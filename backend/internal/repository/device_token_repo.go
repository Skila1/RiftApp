package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DeviceToken struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Token     string    `json:"token"`
	Platform  string    `json:"platform"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type DeviceTokenRepo struct {
	db *pgxpool.Pool
}

func NewDeviceTokenRepo(db *pgxpool.Pool) *DeviceTokenRepo {
	return &DeviceTokenRepo{db: db}
}

func (r *DeviceTokenRepo) Upsert(ctx context.Context, userID, token, platform string) (*DeviceToken, error) {
	id := uuid.New().String()
	dt := &DeviceToken{}
	err := r.db.QueryRow(ctx,
		`INSERT INTO device_tokens (id, user_id, token, platform, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, now(), now())
		 ON CONFLICT (token) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			platform = EXCLUDED.platform,
			updated_at = now()
		 RETURNING id, user_id, token, platform, created_at, updated_at`,
		id, userID, token, platform,
	).Scan(&dt.ID, &dt.UserID, &dt.Token, &dt.Platform, &dt.CreatedAt, &dt.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return dt, nil
}

func (r *DeviceTokenRepo) Delete(ctx context.Context, userID, token string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`, userID, token)
	return err
}

func (r *DeviceTokenRepo) DeleteAllForUser(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM device_tokens WHERE user_id = $1`, userID)
	return err
}

func (r *DeviceTokenRepo) ListByUserID(ctx context.Context, userID string) ([]DeviceToken, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, user_id, token, platform, created_at, updated_at
		 FROM device_tokens WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []DeviceToken
	for rows.Next() {
		var dt DeviceToken
		if err := rows.Scan(&dt.ID, &dt.UserID, &dt.Token, &dt.Platform, &dt.CreatedAt, &dt.UpdatedAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, dt)
	}
	return tokens, rows.Err()
}

func (r *DeviceTokenRepo) ListByUserIDs(ctx context.Context, userIDs []string) ([]DeviceToken, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	rows, err := r.db.Query(ctx,
		`SELECT id, user_id, token, platform, created_at, updated_at
		 FROM device_tokens WHERE user_id = ANY($1)`,
		userIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []DeviceToken
	for rows.Next() {
		var dt DeviceToken
		if err := rows.Scan(&dt.ID, &dt.UserID, &dt.Token, &dt.Platform, &dt.CreatedAt, &dt.UpdatedAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, dt)
	}
	return tokens, rows.Err()
}
