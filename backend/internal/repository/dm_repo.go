package repository

import (
	"context"
	"hash/crc32"
	"sort"
	"strings"
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
		`SELECT c.id, c.created_at, c.updated_at, c.name, c.icon_url, c.is_group,
		        u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen
		 FROM conversations c
		 JOIN conversation_members self_cm ON c.id = self_cm.conversation_id AND self_cm.user_id = $1
		 JOIN conversation_members cm ON c.id = cm.conversation_id
		 JOIN users u ON cm.user_id = u.id
		 ORDER BY c.updated_at DESC, c.id, cm.joined_at ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversationsByID := make(map[string]*ConvResponse)
	orderedIDs := make([]string, 0)
	for rows.Next() {
		var (
			conversationID string
			createdAt      time.Time
			updatedAt      time.Time
			name           *string
			iconURL        *string
			isGroup        bool
			member         models.User
		)
		if err := rows.Scan(
			&conversationID, &createdAt, &updatedAt, &name, &iconURL, &isGroup,
			&member.ID, &member.Username, &member.DisplayName,
			&member.AvatarURL, &member.Status, &member.LastSeen,
		); err != nil {
			return nil, err
		}

		conversation, exists := conversationsByID[conversationID]
		if !exists {
			conversation = &ConvResponse{
				Conversation: models.Conversation{
					ID:        conversationID,
					CreatedAt: createdAt,
					UpdatedAt: updatedAt,
					Name:      name,
					IconURL:   iconURL,
					IsGroup:   isGroup,
					Members:   []models.User{},
				},
			}
			conversationsByID[conversationID] = conversation
			orderedIDs = append(orderedIDs, conversationID)
		}

		conversation.Members = append(conversation.Members, member)
	}

	convos := make([]ConvResponse, 0, len(orderedIDs))
	for _, conversationID := range orderedIDs {
		conversation := conversationsByID[conversationID]
		conversation.Recipient = pickConversationRecipient(conversation.Members, userID)
		convos = append(convos, *conversation)
	}
	if convos == nil {
		convos = []ConvResponse{}
	}
	return convos, rows.Err()
}

func pickConversationRecipient(members []models.User, viewerUserID string) models.User {
	for _, member := range members {
		if member.ID != viewerUserID {
			return member
		}
	}
	if len(members) > 0 {
		return members[0]
	}
	return models.User{}
}

func (r *DMRepo) FetchLastMessages(ctx context.Context, convoIDs []string) (map[string]models.Message, error) {
	result := make(map[string]models.Message)
	if len(convoIDs) == 0 {
		return result, nil
	}

	rows, err := r.db.Query(ctx,
		`SELECT DISTINCT ON (m.conversation_id)
		        m.id, m.conversation_id, m.author_id, m.content, m.created_at, m.forwarded_message_id,
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
			&msg.ID, &convID, &msg.AuthorID, &msg.Content, &msg.CreatedAt, &msg.ForwardedMessageID,
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

func (r *DMRepo) FindConversationByMembers(ctx context.Context, tx pgx.Tx, memberIDs []string) (string, error) {
	var existingID string
	err := tx.QueryRow(ctx,
		`SELECT conversation_id
		 FROM conversation_members
		 GROUP BY conversation_id
		 HAVING COUNT(*) = $2
		    AND COUNT(*) FILTER (WHERE user_id = ANY($1)) = $2
		 LIMIT 1`, memberIDs, len(memberIDs)).Scan(&existingID)
	return existingID, err
}

func (r *DMRepo) CreateConversation(ctx context.Context, tx pgx.Tx, convID string, memberIDs []string, now time.Time, isGroup bool) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO conversations (id, created_at, updated_at, is_group) VALUES ($1, $2, $3, $4)`,
		convID, now, now, isGroup)
	if err != nil {
		return err
	}

	for _, memberID := range memberIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3)`,
			convID, memberID, now,
		); err != nil {
			return err
		}
	}

	return nil
}

func (r *DMRepo) GetConversation(ctx context.Context, convID string) (*models.Conversation, error) {
	var conv models.Conversation
	err := r.db.QueryRow(ctx,
		`SELECT id, created_at, updated_at, name, icon_url, is_group FROM conversations WHERE id = $1`, convID,
	).Scan(&conv.ID, &conv.CreatedAt, &conv.UpdatedAt, &conv.Name, &conv.IconURL, &conv.IsGroup)
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

func (r *DMRepo) GetUsersInfo(ctx context.Context, userIDs []string) ([]models.User, error) {
	if len(userIDs) == 0 {
		return []models.User{}, nil
	}

	rows, err := r.db.Query(ctx,
		`SELECT id, username, display_name, avatar_url, status, last_seen
		 FROM users
		 WHERE id = ANY($1)`, userIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]models.User, 0, len(userIDs))
	for rows.Next() {
		var user models.User
		if err := rows.Scan(&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL, &user.Status, &user.LastSeen); err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	if users == nil {
		users = []models.User{}
	}
	return users, rows.Err()
}

func (r *DMRepo) GetConversationMembersDetailed(ctx context.Context, convID string) ([]models.User, error) {
	rows, err := r.db.Query(ctx,
		`SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen
		 FROM conversation_members cm
		 JOIN users u ON cm.user_id = u.id
		 WHERE cm.conversation_id = $1
		 ORDER BY cm.joined_at ASC`, convID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var user models.User
		if err := rows.Scan(&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL, &user.Status, &user.LastSeen); err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, rows.Err()
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

func (r *DMRepo) UpdateConversationMetadata(ctx context.Context, convID string, nameSet bool, name *string, iconURLSet bool, iconURL *string, updatedAt time.Time) error {
	commandTag, err := r.db.Exec(ctx,
		`UPDATE conversations
		 SET name = CASE WHEN $2 THEN $3 ELSE name END,
		     icon_url = CASE WHEN $4 THEN $5 ELSE icon_url END,
		     updated_at = $6
		 WHERE id = $1`,
		convID, nameSet, name, iconURLSet, iconURL, updatedAt,
	)
	if err != nil {
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *DMRepo) AddConversationMembers(ctx context.Context, tx pgx.Tx, convID string, memberIDs []string, joinedAt time.Time) error {
	for _, memberID := range memberIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3)
			 ON CONFLICT (conversation_id, user_id) DO NOTHING`,
			convID, memberID, joinedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func (r *DMRepo) RemoveConversationMember(ctx context.Context, tx pgx.Tx, convID, userID string) error {
	if _, err := tx.Exec(ctx,
		`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
		convID, userID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM dm_read_states WHERE conversation_id = $1 AND user_id = $2`,
		convID, userID,
	); err != nil {
		return err
	}
	return nil
}

func (r *DMRepo) DeleteConversation(ctx context.Context, tx pgx.Tx, convID string) error {
	_, err := tx.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, convID)
	return err
}

func (r *DMRepo) CountConversationMembers(ctx context.Context, tx pgx.Tx, convID string) (int, error) {
	var count int
	err := tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1`,
		convID,
	).Scan(&count)
	return count, err
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
	return AdvisoryConversationLockKey([]string{userID, recipientID})
}

func AdvisoryConversationLockKey(memberIDs []string) int64 {
	if len(memberIDs) == 0 {
		return 0
	}

	keyParts := append([]string(nil), memberIDs...)
	sort.Strings(keyParts)
	return int64(crc32.ChecksumIEEE([]byte(strings.Join(keyParts, ":"))))
}
