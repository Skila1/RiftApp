-- +goose Up

CREATE TABLE IF NOT EXISTS hub_emojis (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id     UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    file_url   TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hub_emojis_hub ON hub_emojis(hub_id);

CREATE TABLE IF NOT EXISTS hub_stickers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id     UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    file_url   TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hub_stickers_hub ON hub_stickers(hub_id);

CREATE TABLE IF NOT EXISTS hub_sounds (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id     UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    file_url   TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hub_sounds_hub ON hub_sounds(hub_id);

-- +goose Down
DROP TABLE IF EXISTS hub_sounds;
DROP TABLE IF EXISTS hub_stickers;
DROP TABLE IF EXISTS hub_emojis;
