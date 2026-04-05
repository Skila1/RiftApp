package repository

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type MessageRepo struct {
	db *pgxpool.Pool
}

func NewMessageRepo(db *pgxpool.Pool) *MessageRepo {
	return &MessageRepo{db: db}
}

func (r *MessageRepo) Create(ctx context.Context, msg *models.Message) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO messages (id, stream_id, conversation_id, author_id, content, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		msg.ID, msg.StreamID, msg.ConversationID, msg.AuthorID, msg.Content, msg.CreatedAt)
	return err
}

func (r *MessageRepo) ListByStream(ctx context.Context, streamID string, before *string, limit int) ([]models.Message, error) {
	query := `SELECT m.id, m.stream_id, m.author_id, m.content, m.edited_at, m.created_at,
	                  u.id, u.username, u.display_name, u.avatar_url
	           FROM messages m JOIN users u ON m.author_id = u.id
	           WHERE m.stream_id = $1`
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
		var m models.Message
		var author models.User
		var sid *string
		if err := rows.Scan(&m.ID, &sid, &m.AuthorID, &m.Content, &m.EditedAt, &m.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL); err != nil {
			return nil, err
		}
		m.StreamID = sid
		m.Author = &author
		messages = append(messages, m)
	}

	reverse(messages)
	if messages == nil {
		messages = []models.Message{}
	}
	return messages, rows.Err()
}

func (r *MessageRepo) ListByConversation(ctx context.Context, convID string, before *string, limit int) ([]models.Message, error) {
	query := `SELECT m.id, m.conversation_id, m.author_id, m.content, m.edited_at, m.created_at,
	                  u.id, u.username, u.display_name, u.avatar_url
	           FROM messages m JOIN users u ON m.author_id = u.id
	           WHERE m.conversation_id = $1`
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
		var m models.Message
		var author models.User
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.AuthorID, &m.Content, &m.EditedAt, &m.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL); err != nil {
			return nil, err
		}
		m.Author = &author
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

	var msg models.Message
	var author models.User
	err = r.db.QueryRow(ctx,
		`SELECT m.id, m.stream_id, m.conversation_id, m.author_id, m.content, m.edited_at, m.created_at,
		        u.id, u.username, u.display_name, u.avatar_url
		 FROM messages m JOIN users u ON m.author_id = u.id WHERE m.id = $1`, msgID,
	).Scan(&msg.ID, &msg.StreamID, &msg.ConversationID, &msg.AuthorID, &msg.Content, &msg.EditedAt, &msg.CreatedAt,
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL)
	if err != nil {
		return nil, err
	}
	msg.Author = &author
	return &msg, nil
}

func (r *MessageRepo) Delete(ctx context.Context, msgID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM messages WHERE id = $1`, msgID)
	return err
}

func (r *MessageRepo) GetByID(ctx context.Context, msgID string) (*models.Message, error) {
	var msg models.Message
	err := r.db.QueryRow(ctx,
		`SELECT id, stream_id, conversation_id, author_id, content, edited_at, created_at
		 FROM messages WHERE id = $1`, msgID,
	).Scan(&msg.ID, &msg.StreamID, &msg.ConversationID, &msg.AuthorID, &msg.Content, &msg.EditedAt, &msg.CreatedAt)
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
		`SELECT message_id, emoji, array_agg(user_id) AS users, count(*) AS cnt
		 FROM reactions WHERE message_id = ANY($1)
		 GROUP BY message_id, emoji
		 ORDER BY min(created_at)`, msgIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var mid, emoji string
		var users []string
		var cnt int
		if err := rows.Scan(&mid, &emoji, &users, &cnt); err != nil {
			return nil, err
		}
		result[mid] = append(result[mid], models.ReactionAgg{Emoji: emoji, Count: cnt, Users: users})
	}
	return result, rows.Err()
}

func (r *MessageRepo) AddReaction(ctx context.Context, msgID, userID, emoji string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4)
		 ON CONFLICT DO NOTHING`,
		msgID, userID, emoji, time.Now())
	return err
}

func (r *MessageRepo) RemoveReaction(ctx context.Context, msgID, userID, emoji string) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
		msgID, userID, emoji)
	return err
}

func (r *MessageRepo) ReactionExists(ctx context.Context, msgID, userID, emoji string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3)`,
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
		`SELECT id, username, display_name, avatar_url, bio FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL, &user.Bio)
	if err != nil {
		return nil, err
	}
	return &user, nil
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

	return nil
}

func reverse(msgs []models.Message) {
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
}

func (r *MessageRepo) GetDB() *pgxpool.Pool {
	return r.db
}
