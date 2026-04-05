package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// HubNotificationSettings is per-user, per-hub preferences (Discord-style).
type HubNotificationSettings struct {
	NotificationLevel     string `json:"notification_level"` // all | mentions_only | nothing
	SuppressEveryone      bool   `json:"suppress_everyone"`
	SuppressRoleMentions  bool   `json:"suppress_role_mentions"`
	SuppressHighlights    bool   `json:"suppress_highlights"`
	MuteEvents            bool   `json:"mute_events"`
	MobilePush            bool   `json:"mobile_push"`
	HideMutedChannels     bool   `json:"hide_muted_channels"`
	ServerMuted           bool   `json:"server_muted"`
}

func DefaultHubNotificationSettings() HubNotificationSettings {
	return HubNotificationSettings{
		NotificationLevel:    "mentions_only",
		SuppressEveryone:     false,
		SuppressRoleMentions: false,
		SuppressHighlights:   false,
		MuteEvents:           false,
		MobilePush:           true,
		HideMutedChannels:    false,
		ServerMuted:          false,
	}
}

type HubNotificationSettingsRepo struct {
	db *pgxpool.Pool
}

func NewHubNotificationSettingsRepo(db *pgxpool.Pool) *HubNotificationSettingsRepo {
	return &HubNotificationSettingsRepo{db: db}
}

func (r *HubNotificationSettingsRepo) Get(ctx context.Context, userID, hubID string) (HubNotificationSettings, error) {
	def := DefaultHubNotificationSettings()
	var s HubNotificationSettings
	err := r.db.QueryRow(ctx,
		`SELECT notification_level, suppress_everyone, suppress_role_mentions, suppress_highlights,
		        mute_events, mobile_push, hide_muted_channels, server_muted
		 FROM hub_notification_settings WHERE user_id = $1 AND hub_id = $2`,
		userID, hubID,
	).Scan(
		&s.NotificationLevel, &s.SuppressEveryone, &s.SuppressRoleMentions, &s.SuppressHighlights,
		&s.MuteEvents, &s.MobilePush, &s.HideMutedChannels, &s.ServerMuted,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return def, nil
		}
		return def, err
	}
	return s, nil
}

func (r *HubNotificationSettingsRepo) Upsert(ctx context.Context, userID, hubID string, in HubNotificationSettings) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO hub_notification_settings (
			user_id, hub_id, notification_level, suppress_everyone, suppress_role_mentions,
			suppress_highlights, mute_events, mobile_push, hide_muted_channels, server_muted, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
		ON CONFLICT (user_id, hub_id) DO UPDATE SET
			notification_level = EXCLUDED.notification_level,
			suppress_everyone = EXCLUDED.suppress_everyone,
			suppress_role_mentions = EXCLUDED.suppress_role_mentions,
			suppress_highlights = EXCLUDED.suppress_highlights,
			mute_events = EXCLUDED.mute_events,
			mobile_push = EXCLUDED.mobile_push,
			hide_muted_channels = EXCLUDED.hide_muted_channels,
			server_muted = EXCLUDED.server_muted,
			updated_at = now()`,
		userID, hubID, in.NotificationLevel, in.SuppressEveryone, in.SuppressRoleMentions,
		in.SuppressHighlights, in.MuteEvents, in.MobilePush, in.HideMutedChannels, in.ServerMuted,
	)
	return err
}
