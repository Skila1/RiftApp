package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type MessageRepo struct {
	db *pgxpool.Pool
}

const detailedMessageSelect = `m.id, m.stream_id, m.conversation_id, m.author_id, m.content, m.edited_at, m.created_at,
		m.reply_to_message_id, m.webhook_name, m.webhook_avatar_url,
		m.pinned_at, m.pinned_by_id,
		author.id, author.username, author.display_name, author.avatar_url, author.is_bot,
		pinner.id, pinner.username, pinner.display_name, pinner.avatar_url`

const detailedMessageFrom = `FROM messages m
	JOIN users author ON m.author_id = author.id
	LEFT JOIN users pinner ON m.pinned_by_id = pinner.id`

type messageScanner interface {
	Scan(dest ...interface{}) error
}

type MessageSearchFilters struct {
	Query      string
	StreamID   *string
	AuthorID   *string
	AuthorType string
	Mention    string
	Has        string
	Before     *time.Time
	After      *time.Time
	StartAt    *time.Time
	EndAt      *time.Time
	PinnedOnly bool
	LinkOnly   bool
	Filename   string
	Extension  string
	Limit      int
}

func NewMessageRepo(db *pgxpool.Pool) *MessageRepo {
	return &MessageRepo{db: db}
}

func scanDetailedMessage(scanner messageScanner) (models.Message, error) {
	var msg models.Message
	var author models.User
	var authorIsBot bool
	var pinnerID *string
	var pinnerUsername *string
	var pinnerDisplayName *string
	var pinnerAvatarURL *string

	err := scanner.Scan(
		&msg.ID,
		&msg.StreamID,
		&msg.ConversationID,
		&msg.AuthorID,
		&msg.Content,
		&msg.EditedAt,
		&msg.CreatedAt,
		&msg.ReplyToMessageID,
		&msg.WebhookName,
		&msg.WebhookAvatarURL,
		&msg.PinnedAt,
		&msg.PinnedByID,
		&author.ID,
		&author.Username,
		&author.DisplayName,
		&author.AvatarURL,
		&authorIsBot,
		&pinnerID,
		&pinnerUsername,
		&pinnerDisplayName,
		&pinnerAvatarURL,
	)
	if err != nil {
		return models.Message{}, err
	}

	author.IsBot = authorIsBot
	msg.Author = &author
	msg.Pinned = msg.PinnedAt != nil
	switch {
	case msg.WebhookName != nil && *msg.WebhookName != "":
		msg.AuthorType = "webhook"
	case author.IsBot:
		msg.AuthorType = "bot"
	default:
		msg.AuthorType = "user"
	}

	if pinnerID != nil {
		pinner := &models.User{ID: *pinnerID, AvatarURL: pinnerAvatarURL}
		if pinnerUsername != nil {
			pinner.Username = *pinnerUsername
		}
		if pinnerDisplayName != nil {
			pinner.DisplayName = *pinnerDisplayName
		}
		msg.PinnedBy = pinner
	}

	return msg, nil
}

func (r *MessageRepo) Create(ctx context.Context, msg *models.Message) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO messages (id, stream_id, conversation_id, author_id, content, reply_to_message_id, webhook_name, webhook_avatar_url, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		msg.ID, msg.StreamID, msg.ConversationID, msg.AuthorID, msg.Content, msg.ReplyToMessageID, msg.WebhookName, msg.WebhookAvatarURL, msg.CreatedAt)
	return err
}

func (r *MessageRepo) ListByStream(ctx context.Context, streamID string, before *string, limit int) ([]models.Message, error) {
	query := `SELECT ` + detailedMessageSelect + ` ` + detailedMessageFrom + ` WHERE m.stream_id = $1`
	args := []interface{}{streamID}

	if before != nil {
		query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)`
		args = append(args, *before)
	}

	query += ` ORDER BY m.created_at DESC LIMIT ` + strconv.Itoa(limit)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		m, err := scanDetailedMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}

	reverse(messages)
	if messages == nil {
		messages = []models.Message{}
	}
	return messages, rows.Err()
}

func (r *MessageRepo) ListByConversation(ctx context.Context, convID string, before *string, limit int) ([]models.Message, error) {
	query := `SELECT ` + detailedMessageSelect + ` ` + detailedMessageFrom + ` WHERE m.conversation_id = $1`
	args := []interface{}{convID}

	if before != nil {
		query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $2 AND conversation_id = $1)`
		args = append(args, *before)
	}

	query += ` ORDER BY m.created_at DESC LIMIT ` + strconv.Itoa(limit)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		m, err := scanDetailedMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}

	reverse(messages)
	if messages == nil {
		messages = []models.Message{}
	}
	return messages, rows.Err()
}

func (r *MessageRepo) Update(ctx context.Context, msgID, authorID, content string) (*models.Message, error) {
	now := time.Now()
	result, err := r.db.Exec(ctx,
		`UPDATE messages SET content = $1, edited_at = $2 WHERE id = $3 AND author_id = $4`,
		content, now, msgID, authorID)
	if err != nil {
		return nil, err
	}
	if result.RowsAffected() == 0 {
		return nil, nil
	}

	return r.GetDetailedByID(ctx, msgID)
}

func (r *MessageRepo) Delete(ctx context.Context, msgID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM messages WHERE id = $1`, msgID)
	return err
}

func (r *MessageRepo) GetByID(ctx context.Context, msgID string) (*models.Message, error) {
	var msg models.Message
	err := r.db.QueryRow(ctx,
		`SELECT id, stream_id, conversation_id, author_id, content, edited_at, created_at,
		        reply_to_message_id, webhook_name, webhook_avatar_url, pinned_at, pinned_by_id
		 FROM messages WHERE id = $1`, msgID,
	).Scan(
		&msg.ID,
		&msg.StreamID,
		&msg.ConversationID,
		&msg.AuthorID,
		&msg.Content,
		&msg.EditedAt,
		&msg.CreatedAt,
		&msg.ReplyToMessageID,
		&msg.WebhookName,
		&msg.WebhookAvatarURL,
		&msg.PinnedAt,
		&msg.PinnedByID,
	)
	if err != nil {
		return nil, err
	}
	msg.Pinned = msg.PinnedAt != nil
	return &msg, nil
}

func (r *MessageRepo) GetDetailedByID(ctx context.Context, msgID string) (*models.Message, error) {
	msg, err := scanDetailedMessage(r.db.QueryRow(ctx,
		`SELECT `+detailedMessageSelect+` `+detailedMessageFrom+` WHERE m.id = $1`, msgID,
	))
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

func (r *MessageRepo) FetchAttachments(ctx context.Context, msgIDs []string) (map[string][]models.Attachment, error) {
	result := make(map[string][]models.Attachment)
	if len(msgIDs) == 0 {
		return result, nil
	}

	rows, err := r.db.Query(ctx,
		`SELECT id, message_id, filename, url, content_type, size_bytes
		 FROM attachments WHERE message_id = ANY($1)`, msgIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var a models.Attachment
		if err := rows.Scan(&a.ID, &a.MessageID, &a.Filename, &a.URL, &a.ContentType, &a.SizeBytes); err != nil {
			return nil, err
		}
		result[a.MessageID] = append(result[a.MessageID], a)
	}
	return result, rows.Err()
}

func (r *MessageRepo) FetchReactions(ctx context.Context, msgIDs []string) (map[string][]models.ReactionAgg, error) {
	result := make(map[string][]models.ReactionAgg)
	if len(msgIDs) == 0 {
		return result, nil
	}

	rows, err := r.db.Query(ctx,
		`SELECT r.message_id, r.emoji, r.emoji_id, e.file_url,
		        array_agg(r.user_id) AS users, count(*) AS cnt
		 FROM reactions r
		 LEFT JOIN hub_emojis e ON r.emoji_id = e.id
		 WHERE r.message_id = ANY($1)
		 GROUP BY r.message_id, r.emoji, r.emoji_id, e.file_url
		 ORDER BY min(r.created_at)`, msgIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var mid, emoji string
		var emojiID, fileURL *string
		var users []string
		var cnt int
		if err := rows.Scan(&mid, &emoji, &emojiID, &fileURL, &users, &cnt); err != nil {
			return nil, err
		}
		result[mid] = append(result[mid], models.ReactionAgg{Emoji: emoji, EmojiID: emojiID, FileURL: fileURL, Count: cnt, Users: users})
	}
	return result, rows.Err()
}

func (r *MessageRepo) AddReaction(ctx context.Context, msgID, userID, emoji string, emojiID *string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO reactions (message_id, user_id, emoji, emoji_id, created_at) VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT DO NOTHING`,
		msgID, userID, emoji, emojiID, time.Now())
	return err
}

func (r *MessageRepo) RemoveReaction(ctx context.Context, msgID, userID, emoji string, emojiID *string) error {
	if emojiID != nil {
		_, err := r.db.Exec(ctx,
			`DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji_id = $3`,
			msgID, userID, *emojiID)
		return err
	}
	_, err := r.db.Exec(ctx,
		`DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3 AND emoji_id IS NULL`,
		msgID, userID, emoji)
	return err
}

func (r *MessageRepo) ReactionExists(ctx context.Context, msgID, userID, emoji string, emojiID *string) (bool, error) {
	var exists bool
	if emojiID != nil {
		err := r.db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji_id=$3)`,
			msgID, userID, *emojiID).Scan(&exists)
		return exists, err
	}
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3 AND emoji_id IS NULL)`,
		msgID, userID, emoji).Scan(&exists)
	return exists, err
}

func (r *MessageRepo) LinkAttachments(ctx context.Context, msgID, uploaderID string, attachmentIDs []string) error {
	for _, aid := range attachmentIDs {
		_, err := r.db.Exec(ctx,
			`UPDATE attachments SET message_id = $1 WHERE id = $2 AND message_id IS NULL AND uploader_id = $3`,
			msgID, aid, uploaderID)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *MessageRepo) GetLinkedAttachments(ctx context.Context, msgID string) ([]models.Attachment, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, message_id, filename, url, content_type, size_bytes FROM attachments WHERE message_id = $1`, msgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var attachments []models.Attachment
	for rows.Next() {
		var a models.Attachment
		if err := rows.Scan(&a.ID, &a.MessageID, &a.Filename, &a.URL, &a.ContentType, &a.SizeBytes); err != nil {
			return nil, err
		}
		attachments = append(attachments, a)
	}
	return attachments, rows.Err()
}

func (r *MessageRepo) GetAuthorInfo(ctx context.Context, userID string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(ctx,
		`SELECT id, username, display_name, avatar_url, bio, is_bot FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL, &user.Bio, &user.IsBot)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *MessageRepo) FetchReplyTargets(ctx context.Context, replyIDs []string) (map[string]models.Message, error) {
	result := make(map[string]models.Message)
	if len(replyIDs) == 0 {
		return result, nil
	}

	rows, err := r.db.Query(ctx,
		`SELECT `+detailedMessageSelect+` `+detailedMessageFrom+` WHERE m.id = ANY($1)`,
		replyIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	msgIDs := make([]string, 0, len(replyIDs))
	for rows.Next() {
		msg, err := scanDetailedMessage(rows)
		if err != nil {
			return nil, err
		}
		msgIDs = append(msgIDs, msg.ID)
		result[msg.ID] = msg
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	attachments, err := r.FetchAttachments(ctx, msgIDs)
	if err != nil {
		return nil, err
	}
	for id, atts := range attachments {
		msg := result[id]
		msg.Attachments = atts
		result[id] = msg
	}

	return result, nil
}

func (r *MessageRepo) Pin(ctx context.Context, msgID, pinnedByID string, pinnedAt time.Time) error {
	_, err := r.db.Exec(ctx,
		`UPDATE messages SET pinned_at = $1, pinned_by_id = $2 WHERE id = $3`,
		pinnedAt, pinnedByID, msgID,
	)
	return err
}

func (r *MessageRepo) Unpin(ctx context.Context, msgID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE messages SET pinned_at = NULL, pinned_by_id = NULL WHERE id = $1`,
		msgID,
	)
	return err
}

func (r *MessageRepo) ListPinnedByStream(ctx context.Context, streamID string, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	rows, err := r.db.Query(ctx,
		`SELECT `+detailedMessageSelect+` `+detailedMessageFrom+`
		 WHERE m.stream_id = $1 AND m.pinned_at IS NOT NULL
		 ORDER BY m.pinned_at DESC, m.created_at DESC
		 LIMIT `+strconv.Itoa(limit),
		streamID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		msg, err := scanDetailedMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}
	if messages == nil {
		messages = []models.Message{}
	}
	return messages, rows.Err()
}

func (r *MessageRepo) SearchInHub(ctx context.Context, hubID string, filters MessageSearchFilters) ([]models.Message, error) {
	limit := filters.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	clauses := []string{"s.hub_id = $1", "s.type = 0"}
	args := []interface{}{hubID}
	addArg := func(value interface{}) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	if filters.StreamID != nil && *filters.StreamID != "" {
		clauses = append(clauses, "m.stream_id = "+addArg(*filters.StreamID))
	}
	if filters.Query != "" {
		clauses = append(clauses, "m.content ILIKE "+addArg("%"+filters.Query+"%"))
	}
	if filters.AuthorID != nil && *filters.AuthorID != "" {
		clauses = append(clauses, "m.author_id = "+addArg(*filters.AuthorID))
	}
	switch strings.ToLower(strings.TrimSpace(filters.AuthorType)) {
	case "user":
		clauses = append(clauses, "m.webhook_name IS NULL", "author.is_bot = false")
	case "bot":
		clauses = append(clauses, "m.webhook_name IS NULL", "author.is_bot = true")
	case "webhook":
		clauses = append(clauses, "m.webhook_name IS NOT NULL")
	}
	if mention := strings.TrimSpace(filters.Mention); mention != "" {
		clauses = append(clauses, "m.content ILIKE "+addArg("%@"+mention+"%"))
	}
	if filters.PinnedOnly {
		clauses = append(clauses, "m.pinned_at IS NOT NULL")
	}
	if filters.LinkOnly {
		clauses = append(clauses, `m.content ~* '(https?://|www\\.)'`)
	}
	if filters.Filename != "" {
		clauses = append(clauses, `EXISTS (
			SELECT 1 FROM attachments a
			WHERE a.message_id = m.id AND a.filename ILIKE `+addArg("%"+filters.Filename+"%")+`
		)`)
	}
	if ext := strings.TrimSpace(strings.TrimPrefix(strings.ToLower(filters.Extension), ".")); ext != "" {
		clauses = append(clauses, `EXISTS (
			SELECT 1 FROM attachments a
			WHERE a.message_id = m.id AND lower(a.filename) LIKE `+addArg("%."+ext)+`
		)`)
	}

	switch strings.ToLower(strings.TrimSpace(filters.Has)) {
	case "file":
		clauses = append(clauses, `EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id)`)
	case "image":
		clauses = append(clauses, `EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.content_type LIKE 'image/%')`)
	case "video":
		clauses = append(clauses, `EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.content_type LIKE 'video/%')`)
	case "audio":
		clauses = append(clauses, `EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.content_type LIKE 'audio/%')`)
	case "link", "embed":
		clauses = append(clauses, `m.content ~* '(https?://|www\\.)'`)
	}

	if filters.After != nil {
		clauses = append(clauses, "m.created_at > "+addArg(*filters.After))
	}
	if filters.Before != nil {
		clauses = append(clauses, "m.created_at < "+addArg(*filters.Before))
	}
	if filters.StartAt != nil {
		clauses = append(clauses, "m.created_at >= "+addArg(*filters.StartAt))
	}
	if filters.EndAt != nil {
		clauses = append(clauses, "m.created_at < "+addArg(*filters.EndAt))
	}

	query := `SELECT ` + detailedMessageSelect + `
		FROM messages m
		JOIN streams s ON s.id = m.stream_id
		JOIN users author ON m.author_id = author.id
		LEFT JOIN users pinner ON m.pinned_by_id = pinner.id
		WHERE ` + strings.Join(clauses, ` AND `) + `
		ORDER BY m.created_at DESC
		LIMIT ` + strconv.Itoa(limit)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		msg, err := scanDetailedMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}
	if messages == nil {
		messages = []models.Message{}
	}
	return messages, rows.Err()
}

func (r *MessageRepo) EnrichMessages(ctx context.Context, messages []models.Message) error {
	if len(messages) == 0 {
		return nil
	}

	msgIDs := make([]string, len(messages))
	msgMap := make(map[string]*models.Message, len(messages))
	for i := range messages {
		msgIDs[i] = messages[i].ID
		msgMap[messages[i].ID] = &messages[i]
	}

	attachments, err := r.FetchAttachments(ctx, msgIDs)
	if err != nil {
		return err
	}
	for id, atts := range attachments {
		if m, ok := msgMap[id]; ok {
			m.Attachments = atts
		}
	}

	reactions, err := r.FetchReactions(ctx, msgIDs)
	if err != nil {
		return err
	}
	for id, reacts := range reactions {
		if m, ok := msgMap[id]; ok {
			m.Reactions = reacts
		}
	}

	replyIDs := make([]string, 0)
	seenReplyIDs := make(map[string]struct{})
	for i := range messages {
		if messages[i].ReplyToMessageID == nil || *messages[i].ReplyToMessageID == "" {
			continue
		}
		if _, ok := seenReplyIDs[*messages[i].ReplyToMessageID]; ok {
			continue
		}
		seenReplyIDs[*messages[i].ReplyToMessageID] = struct{}{}
		replyIDs = append(replyIDs, *messages[i].ReplyToMessageID)
	}

	replyTargets, err := r.FetchReplyTargets(ctx, replyIDs)
	if err != nil {
		return err
	}
	for i := range messages {
		if messages[i].ReplyToMessageID == nil {
			continue
		}
		reply, ok := replyTargets[*messages[i].ReplyToMessageID]
		if !ok {
			continue
		}
		replyCopy := reply
		messages[i].ReplyTo = &replyCopy
	}

	return nil
}

func reverse(msgs []models.Message) {
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
}

// LatestMessageIDsForHubTextStreams returns the newest message id per text stream in the hub.
func (r *MessageRepo) LatestMessageIDsForHubTextStreams(ctx context.Context, hubID string) (map[string]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT DISTINCT ON (m.stream_id) m.stream_id::text, m.id::text
		 FROM messages m
		 INNER JOIN streams s ON s.id = m.stream_id AND s.hub_id = $1 AND s.type = 0
		 ORDER BY m.stream_id, m.created_at DESC`,
		hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]string)
	for rows.Next() {
		var sid, mid string
		if err := rows.Scan(&sid, &mid); err != nil {
			return nil, err
		}
		out[sid] = mid
	}
	return out, rows.Err()
}

func (r *MessageRepo) GetDB() *pgxpool.Pool {
	return r.db
}
