package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type StreamRepo struct {
	db *pgxpool.Pool
}

func NewStreamRepo(db *pgxpool.Pool) *StreamRepo {
	return &StreamRepo{db: db}
}

func (r *StreamRepo) Create(ctx context.Context, stream *models.Stream) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO streams (id, hub_id, name, type, position, is_private, category_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		stream.ID, stream.HubID, stream.Name, stream.Type, stream.Position, stream.IsPrivate, stream.CategoryID, stream.CreatedAt)
	return err
}

func (r *StreamRepo) GetByID(ctx context.Context, streamID string) (*models.Stream, error) {
	var s models.Stream
	err := r.db.QueryRow(ctx,
		`SELECT id, hub_id, name, type, position, is_private, category_id, created_at
		 FROM streams WHERE id = $1`, streamID,
	).Scan(&s.ID, &s.HubID, &s.Name, &s.Type, &s.Position, &s.IsPrivate, &s.CategoryID, &s.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *StreamRepo) ListByHub(ctx context.Context, hubID string) ([]models.Stream, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, hub_id, name, type, position, is_private, category_id, created_at
		 FROM streams WHERE hub_id = $1 ORDER BY position`, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var streams []models.Stream
	for rows.Next() {
		var s models.Stream
		if err := rows.Scan(&s.ID, &s.HubID, &s.Name, &s.Type, &s.Position, &s.IsPrivate, &s.CategoryID, &s.CreatedAt); err != nil {
			return nil, err
		}
		streams = append(streams, s)
	}
	if streams == nil {
		streams = []models.Stream{}
	}
	return streams, rows.Err()
}

func (r *StreamRepo) Delete(ctx context.Context, streamID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM streams WHERE id = $1`, streamID)
	return err
}

func (r *StreamRepo) UpdateName(ctx context.Context, streamID, name string) error {
	_, err := r.db.Exec(ctx, `UPDATE streams SET name = $1 WHERE id = $2`, name, streamID)
	return err
}

func (r *StreamRepo) GetHubID(ctx context.Context, streamID string) (string, error) {
	var hubID string
	err := r.db.QueryRow(ctx, `SELECT hub_id FROM streams WHERE id = $1`, streamID).Scan(&hubID)
	return hubID, err
}

func (r *StreamRepo) GetName(ctx context.Context, streamID string) (string, error) {
	var name string
	err := r.db.QueryRow(ctx, `SELECT name FROM streams WHERE id = $1`, streamID).Scan(&name)
	return name, err
}

func (r *StreamRepo) GetMaxPosition(ctx context.Context, hubID string) (int, error) {
	var maxPos int
	err := r.db.QueryRow(ctx,
		`SELECT COALESCE(MAX(position), -1) FROM streams WHERE hub_id = $1`, hubID,
	).Scan(&maxPos)
	return maxPos, err
}

func (r *StreamRepo) AckStream(ctx context.Context, userID, streamID, messageID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO stream_read_states (user_id, stream_id, last_read_message_id, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (user_id, stream_id) DO UPDATE
		 SET last_read_message_id = EXCLUDED.last_read_message_id, updated_at = now()`,
		userID, streamID, messageID)
	return err
}

type ReadState struct {
	StreamID          string `json:"stream_id"`
	LastReadMessageID string `json:"last_read_message_id"`
	UnreadCount       int    `json:"unread_count"`
}

func (r *StreamRepo) GetReadStates(ctx context.Context, hubID, userID string) ([]ReadState, error) {
	rows, err := r.db.Query(ctx,
		`SELECT s.id,
		        COALESCE(rs.last_read_message_id::text, '') AS last_read_message_id,
		        (SELECT COUNT(*) FROM messages m
		         WHERE m.stream_id = s.id
		           AND (rs.last_read_message_id IS NULL OR m.created_at > (
		               SELECT created_at FROM messages WHERE id = rs.last_read_message_id
		           ))
		        ) AS unread_count
		 FROM streams s
		 LEFT JOIN stream_read_states rs ON rs.stream_id = s.id AND rs.user_id = $2
		 WHERE s.hub_id = $1 AND s.type = 0`,
		hubID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var states []ReadState
	for rows.Next() {
		var rs ReadState
		if err := rows.Scan(&rs.StreamID, &rs.LastReadMessageID, &rs.UnreadCount); err != nil {
			return nil, err
		}
		states = append(states, rs)
	}
	if states == nil {
		states = []ReadState{}
	}
	return states, rows.Err()
}

// BulkUpdatePositions updates position and optionally category_id for multiple streams in a single transaction.
func (r *StreamRepo) BulkUpdatePositions(ctx context.Context, hubID string, items []struct {
	ID         string
	Position   int
	CategoryID *string
}) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, item := range items {
		_, err := tx.Exec(ctx,
			`UPDATE streams SET position = $1, category_id = $2
			 WHERE id = $3 AND hub_id = $4`,
			item.Position, item.CategoryID, item.ID, hubID,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// SetLastActivity records when activity occurred for ordering (convenience for future use)
func (r *StreamRepo) Touch(ctx context.Context, streamID string) {
	r.db.Exec(ctx, `UPDATE streams SET created_at = $1 WHERE id = $2`, time.Now(), streamID)
}
