package service

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/riftapp-cloud/riftapp/internal/models"
)

func TestExtractDiscordTemplateCode(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "raw code", input: "hgM48av5Q69A", want: "hgM48av5Q69A"},
		{name: "discord new", input: "https://discord.new/hgM48av5Q69A", want: "hgM48av5Q69A"},
		{name: "discord template path", input: "discord.com/template/hgM48av5Q69A", want: "hgM48av5Q69A"},
		{name: "invalid", input: "https://example.com/foo", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := extractDiscordTemplateCode(tt.input); got != tt.want {
				t.Fatalf("extractDiscordTemplateCode(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestMapDiscordPermissions(t *testing.T) {
	bits := discordPermissionBits(discordPermViewChannel | discordPermSendMessages | discordPermManageChannels | discordPermConnect | discordPermSpeak | discordPermUseSoundboard)
	want := models.PermViewStreams | models.PermSendMessages | models.PermManageStreams | models.PermConnectVoice | models.PermSpeakVoice | models.PermUseSoundboard
	if got := mapDiscordPermissions(bits); got != want {
		t.Fatalf("mapDiscordPermissions() = %d, want %d", got, want)
	}
}

func TestBuildDiscordTemplatePreview(t *testing.T) {
	template := &discordTemplateResponse{
		Code:        "hgM48av5Q69A",
		Name:        "Friends & Family",
		Description: stringPointer("Imported from Discord"),
		SerializedSourceGuild: discordSerializedTemplate{
			Name: "Friends & Family",
			Roles: []discordTemplateRole{
				{Name: "@everyone", Permissions: discordPermissionBits(discordPermViewChannel)},
				{Name: "Moderators", Color: 3447003, Position: 2},
			},
			Channels: []discordTemplateChannel{
				{ID: "1", Name: "Text Channels", Type: discordChannelTypeCategory, Position: 0},
				{ID: "2", Name: "general", Type: discordChannelTypeText, Position: 0, ParentID: pointerDiscordTemplateID("1")},
				{ID: "3", Name: "voice", Type: discordChannelTypeVoice, Position: 1, ParentID: pointerDiscordTemplateID("1"), PermissionOverwrites: []json.RawMessage{json.RawMessage(`{}`)}},
				{ID: "4", Name: "thread", Type: 11, Position: 2},
			},
		},
	}

	preview := buildDiscordTemplatePreview(template)
	if preview.RoleCount != 1 {
		t.Fatalf("RoleCount = %d, want 1", preview.RoleCount)
	}
	if preview.CategoryCount != 1 || preview.TextChannelCount != 1 || preview.VoiceChannelCount != 1 {
		t.Fatalf("unexpected counts: %+v", preview)
	}
	if len(preview.UnsupportedFeatures) == 0 {
		t.Fatal("expected unsupported feature notes")
	}
	for _, message := range preview.UnsupportedFeatures {
		if strings.Contains(message, "Channel-specific permission overwrites are skipped") || strings.Contains(message, "@everyone permissions do not map") {
			t.Fatalf("unexpected outdated warning: %q", message)
		}
	}
	if len(preview.Categories) != 1 {
		t.Fatalf("len(Categories) = %d, want 1", len(preview.Categories))
	}
	wantChannels := []DiscordTemplatePreviewChannel{{Name: "general", Type: "text"}, {Name: "voice", Type: "voice"}}
	if !reflect.DeepEqual(preview.Categories[0].Channels, wantChannels) {
		t.Fatalf("preview channels = %+v, want %+v", preview.Categories[0].Channels, wantChannels)
	}
}

func TestParseDiscordPermissionOverwrites(t *testing.T) {
	channel := discordTemplateChannel{
		PermissionOverwrites: []json.RawMessage{
			json.RawMessage(`{"id":"everyone","type":0,"allow":"0","deny":"1024"}`),
			json.RawMessage(`{"id":"role-1","type":0,"allow":"10240","deny":"0"}`),
			json.RawMessage(`{"id":"member-1","type":1,"allow":"1024","deny":"0"}`),
		},
	}
	overwrites, hasMemberSpecific, hasUnmappedRoles := parseDiscordPermissionOverwrites(channel, discordTemplateID("everyone"), map[discordTemplateID]string{discordTemplateID("role-1"): "rank-1"})
	if !hasMemberSpecific {
		t.Fatal("expected member-specific overwrite warning")
	}
	if hasUnmappedRoles {
		t.Fatal("expected role overwrite to map cleanly")
	}
	want := []models.StreamPermissionOverwrite{
		{TargetType: models.StreamPermissionTargetEveryone, TargetID: models.StreamPermissionTargetEveryone, Deny: models.PermViewStreams},
		{TargetType: models.StreamPermissionTargetRole, TargetID: "rank-1", Allow: models.PermSendMessages | models.PermManageMessages},
	}
	if !reflect.DeepEqual(overwrites, want) {
		t.Fatalf("parseDiscordPermissionOverwrites() = %+v, want %+v", overwrites, want)
	}
}

func pointerDiscordTemplateID(value string) *discordTemplateID {
	id := discordTemplateID(value)
	return &id
}

func stringPointer(value string) *string {
	return &value
}
