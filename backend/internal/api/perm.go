package api

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riptide-cloud/riptide/internal/models"
)

// getMemberRole returns the role of a user in a hub, or "" if not a member.
func getMemberRole(ctx context.Context, db *pgxpool.Pool, hubID, userID string) string {
	var role string
	err := db.QueryRow(ctx,
		`SELECT role FROM hub_members WHERE hub_id = $1 AND user_id = $2`,
		hubID, userID).Scan(&role)
	if err != nil {
		return ""
	}
	return role
}

// memberHasPermission checks whether a user has a specific permission in a hub
// based on their role.
func memberHasPermission(ctx context.Context, db *pgxpool.Pool, hubID, userID string, perm int64) bool {
	role := getMemberRole(ctx, db, hubID, userID)
	if role == "" {
		return false
	}
	return models.RoleHasPermission(role, perm)
}

// hubIDForStream looks up the hub_id for a given stream.
func hubIDForStream(ctx context.Context, db *pgxpool.Pool, streamID string) string {
	var hubID string
	db.QueryRow(ctx, `SELECT hub_id FROM streams WHERE id = $1`, streamID).Scan(&hubID)
	return hubID
}

// streamName looks up the name of a stream.
func streamName(ctx context.Context, db *pgxpool.Pool, streamID string) string {
	var name string
	db.QueryRow(ctx, `SELECT name FROM streams WHERE id = $1`, streamID).Scan(&name)
	return name
}
