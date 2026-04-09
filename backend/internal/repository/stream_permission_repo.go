package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type StreamPermissionRepo struct {
	db *pgxpool.Pool
}

func NewStreamPermissionRepo(db *pgxpool.Pool) *StreamPermissionRepo {
	return &StreamPermissionRepo{db: db}
}

func (r *StreamPermissionRepo) ListByStream(ctx context.Context, streamID string) ([]models.StreamPermissionOverwrite, error) {
	rows, err := r.db.Query(ctx,
		`SELECT stream_id::text, target_type, target_id, allow, deny, created_at
		 FROM stream_permission_overwrites
		 WHERE stream_id = $1
		 ORDER BY CASE target_type WHEN 'everyone' THEN 0 ELSE 1 END, target_id`,
		streamID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var overwrites []models.StreamPermissionOverwrite
	for rows.Next() {
		var overwrite models.StreamPermissionOverwrite
		if err := rows.Scan(&overwrite.StreamID, &overwrite.TargetType, &overwrite.TargetID, &overwrite.Allow, &overwrite.Deny, &overwrite.CreatedAt); err != nil {
			return nil, err
		}
		overwrites = append(overwrites, overwrite)
	}
	if overwrites == nil {
		overwrites = []models.StreamPermissionOverwrite{}
	}
	return overwrites, rows.Err()
}

func (r *StreamPermissionRepo) ListByStreams(ctx context.Context, streamIDs []string) (map[string][]models.StreamPermissionOverwrite, error) {
	result := make(map[string][]models.StreamPermissionOverwrite)
	if len(streamIDs) == 0 {
		return result, nil
	}

	placeholders := make([]string, len(streamIDs))
	args := make([]interface{}, len(streamIDs))
	for idx, streamID := range streamIDs {
		placeholders[idx] = fmt.Sprintf("$%d", idx+1)
		args[idx] = streamID
	}

	query := `SELECT stream_id::text, target_type, target_id, allow, deny, created_at
		FROM stream_permission_overwrites
		WHERE stream_id IN (` + strings.Join(placeholders, ", ") + `)
		ORDER BY CASE target_type WHEN 'everyone' THEN 0 ELSE 1 END, target_id`

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var overwrite models.StreamPermissionOverwrite
		if err := rows.Scan(&overwrite.StreamID, &overwrite.TargetType, &overwrite.TargetID, &overwrite.Allow, &overwrite.Deny, &overwrite.CreatedAt); err != nil {
			return nil, err
		}
		result[overwrite.StreamID] = append(result[overwrite.StreamID], overwrite)
	}
	return result, rows.Err()
}

func (r *StreamPermissionRepo) ReplaceForStream(ctx context.Context, streamID string, overwrites []models.StreamPermissionOverwrite) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := r.replaceForStreamTx(ctx, tx, streamID, overwrites); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *StreamPermissionRepo) CreateManyInTx(ctx context.Context, tx pgx.Tx, overwrites []models.StreamPermissionOverwrite) error {
	for _, overwrite := range overwrites {
		if overwrite.Allow == 0 && overwrite.Deny == 0 {
			continue
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO stream_permission_overwrites (stream_id, target_type, target_id, allow, deny)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (stream_id, target_type, target_id) DO UPDATE
			 SET allow = EXCLUDED.allow, deny = EXCLUDED.deny`,
			overwrite.StreamID, overwrite.TargetType, overwrite.TargetID, overwrite.Allow, overwrite.Deny,
		); err != nil {
			return err
		}
	}
	return nil
}

func (r *StreamPermissionRepo) replaceForStreamTx(ctx context.Context, tx pgx.Tx, streamID string, overwrites []models.StreamPermissionOverwrite) error {
	if _, err := tx.Exec(ctx, `DELETE FROM stream_permission_overwrites WHERE stream_id = $1`, streamID); err != nil {
		return err
	}
	for idx := range overwrites {
		overwrites[idx].StreamID = streamID
	}
	return r.CreateManyInTx(ctx, tx, overwrites)
}
