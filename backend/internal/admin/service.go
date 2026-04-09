package admin

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAccountNotSetup    = errors.New("admin account not setup")
	ErrTOTPRequired       = errors.New("2fa required")
	ErrInvalidTOTPCode    = errors.New("invalid 2fa code")
	ErrSessionRevoked     = errors.New("session revoked")
	ErrSessionExpired     = errors.New("session expired")
	ErrAccessDenied       = errors.New("access denied")
)

type EmailCodeSender interface {
	SendAdminCode(ctx context.Context, to, code string) error
}

type Service struct {
	repo        *Repo
	jwt         *AdminJWTManager
	seedEmails  map[string]bool
	emailSender EmailCodeSender
}

func NewService(repo *Repo, jwtSecret string, seedEmails map[string]bool) *Service {
	return &Service{
		repo:       repo,
		jwt:        NewAdminJWTManager(jwtSecret+"_admin", 1*time.Hour),
		seedEmails: seedEmails,
	}
}

func (s *Service) SetEmailSender(sender EmailCodeSender) {
	s.emailSender = sender
}

func (s *Service) IsSeedAdmin(email string) bool {
	return s.seedEmails[email]
}

type LoginResult struct {
	AdminToken   string   `json:"admin_token,omitempty"`
	LoginToken   string   `json:"login_token,omitempty"`
	Requires2FA  bool     `json:"requires_2fa"`
	NeedsSetup   bool     `json:"needs_setup"`
	TOTPMethod   string   `json:"totp_method,omitempty"`
	Role         string   `json:"role,omitempty"`
	User         *Account `json:"user,omitempty"`
}

func (s *Service) Login(ctx context.Context, email, password, ip, ua string) (*LoginResult, error) {
	acct, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(acct.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	if !acct.TOTPEnabled {
		loginToken, err := s.jwt.GenerateLoginToken(acct.UserID, acct.ID)
		if err != nil {
			return nil, err
		}
		return &LoginResult{
			LoginToken: loginToken,
			NeedsSetup: true,
			Role:       acct.Role,
		}, nil
	}

	loginToken, err := s.jwt.GenerateLoginToken(acct.UserID, acct.ID)
	if err != nil {
		return nil, err
	}
	return &LoginResult{
		LoginToken:  loginToken,
		Requires2FA: true,
		TOTPMethod:  acct.TOTPMethod,
	}, nil
}

func (s *Service) Verify2FA(ctx context.Context, loginToken, code, ip, ua string) (*LoginResult, error) {
	claims, err := s.jwt.ValidateLoginToken(loginToken)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	acct, err := s.repo.GetByID(ctx, claims.SessionID)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	if acct.TOTPSecret == nil || !acct.TOTPEnabled {
		return nil, ErrInvalidCredentials
	}

	if !totp.Validate(code, *acct.TOTPSecret) {
		return nil, ErrInvalidTOTPCode
	}

	return s.createSession(ctx, acct, ip, ua)
}

type TOTPSetupResult struct {
	Secret string `json:"secret"`
	QRURI  string `json:"qr_uri"`
}

func (s *Service) SetupTOTP(ctx context.Context, loginToken string) (*TOTPSetupResult, error) {
	claims, err := s.jwt.ValidateLoginToken(loginToken)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	acct, err := s.repo.GetByID(ctx, claims.SessionID)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	issuer := "RiftApp Admin"
	accountName := acct.Username
	if acct.Email != nil {
		accountName = *acct.Email
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: accountName,
	})
	if err != nil {
		return nil, err
	}

	secret := key.Secret()
	if err := s.repo.UpdateTOTP(ctx, acct.ID, &secret, false, "app"); err != nil {
		return nil, err
	}

	return &TOTPSetupResult{
		Secret: secret,
		QRURI:  key.URL(),
	}, nil
}

func (s *Service) ConfirmTOTP(ctx context.Context, loginToken, code, ip, ua string) (*LoginResult, error) {
	claims, err := s.jwt.ValidateLoginToken(loginToken)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	acct, err := s.repo.GetByID(ctx, claims.SessionID)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	if acct.TOTPSecret == nil {
		return nil, errors.New("totp not initialized")
	}

	if !totp.Validate(code, *acct.TOTPSecret) {
		return nil, ErrInvalidTOTPCode
	}

	if err := s.repo.UpdateTOTP(ctx, acct.ID, acct.TOTPSecret, true, "app"); err != nil {
		return nil, err
	}

	return s.createSession(ctx, acct, ip, ua)
}

func (s *Service) createSession(ctx context.Context, acct *Account, ip, ua string) (*LoginResult, error) {
	sessID := uuid.New().String()
	now := time.Now()

	token, err := s.jwt.Generate(acct.UserID, acct.Role, sessID)
	if err != nil {
		return nil, err
	}

	tokenHash := hashToken(token)
	sess := &Session{
		ID:             sessID,
		AdminAccountID: acct.ID,
		IPAddress:      ip,
		UserAgent:      ua,
		CreatedAt:      now,
		ExpiresAt:      now.Add(1 * time.Hour),
	}
	if err := s.repo.CreateSessionWithHash(ctx, sess, tokenHash); err != nil {
		return nil, err
	}

	return &LoginResult{
		AdminToken: token,
		Role:       acct.Role,
		User:       acct,
	}, nil
}

func (s *Service) ValidateSession(ctx context.Context, token string) (*AdminClaims, error) {
	claims, err := s.jwt.Validate(token)
	if err != nil {
		return nil, err
	}

	tokenHash := hashToken(token)
	sess, err := s.repo.GetSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrSessionRevoked
		}
		return nil, err
	}
	if sess.RevokedAt != nil {
		return nil, ErrSessionRevoked
	}
	if time.Now().After(sess.ExpiresAt) {
		return nil, ErrSessionExpired
	}

	return claims, nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	tokenHash := hashToken(token)
	sess, err := s.repo.GetSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		return err
	}
	return s.repo.RevokeSession(ctx, sess.ID)
}

func (s *Service) CreateAccount(ctx context.Context, userID, password, role string) (*Account, error) {
	if !ValidRole(role) {
		return nil, errors.New("invalid role")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	acct := &Account{
		ID:           uuid.New().String(),
		UserID:       userID,
		PasswordHash: string(hash),
		TOTPEnabled:  false,
		TOTPMethod:   "app",
		Role:         role,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.repo.Create(ctx, acct); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, acct.ID)
}

func (s *Service) UpdateRole(ctx context.Context, id, role string) error {
	if !ValidRole(role) {
		return errors.New("invalid role")
	}
	return s.repo.UpdateRole(ctx, id, role)
}

func (s *Service) DeleteAccount(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}

func (s *Service) ListAccounts(ctx context.Context) ([]Account, error) {
	return s.repo.List(ctx)
}

func (s *Service) ListAdminSessions(ctx context.Context) ([]Session, error) {
	return s.repo.ListAllSessions(ctx)
}

func (s *Service) RevokeAdminSession(ctx context.Context, id string) error {
	return s.repo.RevokeSession(ctx, id)
}

func (s *Service) ListUserSessions(ctx context.Context, limit, offset int) ([]UserSession, int, error) {
	return s.repo.ListUserSessions(ctx, limit, offset)
}

func (s *Service) RevokeUserSession(ctx context.Context, id string) error {
	return s.repo.RevokeUserSession(ctx, id)
}

func (s *Service) EnsureSeedAdmins(ctx context.Context) {
	for email := range s.seedEmails {
		_, err := s.repo.GetByEmail(ctx, email)
		if err == nil {
			continue
		}
		if !errors.Is(err, ErrNotFound) {
			log.Printf("admin: error checking seed admin %s: %v", email, err)
			continue
		}

		var userID string
		err = s.repo.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
		if err != nil {
			continue
		}

		randomPass, err := generateRandomPassword(32)
		if err != nil {
			log.Printf("admin: failed to generate random password for seed admin %s: %v", email, err)
			continue
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(randomPass), bcrypt.DefaultCost)
		now := time.Now()
		acct := &Account{
			ID:           uuid.New().String(),
			UserID:       userID,
			PasswordHash: string(hash),
			TOTPEnabled:  false,
			TOTPMethod:   "app",
			Role:         RoleSuperAdmin,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := s.repo.Create(ctx, acct); err != nil {
			log.Printf("admin: failed to seed admin %s: %v", email, err)
		} else {
			log.Printf("admin: seeded super_admin account for %s — set password via admin UI or CLI before use", email)
		}
	}
}

func (s *Service) ChangePassword(ctx context.Context, accountID, oldPass, newPass string) error {
	acct, err := s.repo.GetByID(ctx, accountID)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(acct.PasswordHash), []byte(oldPass)); err != nil {
		return ErrInvalidCredentials
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPass), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.repo.UpdatePassword(ctx, accountID, string(hash)); err != nil {
		return err
	}
	_ = s.repo.RevokeSessionsByAccount(ctx, accountID)
	return nil
}

func (s *Service) ResetTOTP(ctx context.Context, accountID string) error {
	if err := s.repo.UpdateTOTP(ctx, accountID, nil, false, "app"); err != nil {
		return err
	}
	_ = s.repo.RevokeSessionsByAccount(ctx, accountID)
	return nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func generateRandomPassword(length int) (string, error) {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()"
	result := make([]byte, length)
	for i := range result {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return "", err
		}
		result[i] = chars[n.Int64()]
	}
	return string(result), nil
}
