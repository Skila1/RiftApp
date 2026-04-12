-- +goose Up
ALTER TABLE conversations
    ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE conversations c
SET owner_id = owner.user_id
FROM (
    SELECT DISTINCT ON (cm.conversation_id)
        cm.conversation_id,
        cm.user_id
    FROM conversation_members cm
    JOIN conversations c2 ON c2.id = cm.conversation_id
    WHERE c2.is_group = true
    ORDER BY cm.conversation_id, cm.joined_at ASC, cm.user_id ASC
) AS owner
WHERE c.id = owner.conversation_id
  AND c.is_group = true;

-- +goose Down
ALTER TABLE conversations
    DROP COLUMN IF EXISTS owner_id;