-- +goose Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned_at) WHERE banned_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_users_banned;
ALTER TABLE users DROP COLUMN IF EXISTS banned_at;
