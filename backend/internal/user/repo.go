package user

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

// Repo handles all user database operations.
type Repo struct {
	db *pgxpool.Pool
}

func NewRepo(db *pgxpool.Pool) *Repo {
	return &Repo{db: db}
}

var ErrNotFound = errors.New("user not found")

// scanUser is the single source of truth for scanning a user row.
// Column order: id, username, email, display_name, avatar_url, bio, status, last_seen, created_at, updated_at
func scanUser(row pgx.Row) (*models.User, error) {
	var u models.User
	err := row.Scan(
		&u.ID, &u.Username, &u.Email,
		&u.DisplayName, &u.AvatarURL, &u.Bio,
		&u.Status, &u.LastSeen, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

const userColumns = `id, username, email, display_name, avatar_url, bio, status, last_seen, created_at, updated_at`

// GetByID returns a user by primary key.
func (r *Repo) GetByID(ctx context.Context, id string) (*models.User, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE id = $1`, id)
	return scanUser(row)
}

// GetByUsername returns a user by username (case-insensitive).
func (r *Repo) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	row := r.db.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE lower(username) = lower($1)`, username)
	return scanUser(row)
}

// UpdateProfile applies partial updates to a user's profile.
// Only non-nil fields are written. Returns the updated user.
func (r *Repo) UpdateProfile(ctx context.Context, id string, updates ProfileUpdate) (*models.User, error) {
	now := time.Now()

	// Build dynamic SET clause to only update provided fields
	setClauses := "updated_at = $2"
	args := []interface{}{id, now}
	argIdx := 3

	if updates.Username != nil {
		setClauses += `, username = $` + itoa(argIdx)
		args = append(args, *updates.Username)
		argIdx++
	}
	if updates.DisplayName != nil {
		setClauses += `, display_name = $` + itoa(argIdx)
		args = append(args, *updates.DisplayName)
		argIdx++
	}
	if updates.AvatarURL != nil {
		setClauses += `, avatar_url = $` + itoa(argIdx)
		args = append(args, *updates.AvatarURL)
		argIdx++
	}
	if updates.Bio != nil {
		setClauses += `, bio = $` + itoa(argIdx)
		args = append(args, *updates.Bio)
		argIdx++
	}

	query := `UPDATE users SET ` + setClauses + ` WHERE id = $1 RETURNING ` + userColumns
	row := r.db.QueryRow(ctx, query, args...)
	return scanUser(row)
}

// ProfileUpdate holds optional fields for a profile update.
// A nil pointer means "don't change this field".
type ProfileUpdate struct {
	Username    *string
	DisplayName *string
	AvatarURL   *string
	Bio         *string
}

// UsernameExists checks if a username is taken by another user.
func (r *Repo) UsernameExists(ctx context.Context, username string, excludeUserID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE lower(username) = lower($1) AND id != $2)`,
		username, excludeUserID,
	).Scan(&exists)
	return exists, err
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}

// SetStatus updates a user's status (0=offline, 1=online, 2=idle, 3=dnd).
func (r *Repo) SetStatus(ctx context.Context, id string, status int) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET status = $2, updated_at = now() WHERE id = $1`, id, status)
	return err
}

// SetOffline sets a user offline and records last_seen.
func (r *Repo) SetOffline(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET status = 0, last_seen = now(), updated_at = now() WHERE id = $1`, id)
	return err
}

// GetCoMemberIDs returns the IDs of all users who share at least one hub with the given user.
func (r *Repo) GetCoMemberIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT DISTINCT hm2.user_id
		 FROM hub_members hm1
		 JOIN hub_members hm2 ON hm1.hub_id = hm2.hub_id
		WHERE hm1.user_id = $1 AND hm2.user_id != $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
