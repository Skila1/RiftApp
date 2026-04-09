-- +goose Up
ALTER TABLE hubs
    ADD COLUMN IF NOT EXISTS default_permissions BIGINT NOT NULL DEFAULT 1795;

CREATE TABLE IF NOT EXISTS stream_permission_overwrites (
    stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    target_type VARCHAR(16) NOT NULL,
    target_id TEXT NOT NULL,
    allow BIGINT NOT NULL DEFAULT 0,
    deny BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (stream_id, target_type, target_id),
    CONSTRAINT stream_permission_overwrites_target_type_chk CHECK (
        target_type IN ('everyone', 'role')
    )
);

INSERT INTO stream_permission_overwrites (stream_id, target_type, target_id, allow, deny)
SELECT s.id, 'everyone', 'everyone', 0, 1
FROM streams s
WHERE s.is_private = true
ON CONFLICT (stream_id, target_type, target_id) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS stream_permission_overwrites;

ALTER TABLE hubs
    DROP COLUMN IF EXISTS default_permissions;