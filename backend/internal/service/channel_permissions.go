package service

import (
	"context"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

type memberPermissionState struct {
	BasePermissions int64
	RankID          *string
}

func (s *HubService) getMemberPermissionState(ctx context.Context, hubID, userID string) (*memberPermissionState, error) {
	memberCtx, err := s.hubRepo.GetMemberPermissionContext(ctx, hubID, userID)
	if err != nil {
		return nil, apperror.Forbidden("not a member")
	}

	perms := memberCtx.DefaultPermissions | models.RolePermissions[memberCtx.Role]
	if s.rankRepo != nil {
		perms |= s.rankRepo.GetMemberRankPermissions(ctx, hubID, userID)
	}
	return &memberPermissionState{BasePermissions: perms, RankID: memberCtx.RankID}, nil
}

func applyStreamPermissionNormalization(perms int64) int64 {
	if models.HasPermission(perms, models.PermAdministrator) {
		return perms
	}
	if !models.HasPermission(perms, models.PermViewStreams) {
		perms &^= models.PermManageStreams | models.PermSendMessages | models.PermManageMessages | models.PermConnectVoice | models.PermSpeakVoice | models.PermUseSoundboard
		return perms
	}
	if !models.HasPermission(perms, models.PermConnectVoice) {
		perms &^= models.PermSpeakVoice | models.PermUseSoundboard
	}
	return perms
}

func (s *HubService) applyStreamOverwrites(basePermissions int64, rankID *string, overwrites []models.StreamPermissionOverwrite) int64 {
	if models.HasPermission(basePermissions, models.PermAdministrator) {
		return basePermissions
	}

	perms := basePermissions
	var everyoneAllow int64
	var everyoneDeny int64
	var roleAllow int64
	var roleDeny int64

	for _, overwrite := range overwrites {
		switch overwrite.TargetType {
		case models.StreamPermissionTargetEveryone:
			everyoneAllow |= overwrite.Allow
			everyoneDeny |= overwrite.Deny
		case models.StreamPermissionTargetRole:
			if rankID != nil && overwrite.TargetID == *rankID {
				roleAllow |= overwrite.Allow
				roleDeny |= overwrite.Deny
			}
		}
	}

	perms &^= everyoneDeny
	perms |= everyoneAllow
	perms &^= roleDeny
	perms |= roleAllow
	return applyStreamPermissionNormalization(perms)
}

func (s *HubService) GetStreamEffectivePermissions(ctx context.Context, streamID, userID string) (int64, string, error) {
	stream, err := s.streamRepo.GetByID(ctx, streamID)
	if err != nil {
		return 0, "", apperror.NotFound("stream not found")
	}

	state, err := s.getMemberPermissionState(ctx, stream.HubID, userID)
	if err != nil {
		return 0, "", err
	}
	if models.HasPermission(state.BasePermissions, models.PermAdministrator) || s.streamPermRepo == nil {
		return state.BasePermissions, stream.HubID, nil
	}

	overwrites, err := s.streamPermRepo.ListByStream(ctx, streamID)
	if err != nil {
		return 0, "", apperror.Internal("failed to load stream permissions", err)
	}

	return s.applyStreamOverwrites(state.BasePermissions, state.RankID, overwrites), stream.HubID, nil
}

func (s *HubService) HasStreamPermission(ctx context.Context, streamID, userID string, perm int64) bool {
	perms, _, err := s.GetStreamEffectivePermissions(ctx, streamID, userID)
	if err != nil {
		return false
	}
	return models.HasPermission(perms, perm)
}

func (s *HubService) GetVisibleStreams(ctx context.Context, hubID, userID string) ([]models.Stream, error) {
	streams, err := s.streamRepo.ListByHub(ctx, hubID)
	if err != nil {
		return nil, apperror.Internal("internal error", err)
	}

	state, err := s.getMemberPermissionState(ctx, hubID, userID)
	if err != nil {
		return nil, err
	}
	if models.HasPermission(state.BasePermissions, models.PermAdministrator) || s.streamPermRepo == nil || len(streams) == 0 {
		return streams, nil
	}

	streamIDs := make([]string, 0, len(streams))
	for _, stream := range streams {
		streamIDs = append(streamIDs, stream.ID)
	}
	overwritesByStream, err := s.streamPermRepo.ListByStreams(ctx, streamIDs)
	if err != nil {
		return nil, apperror.Internal("failed to load stream permissions", err)
	}

	visible := make([]models.Stream, 0, len(streams))
	for _, stream := range streams {
		perms := s.applyStreamOverwrites(state.BasePermissions, state.RankID, overwritesByStream[stream.ID])
		if models.HasPermission(perms, models.PermViewStreams) {
			visible = append(visible, stream)
		}
	}
	return visible, nil
}

func (s *HubService) GetVisibleStreamIDSet(ctx context.Context, hubID, userID string) (map[string]struct{}, error) {
	streams, err := s.GetVisibleStreams(ctx, hubID, userID)
	if err != nil {
		return nil, err
	}
	result := make(map[string]struct{}, len(streams))
	for _, stream := range streams {
		result[stream.ID] = struct{}{}
	}
	return result, nil
}

func filterOverwritesForTemplateImport(overwrites []models.StreamPermissionOverwrite, targetIDByPlaceholder map[string]string) []models.StreamPermissionOverwrite {
	filtered := make([]models.StreamPermissionOverwrite, 0, len(overwrites))
	for _, overwrite := range overwrites {
		switch overwrite.TargetType {
		case models.StreamPermissionTargetEveryone:
			filtered = append(filtered, overwrite)
		case models.StreamPermissionTargetRole:
			mappedTargetID, ok := targetIDByPlaceholder[overwrite.TargetID]
			if !ok {
				continue
			}
			overwrite.TargetID = mappedTargetID
			filtered = append(filtered, overwrite)
		}
	}
	return filtered
}

func mergeStreamPermissionOverwrites(parent []models.StreamPermissionOverwrite, child []models.StreamPermissionOverwrite) []models.StreamPermissionOverwrite {
	merged := make(map[string]models.StreamPermissionOverwrite, len(parent)+len(child))
	for _, overwrite := range parent {
		merged[overwrite.TargetType+":"+overwrite.TargetID] = overwrite
	}
	for _, overwrite := range child {
		merged[overwrite.TargetType+":"+overwrite.TargetID] = overwrite
	}
	result := make([]models.StreamPermissionOverwrite, 0, len(merged))
	for _, overwrite := range merged {
		if overwrite.Allow == 0 && overwrite.Deny == 0 {
			continue
		}
		result = append(result, overwrite)
	}
	return result
}

func normalizeStreamPermissionOverwrites(overwrites []models.StreamPermissionOverwrite) []models.StreamPermissionOverwrite {
	merged := make(map[string]models.StreamPermissionOverwrite, len(overwrites))
	for _, overwrite := range overwrites {
		key := overwrite.TargetType + ":" + overwrite.TargetID
		existing := merged[key]
		existing.TargetType = overwrite.TargetType
		existing.TargetID = overwrite.TargetID
		existing.Allow |= overwrite.Allow
		existing.Deny |= overwrite.Deny
		existing.Allow &^= existing.Deny
		merged[key] = existing
	}
	result := make([]models.StreamPermissionOverwrite, 0, len(merged))
	for _, overwrite := range merged {
		if overwrite.Allow == 0 && overwrite.Deny == 0 {
			continue
		}
		result = append(result, overwrite)
	}
	return result
}

func streamIsPrivateFromOverwrites(overwrites []models.StreamPermissionOverwrite) bool {
	for _, overwrite := range overwrites {
		if overwrite.TargetType == models.StreamPermissionTargetEveryone && overwrite.TargetID == models.StreamPermissionTargetEveryone && overwrite.Deny&models.PermViewStreams != 0 {
			return true
		}
	}
	return false
}

func everyoneVisibilityOverwrite(isPrivate bool) []models.StreamPermissionOverwrite {
	if !isPrivate {
		return []models.StreamPermissionOverwrite{}
	}
	return []models.StreamPermissionOverwrite{{
		TargetType: models.StreamPermissionTargetEveryone,
		TargetID:   models.StreamPermissionTargetEveryone,
		Deny:       models.PermViewStreams,
	}}
}

func hasManageStreamsPermission(basePermissions int64) bool {
	return models.HasPermission(basePermissions, models.PermManageStreams)
}

func permissionStateFromContext(memberCtx *repository.MemberPermissionContext, rankPermissions int64) int64 {
	return memberCtx.DefaultPermissions | models.RolePermissions[memberCtx.Role] | rankPermissions
}
