package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type RankRepo struct {
	db *pgxpool.Pool
}

func NewRankRepo(db *pgxpool.Pool) *RankRepo {
	return &RankRepo{db: db}
}

func (r *RankRepo) Create(ctx context.Context, rank *models.Rank) error {
	if rank.ID == "" {
		rank.ID = uuid.New().String()
	}
	if rank.CreatedAt.IsZero() {
		rank.CreatedAt = time.Now()
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO ranks (id, hub_id, name, color, permissions, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		rank.ID, rank.HubID, rank.Name, rank.Color, rank.Permissions, rank.Position, rank.CreatedAt)
	return err
}

func (r *RankRepo) GetByID(ctx context.Context, rankID string) (*models.Rank, error) {
	var rank models.Rank
	err := r.db.QueryRow(ctx,
		`SELECT id, hub_id, name, color, permissions, position, created_at
		 FROM ranks WHERE id = $1`, rankID,
	).Scan(&rank.ID, &rank.HubID, &rank.Name, &rank.Color, &rank.Permissions, &rank.Position, &rank.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &rank, nil
}

func (r *RankRepo) ListByHub(ctx context.Context, hubID string) ([]models.Rank, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, hub_id, name, color, permissions, position, created_at
		 FROM ranks WHERE hub_id = $1
		 ORDER BY position ASC, created_at ASC`, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ranks []models.Rank
	for rows.Next() {
		var rank models.Rank
		if err := rows.Scan(&rank.ID, &rank.HubID, &rank.Name, &rank.Color, &rank.Permissions, &rank.Position, &rank.CreatedAt); err != nil {
			return nil, err
		}
		ranks = append(ranks, rank)
	}
	if ranks == nil {
		ranks = []models.Rank{}
	}
	return ranks, rows.Err()
}

func (r *RankRepo) Update(ctx context.Context, rankID string, name *string, color *string, permissions *int64, position *int) (*models.Rank, error) {
	setClauses := []string{}
	args := []interface{}{rankID}
	argIdx := 2

	if name != nil {
		setClauses = append(setClauses, "name = $"+itoa(argIdx))
		args = append(args, *name)
		argIdx++
	}
	if color != nil {
		setClauses = append(setClauses, "color = $"+itoa(argIdx))
		args = append(args, *color)
		argIdx++
	}
	if permissions != nil {
		setClauses = append(setClauses, "permissions = $"+itoa(argIdx))
		args = append(args, *permissions)
		argIdx++
	}
	if position != nil {
		setClauses = append(setClauses, "position = $"+itoa(argIdx))
		args = append(args, *position)
		argIdx++
	}

	if len(setClauses) == 0 {
		return r.GetByID(ctx, rankID)
	}

	query := "UPDATE ranks SET "
	for i, c := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += c
	}
	query += " WHERE id = $1 RETURNING id, hub_id, name, color, permissions, position, created_at"

	var rank models.Rank
	err := r.db.QueryRow(ctx, query, args...).Scan(&rank.ID, &rank.HubID, &rank.Name, &rank.Color, &rank.Permissions, &rank.Position, &rank.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &rank, nil
}

func (r *RankRepo) Delete(ctx context.Context, rankID string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM ranks WHERE id = $1`, rankID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *RankRepo) GetMaxPosition(ctx context.Context, hubID string) (int, error) {
	var pos *int
	err := r.db.QueryRow(ctx, `SELECT MAX(position) FROM ranks WHERE hub_id = $1`, hubID).Scan(&pos)
	if err != nil || pos == nil {
		return 0, err
	}
	return *pos, nil
}

// AssignRank assigns a rank to a hub member by setting hub_members.rank_id.
func (r *RankRepo) AssignRank(ctx context.Context, hubID, userID, rankID string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE hub_members SET rank_id = $1 WHERE hub_id = $2 AND user_id = $3`,
		rankID, hubID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// RemoveRank removes the rank from a hub member (sets rank_id to NULL).
func (r *RankRepo) RemoveRank(ctx context.Context, hubID, userID string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE hub_members SET rank_id = NULL WHERE hub_id = $1 AND user_id = $2`,
		hubID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// GetMemberRankPermissions returns the permission bitfield of the rank assigned to
// a hub member, or 0 if no rank is assigned.
func (r *RankRepo) GetMemberRankPermissions(ctx context.Context, hubID, userID string) int64 {
	var perms *int64
	err := r.db.QueryRow(ctx,
		`SELECT r.permissions FROM ranks r
		 JOIN hub_members hm ON hm.rank_id = r.id
		 WHERE hm.hub_id = $1 AND hm.user_id = $2`, hubID, userID).Scan(&perms)
	if err != nil || perms == nil {
		return 0
	}
	return *perms
}

// CountByHub returns the number of ranks in a hub.
func (r *RankRepo) CountByHub(ctx context.Context, hubID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM ranks WHERE hub_id = $1`, hubID).Scan(&count)
	return count, err
}
