package api

import (
	"fmt"
	"hash/crc32"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riptide-cloud/riptide/internal/middleware"
	"github.com/riptide-cloud/riptide/internal/models"
	"github.com/riptide-cloud/riptide/internal/ws"
)

type DMHandler struct {
	db     *pgxpool.Pool
	hub    *ws.Hub
	notifH *NotifHandler
}

func NewDMHandler(db *pgxpool.Pool, hub *ws.Hub) *DMHandler {
	return &DMHandler{db: db, hub: hub}
}

// List returns all conversations the current user is a member of, with the other member's info and last message.
func (h *DMHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	rows, err := h.db.Query(r.Context(),
		`SELECT c.id, c.created_at, c.updated_at,
		        u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen
		 FROM conversations c
		 JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
		 JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id != $1
		 JOIN users u ON cm2.user_id = u.id
		 ORDER BY c.updated_at DESC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	type ConvResponse struct {
		models.Conversation
		Recipient models.User `json:"recipient"`
	}

	convos := []ConvResponse{}
	convoIDs := []string{}
	for rows.Next() {
		var cr ConvResponse
		if err := rows.Scan(
			&cr.ID, &cr.CreatedAt, &cr.UpdatedAt,
			&cr.Recipient.ID, &cr.Recipient.Username, &cr.Recipient.DisplayName,
			&cr.Recipient.AvatarURL, &cr.Recipient.Status, &cr.Recipient.LastSeen,
		); err != nil {
			continue
		}
		convos = append(convos, cr)
		convoIDs = append(convoIDs, cr.ID)
	}

	// Fetch last message for each conversation
	if len(convoIDs) > 0 {
		convoMap := make(map[string]*ConvResponse, len(convos))
		for i := range convos {
			convoMap[convos[i].ID] = &convos[i]
		}
		mrows, err := h.db.Query(r.Context(),
			`SELECT DISTINCT ON (m.conversation_id)
			        m.id, m.conversation_id, m.author_id, m.content, m.created_at,
			        u.id, u.username, u.display_name, u.avatar_url
			 FROM messages m
			 JOIN users u ON m.author_id = u.id
			 WHERE m.conversation_id = ANY($1)
			 ORDER BY m.conversation_id, m.created_at DESC`, convoIDs)
		if err == nil {
			defer mrows.Close()
			for mrows.Next() {
				var msg models.Message
				var convID string
				var author models.User
				if err := mrows.Scan(
					&msg.ID, &convID, &msg.AuthorID, &msg.Content, &msg.CreatedAt,
					&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
				); err == nil {
					msg.ConversationID = &convID
					msg.Author = &author
					if cr, ok := convoMap[convID]; ok {
						cr.LastMessage = &msg
					}
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, convos)
}

// CreateOrOpen creates a new DM conversation with a user, or returns the existing one.
func (h *DMHandler) CreateOrOpen(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var body struct {
		RecipientID string `json:"recipient_id"`
	}
	if err := readJSON(r, &body); err != nil || body.RecipientID == "" {
		writeError(w, http.StatusBadRequest, "recipient_id is required")
		return
	}
	if body.RecipientID == userID {
		writeError(w, http.StatusBadRequest, "cannot DM yourself")
		return
	}

	// Check recipient exists
	var exists bool
	h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, body.RecipientID).Scan(&exists)
	if !exists {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// ── Serialized check-then-create inside a transaction with advisory lock ──
	// This prevents two concurrent requests from both creating duplicate conversations.
	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(ctx)

	// Deterministic advisory lock key from sorted user pair
	pairKey := userID + ":" + body.RecipientID
	if body.RecipientID < userID {
		pairKey = body.RecipientID + ":" + userID
	}
	lockKey := int64(crc32.ChecksumIEEE([]byte(pairKey)))
	tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey)

	// Re-check for existing conversation inside the lock
	var existingID string
	err = tx.QueryRow(ctx,
		`SELECT cm1.conversation_id FROM conversation_members cm1
		 JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
		 WHERE cm1.user_id = $1 AND cm2.user_id = $2`, userID, body.RecipientID).Scan(&existingID)
	if err == nil {
		tx.Rollback(ctx)

		// Return existing conversation
		var conv models.Conversation
		h.db.QueryRow(ctx,
			`SELECT id, created_at, updated_at FROM conversations WHERE id = $1`, existingID,
		).Scan(&conv.ID, &conv.CreatedAt, &conv.UpdatedAt)

		var recipient models.User
		h.db.QueryRow(ctx,
			`SELECT id, username, display_name, avatar_url, status, last_seen FROM users WHERE id = $1`, body.RecipientID,
		).Scan(&recipient.ID, &recipient.Username, &recipient.DisplayName, &recipient.AvatarURL, &recipient.Status, &recipient.LastSeen)

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id":         conv.ID,
			"created_at": conv.CreatedAt,
			"updated_at": conv.UpdatedAt,
			"recipient":  recipient,
		})
		return
	}

	// Create new conversation inside the same transaction (lock still held)
	convID := uuid.New().String()
	now := time.Now()

	_, err = tx.Exec(ctx,
		`INSERT INTO conversations (id, created_at, updated_at) VALUES ($1, $2, $3)`,
		convID, now, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create conversation")
		return
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3), ($1, $4, $3)`,
		convID, userID, now, body.RecipientID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add members")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var recipient models.User
	h.db.QueryRow(r.Context(),
		`SELECT id, username, display_name, avatar_url, status, last_seen FROM users WHERE id = $1`, body.RecipientID,
	).Scan(&recipient.ID, &recipient.Username, &recipient.DisplayName, &recipient.AvatarURL, &recipient.Status, &recipient.LastSeen)

	// Fetch the initiator's info so the recipient can render their sidebar entry
	var initiator models.User
	h.db.QueryRow(r.Context(),
		`SELECT id, username, display_name, avatar_url, status, last_seen FROM users WHERE id = $1`, userID,
	).Scan(&initiator.ID, &initiator.Username, &initiator.DisplayName, &initiator.AvatarURL, &initiator.Status, &initiator.LastSeen)

	convPayload := map[string]interface{}{
		"id":         convID,
		"created_at": now,
		"updated_at": now,
		"recipient":  recipient,
	}

	// Push new conversation to recipient so their sidebar updates in real-time
	recipientPayload := map[string]interface{}{
		"id":         convID,
		"created_at": now,
		"updated_at": now,
		"recipient":  initiator,
	}
	h.hub.SendToUser(body.RecipientID, ws.NewEvent(ws.OpDMConversationCreate, recipientPayload))

	writeJSON(w, http.StatusCreated, convPayload)
}

// Messages returns messages in a conversation.
func (h *DMHandler) Messages(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationID")
	userID := middleware.GetUserID(r.Context())

	// Verify membership
	var isMember bool
	h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2)`,
		convID, userID).Scan(&isMember)
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this conversation")
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	query := `SELECT m.id, m.conversation_id, m.author_id, m.content, m.edited_at, m.created_at,
	                  u.id, u.username, u.display_name, u.avatar_url
	           FROM messages m JOIN users u ON m.author_id = u.id
	           WHERE m.conversation_id = $1`
	args := []interface{}{convID}

	if before := r.URL.Query().Get("before"); before != "" {
		query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $2 AND conversation_id = $1)`
		args = append(args, before)
	}

	query += ` ORDER BY m.created_at DESC LIMIT ` + strconv.Itoa(limit)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	messages := []models.Message{}
	for rows.Next() {
		var m models.Message
		var author models.User
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.EditedAt, &m.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL); err != nil {
			continue
		}
		m.Author = &author
		messages = append(messages, m)
	}

	// Reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	// Fetch reactions for all messages
	if len(messages) > 0 {
		msgIDs := make([]string, len(messages))
		msgMap := make(map[string]*models.Message, len(messages))
		for i := range messages {
			msgIDs[i] = messages[i].ID
			msgMap[messages[i].ID] = &messages[i]
		}
		rrows, rerr := h.db.Query(r.Context(),
			`SELECT message_id, emoji, array_agg(user_id) AS users, count(*) AS cnt
			 FROM reactions WHERE message_id = ANY($1)
			 GROUP BY message_id, emoji
			 ORDER BY min(created_at)`, msgIDs)
		if rerr == nil {
			defer rrows.Close()
			for rrows.Next() {
				var mid, emoji string
				var users []string
				var cnt int
				if rrows.Scan(&mid, &emoji, &users, &cnt) == nil {
					if m, ok := msgMap[mid]; ok {
						m.Reactions = append(m.Reactions, models.ReactionAgg{Emoji: emoji, Count: cnt, Users: users})
					}
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, messages)
}

// SendMessage sends a message in a DM conversation.
func (h *DMHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationID")
	userID := middleware.GetUserID(r.Context())

	// Verify membership
	var isMember bool
	h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2)`,
		convID, userID).Scan(&isMember)
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this conversation")
		return
	}

	var body struct {
		Content       string   `json:"content"`
		AttachmentIDs []string `json:"attachment_ids"`
	}
	if err := readJSON(r, &body); err != nil || (body.Content == "" && len(body.AttachmentIDs) == 0) {
		writeError(w, http.StatusBadRequest, "content or attachments required")
		return
	}
	if len(body.Content) > 4000 {
		writeError(w, http.StatusBadRequest, "content too long (max 4000)")
		return
	}
	if len(body.AttachmentIDs) > maxAttachmentsPerMessage {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("too many attachments (max %d)", maxAttachmentsPerMessage))
		return
	}

	msg := models.Message{
		ID:             uuid.New().String(),
		ConversationID: &convID,
		AuthorID:       userID,
		Content:        body.Content,
		CreatedAt:      time.Now(),
	}

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO messages (id, conversation_id, author_id, content, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		msg.ID, msg.ConversationID, msg.AuthorID, msg.Content, msg.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create message")
		return
	}

	// Update conversation updated_at
	h.db.Exec(r.Context(),
		`UPDATE conversations SET updated_at = $1 WHERE id = $2`, msg.CreatedAt, convID)

	// Link attachments (only those owned by this user)
	for _, aid := range body.AttachmentIDs {
		if _, err := h.db.Exec(r.Context(),
			`UPDATE attachments SET message_id = $1 WHERE id = $2 AND message_id IS NULL AND uploader_id = $3`,
			msg.ID, aid, userID); err != nil {
			log.Printf("dm: failed to link attachment %s: %v", aid, err)
		}
	}

	// Fetch linked attachments for the WS broadcast
	if len(body.AttachmentIDs) > 0 {
		arows, aErr := h.db.Query(r.Context(),
			`SELECT id, message_id, filename, url, content_type, size_bytes FROM attachments WHERE message_id = $1`, msg.ID)
		if aErr == nil {
			defer arows.Close()
			for arows.Next() {
				var a models.Attachment
				if arows.Scan(&a.ID, &a.MessageID, &a.Filename, &a.URL, &a.ContentType, &a.SizeBytes) == nil {
					msg.Attachments = append(msg.Attachments, a)
				}
			}
		}
	}

	// Fetch author info
	var author models.User
	h.db.QueryRow(r.Context(),
		`SELECT id, username, display_name, avatar_url FROM users WHERE id = $1`, userID,
	).Scan(&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL)
	msg.Author = &author

	// Send via WS to all conversation members except the sender
	// (sender already gets the full message in the HTTP response)
	evt := ws.NewEvent(ws.OpDMMessageCreate, msg)
	rows, err := h.db.Query(r.Context(),
		`SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2`, convID, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var uid string
			if rows.Scan(&uid) == nil {
				h.hub.SendToUser(uid, evt)
			}
		}
	}

	// Create notification for the other user
	if h.notifH != nil {
		mrows, _ := h.db.Query(r.Context(),
			`SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2`,
			convID, userID)
		if mrows != nil {
			defer mrows.Close()
			for mrows.Next() {
				var recipientID string
				if mrows.Scan(&recipientID) == nil {
					title := author.DisplayName + " sent you a message"
					bodyStr := body.Content
					go h.notifH.CreateNotification(recipientID, "dm", title, &bodyStr, &msg.ID, nil, nil, &userID)
				}
			}
		}
	}

	writeJSON(w, http.StatusCreated, msg)
}

// AckDM marks a DM conversation as read up to a given message for the current user.
func (h *DMHandler) AckDM(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationID")
	userID := middleware.GetUserID(r.Context())

	// Verify membership
	var isMember bool
	h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2)`,
		convID, userID).Scan(&isMember)
	if !isMember {
		writeError(w, http.StatusForbidden, "not a member of this conversation")
		return
	}

	var body struct {
		MessageID string `json:"message_id"`
	}
	if err := readJSON(r, &body); err != nil || body.MessageID == "" {
		writeError(w, http.StatusBadRequest, "message_id is required")
		return
	}

	// Verify message belongs to this conversation
	var belongs bool
	h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2)`,
		body.MessageID, convID).Scan(&belongs)
	if !belongs {
		writeError(w, http.StatusBadRequest, "message does not belong to this conversation")
		return
	}

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO dm_read_states (user_id, conversation_id, last_read_message_id, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (user_id, conversation_id) DO UPDATE
		 SET last_read_message_id = EXCLUDED.last_read_message_id, updated_at = now()`,
		userID, convID, body.MessageID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ack conversation")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DMReadStates returns unread counts for all conversations the user is a member of.
func (h *DMHandler) DMReadStates(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	rows, err := h.db.Query(r.Context(),
		`SELECT c.id,
		        COALESCE(rs.last_read_message_id::text, '') AS last_read_message_id,
		        (SELECT COUNT(*) FROM messages m
		         WHERE m.conversation_id = c.id
		           AND (rs.last_read_message_id IS NULL OR m.created_at > (
		               SELECT created_at FROM messages WHERE id = rs.last_read_message_id
		           ))
		        ) AS unread_count
		 FROM conversations c
		 JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = $1
		 LEFT JOIN dm_read_states rs ON rs.conversation_id = c.id AND rs.user_id = $1`,
		userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	type dmState struct {
		ConversationID    string `json:"conversation_id"`
		LastReadMessageID string `json:"last_read_message_id"`
		UnreadCount       int    `json:"unread_count"`
	}
	states := []dmState{}
	for rows.Next() {
		var s dmState
		if rows.Scan(&s.ConversationID, &s.LastReadMessageID, &s.UnreadCount) == nil {
			states = append(states, s)
		}
	}

	writeJSON(w, http.StatusOK, states)
}
