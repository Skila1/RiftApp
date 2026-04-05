package service

import (
	"context"
	"fmt"
	"regexp"
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
	msgRepo       *repository.MessageRepo
	streamRepo    *repository.StreamRepo
	hubService    *HubService
	notifSvc      *NotificationService
	hub           *ws.Hub
	hubNotifRepo  *repository.HubNotificationSettingsRepo
}

func NewMessageService(
	msgRepo *repository.MessageRepo,
	streamRepo *repository.StreamRepo,
	hubService *HubService,
	notifSvc *NotificationService,
	hub *ws.Hub,
	hubNotifRepo *repository.HubNotificationSettingsRepo,
) *MessageService {
	return &MessageService{
		msgRepo:      msgRepo,
		streamRepo:   streamRepo,
		hubService:   hubService,
		notifSvc:     notifSvc,
		hub:          hub,
		hubNotifRepo: hubNotifRepo,
	}
}

type CreateMessageInput struct {
	Content       string   `json:"content"`
	AttachmentIDs []string `json:"attachment_ids"`
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

	msg := &models.Message{
		ID:        uuid.New().String(),
		StreamID:  &streamID,
		AuthorID:  userID,
		Content:   input.Content,
		CreatedAt: time.Now(),
	}

	if err := s.msgRepo.Create(ctx, msg); err != nil {
		return nil, apperror.Internal("failed to create message", err)
	}

	if len(input.AttachmentIDs) > 0 {
		_ = s.msgRepo.LinkAttachments(ctx, msg.ID, userID, input.AttachmentIDs)
		atts, _ := s.msgRepo.GetLinkedAttachments(ctx, msg.ID)
		msg.Attachments = atts
	}

	author, _ := s.msgRepo.GetAuthorInfo(ctx, userID)
	msg.Author = author

	evt := ws.NewEvent(ws.OpMessageCreate, msg)
	s.hub.BroadcastToStream(streamID, evt, "")

	if s.notifSvc != nil && input.Content != "" {
		go s.createMentionNotifications(ctx, msg, hubID, streamID, userID, author)
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

	if msg.StreamID != nil {
		evt := ws.NewEvent(ws.OpMessageUpdate, msg)
		s.hub.BroadcastToStream(*msg.StreamID, evt, "")
	} else if msg.ConversationID != nil {
		s.broadcastToConversation(ctx, *msg.ConversationID, ws.OpMessageUpdate, msg)
	}

	return msg, nil
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

func (s *MessageService) ToggleReaction(ctx context.Context, msgID, userID, emoji string) (added bool, err error) {
	if emoji == "" {
		return false, apperror.BadRequest("emoji is required")
	}

	exists, err := s.msgRepo.ReactionExists(ctx, msgID, userID, emoji)
	if err != nil {
		return false, apperror.Internal("internal error", err)
	}

	msg, _ := s.msgRepo.GetByID(ctx, msgID)

	if exists {
		if err := s.msgRepo.RemoveReaction(ctx, msgID, userID, emoji); err != nil {
			return false, apperror.Internal("internal error", err)
		}
		s.broadcastReaction(msg, ws.OpReactionRemove, msgID, userID, emoji)
		return false, nil
	}

	if err := s.msgRepo.AddReaction(ctx, msgID, userID, emoji); err != nil {
		return false, apperror.Internal("failed to add reaction", err)
	}
	s.broadcastReaction(msg, ws.OpReactionAdd, msgID, userID, emoji)
	return true, nil
}

func (s *MessageService) RemoveReaction(ctx context.Context, msgID, userID, emoji string) error {
	if err := s.msgRepo.RemoveReaction(ctx, msgID, userID, emoji); err != nil {
		return apperror.Internal("internal error", err)
	}
	msg, _ := s.msgRepo.GetByID(ctx, msgID)
	s.broadcastReaction(msg, ws.OpReactionRemove, msgID, userID, emoji)
	return nil
}

func (s *MessageService) broadcastReaction(msg *models.Message, op, msgID, userID, emoji string) {
	if msg == nil {
		return
	}
	if msg.StreamID != nil {
		evt := ws.NewEvent(op, map[string]string{
			"message_id": msgID, "user_id": userID, "emoji": emoji, "stream_id": *msg.StreamID,
		})
		s.hub.BroadcastToStream(*msg.StreamID, evt, "")
	} else if msg.ConversationID != nil {
		s.broadcastToConversation(context.Background(), *msg.ConversationID, op, map[string]string{
			"message_id": msgID, "user_id": userID, "emoji": emoji, "conversation_id": *msg.ConversationID,
		})
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
		if !hubMentionNotificationsEnabled(st) {
			continue
		}
		mID, hID, sID, aID := msg.ID, hubID, streamID, authorID
		go s.notifSvc.Create(mentionedID, "mention", title, &bodyStr, &mID, &hID, &sID, &aID)
	}
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
