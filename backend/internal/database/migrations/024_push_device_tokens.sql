-- +goose Up

CREATE TABLE IF NOT EXISTS device_tokens (
    id          TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

-- +goose Down

DROP TABLE IF EXISTS device_tokens;
