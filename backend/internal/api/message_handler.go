package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riptide-cloud/riptide/internal/middleware"
	"github.com/riptide-cloud/riptide/internal/models"
	"github.com/riptide-cloud/riptide/internal/ws"
)

var mentionRegex = regexp.MustCompile(`@(\w+)`)

type MessageHandler struct {
	db     *pgxpool.Pool
	hub    *ws.Hub
	notifH *NotifHandler
}

func NewMessageHandler(db *pgxpool.Pool, hub *ws.Hub) *MessageHandler {
	return &MessageHandler{db: db, hub: hub}
}

func (h *MessageHandler) List(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	query := `SELECT m.id, m.stream_id, m.author_id, m.content, m.edited_at, m.created_at,
	                  u.id, u.username, u.display_name, u.avatar_url
	           FROM messages m JOIN users u ON m.author_id = u.id
	           WHERE m.stream_id = $1`
	args := []interface{}{streamID}

	if before := r.URL.Query().Get("before"); before != "" {
		query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)`
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
		var sid *string
		if err := rows.Scan(&m.ID, &sid, &m.AuthorID, &m.Content, &m.EditedAt, &m.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL); err != nil {
			continue
		}
		m.StreamID = sid
		m.Author = &author
		messages = append(messages, m)
	}

	// Reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	// Fetch attachments for all messages
	if len(messages) > 0 {
		msgIDs := make([]string, len(messages))
		msgMap := make(map[string]*models.Message, len(messages))
		for i := range messages {
			msgIDs[i] = messages[i].ID
			msgMap[messages[i].ID] = &messages[i]
		}
		arows, err := h.db.Query(r.Context(),
			`SELECT id, message_id, filename, url, content_type, size_bytes
			 FROM attachments WHERE message_id = ANY($1)`, msgIDs)
		if err == nil {
			defer arows.Close()
			for arows.Next() {
				var a models.Attachment
				if err := arows.Scan(&a.ID, &a.MessageID, &a.Filename, &a.URL, &a.ContentType, &a.SizeBytes); err == nil {
					if m, ok := msgMap[a.MessageID]; ok {
						m.Attachments = append(m.Attachments, a)
					}
				}
			}
		}
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

func (h *MessageHandler) Create(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())

	// Check send_messages permission
	hubID := hubIDForStream(r.Context(), h.db, streamID)
	if hubID == "" {
		writeError(w, http.StatusNotFound, "stream not found")
		return
	}
	if !memberHasPermission(r.Context(), h.db, hubID, userID, models.PermSendMessages) {
		writeError(w, http.StatusForbidden, "you do not have permission to send messages")
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
		ID:        uuid.New().String(),
		StreamID:  &streamID,
		AuthorID:  userID,
		Content:   body.Content,
		CreatedAt: time.Now(),
	}

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO messages (id, stream_id, author_id, content, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		msg.ID, msg.StreamID, msg.AuthorID, msg.Content, msg.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create message")
		return
	}

	// Link attachments to this message (only those owned by this user)
	for _, aid := range body.AttachmentIDs {
		if _, err := h.db.Exec(r.Context(),
			`UPDATE attachments SET message_id = $1 WHERE id = $2 AND message_id IS NULL AND uploader_id = $3`,
			msg.ID, aid, userID); err != nil {
			log.Printf("message: failed to link attachment %s: %v", aid, err)
		}
	}

	// Fetch linked attachments
	if len(body.AttachmentIDs) > 0 {
		arows, _ := h.db.Query(r.Context(),
			`SELECT id, message_id, filename, url, content_type, size_bytes FROM attachments WHERE message_id = $1`, msg.ID)
		if arows != nil {
			defer arows.Close()
			for arows.Next() {
				var a models.Attachment
				if err := arows.Scan(&a.ID, &a.MessageID, &a.Filename, &a.URL, &a.ContentType, &a.SizeBytes); err == nil {
					msg.Attachments = append(msg.Attachments, a)
				}
			}
		}
	}

	// Fetch author info
	var author models.User
	h.db.QueryRow(r.Context(),
		`SELECT id, username, display_name, avatar_url, bio FROM users WHERE id = $1`, userID,
	).Scan(&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL, &author.Bio)
	msg.Author = &author

	// Broadcast via WebSocket
	evt := ws.NewEvent(ws.OpMessageCreate, msg)
	h.hub.BroadcastToStream(streamID, evt, "")

	// Detect @mentions and create notifications (capped at 25 per message)
	if h.notifH != nil && body.Content != "" {
		const maxMentionsPerMessage = 25
		matches := mentionRegex.FindAllStringSubmatch(body.Content, -1)

		// Collect unique mentioned usernames (up to cap)
		uniqueUsernames := make([]string, 0, len(matches))
		seenNames := map[string]bool{}
		for _, match := range matches {
			username := match[1]
			if !seenNames[username] {
				seenNames[username] = true
				uniqueUsernames = append(uniqueUsernames, username)
			}
			if len(uniqueUsernames) >= maxMentionsPerMessage {
				break
			}
		}

		if len(uniqueUsernames) > 0 {
			// Resolve all usernames to member IDs in a single batch query
			mrows, err := h.db.Query(r.Context(),
				`SELECT u.username, hm.user_id
				 FROM hub_members hm JOIN users u ON hm.user_id = u.id
				 WHERE hm.hub_id = $1 AND u.username = ANY($2)`,
				hubID, uniqueUsernames)
			if err == nil {
				defer mrows.Close()
				usernameToID := make(map[string]string, len(uniqueUsernames))
				for mrows.Next() {
					var uname, uid string
					if mrows.Scan(&uname, &uid) == nil {
						usernameToID[uname] = uid
					}
				}
				// Fetch stream name once for all notifications
				sName := streamName(r.Context(), h.db, streamID)
				title := author.DisplayName + " mentioned you in #" + sName
				bodyStr := body.Content
				for _, username := range uniqueUsernames {
					mentionedID, ok := usernameToID[username]
					if !ok || mentionedID == userID {
						continue
					}
					mID, hID, sID, aID := msg.ID, hubID, streamID, userID
					go h.notifH.CreateNotification(mentionedID, "mention", title, &bodyStr, &mID, &hID, &sID, &aID)
				}
			}
		}
	}

	writeJSON(w, http.StatusCreated, msg)
}

func (h *MessageHandler) Update(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())

	var body struct {
		Content string `json:"content"`
	}
	if err := readJSON(r, &body); err != nil || body.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}

	now := time.Now()
	result, err := h.db.Exec(r.Context(),
		`UPDATE messages SET content = $1, edited_at = $2 WHERE id = $3 AND author_id = $4`,
		body.Content, now, msgID, userID)
	if err != nil || result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "message not found or unauthorized")
		return
	}

	// Fetch updated message
	var msg models.Message
	var author models.User
	h.db.QueryRow(r.Context(),
		`SELECT m.id, m.stream_id, m.conversation_id, m.author_id, m.content, m.edited_at, m.created_at,
		        u.id, u.username, u.display_name, u.avatar_url
		 FROM messages m JOIN users u ON m.author_id = u.id WHERE m.id = $1`, msgID,
	).Scan(&msg.ID, &msg.StreamID, &msg.ConversationID, &msg.AuthorID, &msg.Content, &msg.EditedAt, &msg.CreatedAt,
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL)
	msg.Author = &author

	if msg.StreamID != nil {
		evt := ws.NewEvent(ws.OpMessageUpdate, msg)
		h.hub.BroadcastToStream(*msg.StreamID, evt, "")
	} else if msg.ConversationID != nil {
		h.broadcastToConversation(r.Context(), *msg.ConversationID, ws.OpMessageUpdate, msg)
	}

	writeJSON(w, http.StatusOK, msg)
}

func (h *MessageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())

	// Fetch message to get stream_id/conversation_id and author_id
	var streamID, conversationID *string
	var authorID string
	err := h.db.QueryRow(r.Context(),
		`SELECT stream_id, conversation_id, author_id FROM messages WHERE id = $1`, msgID,
	).Scan(&streamID, &conversationID, &authorID)
	if err != nil {
		writeError(w, http.StatusNotFound, "message not found")
		return
	}

	// Allow delete if author, or if user has manage_messages permission
	if authorID != userID {
		if streamID != nil {
			hubID := hubIDForStream(r.Context(), h.db, *streamID)
			if !memberHasPermission(r.Context(), h.db, hubID, userID, models.PermManageMessages) {
				writeError(w, http.StatusForbidden, "you do not have permission to delete this message")
				return
			}
		} else {
			writeError(w, http.StatusForbidden, "you do not have permission to delete this message")
			return
		}
	}

	h.db.Exec(r.Context(), `DELETE FROM messages WHERE id = $1`, msgID)

	if streamID != nil {
		evt := ws.NewEvent(ws.OpMessageDelete, map[string]string{
			"id":        msgID,
			"stream_id": *streamID,
		})
		h.hub.BroadcastToStream(*streamID, evt, "")
	} else if conversationID != nil {
		h.broadcastToConversation(r.Context(), *conversationID, ws.OpMessageDelete, map[string]string{
			"id":              msgID,
			"conversation_id": *conversationID,
		})
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *MessageHandler) AddReaction(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())

	var body struct {
		Emoji string `json:"emoji"`
	}
	if err := readJSON(r, &body); err != nil || body.Emoji == "" {
		writeError(w, http.StatusBadRequest, "emoji is required")
		return
	}

	// Toggle: if reaction exists, remove it; otherwise add it
	var exists bool
	h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3)`,
		msgID, userID, body.Emoji).Scan(&exists)

	var streamID *string
	var conversationID *string
	h.db.QueryRow(r.Context(), `SELECT stream_id, conversation_id FROM messages WHERE id = $1`, msgID).Scan(&streamID, &conversationID)

	if exists {
		h.db.Exec(r.Context(),
			`DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
			msgID, userID, body.Emoji)

		if streamID != nil {
			evt := ws.NewEvent(ws.OpReactionRemove, map[string]string{
				"message_id": msgID,
				"user_id":    userID,
				"emoji":      body.Emoji,
				"stream_id":  *streamID,
			})
			h.hub.BroadcastToStream(*streamID, evt, "")
		} else if conversationID != nil {
			h.broadcastToConversation(r.Context(), *conversationID, ws.OpReactionRemove, map[string]string{
				"message_id":      msgID,
				"user_id":         userID,
				"emoji":           body.Emoji,
				"conversation_id": *conversationID,
			})
		}
	} else {
		_, err := h.db.Exec(r.Context(),
			`INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4)
			 ON CONFLICT DO NOTHING`,
			msgID, userID, body.Emoji, time.Now())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to add reaction")
			return
		}

		if streamID != nil {
			evt := ws.NewEvent(ws.OpReactionAdd, map[string]string{
				"message_id": msgID,
				"user_id":    userID,
				"emoji":      body.Emoji,
				"stream_id":  *streamID,
			})
			h.hub.BroadcastToStream(*streamID, evt, "")
		} else if conversationID != nil {
			h.broadcastToConversation(r.Context(), *conversationID, ws.OpReactionAdd, map[string]string{
				"message_id":      msgID,
				"user_id":         userID,
				"emoji":           body.Emoji,
				"conversation_id": *conversationID,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *MessageHandler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	emoji := chi.URLParam(r, "emoji")
	userID := middleware.GetUserID(r.Context())

	h.db.Exec(r.Context(),
		`DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
		msgID, userID, emoji)

	var streamID *string
	var conversationID *string
	h.db.QueryRow(r.Context(), `SELECT stream_id, conversation_id FROM messages WHERE id = $1`, msgID).Scan(&streamID, &conversationID)

	if streamID != nil {
		evt := ws.NewEvent(ws.OpReactionRemove, map[string]string{
			"message_id": msgID,
			"user_id":    userID,
			"emoji":      emoji,
			"stream_id":  *streamID,
		})
		h.hub.BroadcastToStream(*streamID, evt, "")
	} else if conversationID != nil {
		h.broadcastToConversation(r.Context(), *conversationID, ws.OpReactionRemove, map[string]string{
			"message_id":      msgID,
			"user_id":         userID,
			"emoji":           emoji,
			"conversation_id": *conversationID,
		})
	}

	w.WriteHeader(http.StatusNoContent)
}

// broadcastToConversation sends a WS event to all members of a DM conversation.
func (h *MessageHandler) broadcastToConversation(ctx context.Context, conversationID, op string, data interface{}) {
	rows, err := h.db.Query(ctx,
		`SELECT user_id FROM conversation_members WHERE conversation_id = $1`, conversationID)
	if err != nil {
		return
	}
	defer rows.Close()

	evt := ws.NewEvent(op, data)
	for rows.Next() {
		var uid string
		if rows.Scan(&uid) == nil {
			h.hub.SendToUser(uid, evt)
		}
	}
}
