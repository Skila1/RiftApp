package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type HubRepo struct {
	db *pgxpool.Pool
}

func NewHubRepo(db *pgxpool.Pool) *HubRepo {
	return &HubRepo{db: db}
}

func (r *HubRepo) Create(ctx context.Context, hub *models.Hub, ownerRole string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO hubs (id, name, owner_id, created_at) VALUES ($1, $2, $3, $4)`,
		hub.ID, hub.Name, hub.OwnerID, hub.CreatedAt)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO hub_members (hub_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)`,
		hub.ID, hub.OwnerID, ownerRole, time.Now())
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *HubRepo) CreateDefaultStream(ctx context.Context, streamID, hubID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO streams (id, hub_id, name, type, position, created_at) VALUES ($1, $2, 'general', 0, 0, $3)`,
		streamID, hubID, time.Now())
	return err
}

func (r *HubRepo) GetByID(ctx context.Context, hubID string) (*models.Hub, error) {
	var hub models.Hub
	err := r.db.QueryRow(ctx,
		`SELECT id, name, owner_id, icon_url, created_at FROM hubs WHERE id = $1`, hubID,
	).Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.IconURL, &hub.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &hub, nil
}

func (r *HubRepo) ListByUser(ctx context.Context, userID string) ([]models.Hub, error) {
	rows, err := r.db.Query(ctx,
		`SELECT h.id, h.name, h.owner_id, h.icon_url, h.created_at
		 FROM hubs h JOIN hub_members hm ON h.id = hm.hub_id
		 WHERE hm.user_id = $1
		 ORDER BY h.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hubs []models.Hub
	for rows.Next() {
		var hub models.Hub
		if err := rows.Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.IconURL, &hub.CreatedAt); err != nil {
			return nil, err
		}
		hubs = append(hubs, hub)
	}
	if hubs == nil {
		hubs = []models.Hub{}
	}
	return hubs, rows.Err()
}

func (r *HubRepo) Update(ctx context.Context, hubID string, name *string, iconURL *string) (*models.Hub, error) {
	setClauses := []string{}
	args := []interface{}{hubID}
	argIdx := 2

	if name != nil {
		setClauses = append(setClauses, "name = $"+itoa(argIdx))
		args = append(args, *name)
		argIdx++
	}
	if iconURL != nil {
		setClauses = append(setClauses, "icon_url = $"+itoa(argIdx))
		args = append(args, *iconURL)
		argIdx++
	}

	if len(setClauses) == 0 {
		return r.GetByID(ctx, hubID)
	}

	query := "UPDATE hubs SET "
	for i, c := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += c
	}
	query += " WHERE id = $1 RETURNING id, name, owner_id, icon_url, created_at"

	var hub models.Hub
	err := r.db.QueryRow(ctx, query, args...).Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.IconURL, &hub.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &hub, nil
}

func (r *HubRepo) IsMember(ctx context.Context, hubID, userID string) bool {
	var exists bool
	r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM hub_members WHERE hub_id = $1 AND user_id = $2)`,
		hubID, userID).Scan(&exists)
	return exists
}

func (r *HubRepo) GetMemberRole(ctx context.Context, hubID, userID string) string {
	var role string
	err := r.db.QueryRow(ctx,
		`SELECT role FROM hub_members WHERE hub_id = $1 AND user_id = $2`,
		hubID, userID).Scan(&role)
	if err != nil {
		return ""
	}
	return role
}

func (r *HubRepo) AddMember(ctx context.Context, hubID, userID, role string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO hub_members (hub_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)`,
		hubID, userID, role, time.Now())
	return err
}

func (r *HubRepo) RemoveMember(ctx context.Context, hubID, userID string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM hub_members WHERE hub_id = $1 AND user_id = $2`, hubID, userID)
	return err
}

// Delete removes the hub row; FK ON DELETE CASCADE cleans members, streams, messages, invites, etc.
func (r *HubRepo) Delete(ctx context.Context, hubID string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM hubs WHERE id = $1`, hubID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *HubRepo) GetOwnerID(ctx context.Context, hubID string) (string, error) {
	var ownerID string
	err := r.db.QueryRow(ctx, `SELECT owner_id FROM hubs WHERE id = $1`, hubID).Scan(&ownerID)
	return ownerID, err
}

type MemberWithRole struct {
	models.User
	Role string `json:"role"`
}

func (r *HubRepo) ListMembers(ctx context.Context, hubID string) ([]MemberWithRole, error) {
	rows, err := r.db.Query(ctx,
		`SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.status, u.last_seen, hm.role
		 FROM users u JOIN hub_members hm ON u.id = hm.user_id
		 WHERE hm.hub_id = $1
		 ORDER BY CASE hm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, hm.joined_at`, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []MemberWithRole
	for rows.Next() {
		var m MemberWithRole
		if err := rows.Scan(&m.ID, &m.Username, &m.DisplayName, &m.AvatarURL, &m.Bio, &m.Status, &m.LastSeen, &m.Role); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	if members == nil {
		members = []MemberWithRole{}
	}
	return members, rows.Err()
}

func (r *HubRepo) CountMembers(ctx context.Context, hubID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM hub_members WHERE hub_id = $1`, hubID).Scan(&count)
	return count, err
}

func (r *HubRepo) GetDB() *pgxpool.Pool {
	return r.db
}

func (r *HubRepo) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.db.Begin(ctx)
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}
