package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

var mentionRegex = regexp.MustCompile(`@(\w+)`)

const maxAttachmentsPerMessage = 10
const maxMentionsPerMessage = 25

type MessageService struct {
	msgRepo         *repository.MessageRepo
	streamRepo      *repository.StreamRepo
	hubService      *HubService
	notifSvc        *NotificationService
	hub             *ws.Hub
	hubNotifRepo    *repository.HubNotificationSettingsRepo
	streamNotifRepo *repository.StreamNotificationSettingsRepo
}

func NewMessageService(
	msgRepo *repository.MessageRepo,
	streamRepo *repository.StreamRepo,
	hubService *HubService,
	notifSvc *NotificationService,
	hub *ws.Hub,
	hubNotifRepo *repository.HubNotificationSettingsRepo,
	streamNotifRepo *repository.StreamNotificationSettingsRepo,
) *MessageService {
	return &MessageService{
		msgRepo:         msgRepo,
		streamRepo:      streamRepo,
		hubService:      hubService,
		notifSvc:        notifSvc,
		hub:             hub,
		hubNotifRepo:    hubNotifRepo,
		streamNotifRepo: streamNotifRepo,
	}
}

type CreateMessageInput struct {
	Content          string   `json:"content"`
	AttachmentIDs    []string `json:"attachment_ids"`
	ReplyToMessageID *string  `json:"reply_to_message_id"`
}

type SearchMessagesInput struct {
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

func (s *MessageService) List(ctx context.Context, streamID string, before *string, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	messages, err := s.msgRepo.ListByStream(ctx, streamID, before, limit)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	if err := s.msgRepo.EnrichMessages(ctx, messages); err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return messages, nil
}

func (s *MessageService) Create(ctx context.Context, userID, streamID string, input CreateMessageInput) (*models.Message, error) {
	hubID, err := s.streamRepo.GetHubID(ctx, streamID)
	if err != nil || hubID == "" {
		return nil, apperror.NotFound("stream not found")
	}

	if !s.hubService.HasPermission(ctx, hubID, userID, models.PermSendMessages) {
		return nil, apperror.Forbidden("you do not have permission to send messages")
	}

	if input.Content == "" && len(input.AttachmentIDs) == 0 {
		return nil, apperror.BadRequest("content or attachments required")
	}
	if len(input.Content) > 4000 {
		return nil, apperror.BadRequest("content too long (max 4000)")
	}
	if len(input.AttachmentIDs) > maxAttachmentsPerMessage {
		return nil, apperror.BadRequest(fmt.Sprintf("too many attachments (max %d)", maxAttachmentsPerMessage))
	}
	replyToMessageID := normalizeOptionalMessageID(input.ReplyToMessageID)
	if err := s.validateStreamReplyTarget(ctx, streamID, replyToMessageID); err != nil {
		return nil, err
	}

	msg := &models.Message{
		ID:               uuid.New().String(),
		StreamID:         &streamID,
		AuthorID:         userID,
		Content:          input.Content,
		ReplyToMessageID: replyToMessageID,
		CreatedAt:        time.Now(),
	}

	if err := s.msgRepo.Create(ctx, msg); err != nil {
		return nil, apperror.Internal("failed to create message", err)
	}

	if len(input.AttachmentIDs) > 0 {
		_ = s.msgRepo.LinkAttachments(ctx, msg.ID, userID, input.AttachmentIDs)
	}

	msg, err = s.loadDetailedMessage(ctx, msg.ID)
	if err != nil {
		return nil, apperror.Internal("failed to load created message", err)
	}

	evt := ws.NewEvent(ws.OpMessageCreate, msg)
	s.hub.BroadcastToStream(streamID, evt, "")

	if s.notifSvc != nil && input.Content != "" {
		notifCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		go func() {
			defer cancel()
			s.createMentionNotifications(notifCtx, msg, hubID, streamID, userID, msg.Author)
		}()
	}

	return msg, nil
}

func (s *MessageService) Update(ctx context.Context, msgID, userID, content string) (*models.Message, error) {
	if content == "" {
		return nil, apperror.BadRequest("content is required")
	}

	msg, err := s.msgRepo.Update(ctx, msgID, userID, content)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	if msg == nil {
		return nil, apperror.NotFound("message not found or unauthorized")
	}
	msg, err = s.loadDetailedMessage(ctx, msg.ID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}

	if msg.StreamID != nil {
		evt := ws.NewEvent(ws.OpMessageUpdate, msg)
		s.hub.BroadcastToStream(*msg.StreamID, evt, "")
	} else if msg.ConversationID != nil {
		s.broadcastToConversation(ctx, *msg.ConversationID, ws.OpMessageUpdate, msg)
	}

	return msg, nil
}

func (s *MessageService) Pin(ctx context.Context, msgID, userID string) (*models.Message, error) {
	return s.togglePin(ctx, msgID, userID, true)
}

func (s *MessageService) Unpin(ctx context.Context, msgID, userID string) (*models.Message, error) {
	return s.togglePin(ctx, msgID, userID, false)
}

func (s *MessageService) ListPinned(ctx context.Context, streamID, userID string, limit int) ([]models.Message, error) {
	if _, err := s.hubService.GetStreamHubID(ctx, streamID, userID); err != nil {
		return nil, err
	}

	messages, err := s.msgRepo.ListPinnedByStream(ctx, streamID, limit)
	if err != nil {
		return nil, apperror.Internal("failed to list pinned messages", err)
	}
	if err := s.msgRepo.EnrichMessages(ctx, messages); err != nil {
		return nil, apperror.Internal("failed to load pinned messages", err)
	}
	return messages, nil
}

func (s *MessageService) Search(ctx context.Context, hubID, userID string, input SearchMessagesInput) ([]models.Message, error) {
	if err := s.hubService.AssertHubMember(ctx, hubID, userID); err != nil {
		return nil, err
	}

	if input.StreamID != nil && *input.StreamID != "" {
		streamHubID, err := s.streamRepo.GetHubID(ctx, *input.StreamID)
		if err != nil {
			return nil, apperror.NotFound("stream not found")
		}
		if streamHubID != hubID {
			return nil, apperror.BadRequest("stream does not belong to this hub")
		}
	}

	filters := repository.MessageSearchFilters{
		Query:      strings.TrimSpace(input.Query),
		StreamID:   input.StreamID,
		AuthorID:   input.AuthorID,
		AuthorType: strings.TrimSpace(input.AuthorType),
		Mention:    strings.TrimSpace(input.Mention),
		Has:        strings.TrimSpace(input.Has),
		Before:     input.Before,
		After:      input.After,
		StartAt:    input.StartAt,
		EndAt:      input.EndAt,
		PinnedOnly: input.PinnedOnly,
		LinkOnly:   input.LinkOnly,
		Filename:   strings.TrimSpace(input.Filename),
		Extension:  strings.TrimSpace(input.Extension),
		Limit:      input.Limit,
	}

	messages, err := s.msgRepo.SearchInHub(ctx, hubID, filters)
	if err != nil {
		return nil, apperror.Internal("failed to search messages", err)
	}
	if err := s.msgRepo.EnrichMessages(ctx, messages); err != nil {
		return nil, apperror.Internal("failed to load search results", err)
	}
	return messages, nil
}

func (s *MessageService) Delete(ctx context.Context, msgID, userID string) error {
	msg, err := s.msgRepo.GetByID(ctx, msgID)
	if err != nil {
		return apperror.NotFound("message not found")
	}

	if msg.AuthorID != userID {
		if msg.StreamID != nil {
			hubID, _ := s.streamRepo.GetHubID(ctx, *msg.StreamID)
			if !s.hubService.HasPermission(ctx, hubID, userID, models.PermManageMessages) {
				return apperror.Forbidden("you do not have permission to delete this message")
			}
		} else {
			return apperror.Forbidden("you do not have permission to delete this message")
		}
	}

	if err := s.msgRepo.Delete(ctx, msgID); err != nil {
		return apperror.Internal("failed to delete message", err)
	}

	if msg.StreamID != nil {
		evt := ws.NewEvent(ws.OpMessageDelete, map[string]string{"id": msgID, "stream_id": *msg.StreamID})
		s.hub.BroadcastToStream(*msg.StreamID, evt, "")
	} else if msg.ConversationID != nil {
		s.broadcastToConversation(ctx, *msg.ConversationID, ws.OpMessageDelete, map[string]string{"id": msgID, "conversation_id": *msg.ConversationID})
	}

	return nil
}

func (s *MessageService) ToggleReaction(ctx context.Context, msgID, userID, emoji string, emojiID *string) (added bool, err error) {
	if emoji == "" {
		return false, apperror.BadRequest("emoji is required")
	}

	exists, err := s.msgRepo.ReactionExists(ctx, msgID, userID, emoji, emojiID)
	if err != nil {
		return false, apperror.Internal("internal error", err)
	}

	msg, _ := s.msgRepo.GetByID(ctx, msgID)

	if exists {
		if err := s.msgRepo.RemoveReaction(ctx, msgID, userID, emoji, emojiID); err != nil {
			return false, apperror.Internal("internal error", err)
		}
		s.broadcastReaction(msg, ws.OpReactionRemove, msgID, userID, emoji, emojiID, nil)
		return false, nil
	}

	if err := s.msgRepo.AddReaction(ctx, msgID, userID, emoji, emojiID); err != nil {
		return false, apperror.Internal("failed to add reaction", err)
	}

	// Resolve file_url for custom emoji in broadcast
	var fileURL *string
	if emojiID != nil {
		var url string
		_ = s.msgRepo.GetDB().QueryRow(ctx, `SELECT file_url FROM hub_emojis WHERE id = $1`, *emojiID).Scan(&url)
		if url != "" {
			fileURL = &url
		}
	}
	s.broadcastReaction(msg, ws.OpReactionAdd, msgID, userID, emoji, emojiID, fileURL)
	return true, nil
}

func (s *MessageService) RemoveReaction(ctx context.Context, msgID, userID, emoji string, emojiID *string) error {
	if err := s.msgRepo.RemoveReaction(ctx, msgID, userID, emoji, emojiID); err != nil {
		return apperror.Internal("internal error", err)
	}
	msg, _ := s.msgRepo.GetByID(ctx, msgID)
	s.broadcastReaction(msg, ws.OpReactionRemove, msgID, userID, emoji, emojiID, nil)
	return nil
}

func (s *MessageService) broadcastReaction(msg *models.Message, op, msgID, userID, emoji string, emojiID *string, fileURL *string) {
	if msg == nil {
		return
	}
	payload := map[string]interface{}{
		"message_id": msgID, "user_id": userID, "emoji": emoji,
	}
	if emojiID != nil {
		payload["emoji_id"] = *emojiID
	}
	if fileURL != nil {
		payload["file_url"] = *fileURL
	}
	if msg.StreamID != nil {
		payload["stream_id"] = *msg.StreamID
		evt := ws.NewEvent(op, payload)
		s.hub.BroadcastToStream(*msg.StreamID, evt, "")
	} else if msg.ConversationID != nil {
		payload["conversation_id"] = *msg.ConversationID
		s.broadcastToConversation(context.Background(), *msg.ConversationID, op, payload)
	}
}

func (s *MessageService) broadcastToConversation(ctx context.Context, conversationID, op string, data interface{}) {
	dmRepo := repository.NewDMRepo(s.msgRepo.GetDB())
	members, err := dmRepo.GetAllMembers(ctx, conversationID)
	if err != nil {
		return
	}
	evt := ws.NewEvent(op, data)
	for _, uid := range members {
		s.hub.SendToUser(uid, evt)
	}
}

func (s *MessageService) createMentionNotifications(ctx context.Context, msg *models.Message, hubID, streamID, authorID string, author *models.User) {
	matches := mentionRegex.FindAllStringSubmatch(msg.Content, -1)
	if len(matches) == 0 {
		return
	}

	uniqueUsernames := make([]string, 0, len(matches))
	seen := map[string]bool{}
	for _, match := range matches {
		username := match[1]
		if !seen[username] {
			seen[username] = true
			uniqueUsernames = append(uniqueUsernames, username)
		}
		if len(uniqueUsernames) >= maxMentionsPerMessage {
			break
		}
	}

	if len(uniqueUsernames) == 0 || author == nil {
		return
	}

	sName, _ := s.streamRepo.GetName(ctx, streamID)
	title := author.DisplayName + " mentioned you in #" + sName
	bodyStr := msg.Content

	db := s.msgRepo.GetDB()
	rows, err := db.Query(ctx,
		`SELECT u.username, hm.user_id
		 FROM hub_members hm JOIN users u ON hm.user_id = u.id
		 WHERE hm.hub_id = $1 AND u.username = ANY($2)`,
		hubID, uniqueUsernames)
	if err != nil {
		return
	}
	defer rows.Close()

	usernameToID := make(map[string]string)
	for rows.Next() {
		var uname, uid string
		if rows.Scan(&uname, &uid) == nil {
			usernameToID[uname] = uid
		}
	}

	for _, username := range uniqueUsernames {
		mentionedID, ok := usernameToID[username]
		if !ok || mentionedID == authorID {
			continue
		}
		st, err := s.hubNotifRepo.Get(ctx, mentionedID, hubID)
		if err != nil {
			continue
		}
		streamSt, err := s.streamMentionSettings(ctx, mentionedID, streamID)
		if err != nil {
			continue
		}
		if !streamMentionNotificationsEnabled(st, streamSt) {
			continue
		}
		mID, hID, sID, aID := msg.ID, hubID, streamID, authorID
		go func() {
			mentionCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			s.notifSvc.Create(mentionCtx, mentionedID, "mention", title, &bodyStr, &mID, &hID, &sID, &aID)
		}()
	}
}

func (s *MessageService) togglePin(ctx context.Context, msgID, userID string, pinned bool) (*models.Message, error) {
	msg, err := s.msgRepo.GetByID(ctx, msgID)
	if err != nil {
		return nil, apperror.NotFound("message not found")
	}
	if msg.StreamID == nil {
		return nil, apperror.BadRequest("only stream messages can be pinned")
	}

	hubID, err := s.streamRepo.GetHubID(ctx, *msg.StreamID)
	if err != nil {
		return nil, apperror.NotFound("stream not found")
	}
	if err := s.hubService.AssertHubMember(ctx, hubID, userID); err != nil {
		return nil, err
	}
	if msg.AuthorID != userID && !s.hubService.HasPermission(ctx, hubID, userID, models.PermManageMessages) {
		return nil, apperror.Forbidden("you do not have permission to pin this message")
	}

	if pinned {
		if err := s.msgRepo.Pin(ctx, msgID, userID, time.Now()); err != nil {
			return nil, apperror.Internal("failed to pin message", err)
		}
	} else {
		if err := s.msgRepo.Unpin(ctx, msgID); err != nil {
			return nil, apperror.Internal("failed to unpin message", err)
		}
	}

	updated, err := s.loadDetailedMessage(ctx, msgID)
	if err != nil {
		return nil, apperror.Internal("failed to load updated message", err)
	}

	evt := ws.NewEvent(ws.OpMessageUpdate, updated)
	s.hub.BroadcastToStream(*updated.StreamID, evt, "")
	return updated, nil
}

func (s *MessageService) loadDetailedMessage(ctx context.Context, msgID string) (*models.Message, error) {
	msg, err := s.msgRepo.GetDetailedByID(ctx, msgID)
	if err != nil {
		return nil, err
	}
	messages := []models.Message{*msg}
	if err := s.msgRepo.EnrichMessages(ctx, messages); err != nil {
		return nil, err
	}
	return &messages[0], nil
}

func normalizeOptionalMessageID(raw *string) *string {
	if raw == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func (s *MessageService) validateStreamReplyTarget(ctx context.Context, streamID string, replyToMessageID *string) error {
	if replyToMessageID == nil {
		return nil
	}
	replyTo, err := s.msgRepo.GetByID(ctx, *replyToMessageID)
	if err != nil {
		return apperror.BadRequest("reply target not found")
	}
	if replyTo.StreamID == nil || *replyTo.StreamID != streamID {
		return apperror.BadRequest("reply target must be in the same channel")
	}
	return nil
}

func (s *MessageService) streamMentionSettings(ctx context.Context, userID, streamID string) (*repository.StreamNotificationSettings, error) {
	if s.streamNotifRepo == nil {
		return nil, nil
	}
	st, err := s.streamNotifRepo.Get(ctx, userID, streamID)
	if err != nil {
		return nil, err
	}
	return &st, nil
}

func hubMentionNotificationsEnabled(st repository.HubNotificationSettings) bool {
	if st.ServerMuted {
		return false
	}
	switch st.NotificationLevel {
	case "nothing":
		return false
	case "all", "mentions_only":
		return true
	default:
		return true
	}
}

func streamMentionNotificationsEnabled(hub repository.HubNotificationSettings, stream *repository.StreamNotificationSettings) bool {
	if !hubMentionNotificationsEnabled(hub) {
		return false
	}
	if stream == nil {
		return true
	}
	if stream.ChannelMuted {
		return false
	}
	switch stream.NotificationLevel {
	case "nothing":
		return false
	default:
		return true
	}
}
