package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
)

var (
	ErrUsernameTaken      = errors.New("username already taken")
	ErrEmailTaken         = errors.New("email already taken")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAccountSuspended   = errors.New("account suspended")
	ErrUserNotFound       = errors.New("user not found")
)

type Service struct {
	db  *pgxpool.Pool
	jwt *JWTManager
}

func NewService(db *pgxpool.Pool, jwtSecret string) *Service {
	return &Service{
		db:  db,
		jwt: NewJWTManager(jwtSecret),
	}
}

type RegisterInput struct {
	Username string  `json:"username"`
	Email    *string `json:"email,omitempty"`
	Password string  `json:"password"`
}

type LoginInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	User         *models.User `json:"user"`
}

func (s *Service) Register(ctx context.Context, input RegisterInput) (*AuthResponse, error) {
	if len(input.Username) < 2 || len(input.Username) > 32 {
		return nil, errors.New("username must be 2-32 characters")
	}
	if len(input.Password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	id := uuid.New().String()
	now := time.Now()

	_, err = s.db.Exec(ctx,
		`INSERT INTO users (id, username, email, password_hash, display_name, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		id, input.Username, input.Email, string(hash), input.Username, now, now,
	)
	if err != nil {
		if apperror.IsDuplicateKey(err, "users_username_key") {
			return nil, ErrUsernameTaken
		}
		if apperror.IsDuplicateKey(err, "users_email_key") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}

	user := &models.User{
		ID:          id,
		Username:    input.Username,
		Email:       input.Email,
		DisplayName: input.Username,
		Status:      models.UserStatusOnline,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	resp, err := s.generateTokens(user)
	if err != nil {
		return nil, err
	}
	s.storeRefreshToken(ctx, user.ID, resp.RefreshToken)
	return resp, nil
}

func (s *Service) Login(ctx context.Context, input LoginInput) (*AuthResponse, error) {
	var user models.User
	var bannedAt *time.Time
	err := s.db.QueryRow(ctx,
		`SELECT id, username, email, password_hash, display_name, avatar_url, bio, status, created_at, updated_at, banned_at
		 FROM users WHERE username = $1`,
		input.Username,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.DisplayName, &user.AvatarURL, &user.Bio, &user.Status, &user.CreatedAt, &user.UpdatedAt, &bannedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	if bannedAt != nil {
		return nil, ErrAccountSuspended
	}

	resp, err := s.generateTokens(&user)
	if err != nil {
		return nil, err
	}
	s.storeRefreshToken(ctx, user.ID, resp.RefreshToken)
	return resp, nil
}

func (s *Service) GetUser(ctx context.Context, userID string) (*models.User, error) {
	var user models.User
	err := s.db.QueryRow(ctx,
		`SELECT id, username, email, display_name, avatar_url, bio, status, created_at, updated_at
		 FROM users WHERE id = $1`,
		userID,
	).Scan(&user.ID, &user.Username, &user.Email, &user.DisplayName,
		&user.AvatarURL, &user.Bio, &user.Status, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &user, nil
}

func (s *Service) RefreshTokens(ctx context.Context, refreshToken string) (*AuthResponse, error) {
	claims, err := s.jwt.ValidateRefreshToken(refreshToken)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	tokenHash := hashToken(refreshToken)
	var tokenID string
	err = s.db.QueryRow(ctx,
		`SELECT id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > now()`,
		tokenHash, claims.UserID).Scan(&tokenID)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	s.db.Exec(ctx, `DELETE FROM refresh_tokens WHERE id = $1`, tokenID)

	var bannedAt *time.Time
	if err := s.db.QueryRow(ctx, `SELECT banned_at FROM users WHERE id = $1`, claims.UserID).Scan(&bannedAt); err != nil {
		return nil, err
	}
	if bannedAt != nil {
		return nil, ErrAccountSuspended
	}

	user, err := s.GetUser(ctx, claims.UserID)
	if err != nil {
		return nil, err
	}

	resp, err := s.generateTokens(user)
	if err != nil {
		return nil, err
	}
	s.storeRefreshToken(ctx, user.ID, resp.RefreshToken)
	return resp, nil
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	tokenHash := hashToken(refreshToken)
	_, err := s.db.Exec(ctx, `DELETE FROM refresh_tokens WHERE token_hash = $1`, tokenHash)
	return err
}

func (s *Service) ValidateToken(token string) (*Claims, error) {
	return s.jwt.ValidateAccessToken(token)
}

func (s *Service) generateTokens(user *models.User) (*AuthResponse, error) {
	access, err := s.jwt.GenerateAccessToken(user.ID)
	if err != nil {
		return nil, err
	}
	refresh, err := s.jwt.GenerateRefreshToken(user.ID)
	if err != nil {
		return nil, err
	}
	return &AuthResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         user,
	}, nil
}

func (s *Service) storeRefreshToken(ctx context.Context, userID, token string) {
	tokenHash := hashToken(token)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	s.db.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, tokenHash, expiresAt)
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
