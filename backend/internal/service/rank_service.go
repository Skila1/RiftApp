package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

const maxRanksPerHub = 25

type RankService struct {
	rankRepo *repository.RankRepo
	hubRepo  *repository.HubRepo
}

func NewRankService(rankRepo *repository.RankRepo, hubRepo *repository.HubRepo) *RankService {
	return &RankService{rankRepo: rankRepo, hubRepo: hubRepo}
}

func (s *RankService) List(ctx context.Context, hubID, userID string) ([]models.Rank, error) {
	if !s.hubRepo.IsMember(ctx, hubID, userID) {
		return nil, apperror.Forbidden("not a member")
	}
	ranks, err := s.rankRepo.ListByHub(ctx, hubID)
	if err != nil {
		return nil, apperror.Internal("failed to list roles", err)
	}
	return ranks, nil
}

func (s *RankService) Create(ctx context.Context, hubID, userID string, name, color string, permissions int64) (*models.Rank, error) {
	if !s.hasManageRanks(ctx, hubID, userID) {
		return nil, apperror.Forbidden("you do not have permission to manage roles")
	}

	name = strings.TrimSpace(name)
	if name == "" || len(name) > 32 {
		return nil, apperror.BadRequest("name must be 1-32 characters")
	}

	color = strings.TrimSpace(color)
	if color == "" {
		color = "#99aab5"
	}

	count, _ := s.rankRepo.CountByHub(ctx, hubID)
	if count >= maxRanksPerHub {
		return nil, apperror.BadRequest("role limit reached (max 25)")
	}

	maxPos, _ := s.rankRepo.GetMaxPosition(ctx, hubID)

	rank := &models.Rank{
		HubID:       hubID,
		Name:        name,
		Color:       color,
		Permissions: permissions,
		Position:    maxPos + 1,
	}

	if err := s.rankRepo.Create(ctx, rank); err != nil {
		return nil, apperror.Internal("failed to create role", err)
	}
	return rank, nil
}

func (s *RankService) Update(ctx context.Context, hubID, userID, rankID string, name *string, color *string, permissions *int64, position *int) (*models.Rank, error) {
	if !s.hasManageRanks(ctx, hubID, userID) {
		return nil, apperror.Forbidden("you do not have permission to manage roles")
	}

	// Verify rank belongs to this hub
	existing, err := s.rankRepo.GetByID(ctx, rankID)
	if err != nil || existing.HubID != hubID {
		return nil, apperror.NotFound("role not found")
	}

	if name != nil {
		n := strings.TrimSpace(*name)
		if n == "" || len(n) > 32 {
			return nil, apperror.BadRequest("name must be 1-32 characters")
		}
		name = &n
	}

	if color != nil {
		c := strings.TrimSpace(*color)
		color = &c
	}

	rank, err := s.rankRepo.Update(ctx, rankID, name, color, permissions, position)
	if err != nil {
		return nil, apperror.Internal("failed to update role", err)
	}
	return rank, nil
}

func (s *RankService) Delete(ctx context.Context, hubID, userID, rankID string) error {
	if !s.hasManageRanks(ctx, hubID, userID) {
		return apperror.Forbidden("you do not have permission to manage roles")
	}

	existing, err := s.rankRepo.GetByID(ctx, rankID)
	if err != nil || existing.HubID != hubID {
		return apperror.NotFound("role not found")
	}

	if err := s.rankRepo.Delete(ctx, rankID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("role not found")
		}
		return apperror.Internal("failed to delete role", err)
	}
	return nil
}

func (s *RankService) AssignRank(ctx context.Context, hubID, userID, targetUserID, rankID string) error {
	if !s.hasManageRanks(ctx, hubID, userID) {
		return apperror.Forbidden("you do not have permission to manage roles")
	}

	// Verify rank belongs to this hub
	existing, err := s.rankRepo.GetByID(ctx, rankID)
	if err != nil || existing.HubID != hubID {
		return apperror.NotFound("role not found")
	}

	// Verify target is a member
	if !s.hubRepo.IsMember(ctx, hubID, targetUserID) {
		return apperror.NotFound("member not found")
	}

	if err := s.rankRepo.AssignRank(ctx, hubID, targetUserID, rankID); err != nil {
		return apperror.Internal("failed to assign role", err)
	}
	return nil
}

func (s *RankService) RemoveRank(ctx context.Context, hubID, userID, targetUserID string) error {
	if !s.hasManageRanks(ctx, hubID, userID) {
		return apperror.Forbidden("you do not have permission to manage roles")
	}

	if !s.hubRepo.IsMember(ctx, hubID, targetUserID) {
		return apperror.NotFound("member not found")
	}

	if err := s.rankRepo.RemoveRank(ctx, hubID, targetUserID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("member not found")
		}
		return apperror.Internal("failed to remove role", err)
	}
	return nil
}

func (s *RankService) hasManageRanks(ctx context.Context, hubID, userID string) bool {
	role := s.hubRepo.GetMemberRole(ctx, hubID, userID)
	if role == "" {
		return false
	}
	// Combine base role permissions with rank permissions
	perms := models.RolePermissions[role]
	rankPerms := s.rankRepo.GetMemberRankPermissions(ctx, hubID, userID)
	return models.HasPermission(perms|rankPerms, models.PermManageRanks)
}
