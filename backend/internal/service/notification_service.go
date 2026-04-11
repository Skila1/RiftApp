package service

import (
	"context"
	"log"
	"sync"
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
	pushQueue chan pushSendTask
	pushOnce  sync.Once
}

type pushSendTask struct {
	userID  string
	payload PushPayload
}

const (
	pushSendWorkerCount = 8
	pushSendQueueSize   = 256
	pushSendTimeout     = 5 * time.Second
)

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
	if ps != nil {
		s.initPushDispatcher()
	}
}

func (s *NotificationService) initPushDispatcher() {
	s.pushOnce.Do(func() {
		s.pushQueue = make(chan pushSendTask, pushSendQueueSize)
		for workerIndex := 0; workerIndex < pushSendWorkerCount; workerIndex++ {
			go s.runPushWorker()
		}
	})
}

func (s *NotificationService) runPushWorker() {
	for task := range s.pushQueue {
		if s.pushSvc == nil || task.userID == "" {
			continue
		}

		pushCtx, cancel := context.WithTimeout(context.Background(), pushSendTimeout)
		err := s.pushSvc.SendToUser(pushCtx, task.userID, task.payload)
		cancel()
		if err != nil {
			log.Printf("push: send to user %s failed: %v", task.userID, err)
		}
	}
}

func clonePushPayload(payload PushPayload) PushPayload {
	clone := payload
	if payload.BadgeCount != nil {
		badgeCount := *payload.BadgeCount
		clone.BadgeCount = &badgeCount
	}
	if len(payload.Data) == 0 {
		clone.Data = nil
		return clone
	}
	clone.Data = make(map[string]string, len(payload.Data))
	for key, value := range payload.Data {
		if key == "" || value == "" {
			continue
		}
		clone.Data[key] = value
	}
	return clone
}

func isReservedPushDataKey(key string) bool {
	switch key {
	case "type", "hub_id", "stream_id", "reference_id":
		return true
	default:
		return false
	}
}

func buildPushData(ntype string, referenceID, hubID, streamID *string, pushDataCopy map[string]string) map[string]string {
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
	for key, value := range pushDataCopy {
		if key == "" || value == "" || isReservedPushDataKey(key) {
			continue
		}
		data[key] = value
	}
	return data
}

func (s *NotificationService) dispatchPushAsync(userID string, payload PushPayload) {
	if s.pushSvc == nil || userID == "" {
		return
	}

	s.initPushDispatcher()
	task := pushSendTask{userID: userID, payload: clonePushPayload(payload)}
	select {
	case s.pushQueue <- task:
	default:
		log.Printf("push: queue full, dropping notification for user %s", userID)
	}
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
	s.CreateWithPushData(ctx, userID, ntype, title, body, referenceID, hubID, streamID, actorID, nil)
}

func (s *NotificationService) CreateWithPushData(ctx context.Context, userID, ntype, title string, body, referenceID, hubID, streamID, actorID *string, pushData map[string]string) {
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
		pushDataCopy := make(map[string]string, len(pushData))
		for key, value := range pushData {
			if key == "" || value == "" {
				continue
			}
			pushDataCopy[key] = value
		}

		pushBody := title
		if body != nil && *body != "" {
			pushBody = *body
		}
		data := buildPushData(ntype, referenceID, hubID, streamID, pushDataCopy)
		s.dispatchPushAsync(userID, PushPayload{
			Title:       title,
			Body:        pushBody,
			Data:        data,
			CollapseKey: ntype,
		})
	}
}

func (s *NotificationService) PushUsers(ctx context.Context, userIDs []string, p PushPayload) {
	if s.pushSvc == nil || len(userIDs) == 0 {
		return
	}
	for _, userID := range userIDs {
		if userID == "" {
			continue
		}
		s.dispatchPushAsync(userID, p)
	}
}
