package service

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/moderation"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/user"
)

type ReportService struct {
	repo     *repository.ReportRepo
	modSvc   *moderation.Service
	msgRepo  *repository.MessageRepo
	userRepo *user.Repo
	notifSvc *NotificationService
}

func NewReportService(
	repo *repository.ReportRepo,
	modSvc *moderation.Service,
	msgRepo *repository.MessageRepo,
	userRepo *user.Repo,
	notifSvc *NotificationService,
) *ReportService {
	return &ReportService{
		repo:     repo,
		modSvc:   modSvc,
		msgRepo:  msgRepo,
		userRepo: userRepo,
		notifSvc: notifSvc,
	}
}

type CreateReportInput struct {
	ReportedUserID *string `json:"reported_user_id"`
	MessageID      *string `json:"message_id"`
	HubID          *string `json:"hub_id"`
	Reason         string  `json:"reason"`
	Category       string  `json:"category"`
	MessageContent string  `json:"message_content"`
}

func (s *ReportService) Create(ctx context.Context, reporterID string, input CreateReportInput) (*repository.Report, error) {
	if input.Reason == "" {
		return nil, apperror.BadRequest("reason is required")
	}
	cat := input.Category
	if cat == "" {
		cat = "other"
	}

	var autoMod json.RawMessage
	if s.modSvc != nil && input.MessageContent != "" {
		if resp := s.modSvc.AnalyzeForReport(ctx, input.MessageContent); resp != nil {
			autoMod, _ = json.Marshal(resp)
		}
	}

	report := &repository.Report{
		ID:             uuid.New().String(),
		ReporterID:     reporterID,
		ReportedUserID: input.ReportedUserID,
		MessageID:      input.MessageID,
		HubID:          input.HubID,
		Reason:         input.Reason,
		Category:       cat,
		AutoModeration: autoMod,
		CreatedAt:      time.Now(),
	}

	if err := s.repo.Create(ctx, report); err != nil {
		return nil, apperror.Internal("failed to create report", err)
	}
	return s.repo.GetByID(ctx, report.ID)
}

func (s *ReportService) Get(ctx context.Context, id string) (*repository.Report, error) {
	rpt, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperror.NotFound("report not found")
		}
		return nil, err
	}
	return rpt, nil
}

func (s *ReportService) List(ctx context.Context, status, category string, limit, offset int) ([]repository.Report, int, error) {
	return s.repo.List(ctx, repository.ReportFilter{
		Status:   status,
		Category: category,
		Limit:    limit,
		Offset:   offset,
	})
}

func (s *ReportService) Resolve(ctx context.Context, id, moderatorID, status string, note *string) error {
	if status != "resolved" && status != "dismissed" && status != "reviewing" {
		return apperror.BadRequest("invalid status")
	}
	return s.repo.UpdateStatus(ctx, id, status, &moderatorID, note)
}

type TakeActionInput struct {
	ActionType   string  `json:"action_type"`
	TargetUserID *string `json:"target_user_id"`
	TargetHubID  *string `json:"target_hub_id"`
}

var allowedActionTypes = map[string]bool{
	"ban": true, "warn": true, "delete_message": true,
}

func (s *ReportService) TakeAction(ctx context.Context, reportID, performedBy string, input TakeActionInput) error {
	if input.ActionType == "" {
		return apperror.BadRequest("action_type is required")
	}
	if !allowedActionTypes[input.ActionType] {
		return apperror.BadRequest("unknown action_type: " + input.ActionType)
	}

	var execErr error
	switch input.ActionType {
	case "ban":
		execErr = s.executeBan(ctx, input.TargetUserID, reportID, performedBy)
	case "warn":
		execErr = s.executeWarn(ctx, input.TargetUserID, reportID, performedBy)
	case "delete_message":
		execErr = s.executeDeleteMessage(ctx, reportID)
	}
	if execErr != nil {
		return execErr
	}

	action := &repository.ModerationAction{
		ID:           uuid.New().String(),
		ReportID:     &reportID,
		ActionType:   input.ActionType,
		TargetUserID: input.TargetUserID,
		TargetHubID:  input.TargetHubID,
		PerformedBy:  performedBy,
		CreatedAt:    time.Now(),
	}
	if err := s.repo.CreateAction(ctx, action); err != nil {
		log.Printf("moderation: action %s succeeded but audit log failed: %v", input.ActionType, err)
	}

	return nil
}

func (s *ReportService) executeBan(ctx context.Context, targetUserID *string, reportID, performedBy string) error {
	if targetUserID == nil || *targetUserID == "" {
		return apperror.BadRequest("target_user_id is required for ban action")
	}
	if s.userRepo == nil {
		return apperror.Internal("user repository not available", nil)
	}
	if err := s.userRepo.BanUser(ctx, *targetUserID); err != nil {
		return apperror.Internal("failed to ban user", err)
	}
	log.Printf("moderation: user %s banned by %s (report %s)", *targetUserID, performedBy, reportID)
	return nil
}

func (s *ReportService) executeWarn(ctx context.Context, targetUserID *string, reportID, performedBy string) error {
	if targetUserID == nil || *targetUserID == "" {
		return apperror.BadRequest("target_user_id is required for warn action")
	}
	if s.notifSvc != nil {
		body := "A moderator has reviewed reported content associated with your account. Please review our community guidelines."
		s.notifSvc.Create(ctx, *targetUserID, "moderation", "You have received a warning", &body, &reportID, nil, nil, nil)
	}
	log.Printf("moderation: user %s warned by %s (report %s)", *targetUserID, performedBy, reportID)
	return nil
}

func (s *ReportService) executeDeleteMessage(ctx context.Context, reportID string) error {
	if s.msgRepo == nil {
		return apperror.Internal("message repository not available", nil)
	}
	report, err := s.repo.GetByID(ctx, reportID)
	if err != nil {
		return apperror.Internal("failed to load report for message deletion", err)
	}
	if report.MessageID == nil || *report.MessageID == "" {
		return apperror.BadRequest("report has no associated message")
	}
	if err := s.msgRepo.Delete(ctx, *report.MessageID); err != nil {
		return apperror.Internal("failed to delete message", err)
	}
	log.Printf("moderation: message %s deleted (report %s)", *report.MessageID, reportID)
	return nil
}

func (s *ReportService) Stats(ctx context.Context) (map[string]interface{}, error) {
	return s.repo.Stats(ctx)
}
