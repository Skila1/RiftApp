package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type NotificationRepo struct {
	db *pgxpool.Pool
}

func NewNotificationRepo(db *pgxpool.Pool) *NotificationRepo {
	return &NotificationRepo{db: db}
}

func (r *NotificationRepo) List(ctx context.Context, userID string) ([]models.Notification, error) {
	rows, err := r.db.Query(ctx,
		`SELECT n.id, n.user_id, n.type, n.title, n.body, n.reference_id,
		        n.hub_id, n.stream_id, n.actor_id, n.read, n.created_at,
		        u.id, u.username, u.display_name, u.avatar_url
		 FROM notifications n
		 LEFT JOIN users u ON n.actor_id = u.id
		 WHERE n.user_id = $1
		 ORDER BY n.created_at DESC
		 LIMIT 50`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifs []models.Notification
	for rows.Next() {
		var n models.Notification
		var actor models.User
		var actorID *string
		if err := rows.Scan(
			&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &n.ReferenceID,
			&n.HubID, &n.StreamID, &actorID, &n.Read, &n.CreatedAt,
			&actor.ID, &actor.Username, &actor.DisplayName, &actor.AvatarURL,
		); err != nil {
			return nil, err
		}
		if actorID != nil {
			n.ActorID = actorID
			n.Actor = &actor
		}
		notifs = append(notifs, n)
	}
	if notifs == nil {
		notifs = []models.Notification{}
	}
	return notifs, rows.Err()
}

func (r *NotificationRepo) MarkRead(ctx context.Context, notifID, userID string) (bool, error) {
	result, err := r.db.Exec(ctx,
		`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
		notifID, userID)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() > 0, nil
}

func (r *NotificationRepo) MarkAllRead(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`, userID)
	return err
}

func (r *NotificationRepo) Create(ctx context.Context, notif *models.Notification) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO notifications (id, user_id, type, title, body, reference_id, hub_id, stream_id, actor_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 ON CONFLICT DO NOTHING`,
		notif.ID, notif.UserID, notif.Type, notif.Title, notif.Body,
		notif.ReferenceID, notif.HubID, notif.StreamID, notif.ActorID, notif.CreatedAt)
	return err
}

func (r *NotificationRepo) ExistsByReference(ctx context.Context, userID, ntype, referenceID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND reference_id = $3)`,
		userID, ntype, referenceID).Scan(&exists)
	return exists, err
}

func (r *NotificationRepo) RecentDMNotifExists(ctx context.Context, userID, actorID string) (bool, error) {
	var recent bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'dm' AND actor_id = $2 AND created_at > now() - interval '5 minutes')`,
		userID, actorID).Scan(&recent)
	return recent, err
}

func (r *NotificationRepo) HourlyCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
		userID).Scan(&count)
	return count, err
}

func (r *NotificationRepo) GetActorInfo(ctx context.Context, actorID string) (*models.User, error) {
	var actor models.User
	err := r.db.QueryRow(ctx,
		`SELECT id, username, display_name, avatar_url FROM users WHERE id = $1`, actorID,
	).Scan(&actor.ID, &actor.Username, &actor.DisplayName, &actor.AvatarURL)
	if err != nil {
		return nil, err
	}
	return &actor, nil
}

func (r *NotificationRepo) GetDisplayName(ctx context.Context, userID string) (string, error) {
	var name string
	err := r.db.QueryRow(ctx,
		`SELECT display_name FROM users WHERE id = $1`, userID).Scan(&name)
	return name, err
}

func (r *NotificationRepo) Now() time.Time {
	return time.Now()
}
