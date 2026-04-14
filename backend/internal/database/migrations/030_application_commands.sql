-- +goose Up

CREATE TABLE IF NOT EXISTS application_commands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    hub_id          UUID REFERENCES hubs(id) ON DELETE CASCADE,
    name            VARCHAR(32) NOT NULL,
    description     VARCHAR(100) NOT NULL DEFAULT '',
    options         JSONB NOT NULL DEFAULT '[]',
    type            INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_app_commands_unique ON application_commands(application_id, COALESCE(hub_id, '00000000-0000-0000-0000-000000000000'), name);
CREATE INDEX idx_app_commands_app ON application_commands(application_id);
CREATE INDEX idx_app_commands_hub ON application_commands(hub_id) WHERE hub_id IS NOT NULL;

-- +goose Down

DROP TABLE IF EXISTS application_commands;
