package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
	"github.com/riftapp-cloud/riftapp/internal/models"
)

const discordTemplateAPIBase = "https://discord.com/api/v10/guilds/templates/"

const (
	discordChannelTypeText         = 0
	discordChannelTypeVoice        = 2
	discordChannelTypeCategory     = 4
	discordChannelTypeAnnouncement = 5
	discordChannelTypeStageVoice   = 13
	discordChannelTypeForum        = 15
	discordChannelTypeMedia        = 16
)

const (
	discordPermKickMembers    uint64 = 1 << 1
	discordPermBanMembers     uint64 = 1 << 2
	discordPermAdministrator  uint64 = 1 << 3
	discordPermManageChannels uint64 = 1 << 4
	discordPermManageGuild    uint64 = 1 << 5
	discordPermViewChannel    uint64 = 1 << 10
	discordPermSendMessages   uint64 = 1 << 11
	discordPermManageMessages uint64 = 1 << 13
	discordPermConnect        uint64 = 1 << 20
	discordPermSpeak          uint64 = 1 << 21
	discordPermManageRoles    uint64 = 1 << 28
	discordPermUseSoundboard  uint64 = 1 << 42
	discordPermPinMessages    uint64 = 1 << 51
)

const (
	discordOverwriteTypeRole   = 0
	discordOverwriteTypeMember = 1
)

type DiscordTemplatePreview struct {
	Code                string                           `json:"code"`
	Name                string                           `json:"name"`
	Description         string                           `json:"description,omitempty"`
	SourceGuildName     string                           `json:"source_guild_name"`
	SuggestedHubName    string                           `json:"suggested_hub_name"`
	CategoryCount       int                              `json:"category_count"`
	TextChannelCount    int                              `json:"text_channel_count"`
	VoiceChannelCount   int                              `json:"voice_channel_count"`
	RoleCount           int                              `json:"role_count"`
	Categories          []DiscordTemplatePreviewCategory `json:"categories"`
	Uncategorized       []DiscordTemplatePreviewChannel  `json:"uncategorized_channels"`
	Roles               []DiscordTemplatePreviewRole     `json:"roles"`
	UnsupportedFeatures []string                         `json:"unsupported_features,omitempty"`
}

type DiscordTemplatePreviewCategory struct {
	Name     string                          `json:"name"`
	Channels []DiscordTemplatePreviewChannel `json:"channels"`
}

type DiscordTemplatePreviewChannel struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type DiscordTemplatePreviewRole struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type discordTemplateID string

func (id *discordTemplateID) UnmarshalJSON(data []byte) error {
	raw := strings.TrimSpace(string(data))
	if raw == "null" {
		return nil
	}
	raw = strings.Trim(raw, `"`)
	if raw == "" {
		return fmt.Errorf("empty template identifier")
	}
	*id = discordTemplateID(raw)
	return nil
}

type discordPermissionBits uint64

func (bits *discordPermissionBits) UnmarshalJSON(data []byte) error {
	raw := strings.TrimSpace(string(data))
	if raw == "null" || raw == "" {
		*bits = 0
		return nil
	}
	raw = strings.Trim(raw, `"`)
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return err
	}
	*bits = discordPermissionBits(value)
	return nil
}

type discordTemplateResponse struct {
	Code                  string                    `json:"code"`
	Name                  string                    `json:"name"`
	Description           *string                   `json:"description"`
	SerializedSourceGuild discordSerializedTemplate `json:"serialized_source_guild"`
}

type discordSerializedTemplate struct {
	Name        string                   `json:"name"`
	Description *string                  `json:"description"`
	Roles       []discordTemplateRole    `json:"roles"`
	Channels    []discordTemplateChannel `json:"channels"`
	IconHash    *string                  `json:"icon_hash"`
}

type discordTemplateRole struct {
	ID          discordTemplateID     `json:"id"`
	Name        string                `json:"name"`
	Permissions discordPermissionBits `json:"permissions"`
	Color       int                   `json:"color"`
	Position    int                   `json:"position"`
	Managed     bool                  `json:"managed"`
}

type discordTemplateChannel struct {
	ID                   discordTemplateID  `json:"id"`
	Name                 string             `json:"name"`
	Position             int                `json:"position"`
	Type                 int                `json:"type"`
	ParentID             *discordTemplateID `json:"parent_id"`
	Bitrate              int                `json:"bitrate"`
	UserLimit            int                `json:"user_limit"`
	PermissionOverwrites []json.RawMessage  `json:"permission_overwrites"`
}

type discordPermissionOverwrite struct {
	ID    discordTemplateID     `json:"id"`
	Type  int                   `json:"type"`
	Allow discordPermissionBits `json:"allow"`
	Deny  discordPermissionBits `json:"deny"`
}

var discordTemplateCodePattern = regexp.MustCompile(`(?:discord\.new|discord(?:app)?\.com/template|discord\.com/template|/template/)([A-Za-z0-9-]+)`)

type indexedDiscordRole struct {
	index int
	role  discordTemplateRole
}

type indexedDiscordChannel struct {
	index   int
	channel discordTemplateChannel
}

func (s *HubService) PreviewDiscordTemplate(ctx context.Context, input string) (*DiscordTemplatePreview, error) {
	template, err := s.fetchDiscordTemplate(ctx, input)
	if err != nil {
		return nil, err
	}
	preview := buildDiscordTemplatePreview(template)
	return &preview, nil
}

func (s *HubService) ImportDiscordTemplate(ctx context.Context, userID, input string) (*models.Hub, error) {
	template, err := s.fetchDiscordTemplate(ctx, input)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	everyonePerms := models.PermDefault
	everyoneRoleID, hasEveryoneRole := discordEveryoneRoleID(template.SerializedSourceGuild.Roles)
	if hasEveryoneRole {
		everyonePerms = mapDiscordPermissions(discordEveryonePermissions(template.SerializedSourceGuild.Roles))
	}
	hub := &models.Hub{
		ID:                 uuid.New().String(),
		Name:               suggestedHubName(template),
		OwnerID:            userID,
		DefaultPermissions: everyonePerms,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	tx, err := s.hubRepo.GetDB().Begin(ctx)
	if err != nil {
		return nil, apperror.Internal("failed to start template import", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`INSERT INTO hubs (id, name, owner_id, default_permissions, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		hub.ID, hub.Name, hub.OwnerID, hub.DefaultPermissions, hub.CreatedAt, hub.UpdatedAt,
	); err != nil {
		return nil, apperror.Internal("failed to create imported hub", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO hub_members (hub_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)`,
		hub.ID, userID, models.RoleOwner, now,
	); err != nil {
		return nil, apperror.Internal("failed to create imported hub membership", err)
	}

	roles := orderedImportableDiscordRoles(template.SerializedSourceGuild.Roles)
	roleIDByTemplate := make(map[discordTemplateID]string, len(roles))
	for idx, role := range roles {
		rankID := uuid.New().String()
		roleIDByTemplate[role.ID] = rankID
		if _, err := tx.Exec(ctx,
			`INSERT INTO ranks (id, hub_id, name, color, permissions, position, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			rankID,
			hub.ID,
			sanitizeImportedRoleName(role.Name, idx+1),
			discordColorToHex(role.Color),
			mapDiscordPermissions(role.Permissions),
			role.Position,
			now,
		); err != nil {
			return nil, apperror.Internal("failed to import template roles", err)
		}
	}

	categoryRows := orderedDiscordTemplateCategories(template.SerializedSourceGuild.Channels)
	categoryIDs := make(map[discordTemplateID]string, len(categoryRows))
	categoryOverwrites := make(map[discordTemplateID][]models.StreamPermissionOverwrite, len(categoryRows))
	for idx, entry := range categoryRows {
		categoryID := uuid.New().String()
		if _, err := tx.Exec(ctx,
			`INSERT INTO categories (id, hub_id, name, position, created_at) VALUES ($1, $2, $3, $4, $5)`,
			categoryID,
			hub.ID,
			sanitizeImportedCategoryName(entry.channel.Name, idx+1),
			idx,
			now,
		); err != nil {
			return nil, apperror.Internal("failed to import template categories", err)
		}
		categoryIDs[entry.channel.ID] = categoryID
		if hasEveryoneRole {
			overwrites, _, _ := parseDiscordPermissionOverwrites(entry.channel, everyoneRoleID, roleIDByTemplate)
			categoryOverwrites[entry.channel.ID] = overwrites
		}
	}

	streamPosition := 0
	for _, entry := range orderedUncategorizedDiscordChannels(template.SerializedSourceGuild.Channels) {
		overwrites := []models.StreamPermissionOverwrite{}
		if hasEveryoneRole {
			overwrites, _, _ = parseDiscordPermissionOverwrites(entry.channel, everyoneRoleID, roleIDByTemplate)
		}
		inserted, err := s.insertImportedTemplateStream(ctx, tx, hub.ID, entry.channel, nil, streamPosition, now, overwrites)
		if err != nil {
			return nil, err
		}
		if inserted {
			streamPosition++
		}
	}

	for _, category := range categoryRows {
		categoryID := categoryIDs[category.channel.ID]
		children := orderedDiscordTemplateChildChannels(template.SerializedSourceGuild.Channels, category.channel.ID)
		for _, child := range children {
			overwrites := []models.StreamPermissionOverwrite{}
			if hasEveryoneRole {
				channelOverwrites, _, _ := parseDiscordPermissionOverwrites(child.channel, everyoneRoleID, roleIDByTemplate)
				overwrites = mergeStreamPermissionOverwrites(categoryOverwrites[category.channel.ID], channelOverwrites)
			}
			inserted, err := s.insertImportedTemplateStream(ctx, tx, hub.ID, child.channel, &categoryID, streamPosition, now, overwrites)
			if err != nil {
				return nil, err
			}
			if inserted {
				streamPosition++
			}
		}
	}

	if streamPosition == 0 {
		if _, err := tx.Exec(ctx,
			`INSERT INTO streams (id, hub_id, name, type, position, is_private, category_id, bitrate, user_limit, region, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
			uuid.New().String(), hub.ID, "general", 0, 0, false, nil, 64000, 0, "", now,
		); err != nil {
			return nil, apperror.Internal("failed to create fallback general channel", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, apperror.Internal("failed to finalize template import", err)
	}

	return hub, nil
}

func (s *HubService) insertImportedTemplateStream(ctx context.Context, tx pgx.Tx, hubID string, channel discordTemplateChannel, categoryID *string, position int, createdAt time.Time, overwrites []models.StreamPermissionOverwrite) (bool, error) {
	streamType, ok := importedStreamType(channel.Type)
	if !ok {
		return false, nil
	}

	name := sanitizeImportedStreamName(channel.Name, streamType, position+1)
	bitrate := 64000
	if channel.Bitrate > 0 {
		bitrate = channel.Bitrate
	}
	userLimit := channel.UserLimit
	if userLimit < 0 {
		userLimit = 0
	}
	streamID := uuid.New().String()
	overwrites = normalizeStreamPermissionOverwrites(overwrites)
	isPrivate := streamIsPrivateFromOverwrites(overwrites)

	if _, err := tx.Exec(ctx,
		`INSERT INTO streams (id, hub_id, name, type, position, is_private, category_id, bitrate, user_limit, region, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		streamID, hubID, name, streamType, position, isPrivate, categoryID, bitrate, userLimit, "", createdAt,
	); err != nil {
		return false, apperror.Internal("failed to import template channels", err)
	}
	if s.streamPermRepo != nil && len(overwrites) > 0 {
		for idx := range overwrites {
			overwrites[idx].StreamID = streamID
		}
		if err := s.streamPermRepo.CreateManyInTx(ctx, tx, overwrites); err != nil {
			return false, apperror.Internal("failed to import template channel permissions", err)
		}
	}
	return true, nil
}

func (s *HubService) fetchDiscordTemplate(ctx context.Context, input string) (*discordTemplateResponse, error) {
	code := extractDiscordTemplateCode(input)
	if code == "" {
		return nil, apperror.BadRequest("enter a valid Discord template code or link")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discordTemplateAPIBase+url.PathEscape(code), nil)
	if err != nil {
		return nil, apperror.Internal("failed to prepare Discord template request", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "RiftApp/1.0")

	resp, err := s.discordHTTP.Do(req)
	if err != nil {
		return nil, apperror.New(http.StatusBadGateway, "failed to reach Discord template API")
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, apperror.NotFound("Discord template not found")
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, apperror.New(http.StatusBadGateway, "Discord template could not be loaded")
	}

	decoder := json.NewDecoder(io.LimitReader(resp.Body, 2<<20))
	var template discordTemplateResponse
	if err := decoder.Decode(&template); err != nil {
		return nil, apperror.Internal("failed to decode Discord template", err)
	}

	if suggestedHubName(&template) == "Imported Server" && len(template.SerializedSourceGuild.Channels) == 0 && len(template.SerializedSourceGuild.Roles) == 0 {
		return nil, apperror.BadRequest("Discord template is empty")
	}

	return &template, nil
}

func buildDiscordTemplatePreview(template *discordTemplateResponse) DiscordTemplatePreview {
	preview := DiscordTemplatePreview{
		Code:             template.Code,
		Name:             strings.TrimSpace(template.Name),
		SourceGuildName:  strings.TrimSpace(template.SerializedSourceGuild.Name),
		SuggestedHubName: suggestedHubName(template),
		Categories:       []DiscordTemplatePreviewCategory{},
		Uncategorized:    []DiscordTemplatePreviewChannel{},
		Roles:            []DiscordTemplatePreviewRole{},
	}
	if template.Description != nil {
		preview.Description = strings.TrimSpace(*template.Description)
	}

	if preview.SourceGuildName == "" {
		preview.SourceGuildName = preview.SuggestedHubName
	}

	unsupported := make(map[string]struct{})
	categoryPreviewByID := map[discordTemplateID]*DiscordTemplatePreviewCategory{}
	everyoneRoleID, _ := discordEveryoneRoleID(template.SerializedSourceGuild.Roles)
	previewRoleMap := make(map[discordTemplateID]string)
	for _, role := range orderedImportableDiscordRoles(template.SerializedSourceGuild.Roles) {
		previewRoleMap[role.ID] = string(role.ID)
	}

	for _, entry := range orderedDiscordTemplateCategories(template.SerializedSourceGuild.Channels) {
		category := DiscordTemplatePreviewCategory{
			Name:     sanitizeImportedCategoryName(entry.channel.Name, len(preview.Categories)+1),
			Channels: []DiscordTemplatePreviewChannel{},
		}
		preview.Categories = append(preview.Categories, category)
		categoryPreviewByID[entry.channel.ID] = &preview.Categories[len(preview.Categories)-1]
		if _, hasMemberSpecific, hasUnmappedRoles := parseDiscordPermissionOverwrites(entry.channel, everyoneRoleID, previewRoleMap); hasMemberSpecific {
			unsupported["Member-specific channel overwrites are ignored because Discord templates do not include hub members."] = struct{}{}
		} else if hasUnmappedRoles {
			unsupported["Some channel overwrites target unsupported or Discord-managed roles and will be ignored."] = struct{}{}
		}
	}

	for _, entry := range orderedUncategorizedDiscordChannels(template.SerializedSourceGuild.Channels) {
		channelPreview, ok := buildDiscordChannelPreview(entry.channel)
		if !ok {
			unsupported["Some Discord-specific channel types cannot be imported into Rift yet."] = struct{}{}
			continue
		}
		preview.Uncategorized = append(preview.Uncategorized, channelPreview)
		if channelPreview.Type == "text" {
			preview.TextChannelCount++
		} else {
			preview.VoiceChannelCount++
		}
		if _, hasMemberSpecific, hasUnmappedRoles := parseDiscordPermissionOverwrites(entry.channel, everyoneRoleID, previewRoleMap); hasMemberSpecific {
			unsupported["Member-specific channel overwrites are ignored because Discord templates do not include hub members."] = struct{}{}
		} else if hasUnmappedRoles {
			unsupported["Some channel overwrites target unsupported or Discord-managed roles and will be ignored."] = struct{}{}
		}
	}

	for _, category := range orderedDiscordTemplateCategories(template.SerializedSourceGuild.Channels) {
		container := categoryPreviewByID[category.channel.ID]
		children := orderedDiscordTemplateChildChannels(template.SerializedSourceGuild.Channels, category.channel.ID)
		for _, child := range children {
			channelPreview, ok := buildDiscordChannelPreview(child.channel)
			if !ok {
				unsupported["Some Discord-specific channel types cannot be imported into Rift yet."] = struct{}{}
				continue
			}
			container.Channels = append(container.Channels, channelPreview)
			if channelPreview.Type == "text" {
				preview.TextChannelCount++
			} else {
				preview.VoiceChannelCount++
			}
			if _, hasMemberSpecific, hasUnmappedRoles := parseDiscordPermissionOverwrites(child.channel, everyoneRoleID, previewRoleMap); hasMemberSpecific {
				unsupported["Member-specific channel overwrites are ignored because Discord templates do not include hub members."] = struct{}{}
			} else if hasUnmappedRoles {
				unsupported["Some channel overwrites target unsupported or Discord-managed roles and will be ignored."] = struct{}{}
			}
		}
	}

	roles := orderedImportableDiscordRoles(template.SerializedSourceGuild.Roles)
	for _, role := range roles {
		preview.Roles = append(preview.Roles, DiscordTemplatePreviewRole{
			Name:  sanitizeImportedRoleName(role.Name, len(preview.Roles)+1),
			Color: discordColorToHex(role.Color),
		})
	}
	preview.RoleCount = len(preview.Roles)
	preview.CategoryCount = len(preview.Categories)

	if desc := template.SerializedSourceGuild.Description; preview.Description == "" && desc != nil {
		preview.Description = strings.TrimSpace(*desc)
	}

	for message := range unsupported {
		preview.UnsupportedFeatures = append(preview.UnsupportedFeatures, message)
	}
	sort.Strings(preview.UnsupportedFeatures)
	return preview
}

func buildDiscordChannelPreview(channel discordTemplateChannel) (DiscordTemplatePreviewChannel, bool) {
	streamType, ok := importedStreamType(channel.Type)
	if !ok {
		return DiscordTemplatePreviewChannel{}, false
	}
	typeLabel := "text"
	if streamType == 1 {
		typeLabel = "voice"
	}
	return DiscordTemplatePreviewChannel{
		Name: sanitizeImportedStreamName(channel.Name, streamType, 1),
		Type: typeLabel,
	}, true
}

func orderedImportableDiscordRoles(roles []discordTemplateRole) []discordTemplateRole {
	indexed := make([]indexedDiscordRole, 0, len(roles))
	for idx, role := range roles {
		if shouldImportDiscordRole(role) {
			indexed = append(indexed, indexedDiscordRole{index: idx, role: role})
		}
	}
	sort.SliceStable(indexed, func(i, j int) bool {
		if indexed[i].role.Position != indexed[j].role.Position {
			return indexed[i].role.Position < indexed[j].role.Position
		}
		return indexed[i].index < indexed[j].index
	})
	out := make([]discordTemplateRole, 0, len(indexed))
	for _, item := range indexed {
		out = append(out, item.role)
	}
	return out
}

func orderedDiscordTemplateCategories(channels []discordTemplateChannel) []indexedDiscordChannel {
	indexed := make([]indexedDiscordChannel, 0)
	for idx, channel := range channels {
		if channel.Type == discordChannelTypeCategory {
			indexed = append(indexed, indexedDiscordChannel{index: idx, channel: channel})
		}
	}
	sort.SliceStable(indexed, func(i, j int) bool {
		if indexed[i].channel.Position != indexed[j].channel.Position {
			return indexed[i].channel.Position < indexed[j].channel.Position
		}
		return indexed[i].index < indexed[j].index
	})
	return indexed
}

func orderedUncategorizedDiscordChannels(channels []discordTemplateChannel) []indexedDiscordChannel {
	indexed := make([]indexedDiscordChannel, 0)
	for idx, channel := range channels {
		if channel.Type == discordChannelTypeCategory {
			continue
		}
		if channel.ParentID != nil && *channel.ParentID != "" {
			continue
		}
		indexed = append(indexed, indexedDiscordChannel{index: idx, channel: channel})
	}
	sort.SliceStable(indexed, func(i, j int) bool {
		if indexed[i].channel.Position != indexed[j].channel.Position {
			return indexed[i].channel.Position < indexed[j].channel.Position
		}
		return indexed[i].index < indexed[j].index
	})
	return indexed
}

func orderedDiscordTemplateChildChannels(channels []discordTemplateChannel, parentID discordTemplateID) []indexedDiscordChannel {
	indexed := make([]indexedDiscordChannel, 0)
	for idx, channel := range channels {
		if channel.Type == discordChannelTypeCategory || channel.ParentID == nil || *channel.ParentID != parentID {
			continue
		}
		indexed = append(indexed, indexedDiscordChannel{index: idx, channel: channel})
	}
	sort.SliceStable(indexed, func(i, j int) bool {
		if indexed[i].channel.Position != indexed[j].channel.Position {
			return indexed[i].channel.Position < indexed[j].channel.Position
		}
		return indexed[i].index < indexed[j].index
	})
	return indexed
}

func shouldImportDiscordRole(role discordTemplateRole) bool {
	name := strings.TrimSpace(role.Name)
	if name == "" || name == "@everyone" || role.Managed {
		return false
	}
	return true
}

func discordEveryoneRoleID(roles []discordTemplateRole) (discordTemplateID, bool) {
	for _, role := range roles {
		if strings.TrimSpace(role.Name) == "@everyone" {
			return role.ID, true
		}
	}
	return "", false
}

func discordEveryonePermissions(roles []discordTemplateRole) discordPermissionBits {
	for _, role := range roles {
		if strings.TrimSpace(role.Name) == "@everyone" {
			return role.Permissions
		}
	}
	return 0
}

func parseDiscordPermissionOverwrites(channel discordTemplateChannel, everyoneRoleID discordTemplateID, roleIDByTemplate map[discordTemplateID]string) ([]models.StreamPermissionOverwrite, bool, bool) {
	overwrites := make([]models.StreamPermissionOverwrite, 0, len(channel.PermissionOverwrites))
	hasMemberSpecific := false
	hasUnmappedRoles := false
	for _, raw := range channel.PermissionOverwrites {
		var overwrite discordPermissionOverwrite
		if err := json.Unmarshal(raw, &overwrite); err != nil {
			continue
		}
		allow := mapDiscordPermissions(overwrite.Allow) & streamOverwriteAllowedMask
		deny := mapDiscordPermissions(overwrite.Deny) & streamOverwriteAllowedMask
		allow &^= deny
		if allow == 0 && deny == 0 {
			continue
		}
		switch overwrite.Type {
		case discordOverwriteTypeRole:
			if overwrite.ID == everyoneRoleID {
				overwrites = append(overwrites, models.StreamPermissionOverwrite{
					TargetType: models.StreamPermissionTargetEveryone,
					TargetID:   models.StreamPermissionTargetEveryone,
					Allow:      allow,
					Deny:       deny,
				})
				continue
			}
			mappedRoleID, ok := roleIDByTemplate[overwrite.ID]
			if !ok {
				hasUnmappedRoles = true
				continue
			}
			overwrites = append(overwrites, models.StreamPermissionOverwrite{
				TargetType: models.StreamPermissionTargetRole,
				TargetID:   mappedRoleID,
				Allow:      allow,
				Deny:       deny,
			})
		case discordOverwriteTypeMember:
			hasMemberSpecific = true
		}
	}
	return normalizeStreamPermissionOverwrites(overwrites), hasMemberSpecific, hasUnmappedRoles
}

func importedStreamType(discordType int) (int, bool) {
	switch discordType {
	case discordChannelTypeText, discordChannelTypeAnnouncement, discordChannelTypeForum, discordChannelTypeMedia:
		return 0, true
	case discordChannelTypeVoice, discordChannelTypeStageVoice:
		return 1, true
	default:
		return 0, false
	}
}

func mapDiscordPermissions(bits discordPermissionBits) int64 {
	value := uint64(bits)
	if value&discordPermAdministrator != 0 {
		return models.PermAdministrator
	}

	var perms int64
	if value&discordPermViewChannel != 0 {
		perms |= models.PermViewStreams
	}
	if value&discordPermSendMessages != 0 {
		perms |= models.PermSendMessages
	}
	if value&(discordPermManageMessages|discordPermPinMessages) != 0 {
		perms |= models.PermManageMessages
	}
	if value&discordPermManageChannels != 0 {
		perms |= models.PermManageStreams
	}
	if value&discordPermManageGuild != 0 {
		perms |= models.PermManageHub
	}
	if value&discordPermManageRoles != 0 {
		perms |= models.PermManageRanks
	}
	if value&discordPermKickMembers != 0 {
		perms |= models.PermKickMembers
	}
	if value&discordPermBanMembers != 0 {
		perms |= models.PermBanMembers
	}
	if value&discordPermConnect != 0 {
		perms |= models.PermConnectVoice
	}
	if value&discordPermSpeak != 0 {
		perms |= models.PermSpeakVoice
	}
	if value&discordPermUseSoundboard != 0 {
		perms |= models.PermUseSoundboard
	}
	return perms
}

func extractDiscordTemplateCode(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}

	directMatch := discordTemplateCodePattern.FindStringSubmatch(trimmed)
	if len(directMatch) > 1 {
		return directMatch[1]
	}

	if simpleTemplateCode(trimmed) {
		return trimmed
	}

	normalized := trimmed
	if !strings.Contains(normalized, "://") {
		normalized = "https://" + normalized
	}
	parsed, err := url.Parse(normalized)
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	host := strings.ToLower(parsed.Hostname())
	if host == "discord.new" && len(parts) > 0 && simpleTemplateCode(parts[0]) {
		return parts[0]
	}
	for idx, part := range parts {
		if strings.EqualFold(part, "template") && idx+1 < len(parts) && simpleTemplateCode(parts[idx+1]) {
			return parts[idx+1]
		}
	}
	return ""
}

func simpleTemplateCode(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '-' {
			return false
		}
	}
	return true
}

func suggestedHubName(template *discordTemplateResponse) string {
	for _, candidate := range []string{template.SerializedSourceGuild.Name, template.Name} {
		if name := trimAndTruncate(candidate, 100); name != "" {
			return name
		}
	}
	return "Imported Server"
}

func sanitizeImportedRoleName(name string, index int) string {
	if trimmed := trimAndTruncate(name, 64); trimmed != "" {
		return trimmed
	}
	return fmt.Sprintf("Imported Role %d", index)
}

func sanitizeImportedCategoryName(name string, index int) string {
	if trimmed := trimAndTruncate(name, 100); trimmed != "" {
		return trimmed
	}
	return fmt.Sprintf("Category %d", index)
}

func sanitizeImportedStreamName(name string, streamType int, index int) string {
	normalized := normalizeStreamName(name)
	if normalized != "" {
		return normalized
	}
	if streamType == 1 {
		return fmt.Sprintf("voice-%d", index)
	}
	return fmt.Sprintf("channel-%d", index)
}

func discordColorToHex(color int) string {
	if color <= 0 {
		return "#99AAB5"
	}
	return fmt.Sprintf("#%06X", color&0xFFFFFF)
}

func trimAndTruncate(value string, max int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	runes := []rune(trimmed)
	if len(runes) <= max {
		return trimmed
	}
	return string(runes[:max])
}
