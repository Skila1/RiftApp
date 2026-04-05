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

type HubService struct {
	hubRepo       *repository.HubRepo
	streamRepo    *repository.StreamRepo
	inviteRepo    *repository.InviteRepo
	notifRepo     *repository.NotificationRepo
	hubNotifRepo  *repository.HubNotificationSettingsRepo
}

func NewHubService(
	hubRepo *repository.HubRepo,
	streamRepo *repository.StreamRepo,
	inviteRepo *repository.InviteRepo,
	notifRepo *repository.NotificationRepo,
	hubNotifRepo *repository.HubNotificationSettingsRepo,
) *HubService {
	return &HubService{
		hubRepo:      hubRepo,
		streamRepo:   streamRepo,
		inviteRepo:   inviteRepo,
		notifRepo:    notifRepo,
		hubNotifRepo: hubNotifRepo,
	}
}

func (s *HubService) Create(ctx context.Context, userID, name string) (*models.Hub, error) {
	if name == "" {
		return nil, apperror.BadRequest("name is required")
	}

	hub := &models.Hub{
		ID:        uuid.New().String(),
		Name:      name,
		OwnerID:   userID,
		CreatedAt: time.Now(),
	}

	if err := s.hubRepo.Create(ctx, hub, models.RoleOwner); err != nil {
		return nil, apperror.Internal("failed to create hub", err)
	}

	if err := s.hubRepo.CreateDefaultStream(ctx, uuid.New().String(), hub.ID); err != nil {
		return nil, apperror.Internal("failed to create default stream", err)
	}

	return hub, nil
}

func (s *HubService) Get(ctx context.Context, hubID, userID string) (*models.Hub, error) {
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return nil, apperror.Forbidden("not a member")
	}
	hub, err := s.hubRepo.GetByID(ctx, hubID)
	if err != nil {
		return nil, apperror.NotFound("hub not found")
	}
	return hub, nil
}

func (s *HubService) List(ctx context.Context, userID string) ([]models.Hub, error) {
	hubs, err := s.hubRepo.ListByUser(ctx, userID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return hubs, nil
}

func (s *HubService) Update(ctx context.Context, hubID, userID string, name *string, iconURL *string) (*models.Hub, error) {
	if !s.canManage(ctx, hubID, userID) {
		return nil, apperror.Forbidden("you do not have permission to edit this hub")
	}

	if name != nil {
		n := strings.TrimSpace(*name)
		if n == "" || len(n) > 100 {
			return nil, apperror.BadRequest("name must be 1-100 characters")
		}
		name = &n
	}
	if iconURL != nil {
		u := strings.TrimSpace(*iconURL)
		if len(u) > 512 {
			return nil, apperror.BadRequest("icon_url must be at most 512 characters")
		}
		iconURL = &u
	}

	if name == nil && iconURL == nil {
		return nil, apperror.BadRequest("no fields to update")
	}

	hub, err := s.hubRepo.Update(ctx, hubID, name, iconURL)
	if err != nil {
		return nil, apperror.NotFound("hub not found")
	}
	return hub, nil
}

func (s *HubService) Join(ctx context.Context, hubID, userID string) error {
	if s.hubRepo.IsMember(ctx, hubID, userID) {
		return apperror.Conflict("already a member")
	}
	if err := s.hubRepo.AddMember(ctx, hubID, userID, models.RoleMember); err != nil {
		return apperror.Internal("failed to join", err)
	}
	return nil
}

func (s *HubService) Leave(ctx context.Context, hubID, userID string) error {
	ownerID, err := s.hubRepo.GetOwnerID(ctx, hubID)
	if err != nil {
		return apperror.NotFound("hub not found")
	}
	if ownerID == userID {
		return apperror.Forbidden("owner cannot leave the hub")
	}
	if err := s.hubRepo.RemoveMember(ctx, hubID, userID); err != nil {
		return apperror.Internal("failed to leave", err)
	}
	return nil
}

func (s *HubService) Members(ctx context.Context, hubID, userID string) ([]repository.MemberWithRole, error) {
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return nil, apperror.Forbidden("not a member")
	}
	members, err := s.hubRepo.ListMembers(ctx, hubID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}
	return members, nil
}

func (s *HubService) GetInviteInfo(ctx context.Context, code string) (map[string]interface{}, error) {
	invite, err := s.inviteRepo.GetByCode(ctx, code)
	if err != nil {
		return nil, apperror.NotFound("invalid invite code")
	}
	if invite.ExpiresAt != nil && time.Now().After(*invite.ExpiresAt) {
		return nil, apperror.New(410, "invite has expired")
	}
	if invite.MaxUses > 0 && invite.Uses >= invite.MaxUses {
		return nil, apperror.New(410, "invite has reached maximum uses")
	}
	hub, err := s.hubRepo.GetByID(ctx, invite.HubID)
	if err != nil {
		return nil, apperror.NotFound("hub not found")
	}
	memberCount, _ := s.hubRepo.CountMembers(ctx, invite.HubID)
	return map[string]interface{}{
		"code":         invite.Code,
		"hub_id":       hub.ID,
		"hub_name":     hub.Name,
		"hub_icon_url": hub.IconURL,
		"member_count": memberCount,
		"expires_at":   invite.ExpiresAt,
	}, nil
}

func (s *HubService) CreateInvite(ctx context.Context, hubID, userID string, maxUses int, expiresIn *int) (*models.HubInvite, error) {
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return nil, apperror.Forbidden("you must be a member to create invites")
	}

	code, err := repository.GenerateInviteCode()
	if err != nil {
		return nil, apperror.Internal("failed to generate invite code", err)
	}

	invite := &models.HubInvite{
		ID:        uuid.New().String(),
		HubID:     hubID,
		CreatorID: userID,
		Code:      code,
		MaxUses:   maxUses,
		Uses:      0,
		CreatedAt: time.Now(),
	}

	if expiresIn != nil && *expiresIn > 0 {
		exp := time.Now().Add(time.Duration(*expiresIn) * time.Second)
		invite.ExpiresAt = &exp
	}

	if err := s.inviteRepo.Create(ctx, invite); err != nil {
		return nil, apperror.Internal("failed to create invite", err)
	}
	return invite, nil
}

func (s *HubService) JoinViaInvite(ctx context.Context, code, userID string) (*models.Hub, string, error) {
	invite, err := s.inviteRepo.GetByCode(ctx, code)
	if err != nil {
		return nil, "", apperror.NotFound("invalid invite code")
	}

	if invite.ExpiresAt != nil && time.Now().After(*invite.ExpiresAt) {
		return nil, "", apperror.New(410, "invite has expired")
	}

	if invite.MaxUses > 0 && invite.Uses >= invite.MaxUses {
		return nil, "", apperror.New(410, "invite has reached maximum uses")
	}

	if s.hubRepo.IsMember(ctx, invite.HubID, userID) {
		return nil, "", apperror.Conflict("already a member of this hub")
	}

	tx, err := s.inviteRepo.BeginTx(ctx)
	if err != nil {
		return nil, "", apperror.Internal("internal error", err)
	}
	defer tx.Rollback(ctx)

	if err := s.inviteRepo.AddMemberInTx(ctx, tx, invite.HubID, userID, models.RoleMember); err != nil {
		return nil, "", apperror.Internal("failed to join hub", err)
	}

	if err := s.inviteRepo.IncrementUses(ctx, tx, invite.ID); err != nil {
		return nil, "", apperror.Internal("internal error", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, "", apperror.Internal("internal error", err)
	}

	hub, _ := s.hubRepo.GetByID(ctx, invite.HubID)
	return hub, invite.CreatorID, nil
}

func (s *HubService) canManage(ctx context.Context, hubID, userID string) bool {
	role := s.hubRepo.GetMemberRole(ctx, hubID, userID)
	if role == "" {
		return false
	}
	return models.RoleHasPermission(role, models.PermManageHub)
}

func (s *HubService) HasPermission(ctx context.Context, hubID, userID string, perm int64) bool {
	role := s.hubRepo.GetMemberRole(ctx, hubID, userID)
	if role == "" {
		return false
	}
	return models.RoleHasPermission(role, perm)
}

func (s *HubService) GetStreamHubID(ctx context.Context, streamID, userID string) (string, error) {
	hubID, err := s.streamRepo.GetHubID(ctx, streamID)
	if err != nil {
		return "", err
	}
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return "", apperror.Forbidden("not a member")
	}
	return hubID, nil
}

func (s *HubService) AssertHubMember(ctx context.Context, hubID, userID string) error {
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return apperror.Forbidden("not a member")
	}
	return nil
}

func (s *HubService) GetNotificationSettings(ctx context.Context, hubID, userID string) (repository.HubNotificationSettings, error) {
	if err := s.AssertHubMember(ctx, hubID, userID); err != nil {
		return repository.HubNotificationSettings{}, err
	}
	return s.hubNotifRepo.Get(ctx, userID, hubID)
}

// ShouldDeliverInviteJoinNotif is false when the hub owner has muted server event notifications.
func (s *HubService) ShouldDeliverInviteJoinNotif(ctx context.Context, creatorID, hubID string) bool {
	st, err := s.hubNotifRepo.Get(ctx, creatorID, hubID)
	if err != nil {
		return true
	}
	return !st.MuteEvents
}

func (s *HubService) UpdateNotificationSettings(ctx context.Context, hubID, userID string, in repository.HubNotificationSettings) (repository.HubNotificationSettings, error) {
	if err := s.AssertHubMember(ctx, hubID, userID); err != nil {
		return repository.HubNotificationSettings{}, err
	}
	switch in.NotificationLevel {
	case "all", "mentions_only", "nothing":
	default:
		return repository.HubNotificationSettings{}, apperror.BadRequest("invalid notification_level")
	}
	if err := s.hubNotifRepo.Upsert(ctx, userID, hubID, in); err != nil {
		return repository.HubNotificationSettings{}, apperror.Internal("failed to save settings", err)
	}
	return s.hubNotifRepo.Get(ctx, userID, hubID)
}
