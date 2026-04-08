-- +goose Up
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS webhook_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS webhook_avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_message_id
    ON messages(reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stream_notification_settings (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    notification_level VARCHAR(20) NOT NULL DEFAULT 'mentions_only',
    suppress_everyone BOOLEAN NOT NULL DEFAULT false,
    suppress_role_mentions BOOLEAN NOT NULL DEFAULT false,
    suppress_highlights BOOLEAN NOT NULL DEFAULT false,
    mute_events BOOLEAN NOT NULL DEFAULT false,
    mobile_push BOOLEAN NOT NULL DEFAULT true,
    hide_muted_channels BOOLEAN NOT NULL DEFAULT false,
    channel_muted BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, stream_id),
    CONSTRAINT stream_notification_settings_level_chk CHECK (
        notification_level IN ('all', 'mentions_only', 'nothing')
    )
);

CREATE INDEX IF NOT EXISTS idx_stream_notification_settings_stream_id
    ON stream_notification_settings(stream_id);

-- +goose Down
DROP INDEX IF EXISTS idx_stream_notification_settings_stream_id;
DROP TABLE IF EXISTS stream_notification_settings;

DROP INDEX IF EXISTS idx_messages_reply_to_message_id;

ALTER TABLE messages
    DROP COLUMN IF EXISTS webhook_avatar_url,
    DROP COLUMN IF EXISTS webhook_name,
    DROP COLUMN IF EXISTS reply_to_message_id;

ALTER TABLE users
    DROP COLUMN IF EXISTS is_bot;