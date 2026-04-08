-- +goose Up
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pinned_by_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_stream_pinned_at
    ON messages(stream_id, pinned_at DESC NULLS LAST)
    WHERE pinned_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_pinned_by_id
    ON messages(pinned_by_id)
    WHERE pinned_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
    ON messages USING GIN (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_attachments_filename_trgm
    ON attachments USING GIN (filename gin_trgm_ops);

-- +goose Down
DROP INDEX IF EXISTS idx_attachments_filename_trgm;
DROP INDEX IF EXISTS idx_messages_content_trgm;
DROP INDEX IF EXISTS idx_messages_pinned_by_id;
DROP INDEX IF EXISTS idx_messages_stream_pinned_at;

ALTER TABLE messages
    DROP COLUMN IF EXISTS pinned_by_id,
    DROP COLUMN IF EXISTS pinned_at;

DROP EXTENSION IF EXISTS pg_trgm;