package api

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riptide-cloud/riptide/internal/middleware"
	"github.com/riptide-cloud/riptide/internal/models"
	"github.com/riptide-cloud/riptide/internal/ws"
)

type NotifHandler struct {
	db  *pgxpool.Pool
	hub *ws.Hub
}

func NewNotifHandler(db *pgxpool.Pool, hub *ws.Hub) *NotifHandler {
	return &NotifHandler{db: db, hub: hub}
}

// List returns the current user's notifications (newest first, max 50).
func (h *NotifHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	rows, err := h.db.Query(r.Context(),
		`SELECT n.id, n.user_id, n.type, n.title, n.body, n.reference_id,
		        n.hub_id, n.stream_id, n.actor_id, n.read, n.created_at,
		        u.id, u.username, u.display_name, u.avatar_url
		 FROM notifications n
		 LEFT JOIN users u ON n.actor_id = u.id
		 WHERE n.user_id = $1
		 ORDER BY n.created_at DESC
		 LIMIT 50`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	notifs := []models.Notification{}
	for rows.Next() {
		var n models.Notification
		var actor models.User
		var actorID *string
		if err := rows.Scan(
			&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &n.ReferenceID,
			&n.HubID, &n.StreamID, &actorID, &n.Read, &n.CreatedAt,
			&actor.ID, &actor.Username, &actor.DisplayName, &actor.AvatarURL,
		); err != nil {
			continue
		}
		if actorID != nil {
			n.ActorID = actorID
			n.Actor = &actor
		}
		notifs = append(notifs, n)
	}

	writeJSON(w, http.StatusOK, notifs)
}

// MarkRead marks a single notification as read.
func (h *NotifHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	notifID := chi.URLParam(r, "notifID")
	userID := middleware.GetUserID(r.Context())

	result, err := h.db.Exec(r.Context(),
		`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
		notifID, userID)
	if err != nil || result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "notification not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// MarkAllRead marks all of the current user's notifications as read.
func (h *NotifHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	_, err := h.db.Exec(r.Context(),
		`UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// CreateNotification inserts a notification row and pushes it via WS.
// Skips self-triggered notifications, deduplicates by reference, and rate-limits DM notifications.
func (h *NotifHandler) CreateNotification(userID, ntype, title string, body, referenceID, hubID, streamID, actorID *string) {
	// ── Guard: never notify a user about their own action ──
	if actorID != nil && *actorID == userID {
		return
	}

	ctx := context.Background()

	// ── Dedup: skip if an identical (user, type, reference) row already exists ──
	if referenceID != nil {
		var exists bool
		_ = h.db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND reference_id = $3)`,
			userID, ntype, *referenceID).Scan(&exists)
		if exists {
			return
		}
	}

	// ── Rate limit DM notifications: one per sender per 5-minute window ──
	if ntype == "dm" && actorID != nil {
		var recent bool
		_ = h.db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'dm' AND actor_id = $2 AND created_at > now() - interval '5 minutes')`,
			userID, *actorID).Scan(&recent)
		if recent {
			return
		}
	}

	// ── General rate limit: max 50 notifications per user per hour ──
	var hourCount int
	_ = h.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
		userID).Scan(&hourCount)
	if hourCount >= 50 {
		log.Printf("notif: rate limit hit for user %s (%d/hr)", userID, hourCount)
		return
	}

	id := uuid.New().String()
	now := time.Now()

	_, err := h.db.Exec(ctx,
		`INSERT INTO notifications (id, user_id, type, title, body, reference_id, hub_id, stream_id, actor_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 ON CONFLICT DO NOTHING`,
		id, userID, ntype, title, body, referenceID, hubID, streamID, actorID, now)
	if err != nil {
		log.Printf("notif: insert failed for user %s type %s: %v", userID, ntype, err)
		return
	}

	notif := models.Notification{
		ID:          id,
		UserID:      userID,
		Type:        ntype,
		Title:       title,
		Body:        body,
		ReferenceID: referenceID,
		HubID:       hubID,
		StreamID:    streamID,
		ActorID:     actorID,
		Read:        false,
		CreatedAt:   now,
	}

	// Fetch actor info if present
	if actorID != nil {
		var actor models.User
		err := h.db.QueryRow(ctx,
			`SELECT id, username, display_name, avatar_url FROM users WHERE id = $1`, *actorID,
		).Scan(&actor.ID, &actor.Username, &actor.DisplayName, &actor.AvatarURL)
		if err == nil {
			notif.Actor = &actor
		}
	}

	evt := ws.NewEvent(ws.OpNotificationCreate, notif)
	h.hub.SendToUser(userID, evt)
}
