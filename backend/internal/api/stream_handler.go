package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riptide-cloud/riptide/internal/middleware"
	"github.com/riptide-cloud/riptide/internal/models"
)

type StreamHandler struct {
	db *pgxpool.Pool
}

func NewStreamHandler(db *pgxpool.Pool) *StreamHandler {
	return &StreamHandler{db: db}
}

func (h *StreamHandler) Create(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	if !memberHasPermission(r.Context(), h.db, hubID, userID, models.PermManageStreams) {
		writeError(w, http.StatusForbidden, "you do not have permission to manage channels")
		return
	}

	var body struct {
		Name      string `json:"name"`
		Type      int    `json:"type"`
		IsPrivate bool   `json:"is_private"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	// Get next position
	var maxPos int
	h.db.QueryRow(r.Context(),
		`SELECT COALESCE(MAX(position), -1) FROM streams WHERE hub_id = $1`, hubID,
	).Scan(&maxPos)

	stream := models.Stream{
		ID:        uuid.New().String(),
		HubID:     hubID,
		Name:      body.Name,
		Type:      body.Type,
		Position:  maxPos + 1,
		IsPrivate: body.IsPrivate,
		CreatedAt: time.Now(),
	}

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO streams (id, hub_id, name, type, position, is_private, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		stream.ID, stream.HubID, stream.Name, stream.Type, stream.Position, stream.IsPrivate, stream.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create stream")
		return
	}

	writeJSON(w, http.StatusCreated, stream)
}

func (h *StreamHandler) List(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	rows, err := h.db.Query(r.Context(),
		`SELECT id, hub_id, name, type, position, is_private, created_at
		 FROM streams WHERE hub_id = $1 ORDER BY position`, hubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	streams := []models.Stream{}
	for rows.Next() {
		var s models.Stream
		if err := rows.Scan(&s.ID, &s.HubID, &s.Name, &s.Type, &s.Position, &s.IsPrivate, &s.CreatedAt); err != nil {
			continue
		}
		streams = append(streams, s)
	}

	writeJSON(w, http.StatusOK, streams)
}

func (h *StreamHandler) Get(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	var s models.Stream
	err := h.db.QueryRow(r.Context(),
		`SELECT id, hub_id, name, type, position, is_private, created_at
		 FROM streams WHERE id = $1`, streamID,
	).Scan(&s.ID, &s.HubID, &s.Name, &s.Type, &s.Position, &s.IsPrivate, &s.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "stream not found")
		return
	}

	writeJSON(w, http.StatusOK, s)
}

func (h *StreamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())

	hubID := hubIDForStream(r.Context(), h.db, streamID)
	if hubID == "" {
		writeError(w, http.StatusNotFound, "stream not found")
		return
	}

	if !memberHasPermission(r.Context(), h.db, hubID, userID, models.PermManageStreams) {
		writeError(w, http.StatusForbidden, "you do not have permission to manage channels")
		return
	}

	_, err := h.db.Exec(r.Context(), `DELETE FROM streams WHERE id = $1`, streamID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete stream")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Ack marks a stream as read up to the given message for the current user.
func (h *StreamHandler) Ack(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())

	var body struct {
		MessageID string `json:"message_id"`
	}
	if err := readJSON(r, &body); err != nil || body.MessageID == "" {
		writeError(w, http.StatusBadRequest, "message_id is required")
		return
	}

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO stream_read_states (user_id, stream_id, last_read_message_id, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (user_id, stream_id) DO UPDATE
		 SET last_read_message_id = EXCLUDED.last_read_message_id, updated_at = now()`,
		userID, streamID, body.MessageID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark stream read")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ReadStates returns the unread count for each stream in a hub for the current user.
func (h *StreamHandler) ReadStates(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	rows, err := h.db.Query(r.Context(),
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
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	type readState struct {
		StreamID          string `json:"stream_id"`
		LastReadMessageID string `json:"last_read_message_id"`
		UnreadCount       int    `json:"unread_count"`
	}
	states := []readState{}
	for rows.Next() {
		var rs readState
		if rows.Scan(&rs.StreamID, &rs.LastReadMessageID, &rs.UnreadCount) == nil {
			states = append(states, rs)
		}
	}

	writeJSON(w, http.StatusOK, states)
}
