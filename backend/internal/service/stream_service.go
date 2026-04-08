package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

type StreamService struct {
	streamRepo      *repository.StreamRepo
	hubService      *HubService
	msgRepo         *repository.MessageRepo
	notifRepo       *repository.NotificationRepo
	streamNotifRepo *repository.StreamNotificationSettingsRepo
}

func NewStreamService(
	streamRepo *repository.StreamRepo,
	hubService *HubService,
	msgRepo *repository.MessageRepo,
	notifRepo *repository.NotificationRepo,
	streamNotifRepo *repository.StreamNotificationSettingsRepo,
) *StreamService {
	return &StreamService{
		streamRepo:      streamRepo,
		hubService:      hubService,
		msgRepo:         msgRepo,
		notifRepo:       notifRepo,
		streamNotifRepo: streamNotifRepo,
	}
}

func (s *StreamService) Create(ctx context.Context, hubID, userID, name string, streamType int, isPrivate bool, categoryID *string) (*models.Stream, error) {
	if !s.hubService.HasPermission(ctx, hubID, userID, models.PermManageStreams) {
		return nil, apperror.Forbidden("you do not have permission to manage channels")
	}
	name = normalizeStreamName(name)
	if name == "" {
		return nil, apperror.BadRequest("name is required")
	}

	maxPos, _ := s.streamRepo.GetMaxPosition(ctx, hubID)

	stream := &models.Stream{
		ID:         uuid.New().String(),
		HubID:      hubID,
		Name:       name,
		Type:       streamType,
		Position:   maxPos + 1,
		IsPrivate:  isPrivate,
		CategoryID: categoryID,
		CreatedAt:  time.Now(),
	}

	if err := s.streamRepo.Create(ctx, stream); err != nil {
		return nil, apperror.Internal("failed to create stream", err)
	}
	return stream, nil
}

func (s *StreamService) List(ctx context.Context, hubID string) ([]models.Stream, error) {
	streams, err := s.streamRepo.ListByHub(ctx, hubID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return streams, nil
}

func (s *StreamService) Get(ctx context.Context, streamID string) (*models.Stream, error) {
	stream, err := s.streamRepo.GetByID(ctx, streamID)
	if err != nil {
		return nil, apperror.NotFound("stream not found")
	}
	return stream, nil
}

func (s *StreamService) Delete(ctx context.Context, streamID, userID string) error {
	hubID, err := s.streamRepo.GetHubID(ctx, streamID)
	if err != nil {
		return apperror.NotFound("stream not found")
	}
	if !s.hubService.HasPermission(ctx, hubID, userID, models.PermManageStreams) {
		return apperror.Forbidden("you do not have permission to manage channels")
	}
	if err := s.streamRepo.Delete(ctx, streamID); err != nil {
		return apperror.Internal("failed to delete stream", err)
	}
	return nil
}

func normalizeStreamName(raw string) string {
	s := strings.TrimSpace(strings.ToLower(raw))
	s = strings.ReplaceAll(s, " ", "-")
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Patch updates editable stream fields (name, bitrate, user_limit, region, is_private). Requires manage channels permission.
func (s *StreamService) Patch(ctx context.Context, streamID, userID string, name *string, bitrate *int, userLimit *int, region *string, isPrivate *bool) (*models.Stream, error) {
	hubID, err := s.streamRepo.GetHubID(ctx, streamID)
	if err != nil {
		return nil, apperror.NotFound("stream not found")
	}
	if !s.hubService.HasPermission(ctx, hubID, userID, models.PermManageStreams) {
		return nil, apperror.Forbidden("you do not have permission to manage channels")
	}
	if name != nil {
		n := normalizeStreamName(*name)
		if n == "" {
			return nil, apperror.BadRequest("name is required")
		}
		if err := s.streamRepo.UpdateName(ctx, streamID, n); err != nil {
			return nil, apperror.Internal("failed to update stream", err)
		}
	}
	// Voice-channel settings
	if bitrate != nil || userLimit != nil || region != nil {
		current, err := s.streamRepo.GetByID(ctx, streamID)
		if err != nil {
			return nil, apperror.Internal("failed to read stream", err)
		}
		b := current.Bitrate
		ul := current.UserLimit
		rg := current.Region
		if bitrate != nil {
			b = *bitrate
			if b < 8000 || b > 96000 {
				return nil, apperror.BadRequest("bitrate must be between 8000 and 96000")
			}
		}
		if userLimit != nil {
			ul = *userLimit
			if ul < 0 || ul > 99 {
				return nil, apperror.BadRequest("user_limit must be between 0 and 99")
			}
		}
		if region != nil {
			rg = *region
		}
		if err := s.streamRepo.UpdateSettings(ctx, streamID, b, ul, rg); err != nil {
			return nil, apperror.Internal("failed to update stream settings", err)
		}
	}
	if isPrivate != nil {
		if err := s.streamRepo.UpdateIsPrivate(ctx, streamID, *isPrivate); err != nil {
			return nil, apperror.Internal("failed to update stream privacy", err)
		}
	}
	return s.streamRepo.GetByID(ctx, streamID)
}

func (s *StreamService) Ack(ctx context.Context, streamID, userID, messageID string) error {
	if messageID == "" {
		return apperror.BadRequest("message_id is required")
	}
	if err := s.streamRepo.AckStream(ctx, userID, streamID, messageID); err != nil {
		return apperror.Internal("failed to mark stream read", err)
	}
	return nil
}

func (s *StreamService) ReadStates(ctx context.Context, hubID, userID string) ([]repository.ReadState, error) {
	states, err := s.streamRepo.GetReadStates(ctx, hubID, userID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return states, nil
}

func (s *StreamService) GetHubID(ctx context.Context, streamID string) (string, error) {
	return s.streamRepo.GetHubID(ctx, streamID)
}

func (s *StreamService) GetName(ctx context.Context, streamID string) (string, error) {
	return s.streamRepo.GetName(ctx, streamID)
}

func (s *StreamService) GetNotificationSettings(ctx context.Context, streamID, userID string) (repository.StreamNotificationSettings, error) {
	if _, err := s.hubService.GetStreamHubID(ctx, streamID, userID); err != nil {
		return repository.StreamNotificationSettings{}, err
	}
	return s.streamNotifRepo.Get(ctx, userID, streamID)
}

func (s *StreamService) UpdateNotificationSettings(ctx context.Context, streamID, userID string, in repository.StreamNotificationSettings) (repository.StreamNotificationSettings, error) {
	if _, err := s.hubService.GetStreamHubID(ctx, streamID, userID); err != nil {
		return repository.StreamNotificationSettings{}, err
	}
	switch in.NotificationLevel {
	case "all", "mentions_only", "nothing":
	default:
		return repository.StreamNotificationSettings{}, apperror.BadRequest("invalid notification_level")
	}
	if err := s.streamNotifRepo.Upsert(ctx, userID, streamID, in); err != nil {
		return repository.StreamNotificationSettings{}, apperror.Internal("failed to save settings", err)
	}
	return s.streamNotifRepo.Get(ctx, userID, streamID)
}

// MarkAllReadInHub marks every text stream in the hub read (latest message per stream) and clears hub notifications.
func (s *StreamService) MarkAllReadInHub(ctx context.Context, hubID, userID string) error {
	if err := s.hubService.AssertHubMember(ctx, hubID, userID); err != nil {
		return err
	}
	latest, err := s.msgRepo.LatestMessageIDsForHubTextStreams(ctx, hubID)
	if err != nil {
		return apperror.Internal("failed to list latest messages", err)
	}
	for streamID, msgID := range latest {
		if err := s.streamRepo.AckStream(ctx, userID, streamID, msgID); err != nil {
			return apperror.Internal("failed to ack stream", err)
		}
	}
	if err := s.notifRepo.MarkReadForHub(ctx, userID, hubID); err != nil {
		return apperror.Internal("failed to mark notifications read", err)
	}
	return nil
}

// ReorderStreams bulk-updates stream positions and category assignments.
func (s *StreamService) ReorderStreams(ctx context.Context, hubID, userID string, items []struct {
	ID         string  `json:"id"`
	Position   int     `json:"position"`
	CategoryID *string `json:"category_id"`
}) error {
	if !s.hubService.HasPermission(ctx, hubID, userID, models.PermManageStreams) {
		return apperror.Forbidden("you do not have permission to manage channels")
	}
	if len(items) == 0 {
		return nil
	}
	bulkItems := make([]struct {
		ID         string
		Position   int
		CategoryID *string
	}, len(items))
	for i, it := range items {
		bulkItems[i].ID = it.ID
		bulkItems[i].Position = it.Position
		bulkItems[i].CategoryID = it.CategoryID
	}
	if err := s.streamRepo.BulkUpdatePositions(ctx, hubID, bulkItems); err != nil {
		return apperror.Internal("failed to reorder streams", err)
	}
	return nil
}
