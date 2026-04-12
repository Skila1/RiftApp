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
	"github.com/riftapp-cloud/riftapp/internal/moderation"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

var mentionRegex = regexp.MustCompile(`@(\w+)`)

const maxAttachmentsPerMessage = 10
const maxMentionsPerMessage = 25

type streamNotificationPolicy int

const (
	streamNotificationPolicyNone streamNotificationPolicy = iota
	streamNotificationPolicyMentionsOnly
	streamNotificationPolicyAll
)

type MessageService struct {
	msgRepo         *repository.MessageRepo
	streamRepo      *repository.StreamRepo
	hubService      *HubService
	notifSvc        *NotificationService
	hub             *ws.Hub
	hubNotifRepo    *repository.HubNotificationSettingsRepo
	streamNotifRepo *repository.StreamNotificationSettingsRepo
	modSvc          *moderation.Service
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

func (s *MessageService) SetModerationService(mod *moderation.Service) {
	s.modSvc = mod
}

type CreateMessageInput struct {
	Content            string   `json:"content"`
	AttachmentIDs      []string `json:"attachment_ids"`
	ReplyToMessageID   *string  `json:"reply_to_message_id"`
	ForwardedMessageID *string  `json:"-"`
}

type SearchMessagesInput struct {
	Query            string
	StreamID         *string
	VisibleStreamIDs []string
	AuthorID         *string
	AuthorType       string
	Mention          string
	Has              string
	Before           *time.Time
	After            *time.Time
	StartAt          *time.Time
	EndAt            *time.Time
	PinnedOnly       bool
	LinkOnly         bool
	Filename         string
	Extension        string
	Limit            int
}

type ForwardMessageInput struct {
	Content            string
	AttachmentIDs      []string
	ForwardedMessageID *string
}

func (s *MessageService) List(ctx context.Context, userID, streamID string, before *string, limit int) ([]models.Message, error) {
	if _, err := s.hubService.GetStreamHubID(ctx, streamID, userID); err != nil {
		return nil, err
	}
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
	perms, hubID, err := s.hubService.GetStreamEffectivePermissions(ctx, streamID, userID)
	if err != nil || hubID == "" {
		return nil, apperror.NotFound("stream not found")
	}

	if !models.HasPermission(perms, models.PermSendMessages) {
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

	if input.Content != "" && s.modSvc != nil {
		if result := s.modSvc.CheckText(ctx, input.Content); result != nil && result.Flagged {
			return nil, apperror.BadRequest("message blocked by content moderation: " + result.Category)
		}
	}

	msg := &models.Message{
		ID:                 uuid.New().String(),
		StreamID:           &streamID,
		AuthorID:           userID,
		Content:            input.Content,
		ReplyToMessageID:   replyToMessageID,
		ForwardedMessageID: normalizeOptionalMessageID(input.ForwardedMessageID),
		CreatedAt:          time.Now(),
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

	if s.notifSvc != nil {
		notifCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		go func() {
			defer cancel()
			s.createStreamNotifications(notifCtx, msg, hubID, streamID, userID, msg.Author)
		}()
	}

	return msg, nil
}

func (s *MessageService) Update(ctx context.Context, msgID, userID, content string) (*models.Message, error) {
	if content == "" {
		return nil, apperror.BadRequest("content is required")
	}

	if s.modSvc != nil {
		if result := s.modSvc.CheckText(ctx, content); result != nil && result.Flagged {
			return nil, apperror.BadRequest("message blocked by content moderation: " + result.Category)
		}
	}

	existing, err := s.msgRepo.GetByID(ctx, msgID)
	if err != nil {
		return nil, apperror.NotFound("message not found or unauthorized")
	}
	if err := rejectSystemMessageMutation(existing, "edited"); err != nil {
		return nil, err
	}
	if existing.StreamID != nil {
		if _, err := s.hubService.GetStreamHubID(ctx, *existing.StreamID, userID); err != nil {
			return nil, err
		}
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

func (s *MessageService) ListConversationPinned(ctx context.Context, conversationID, userID string, limit int) ([]models.Message, error) {
	dmRepo := repository.NewDMRepo(s.msgRepo.GetDB())
	isMember, err := dmRepo.IsMember(ctx, conversationID, userID)
	if err != nil {
		return nil, apperror.Internal("failed to validate conversation membership", err)
	}
	if !isMember {
		return nil, apperror.Forbidden("not a member of this conversation")
	}

	messages, err := s.msgRepo.ListPinnedByConversation(ctx, conversationID, limit)
	if err != nil {
		return nil, apperror.Internal("failed to list pinned messages", err)
	}
	if err := s.msgRepo.EnrichMessages(ctx, messages); err != nil {
		return nil, apperror.Internal("failed to load pinned messages", err)
	}
	return messages, nil
}

func (s *MessageService) Search(ctx context.Context, hubID, userID string, input SearchMessagesInput) ([]models.Message, error) {
	visibleStreams, err := s.hubService.GetVisibleStreams(ctx, hubID, userID)
	if err != nil {
		return nil, err
	}
	visibleIDs := make([]string, 0, len(visibleStreams))
	visibleSet := make(map[string]struct{}, len(visibleStreams))
	for _, stream := range visibleStreams {
		visibleIDs = append(visibleIDs, stream.ID)
		visibleSet[stream.ID] = struct{}{}
	}
	if len(visibleIDs) == 0 {
		return []models.Message{}, nil
	}

	if input.StreamID != nil && *input.StreamID != "" {
		streamHubID, err := s.hubService.GetStreamHubID(ctx, *input.StreamID, userID)
		if err != nil {
			return nil, apperror.NotFound("stream not found")
		}
		if streamHubID != hubID {
			return nil, apperror.BadRequest("stream does not belong to this hub")
		}
		if _, ok := visibleSet[*input.StreamID]; !ok {
			return nil, apperror.NotFound("stream not found")
		}
	}

	filters := repository.MessageSearchFilters{
		Query:            strings.TrimSpace(input.Query),
		StreamID:         input.StreamID,
		VisibleStreamIDs: visibleIDs,
		AuthorID:         input.AuthorID,
		AuthorType:       strings.TrimSpace(input.AuthorType),
		Mention:          strings.TrimSpace(input.Mention),
		Has:              strings.TrimSpace(input.Has),
		Before:           input.Before,
		After:            input.After,
		StartAt:          input.StartAt,
		EndAt:            input.EndAt,
		PinnedOnly:       input.PinnedOnly,
		LinkOnly:         input.LinkOnly,
		Filename:         strings.TrimSpace(input.Filename),
		Extension:        strings.TrimSpace(input.Extension),
		Limit:            input.Limit,
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

func (s *MessageService) SearchConversation(ctx context.Context, conversationID, userID string, input SearchMessagesInput) ([]models.Message, error) {
	dmRepo := repository.NewDMRepo(s.msgRepo.GetDB())
	isMember, err := dmRepo.IsMember(ctx, conversationID, userID)
	if err != nil {
		return nil, apperror.Internal("failed to validate conversation membership", err)
	}
	if !isMember {
		return nil, apperror.Forbidden("not a member of this conversation")
	}

	filters := repository.MessageSearchFilters{
		Query:      strings.TrimSpace(input.Query),
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

	messages, err := s.msgRepo.SearchInConversation(ctx, conversationID, filters)
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
	if err := rejectSystemMessageMutation(msg, "deleted"); err != nil {
		return err
	}

	if msg.StreamID != nil {
		perms, _, err := s.hubService.GetStreamEffectivePermissions(ctx, *msg.StreamID, userID)
		if err != nil {
			return err
		}
		if msg.AuthorID != userID && !models.HasPermission(perms, models.PermManageMessages) {
			return apperror.Forbidden("you do not have permission to delete this message")
		}
	} else if msg.AuthorID != userID {
		return apperror.Forbidden("you do not have permission to delete this message")
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

func (s *MessageService) PrepareForward(ctx context.Context, msgID, userID string) (ForwardMessageInput, error) {
	msg, err := s.msgRepo.GetByID(ctx, msgID)
	if err != nil {
		return ForwardMessageInput{}, apperror.NotFound("message not found")
	}
	if err := rejectSystemMessageMutation(msg, "forwarded"); err != nil {
		return ForwardMessageInput{}, err
	}

	if msg.StreamID != nil {
		if _, err := s.hubService.GetStreamHubID(ctx, *msg.StreamID, userID); err != nil {
			return ForwardMessageInput{}, err
		}
	} else if msg.ConversationID != nil {
		dmRepo := repository.NewDMRepo(s.msgRepo.GetDB())
		isMember, err := dmRepo.IsMember(ctx, *msg.ConversationID, userID)
		if err != nil {
			return ForwardMessageInput{}, apperror.Internal("failed to validate conversation membership", err)
		}
		if !isMember {
			return ForwardMessageInput{}, apperror.Forbidden("not a member of this conversation")
		}
	}

	attachmentIDs, err := s.msgRepo.CloneAttachments(ctx, msg.ID, userID)
	if err != nil {
		return ForwardMessageInput{}, apperror.Internal("failed to clone message attachments", err)
	}

	forwardedMessageID := msg.ID
	if msg.ForwardedMessageID != nil && *msg.ForwardedMessageID != "" {
		forwardedMessageID = *msg.ForwardedMessageID
	}

	return ForwardMessageInput{
		Content:            msg.Content,
		AttachmentIDs:      attachmentIDs,
		ForwardedMessageID: &forwardedMessageID,
	}, nil
}

func (s *MessageService) ToggleReaction(ctx context.Context, msgID, userID, emoji string, emojiID *string) (added bool, err error) {
	if emoji == "" {
		return false, apperror.BadRequest("emoji is required")
	}
	msg, err := s.msgRepo.GetByID(ctx, msgID)
	if err != nil {
		return false, apperror.NotFound("message not found")
	}
	if err := rejectSystemMessageMutation(msg, "reacted to"); err != nil {
		return false, err
	}
	if msg.StreamID != nil {
		if _, err := s.hubService.GetStreamHubID(ctx, *msg.StreamID, userID); err != nil {
			return false, err
		}
	}

	exists, err := s.msgRepo.ReactionExists(ctx, msgID, userID, emoji, emojiID)
	if err != nil {
		return false, apperror.Internal("internal error", err)
	}

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
	msg, err := s.msgRepo.GetByID(ctx, msgID)
	if err != nil {
		return apperror.NotFound("message not found")
	}
	if err := rejectSystemMessageMutation(msg, "reacted to"); err != nil {
		return err
	}
	if msg.StreamID != nil {
		if _, err := s.hubService.GetStreamHubID(ctx, *msg.StreamID, userID); err != nil {
			return err
		}
	}
	if err := s.msgRepo.RemoveReaction(ctx, msgID, userID, emoji, emojiID); err != nil {
		return apperror.Internal("internal error", err)
	}
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

func (s *MessageService) createStreamNotifications(ctx context.Context, msg *models.Message, hubID, streamID, authorID string, author *models.User) {
	if msg == nil {
		return
	}

	mentionedUserIDs, err := s.mentionedUserIDs(ctx, hubID, msg.Content)
	if err != nil {
		mentionedUserIDs = map[string]struct{}{}
	}

	memberIDs, err := s.hubMemberIDs(ctx, hubID)
	if err != nil {
		return
	}

	streamTitle := streamNotificationLocation("")
	if sName, err := s.streamRepo.GetName(ctx, streamID); err == nil {
		streamTitle = streamNotificationLocation(sName)
	}

	actorLabel := notificationActorLabel(author)
	mentionTitle := actorLabel + " mentioned you in " + streamTitle
	messageTitle := actorLabel + " sent a message in " + streamTitle
	bodyStr := streamNotificationBody(msg)
	mID, hID, sID, aID := msg.ID, hubID, streamID, authorID

	for _, memberID := range memberIDs {
		if memberID == authorID {
			continue
		}
		if !s.hubService.CanViewStream(ctx, streamID, memberID) {
			continue
		}

		hubSettings, err := s.hubNotifRepo.Get(ctx, memberID, hubID)
		if err != nil {
			continue
		}
		streamSettings, err := s.streamNotificationSettingsOverride(ctx, memberID, streamID)
		if err != nil {
			continue
		}

		policy := effectiveStreamNotificationPolicy(hubSettings, streamSettings)
		if policy == streamNotificationPolicyNone {
			continue
		}

		notifType := ""
		title := ""
		if _, mentioned := mentionedUserIDs[memberID]; mentioned {
			notifType = "mention"
			title = mentionTitle
		} else if policy == streamNotificationPolicyAll {
			notifType = "message"
			title = messageTitle
		} else {
			continue
		}

		go func(recipientID, notificationType, notificationTitle string) {
			notifCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			s.notifSvc.Create(notifCtx, recipientID, notificationType, notificationTitle, &bodyStr, &mID, &hID, &sID, &aID)
		}(memberID, notifType, title)
	}
}

func (s *MessageService) togglePin(ctx context.Context, msgID, userID string, pinned bool) (*models.Message, error) {
	msg, err := s.msgRepo.GetByID(ctx, msgID)
	if err != nil {
		return nil, apperror.NotFound("message not found")
	}
	if err := rejectSystemMessageMutation(msg, "pinned"); err != nil {
		return nil, err
	}
	if msg.StreamID != nil {
		if _, err := s.streamRepo.GetHubID(ctx, *msg.StreamID); err != nil {
			return nil, apperror.NotFound("stream not found")
		}
		perms, _, err := s.hubService.GetStreamEffectivePermissions(ctx, *msg.StreamID, userID)
		if err != nil {
			return nil, err
		}
		if !models.HasPermission(perms, models.PermManageMessages) {
			return nil, apperror.Forbidden("you do not have permission to pin this message")
		}
	} else if msg.ConversationID != nil {
		dmRepo := repository.NewDMRepo(s.msgRepo.GetDB())
		isMember, err := dmRepo.IsMember(ctx, *msg.ConversationID, userID)
		if err != nil {
			return nil, apperror.Internal("failed to validate conversation membership", err)
		}
		if !isMember {
			return nil, apperror.Forbidden("not a member of this conversation")
		}
	} else {
		return nil, apperror.BadRequest("message cannot be pinned")
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

	if updated.StreamID != nil {
		evt := ws.NewEvent(ws.OpMessageUpdate, updated)
		s.hub.BroadcastToStream(*updated.StreamID, evt, "")
	} else if updated.ConversationID != nil {
		s.broadcastToConversation(ctx, *updated.ConversationID, ws.OpMessageUpdate, updated)
	}
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

func rejectSystemMessageMutation(msg *models.Message, action string) error {
	if msg == nil || msg.SystemType == nil || strings.TrimSpace(*msg.SystemType) == "" {
		return nil
	}
	return apperror.BadRequest("system messages cannot be " + action)
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

func (s *MessageService) mentionedUserIDs(ctx context.Context, hubID, content string) (map[string]struct{}, error) {
	mentionedUserIDs := map[string]struct{}{}
	matches := mentionRegex.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return mentionedUserIDs, nil
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

	if len(uniqueUsernames) == 0 {
		return mentionedUserIDs, nil
	}

	rows, err := s.msgRepo.GetDB().Query(ctx,
		`SELECT hm.user_id
		 FROM hub_members hm JOIN users u ON hm.user_id = u.id
		 WHERE hm.hub_id = $1 AND u.username = ANY($2)`,
		hubID, uniqueUsernames)
	if err != nil {
		return mentionedUserIDs, err
	}
	defer rows.Close()

	for rows.Next() {
		var userID string
		if rows.Scan(&userID) == nil {
			mentionedUserIDs[userID] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return mentionedUserIDs, err
	}

	return mentionedUserIDs, nil
}

func (s *MessageService) hubMemberIDs(ctx context.Context, hubID string) ([]string, error) {
	rows, err := s.msgRepo.GetDB().Query(ctx, `SELECT user_id FROM hub_members WHERE hub_id = $1`, hubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	memberIDs := make([]string, 0, 8)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		memberIDs = append(memberIDs, userID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return memberIDs, nil
}

func notificationActorLabel(author *models.User) string {
	if author == nil {
		return "Someone"
	}
	if displayName := strings.TrimSpace(author.DisplayName); displayName != "" {
		return displayName
	}
	if username := strings.TrimSpace(author.Username); username != "" {
		return username
	}
	return "Someone"
}

func streamNotificationLocation(streamName string) string {
	trimmed := strings.TrimSpace(streamName)
	if trimmed == "" {
		return "this channel"
	}
	return "#" + trimmed
}

func streamNotificationBody(msg *models.Message) string {
	trimmed := strings.TrimSpace(msg.Content)
	if trimmed != "" {
		return trimmed
	}
	if len(msg.Attachments) == 1 {
		return "Sent an attachment"
	}
	if len(msg.Attachments) > 1 {
		return fmt.Sprintf("Sent %d attachments", len(msg.Attachments))
	}
	return "Sent a message"
}

func (s *MessageService) streamNotificationSettingsOverride(ctx context.Context, userID, streamID string) (*repository.StreamNotificationSettings, error) {
	if s.streamNotifRepo == nil {
		return nil, nil
	}
	return s.streamNotifRepo.GetOverride(ctx, userID, streamID)
}

func effectiveStreamNotificationPolicy(hub repository.HubNotificationSettings, stream *repository.StreamNotificationSettings) streamNotificationPolicy {
	if hub.ServerMuted {
		return streamNotificationPolicyNone
	}
	if stream != nil && stream.ChannelMuted {
		return streamNotificationPolicyNone
	}
	if stream != nil {
		switch stream.NotificationLevel {
		case "nothing":
			return streamNotificationPolicyNone
		case "all":
			return streamNotificationPolicyAll
		default:
			return streamNotificationPolicyMentionsOnly
		}
	}
	switch hub.NotificationLevel {
	case "nothing":
		return streamNotificationPolicyNone
	case "all":
		return streamNotificationPolicyAll
	default:
		return streamNotificationPolicyMentionsOnly
	}
}
