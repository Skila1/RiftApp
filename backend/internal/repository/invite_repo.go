package repository

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type InviteRepo struct {
	db *pgxpool.Pool
}

func NewInviteRepo(db *pgxpool.Pool) *InviteRepo {
	return &InviteRepo{db: db}
}

func (r *InviteRepo) Create(ctx context.Context, invite *models.HubInvite) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO hub_invites (id, hub_id, creator_id, code, max_uses, uses, expires_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		invite.ID, invite.HubID, invite.CreatorID, invite.Code,
		invite.MaxUses, invite.Uses, invite.ExpiresAt, invite.CreatedAt)
	return err
}

func (r *InviteRepo) GetByCode(ctx context.Context, code string) (*models.HubInvite, error) {
	var invite models.HubInvite
	err := r.db.QueryRow(ctx,
		`SELECT id, hub_id, creator_id, code, max_uses, uses, expires_at, created_at
		 FROM hub_invites WHERE code = $1`, code,
	).Scan(&invite.ID, &invite.HubID, &invite.CreatorID, &invite.Code,
		&invite.MaxUses, &invite.Uses, &invite.ExpiresAt, &invite.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &invite, nil
}

func (r *InviteRepo) IncrementUses(ctx context.Context, tx pgx.Tx, inviteID string) error {
	_, err := tx.Exec(ctx,
		`UPDATE hub_invites SET uses = uses + 1 WHERE id = $1`, inviteID)
	return err
}

func GenerateInviteCode() (string, error) {
	b := make([]byte, 5)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)), nil
}

func (r *InviteRepo) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.db.Begin(ctx)
}

func (r *InviteRepo) AddMemberInTx(ctx context.Context, tx pgx.Tx, hubID, userID, role string) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO hub_members (hub_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)`,
		hubID, userID, role, time.Now())
	return err
}
