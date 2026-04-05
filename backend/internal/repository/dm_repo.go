package repository

import (
	"context"
	"hash/crc32"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

type DMRepo struct {
	db *pgxpool.Pool
}

func NewDMRepo(db *pgxpool.Pool) *DMRepo {
	return &DMRepo{db: db}
}

type ConvResponse struct {
	models.Conversation
	Recipient models.User `json:"recipient"`
}

func (r *DMRepo) ListConversations(ctx context.Context, userID string) ([]ConvResponse, error) {
	rows, err := r.db.Query(ctx,
		`SELECT c.id, c.created_at, c.updated_at,
		        u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen
		 FROM conversations c
		 JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
		 JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id != $1
		 JOIN users u ON cm2.user_id = u.id
		 ORDER BY c.updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convos []ConvResponse
	for rows.Next() {
		var cr ConvResponse
		if err := rows.Scan(
			&cr.ID, &cr.CreatedAt, &cr.UpdatedAt,
			&cr.Recipient.ID, &cr.Recipient.Username, &cr.Recipient.DisplayName,
			&cr.Recipient.AvatarURL, &cr.Recipient.Status, &cr.Recipient.LastSeen,
		); err != nil {
			return nil, err
		}
		convos = append(convos, cr)
	}
	if convos == nil {
		convos = []ConvResponse{}
	}
	return convos, rows.Err()
}

func (r *DMRepo) FetchLastMessages(ctx context.Context, convoIDs []string) (map[string]models.Message, error) {
	result := make(map[string]models.Message)
	if len(convoIDs) == 0 {
		return result, nil
	}

	rows, err := r.db.Query(ctx,
		`SELECT DISTINCT ON (m.conversation_id)
		        m.id, m.conversation_id, m.author_id, m.content, m.created_at,
		        u.id, u.username, u.display_name, u.avatar_url
		 FROM messages m
		 JOIN users u ON m.author_id = u.id
		 WHERE m.conversation_id = ANY($1)
		 ORDER BY m.conversation_id, m.created_at DESC`, convoIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var msg models.Message
		var convID string
		var author models.User
		if err := rows.Scan(
			&msg.ID, &convID, &msg.AuthorID, &msg.Content, &msg.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
		); err != nil {
			return nil, err
		}
		msg.ConversationID = &convID
		msg.Author = &author
		result[convID] = msg
	}
	return result, rows.Err()
}

func (r *DMRepo) UserExists(ctx context.Context, userID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, userID).Scan(&exists)
	return exists, err
}

func (r *DMRepo) FindExistingConversation(ctx context.Context, tx pgx.Tx, userID, recipientID string) (string, error) {
	var existingID string
	err := tx.QueryRow(ctx,
		`SELECT cm1.conversation_id FROM conversation_members cm1
		 JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
		 WHERE cm1.user_id = $1 AND cm2.user_id = $2`, userID, recipientID).Scan(&existingID)
	return existingID, err
}

func (r *DMRepo) CreateConversation(ctx context.Context, tx pgx.Tx, convID, userID, recipientID string, now time.Time) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO conversations (id, created_at, updated_at) VALUES ($1, $2, $3)`,
		convID, now, now)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3), ($1, $4, $3)`,
		convID, userID, now, recipientID)
	return err
}

func (r *DMRepo) GetConversation(ctx context.Context, convID string) (*models.Conversation, error) {
	var conv models.Conversation
	err := r.db.QueryRow(ctx,
		`SELECT id, created_at, updated_at FROM conversations WHERE id = $1`, convID,
	).Scan(&conv.ID, &conv.CreatedAt, &conv.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &conv, nil
}

func (r *DMRepo) GetUserInfo(ctx context.Context, userID string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(ctx,
		`SELECT id, username, display_name, avatar_url, status, last_seen FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL, &user.Status, &user.LastSeen)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *DMRepo) IsMember(ctx context.Context, convID, userID string) (bool, error) {
	var isMember bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2)`,
		convID, userID).Scan(&isMember)
	return isMember, err
}

func (r *DMRepo) UpdateConversationTimestamp(ctx context.Context, convID string, t time.Time) error {
	_, err := r.db.Exec(ctx,
		`UPDATE conversations SET updated_at = $1 WHERE id = $2`, t, convID)
	return err
}

func (r *DMRepo) GetOtherMembers(ctx context.Context, convID, excludeUserID string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2`, convID, excludeUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var uid string
		if rows.Scan(&uid) == nil {
			ids = append(ids, uid)
		}
	}
	return ids, rows.Err()
}

func (r *DMRepo) GetAllMembers(ctx context.Context, convID string) ([]string, error) {
	rows, err := r.db.Query(ctx,
		`SELECT user_id FROM conversation_members WHERE conversation_id = $1`, convID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var uid string
		if rows.Scan(&uid) == nil {
			ids = append(ids, uid)
		}
	}
	return ids, rows.Err()
}

func (r *DMRepo) AckDM(ctx context.Context, userID, convID, messageID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO dm_read_states (user_id, conversation_id, last_read_message_id, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (user_id, conversation_id) DO UPDATE
		 SET last_read_message_id = EXCLUDED.last_read_message_id, updated_at = now()`,
		userID, convID, messageID)
	return err
}

func (r *DMRepo) MessageBelongsToConversation(ctx context.Context, messageID, convID string) (bool, error) {
	var belongs bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2)`,
		messageID, convID).Scan(&belongs)
	return belongs, err
}

type DMReadState struct {
	ConversationID    string `json:"conversation_id"`
	LastReadMessageID string `json:"last_read_message_id"`
	UnreadCount       int    `json:"unread_count"`
}

func (r *DMRepo) GetReadStates(ctx context.Context, userID string) ([]DMReadState, error) {
	rows, err := r.db.Query(ctx,
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
		return nil, err
	}
	defer rows.Close()

	var states []DMReadState
	for rows.Next() {
		var s DMReadState
		if err := rows.Scan(&s.ConversationID, &s.LastReadMessageID, &s.UnreadCount); err != nil {
			return nil, err
		}
		states = append(states, s)
	}
	if states == nil {
		states = []DMReadState{}
	}
	return states, rows.Err()
}

func (r *DMRepo) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.db.Begin(ctx)
}

func AdvisoryLockKey(userID, recipientID string) int64 {
	pairKey := userID + ":" + recipientID
	if recipientID < userID {
		pairKey = recipientID + ":" + userID
	}
	return int64(crc32.ChecksumIEEE([]byte(pairKey)))
}
