package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type StreamNotificationSettings struct {
	NotificationLevel    string `json:"notification_level"`
	SuppressEveryone     bool   `json:"suppress_everyone"`
	SuppressRoleMentions bool   `json:"suppress_role_mentions"`
	SuppressHighlights   bool   `json:"suppress_highlights"`
	MuteEvents           bool   `json:"mute_events"`
	MobilePush           bool   `json:"mobile_push"`
	HideMutedChannels    bool   `json:"hide_muted_channels"`
	ChannelMuted         bool   `json:"channel_muted"`
}

func DefaultStreamNotificationSettings() StreamNotificationSettings {
	return StreamNotificationSettings{
		NotificationLevel:    "mentions_only",
		SuppressEveryone:     false,
		SuppressRoleMentions: false,
		SuppressHighlights:   false,
		MuteEvents:           false,
		MobilePush:           true,
		HideMutedChannels:    false,
		ChannelMuted:         false,
	}
}

type StreamNotificationSettingsRepo struct {
	db *pgxpool.Pool
}

func NewStreamNotificationSettingsRepo(db *pgxpool.Pool) *StreamNotificationSettingsRepo {
	return &StreamNotificationSettingsRepo{db: db}
}

func (r *StreamNotificationSettingsRepo) Get(ctx context.Context, userID, streamID string) (StreamNotificationSettings, error) {
	st, err := r.GetOverride(ctx, userID, streamID)
	if err != nil {
		return DefaultStreamNotificationSettings(), err
	}
	if st == nil {
		return DefaultStreamNotificationSettings(), nil
	}
	return *st, nil
}

func (r *StreamNotificationSettingsRepo) GetOverride(ctx context.Context, userID, streamID string) (*StreamNotificationSettings, error) {
	var s StreamNotificationSettings
	err := r.db.QueryRow(ctx,
		`SELECT notification_level, suppress_everyone, suppress_role_mentions, suppress_highlights,
		        mute_events, mobile_push, hide_muted_channels, channel_muted
		 FROM stream_notification_settings WHERE user_id = $1 AND stream_id = $2`,
		userID, streamID,
	).Scan(
		&s.NotificationLevel, &s.SuppressEveryone, &s.SuppressRoleMentions, &s.SuppressHighlights,
		&s.MuteEvents, &s.MobilePush, &s.HideMutedChannels, &s.ChannelMuted,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

func (r *StreamNotificationSettingsRepo) Upsert(ctx context.Context, userID, streamID string, in StreamNotificationSettings) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO stream_notification_settings (
			user_id, stream_id, notification_level, suppress_everyone, suppress_role_mentions,
			suppress_highlights, mute_events, mobile_push, hide_muted_channels, channel_muted, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
		ON CONFLICT (user_id, stream_id) DO UPDATE SET
			notification_level = EXCLUDED.notification_level,
			suppress_everyone = EXCLUDED.suppress_everyone,
			suppress_role_mentions = EXCLUDED.suppress_role_mentions,
			suppress_highlights = EXCLUDED.suppress_highlights,
			mute_events = EXCLUDED.mute_events,
			mobile_push = EXCLUDED.mobile_push,
			hide_muted_channels = EXCLUDED.hide_muted_channels,
			channel_muted = EXCLUDED.channel_muted,
			updated_at = now()`,
		userID, streamID, in.NotificationLevel, in.SuppressEveryone, in.SuppressRoleMentions,
		in.SuppressHighlights, in.MuteEvents, in.MobilePush, in.HideMutedChannels, in.ChannelMuted,
	)
	return err
}
