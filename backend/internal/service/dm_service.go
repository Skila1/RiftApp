package service

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/moderation"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type DMService struct {
	dmRepo   *repository.DMRepo
	msgRepo  *repository.MessageRepo
	notifSvc *NotificationService
	hub      *ws.Hub
	modSvc   *moderation.Service
}

func NewDMService(dmRepo *repository.DMRepo, msgRepo *repository.MessageRepo, notifSvc *NotificationService, hub *ws.Hub) *DMService {
	return &DMService{dmRepo: dmRepo, msgRepo: msgRepo, notifSvc: notifSvc, hub: hub}
}

func (s *DMService) SetModerationService(mod *moderation.Service) {
	s.modSvc = mod
}

func (s *DMService) ListConversations(ctx context.Context, userID string) ([]repository.ConvResponse, error) {
	convos, err := s.dmRepo.ListConversations(ctx, userID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}

	if len(convos) > 0 {
		convoIDs := make([]string, len(convos))
		for i := range convos {
			convoIDs[i] = convos[i].ID
		}
		lastMsgs, err := s.dmRepo.FetchLastMessages(ctx, convoIDs)
		if err == nil {
			for i := range convos {
				if msg, ok := lastMsgs[convos[i].ID]; ok {
					convos[i].LastMessage = &msg
				}
			}
		}
	}

	return convos, nil
}

func (s *DMService) CreateOrOpen(ctx context.Context, userID, recipientID string) (repository.ConvResponse, bool, error) {
	if recipientID == "" {
		return repository.ConvResponse{}, false, apperror.BadRequest("recipient_id is required")
	}
	if recipientID == userID {
		return repository.ConvResponse{}, false, apperror.BadRequest("cannot DM yourself")
	}

	return s.createOrOpenConversation(ctx, userID, []string{recipientID}, false)
}

func (s *DMService) CreateOrOpenGroup(ctx context.Context, userID string, memberIDs []string) (repository.ConvResponse, bool, error) {
	return s.createOrOpenConversation(ctx, userID, memberIDs, true)
}

func (s *DMService) createOrOpenConversation(ctx context.Context, userID string, requestedMemberIDs []string, requireGroup bool) (repository.ConvResponse, bool, error) {
	memberIDs, err := normalizeConversationMembers(userID, requestedMemberIDs)
	if err != nil {
		return repository.ConvResponse{}, false, err
	}
	if requireGroup && len(memberIDs) < 3 {
		return repository.ConvResponse{}, false, apperror.BadRequest("group DMs require at least 3 members")
	}

	for _, memberID := range memberIDs {
		if memberID == userID {
			continue
		}
		exists, lookupErr := s.dmRepo.UserExists(ctx, memberID)
		if lookupErr != nil {
			return repository.ConvResponse{}, false, apperror.Internal("internal error", lookupErr)
		}
		if !exists {
			return repository.ConvResponse{}, false, apperror.NotFound("user not found")
		}
	}

	tx, err := s.dmRepo.BeginTx(ctx)
	if err != nil {
		return repository.ConvResponse{}, false, apperror.Internal("internal error", err)
	}
	defer tx.Rollback(ctx)

	lockKey := repository.AdvisoryConversationLockKey(memberIDs)
	tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey)

	existingID, err := s.dmRepo.FindConversationByMembers(ctx, tx, memberIDs)
	if err == nil {
		tx.Rollback(ctx)
		response, buildErr := s.buildConversationResponse(ctx, existingID, userID)
		if buildErr != nil {
			return repository.ConvResponse{}, false, buildErr
		}
		return response, false, nil
	}
	if err != pgx.ErrNoRows {
		return repository.ConvResponse{}, false, apperror.Internal("internal error", err)
	}

	convID := uuid.New().String()
	now := time.Now()

	if err := s.dmRepo.CreateConversation(ctx, tx, convID, memberIDs, now); err != nil {
		return repository.ConvResponse{}, false, apperror.Internal("failed to create conversation", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return repository.ConvResponse{}, false, apperror.Internal("internal error", err)
	}

	members, err := s.dmRepo.GetUsersInfo(ctx, memberIDs)
	if err != nil {
		return repository.ConvResponse{}, false, apperror.Internal("internal error", err)
	}
	sort.SliceStable(members, func(i, j int) bool {
		return indexOfMember(memberIDs, members[i].ID) < indexOfMember(memberIDs, members[j].ID)
	})

	for _, memberID := range memberIDs {
		if memberID == userID {
			continue
		}
		payload := buildConversationPayload(convID, now, members, memberID)
		s.hub.SendToUser(memberID, ws.NewEvent(ws.OpDMConversationCreate, payload))
	}

	return buildConversationPayload(convID, now, members, userID), true, nil
}

func buildConversationPayload(convID string, timestamp time.Time, members []models.User, viewerUserID string) repository.ConvResponse {
	memberCopy := append([]models.User(nil), members...)
	return repository.ConvResponse{
		Conversation: models.Conversation{
			ID:        convID,
			CreatedAt: timestamp,
			UpdatedAt: timestamp,
			Members:   memberCopy,
		},
		Recipient: pickConversationRecipient(memberCopy, viewerUserID),
	}
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

func normalizeConversationMembers(userID string, requestedMemberIDs []string) ([]string, error) {
	seen := map[string]struct{}{userID: {}}
	memberIDs := []string{userID}
	for _, memberID := range requestedMemberIDs {
		if memberID == "" {
			continue
		}
		if memberID == userID {
			continue
		}
		if _, exists := seen[memberID]; exists {
			continue
		}
		seen[memberID] = struct{}{}
		memberIDs = append(memberIDs, memberID)
	}
	if len(memberIDs) < 2 {
		return nil, apperror.BadRequest("at least one recipient is required")
	}
	return memberIDs, nil
}

func indexOfMember(memberIDs []string, target string) int {
	for index, memberID := range memberIDs {
		if memberID == target {
			return index
		}
	}
	return len(memberIDs)
}

func (s *DMService) buildConversationResponse(ctx context.Context, convID, viewerUserID string) (repository.ConvResponse, error) {
	conversation, err := s.dmRepo.GetConversation(ctx, convID)
	if err != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", err)
	}
	members, err := s.dmRepo.GetConversationMembersDetailed(ctx, convID)
	if err != nil {
		return repository.ConvResponse{}, apperror.Internal("internal error", err)
	}
	conversation.Members = members
	return repository.ConvResponse{
		Conversation: *conversation,
		Recipient:    pickConversationRecipient(members, viewerUserID),
	}, nil
}

func (s *DMService) ListMessages(ctx context.Context, convID, userID string, before *string, limit int) ([]models.Message, error) {
	isMember, _ := s.dmRepo.IsMember(ctx, convID, userID)
	if !isMember {
		return nil, apperror.Forbidden("not a member of this conversation")
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	messages, err := s.msgRepo.ListByConversation(ctx, convID, before, limit)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	if err := s.msgRepo.EnrichMessages(ctx, messages); err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return messages, nil
}

type SendDMInput struct {
	Content            string   `json:"content"`
	AttachmentIDs      []string `json:"attachment_ids"`
	ReplyToMessageID   *string  `json:"reply_to_message_id"`
	ForwardedMessageID *string  `json:"-"`
}

func (s *DMService) SendMessage(ctx context.Context, convID, userID string, input SendDMInput) (*models.Message, error) {
	isMember, _ := s.dmRepo.IsMember(ctx, convID, userID)
	if !isMember {
		return nil, apperror.Forbidden("not a member of this conversation")
	}
	if input.Content == "" && len(input.AttachmentIDs) == 0 {
		return nil, apperror.BadRequest("content or attachments required")
	}
	if len(input.Content) > 4000 {
		return nil, apperror.BadRequest("content too long (max 4000)")
	}
	if len(input.AttachmentIDs) > 10 {
		return nil, apperror.BadRequest(fmt.Sprintf("too many attachments (max %d)", 10))
	}

	if input.Content != "" && s.modSvc != nil {
		if result := s.modSvc.CheckText(ctx, input.Content); result != nil && result.Flagged {
			return nil, apperror.BadRequest("message blocked by content moderation: " + result.Category)
		}
	}

	replyToMessageID := normalizeOptionalMessageID(input.ReplyToMessageID)
	if replyToMessageID != nil {
		belongs, err := s.dmRepo.MessageBelongsToConversation(ctx, *replyToMessageID, convID)
		if err != nil || !belongs {
			return nil, apperror.BadRequest("reply target must be in the same conversation")
		}
	}

	msg := &models.Message{
		ID:                 uuid.New().String(),
		ConversationID:     &convID,
		AuthorID:           userID,
		Content:            input.Content,
		ReplyToMessageID:   replyToMessageID,
		ForwardedMessageID: normalizeOptionalMessageID(input.ForwardedMessageID),
		CreatedAt:          time.Now(),
	}

	if err := s.msgRepo.Create(ctx, msg); err != nil {
		return nil, apperror.Internal("failed to create message", err)
	}

	_ = s.dmRepo.UpdateConversationTimestamp(ctx, convID, msg.CreatedAt)

	if len(input.AttachmentIDs) > 0 {
		_ = s.msgRepo.LinkAttachments(ctx, msg.ID, userID, input.AttachmentIDs)
	}

	msg, err := s.loadDetailedMessage(ctx, msg.ID)
	if err != nil {
		return nil, apperror.Internal("failed to load created message", err)
	}

	evt := ws.NewEvent(ws.OpDMMessageCreate, msg)
	// Sender: apply immediately in their UI (and other tabs/devices).
	s.hub.SendToUser(userID, evt)
	others, _ := s.dmRepo.GetOtherMembers(ctx, convID, userID)
	for _, uid := range others {
		s.hub.SendToUser(uid, evt)
	}

	if s.notifSvc != nil && msg.Author != nil {
		for _, recipientID := range others {
			rid := recipientID
			title := msg.Author.DisplayName + " sent you a message"
			bodyStr := input.Content
			notifCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			go func() {
				defer cancel()
				s.notifSvc.Create(notifCtx, rid, "dm", title, &bodyStr, &msg.ID, nil, nil, &userID)
			}()
		}
	}

	return msg, nil
}

func (s *DMService) loadDetailedMessage(ctx context.Context, msgID string) (*models.Message, error) {
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

func (s *DMService) AckDM(ctx context.Context, convID, userID, messageID string) error {
	isMember, _ := s.dmRepo.IsMember(ctx, convID, userID)
	if !isMember {
		return apperror.Forbidden("not a member of this conversation")
	}
	if messageID == "" {
		return apperror.BadRequest("message_id is required")
	}
	belongs, _ := s.dmRepo.MessageBelongsToConversation(ctx, messageID, convID)
	if !belongs {
		return apperror.BadRequest("message does not belong to this conversation")
	}
	if err := s.dmRepo.AckDM(ctx, userID, convID, messageID); err != nil {
		return apperror.Internal("failed to ack conversation", err)
	}
	return nil
}

func (s *DMService) ReadStates(ctx context.Context, userID string) ([]repository.DMReadState, error) {
	states, err := s.dmRepo.GetReadStates(ctx, userID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return states, nil
}
