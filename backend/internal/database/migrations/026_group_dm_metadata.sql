-- +goose Up
ALTER TABLE conversations
    ADD COLUMN name TEXT,
    ADD COLUMN icon_url TEXT,
    ADD COLUMN is_group BOOLEAN NOT NULL DEFAULT false;

UPDATE conversations c
SET is_group = true
WHERE c.id IN (
    SELECT cm.conversation_id
    FROM conversation_members cm
    GROUP BY cm.conversation_id
    HAVING COUNT(*) > 2
);

-- +goose Down
ALTER TABLE conversations
    DROP COLUMN IF EXISTS is_group,
    DROP COLUMN IF EXISTS icon_url,
    DROP COLUMN IF EXISTS name;