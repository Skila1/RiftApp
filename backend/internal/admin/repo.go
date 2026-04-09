package admin

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repo struct {
	db *pgxpool.Pool
}

func NewRepo(db *pgxpool.Pool) *Repo {
	return &Repo{db: db}
}

var ErrNotFound = errors.New("admin: not found")

func (r *Repo) GetByUserID(ctx context.Context, userID string) (*Account, error) {
	a := &Account{}
	err := r.db.QueryRow(ctx,
		`SELECT a.id, a.user_id, a.password_hash, a.totp_secret, a.totp_enabled, a.totp_method, a.role, a.created_at, a.updated_at,
		        u.username, u.email, u.display_name, u.avatar_url
		 FROM admin_accounts a
		 JOIN users u ON a.user_id = u.id
		 WHERE a.user_id = $1`, userID,
	).Scan(&a.ID, &a.UserID, &a.PasswordHash, &a.TOTPSecret, &a.TOTPEnabled, &a.TOTPMethod, &a.Role, &a.CreatedAt, &a.UpdatedAt,
		&a.Username, &a.Email, &a.DisplayName, &a.AvatarURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return a, nil
}

func (r *Repo) GetByEmail(ctx context.Context, email string) (*Account, error) {
	a := &Account{}
	err := r.db.QueryRow(ctx,
		`SELECT a.id, a.user_id, a.password_hash, a.totp_secret, a.totp_enabled, a.totp_method, a.role, a.created_at, a.updated_at,
		        u.username, u.email, u.display_name, u.avatar_url
		 FROM admin_accounts a
		 JOIN users u ON a.user_id = u.id
		 WHERE u.email = $1`, email,
	).Scan(&a.ID, &a.UserID, &a.PasswordHash, &a.TOTPSecret, &a.TOTPEnabled, &a.TOTPMethod, &a.Role, &a.CreatedAt, &a.UpdatedAt,
		&a.Username, &a.Email, &a.DisplayName, &a.AvatarURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return a, nil
}

func (r *Repo) GetByID(ctx context.Context, id string) (*Account, error) {
	a := &Account{}
	err := r.db.QueryRow(ctx,
		`SELECT a.id, a.user_id, a.password_hash, a.totp_secret, a.totp_enabled, a.totp_method, a.role, a.created_at, a.updated_at,
		        u.username, u.email, u.display_name, u.avatar_url
		 FROM admin_accounts a
		 JOIN users u ON a.user_id = u.id
		 WHERE a.id = $1`, id,
	).Scan(&a.ID, &a.UserID, &a.PasswordHash, &a.TOTPSecret, &a.TOTPEnabled, &a.TOTPMethod, &a.Role, &a.CreatedAt, &a.UpdatedAt,
		&a.Username, &a.Email, &a.DisplayName, &a.AvatarURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return a, nil
}

func (r *Repo) Create(ctx context.Context, a *Account) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO admin_accounts (id, user_id, password_hash, totp_secret, totp_enabled, totp_method, role, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		a.ID, a.UserID, a.PasswordHash, a.TOTPSecret, a.TOTPEnabled, a.TOTPMethod, a.Role, a.CreatedAt, a.UpdatedAt)
	return err
}

func (r *Repo) UpdatePassword(ctx context.Context, id, hash string) error {
	cmd, err := r.db.Exec(ctx,
		`UPDATE admin_accounts SET password_hash = $2, updated_at = now() WHERE id = $1`, id, hash)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) UpdateTOTP(ctx context.Context, id string, secret *string, enabled bool, method string) error {
	cmd, err := r.db.Exec(ctx,
		`UPDATE admin_accounts SET totp_secret = $2, totp_enabled = $3, totp_method = $4, updated_at = now() WHERE id = $1`,
		id, secret, enabled, method)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) UpdateRole(ctx context.Context, id, role string) error {
	cmd, err := r.db.Exec(ctx,
		`UPDATE admin_accounts SET role = $2, updated_at = now() WHERE id = $1`, id, role)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) Delete(ctx context.Context, id string) error {
	cmd, err := r.db.Exec(ctx, `DELETE FROM admin_accounts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) List(ctx context.Context) ([]Account, error) {
	rows, err := r.db.Query(ctx,
		`SELECT a.id, a.user_id, a.password_hash, a.totp_secret, a.totp_enabled, a.totp_method, a.role, a.created_at, a.updated_at,
		        u.username, u.email, u.display_name, u.avatar_url
		 FROM admin_accounts a
		 JOIN users u ON a.user_id = u.id
		 ORDER BY a.created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Account
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.ID, &a.UserID, &a.PasswordHash, &a.TOTPSecret, &a.TOTPEnabled, &a.TOTPMethod, &a.Role, &a.CreatedAt, &a.UpdatedAt,
			&a.Username, &a.Email, &a.DisplayName, &a.AvatarURL); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, rows.Err()
}

// --- Sessions ---

func (r *Repo) CreateSessionWithHash(ctx context.Context, s *Session, tokenHash string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO admin_sessions (id, admin_account_id, token_hash, ip_address, user_agent, created_at, expires_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		s.ID, s.AdminAccountID, tokenHash, s.IPAddress, s.UserAgent, s.CreatedAt, s.ExpiresAt)
	return err
}

func (r *Repo) RevokeSessionsByAccount(ctx context.Context, accountID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE admin_sessions SET revoked_at = now() WHERE admin_account_id = $1 AND revoked_at IS NULL`, accountID)
	return err
}

func (r *Repo) GetSessionByTokenHash(ctx context.Context, hash string) (*Session, error) {
	s := &Session{}
	err := r.db.QueryRow(ctx,
		`SELECT id, admin_account_id, ip_address, user_agent, created_at, expires_at, revoked_at
		 FROM admin_sessions WHERE token_hash = $1`, hash,
	).Scan(&s.ID, &s.AdminAccountID, &s.IPAddress, &s.UserAgent, &s.CreatedAt, &s.ExpiresAt, &s.RevokedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return s, nil
}

func (r *Repo) RevokeSession(ctx context.Context, id string) error {
	cmd, err := r.db.Exec(ctx, `UPDATE admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repo) ListSessions(ctx context.Context, accountID string) ([]Session, error) {
	rows, err := r.db.Query(ctx,
		`SELECT s.id, s.admin_account_id, s.ip_address, s.user_agent, s.created_at, s.expires_at, s.revoked_at,
		        u.username, u.email, u.display_name
		 FROM admin_sessions s
		 JOIN admin_accounts a ON s.admin_account_id = a.id
		 JOIN users u ON a.user_id = u.id
		 WHERE ($1 = '' OR s.admin_account_id = $1)
		 ORDER BY s.created_at DESC
		 LIMIT 100`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Session
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.AdminAccountID, &s.IPAddress, &s.UserAgent, &s.CreatedAt, &s.ExpiresAt, &s.RevokedAt,
			&s.Username, &s.Email, &s.DisplayName); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, rows.Err()
}

func (r *Repo) ListAllSessions(ctx context.Context) ([]Session, error) {
	return r.ListSessions(ctx, "")
}

func (r *Repo) CleanExpiredSessions(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `DELETE FROM admin_sessions WHERE expires_at < now()`)
	return err
}

// --- User sessions (refresh_tokens) ---

type UserSession struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	Username  string    `json:"username"`
	Email     *string   `json:"email,omitempty"`
}

func (r *Repo) ListUserSessions(ctx context.Context, limit, offset int) ([]UserSession, int, error) {
	if limit <= 0 {
		limit = 50
	}
	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM refresh_tokens WHERE expires_at > now()`).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.Query(ctx,
		`SELECT rt.id, rt.user_id, rt.expires_at, rt.created_at, u.username, u.email
		 FROM refresh_tokens rt
		 JOIN users u ON rt.user_id = u.id
		 WHERE rt.expires_at > now()
		 ORDER BY rt.created_at DESC
		 LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []UserSession
	for rows.Next() {
		var s UserSession
		if err := rows.Scan(&s.ID, &s.UserID, &s.ExpiresAt, &s.CreatedAt, &s.Username, &s.Email); err != nil {
			return nil, 0, err
		}
		list = append(list, s)
	}
	return list, total, rows.Err()
}

func (r *Repo) RevokeUserSession(ctx context.Context, id string) error {
	cmd, err := r.db.Exec(ctx, `DELETE FROM refresh_tokens WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
