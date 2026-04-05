package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type DMService struct {
	dmRepo   *repository.DMRepo
	msgRepo  *repository.MessageRepo
	notifSvc *NotificationService
	hub      *ws.Hub
}

func NewDMService(dmRepo *repository.DMRepo, msgRepo *repository.MessageRepo, notifSvc *NotificationService, hub *ws.Hub) *DMService {
	return &DMService{dmRepo: dmRepo, msgRepo: msgRepo, notifSvc: notifSvc, hub: hub}
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

func (s *DMService) CreateOrOpen(ctx context.Context, userID, recipientID string) (map[string]interface{}, bool, error) {
	if recipientID == "" {
		return nil, false, apperror.BadRequest("recipient_id is required")
	}
	if recipientID == userID {
		return nil, false, apperror.BadRequest("cannot DM yourself")
	}

	exists, _ := s.dmRepo.UserExists(ctx, recipientID)
	if !exists {
		return nil, false, apperror.NotFound("user not found")
	}

	tx, err := s.dmRepo.BeginTx(ctx)
	if err != nil {
		return nil, false, apperror.Internal("internal error", err)
	}
	defer tx.Rollback(ctx)

	lockKey := repository.AdvisoryLockKey(userID, recipientID)
	tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey)

	existingID, err := s.dmRepo.FindExistingConversation(ctx, tx, userID, recipientID)
	if err == nil {
		tx.Rollback(ctx)
		conv, _ := s.dmRepo.GetConversation(ctx, existingID)
		recipient, _ := s.dmRepo.GetUserInfo(ctx, recipientID)
		result := map[string]interface{}{
			"id":         conv.ID,
			"created_at": conv.CreatedAt,
			"updated_at": conv.UpdatedAt,
			"recipient":  recipient,
		}
		return result, false, nil
	}

	convID := uuid.New().String()
	now := time.Now()

	if err := s.dmRepo.CreateConversation(ctx, tx, convID, userID, recipientID, now); err != nil {
		return nil, false, apperror.Internal("failed to create conversation", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, apperror.Internal("internal error", err)
	}

	recipient, _ := s.dmRepo.GetUserInfo(ctx, recipientID)
	initiator, _ := s.dmRepo.GetUserInfo(ctx, userID)

	recipientPayload := map[string]interface{}{
		"id": convID, "created_at": now, "updated_at": now, "recipient": initiator,
	}
	s.hub.SendToUser(recipientID, ws.NewEvent(ws.OpDMConversationCreate, recipientPayload))

	result := map[string]interface{}{
		"id": convID, "created_at": now, "updated_at": now, "recipient": recipient,
	}
	return result, true, nil
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
	Content       string   `json:"content"`
	AttachmentIDs []string `json:"attachment_ids"`
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

	msg := &models.Message{
		ID:             uuid.New().String(),
		ConversationID: &convID,
		AuthorID:       userID,
		Content:        input.Content,
		CreatedAt:      time.Now(),
	}

	if err := s.msgRepo.Create(ctx, msg); err != nil {
		return nil, apperror.Internal("failed to create message", err)
	}

	_ = s.dmRepo.UpdateConversationTimestamp(ctx, convID, msg.CreatedAt)

	if len(input.AttachmentIDs) > 0 {
		_ = s.msgRepo.LinkAttachments(ctx, msg.ID, userID, input.AttachmentIDs)
		atts, _ := s.msgRepo.GetLinkedAttachments(ctx, msg.ID)
		msg.Attachments = atts
	}

	author, _ := s.msgRepo.GetAuthorInfo(ctx, userID)
	msg.Author = author

	evt := ws.NewEvent(ws.OpDMMessageCreate, msg)
	others, _ := s.dmRepo.GetOtherMembers(ctx, convID, userID)
	for _, uid := range others {
		s.hub.SendToUser(uid, evt)
	}

	if s.notifSvc != nil && author != nil {
		for _, recipientID := range others {
			title := author.DisplayName + " sent you a message"
			bodyStr := input.Content
			go s.notifSvc.Create(recipientID, "dm", title, &bodyStr, &msg.ID, nil, nil, &userID)
		}
	}

	return msg, nil
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
