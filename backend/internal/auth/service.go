package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/riptide-cloud/riptide/internal/models"
)

var (
	ErrUsernameTaken  = errors.New("username already taken")
	ErrEmailTaken     = errors.New("email already taken")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserNotFound   = errors.New("user not found")
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
		if isDuplicateKey(err, "users_username_key") {
			return nil, ErrUsernameTaken
		}
		if isDuplicateKey(err, "users_email_key") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}

	user := &models.User{
		ID:          id,
		Username:    input.Username,
		Email:       input.Email,
		DisplayName: input.Username,
		Status:      1,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	return s.generateTokens(user)
}

func (s *Service) Login(ctx context.Context, input LoginInput) (*AuthResponse, error) {
	var user models.User
	err := s.db.QueryRow(ctx,
		`SELECT id, username, email, password_hash, display_name, avatar_url, bio, status, created_at, updated_at
		 FROM users WHERE username = $1`,
		input.Username,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.DisplayName, &user.AvatarURL, &user.Bio, &user.Status, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.generateTokens(&user)
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

	user, err := s.GetUser(ctx, claims.UserID)
	if err != nil {
		return nil, err
	}

	return s.generateTokens(user)
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

func isDuplicateKey(err error, constraint string) bool {
	return err != nil && contains(err.Error(), constraint)
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchStr(s, substr)
}

func searchStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
