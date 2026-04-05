package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riftapp-cloud/riftapp/internal/models"
)

type FriendshipRepo struct {
	db *pgxpool.Pool
}

func NewFriendshipRepo(db *pgxpool.Pool) *FriendshipRepo {
	return &FriendshipRepo{db: db}
}

func (r *FriendshipRepo) Create(ctx context.Context, userID, friendID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 0)
		 ON CONFLICT DO NOTHING`, userID, friendID)
	return err
}

func (r *FriendshipRepo) Accept(ctx context.Context, userID, friendID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE friendships SET status = 1, updated_at = now()
		 WHERE user_id = $1 AND friend_id = $2 AND status = 0`, userID, friendID)
	return err
}

func (r *FriendshipRepo) Delete(ctx context.Context, userA, userB string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM friendships
		 WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
		userA, userB)
	return err
}

func (r *FriendshipRepo) Get(ctx context.Context, userA, userB string) (*models.Friendship, error) {
	var f models.Friendship
	err := r.db.QueryRow(ctx,
		`SELECT user_id, friend_id, status, created_at, updated_at
		 FROM friendships
		 WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
		userA, userB).Scan(&f.UserID, &f.FriendID, &f.Status, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// ListFriends returns accepted friendships with user info
func (r *FriendshipRepo) ListFriends(ctx context.Context, userID string) ([]models.Friendship, error) {
	rows, err := r.db.Query(ctx,
		`SELECT f.user_id, f.friend_id, f.status, f.created_at, f.updated_at,
		        u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen, u.bio
		 FROM friendships f
		 JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
		 WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 1
		 ORDER BY u.display_name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFriendships(rows)
}

// ListPendingIncoming returns friend requests sent TO userID
func (r *FriendshipRepo) ListPendingIncoming(ctx context.Context, userID string) ([]models.Friendship, error) {
	rows, err := r.db.Query(ctx,
		`SELECT f.user_id, f.friend_id, f.status, f.created_at, f.updated_at,
		        u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen, u.bio
		 FROM friendships f
		 JOIN users u ON u.id = f.user_id
		 WHERE f.friend_id = $1 AND f.status = 0
		 ORDER BY f.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFriendships(rows)
}

// ListPendingOutgoing returns friend requests sent BY userID
func (r *FriendshipRepo) ListPendingOutgoing(ctx context.Context, userID string) ([]models.Friendship, error) {
	rows, err := r.db.Query(ctx,
		`SELECT f.user_id, f.friend_id, f.status, f.created_at, f.updated_at,
		        u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen, u.bio
		 FROM friendships f
		 JOIN users u ON u.id = f.friend_id
		 WHERE f.user_id = $1 AND f.status = 0
		 ORDER BY f.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFriendships(rows)
}

func (r *FriendshipRepo) CountPendingIncoming(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM friendships WHERE friend_id = $1 AND status = 0`, userID).Scan(&count)
	return count, err
}

func scanFriendships(rows interface {
	Next() bool
	Scan(dest ...interface{}) error
	Err() error
}) ([]models.Friendship, error) {
	var list []models.Friendship
	for rows.Next() {
		var f models.Friendship
		var u models.User
		if err := rows.Scan(
			&f.UserID, &f.FriendID, &f.Status, &f.CreatedAt, &f.UpdatedAt,
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Status, &u.LastSeen, &u.Bio,
		); err != nil {
			return nil, err
		}
		f.User = &u
		list = append(list, f)
	}
	if list == nil {
		list = []models.Friendship{}
	}
	return list, rows.Err()
}
