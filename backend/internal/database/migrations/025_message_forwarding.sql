-- +goose Up
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS forwarded_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_forwarded_message_id
    ON messages(forwarded_message_id)
    WHERE forwarded_message_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_messages_forwarded_message_id;

ALTER TABLE messages
    DROP COLUMN IF EXISTS forwarded_message_id;