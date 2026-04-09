package service

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"

	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type NotificationService struct {
	notifRepo *repository.NotificationRepo
	hub       *ws.Hub
	pushSvc   PushSender
}

type PushSender interface {
	SendToUser(ctx context.Context, userID string, p PushPayload) error
}

type PushPayload struct {
	Title       string
	Body        string
	Data        map[string]string
	BadgeCount  *int
	CollapseKey string
}

func NewNotificationService(notifRepo *repository.NotificationRepo, hub *ws.Hub) *NotificationService {
	return &NotificationService{notifRepo: notifRepo, hub: hub}
}

func (s *NotificationService) SetPushSender(ps PushSender) {
	s.pushSvc = ps
}

func (s *NotificationService) List(ctx context.Context, userID string) ([]models.Notification, error) {
	return s.notifRepo.List(ctx, userID)
}

func (s *NotificationService) MarkRead(ctx context.Context, notifID, userID string) (bool, error) {
	return s.notifRepo.MarkRead(ctx, notifID, userID)
}

func (s *NotificationService) MarkAllRead(ctx context.Context, userID string) error {
	return s.notifRepo.MarkAllRead(ctx, userID)
}

func (s *NotificationService) Create(ctx context.Context, userID, ntype, title string, body, referenceID, hubID, streamID, actorID *string) {
	if actorID != nil && *actorID == userID {
		return
	}

	if referenceID != nil {
		exists, _ := s.notifRepo.ExistsByReference(ctx, userID, ntype, *referenceID)
		if exists {
			return
		}
	}

	if ntype == "dm" && actorID != nil {
		recent, _ := s.notifRepo.RecentDMNotifExists(ctx, userID, *actorID)
		if recent {
			return
		}
	}

	hourCount, _ := s.notifRepo.HourlyCount(ctx, userID)
	if hourCount >= 50 {
		log.Printf("notif: rate limit hit for user %s (%d/hr)", userID, hourCount)
		return
	}

	id := uuid.New().String()
	now := time.Now()

	notif := &models.Notification{
		ID:          id,
		UserID:      userID,
		Type:        ntype,
		Title:       title,
		Body:        body,
		ReferenceID: referenceID,
		HubID:       hubID,
		StreamID:    streamID,
		ActorID:     actorID,
		Read:        false,
		CreatedAt:   now,
	}

	if err := s.notifRepo.Create(ctx, notif); err != nil {
		log.Printf("notif: insert failed for user %s type %s: %v", userID, ntype, err)
		return
	}

	if actorID != nil {
		actor, err := s.notifRepo.GetActorInfo(ctx, *actorID)
		if err == nil {
			notif.Actor = actor
		}
	}

	evt := ws.NewEvent(ws.OpNotificationCreate, notif)
	s.hub.SendToUser(userID, evt)

	if s.pushSvc != nil {
		go func() {
			pushBody := title
			if body != nil && *body != "" {
				pushBody = *body
			}
			data := map[string]string{"type": ntype}
			if hubID != nil {
				data["hub_id"] = *hubID
			}
			if streamID != nil {
				data["stream_id"] = *streamID
			}
			if referenceID != nil {
				data["reference_id"] = *referenceID
			}
			_ = s.pushSvc.SendToUser(context.Background(), userID, PushPayload{
				Title:       title,
				Body:        pushBody,
				Data:        data,
				CollapseKey: ntype,
			})
		}()
	}
}
