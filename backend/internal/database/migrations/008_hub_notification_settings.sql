-- +goose Up
CREATE TABLE hub_notification_settings (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hub_id UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    notification_level VARCHAR(20) NOT NULL DEFAULT 'mentions_only',
    suppress_everyone BOOLEAN NOT NULL DEFAULT false,
    suppress_role_mentions BOOLEAN NOT NULL DEFAULT false,
    suppress_highlights BOOLEAN NOT NULL DEFAULT false,
    mute_events BOOLEAN NOT NULL DEFAULT false,
    mobile_push BOOLEAN NOT NULL DEFAULT true,
    hide_muted_channels BOOLEAN NOT NULL DEFAULT false,
    server_muted BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, hub_id),
    CONSTRAINT hub_notification_settings_level_chk CHECK (
        notification_level IN ('all', 'mentions_only', 'nothing')
    )
);

-- +goose Down
DROP TABLE IF EXISTS hub_notification_settings;
