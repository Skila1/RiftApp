package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riftapp-cloud/riftapp/internal/models"
)

type BlockRepo struct {
	db *pgxpool.Pool
}

func NewBlockRepo(db *pgxpool.Pool) *BlockRepo {
	return &BlockRepo{db: db}
}

func (r *BlockRepo) Create(ctx context.Context, blockerID, blockedID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`, blockerID, blockedID)
	return err
}

func (r *BlockRepo) Delete(ctx context.Context, blockerID, blockedID string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
		blockerID, blockedID)
	return err
}

func (r *BlockRepo) IsBlocked(ctx context.Context, blockerID, blockedID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2)`,
		blockerID, blockedID).Scan(&exists)
	return exists, err
}

// EitherBlocked checks if either user has blocked the other
func (r *BlockRepo) EitherBlocked(ctx context.Context, userA, userB string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM blocks
			WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
		)`, userA, userB).Scan(&exists)
	return exists, err
}

func (r *BlockRepo) List(ctx context.Context, userID string) ([]models.Block, error) {
	rows, err := r.db.Query(ctx,
		`SELECT b.blocker_id, b.blocked_id, b.created_at,
		        u.id, u.username, u.display_name, u.avatar_url
		 FROM blocks b
		 JOIN users u ON u.id = b.blocked_id
		 WHERE b.blocker_id = $1
		 ORDER BY b.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.Block
	for rows.Next() {
		var bl models.Block
		var u models.User
		if err := rows.Scan(
			&bl.BlockerID, &bl.BlockedID, &bl.CreatedAt,
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL,
		); err != nil {
			return nil, err
		}
		bl.User = &u
		list = append(list, bl)
	}
	if list == nil {
		list = []models.Block{}
	}
	return list, rows.Err()
}
