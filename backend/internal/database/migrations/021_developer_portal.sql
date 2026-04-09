-- +goose Up

CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT,
    bot_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    bot_public BOOLEAN NOT NULL DEFAULT true,
    bot_require_code_grant BOOLEAN NOT NULL DEFAULT false,
    verify_key VARCHAR(128) NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    terms_of_service_url TEXT,
    privacy_policy_url TEXT,
    interactions_endpoint_url TEXT,
    role_connections_verification_url TEXT,
    custom_install_url TEXT,
    install_params JSONB,
    flags INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_applications_owner ON applications(owner_id);

CREATE TABLE bot_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    bot_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_bot_tokens_app ON bot_tokens(application_id);
CREATE INDEX idx_bot_tokens_hash ON bot_tokens(token_hash);

CREATE TABLE oauth2_redirects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth2_redirects_app ON oauth2_redirects(application_id);

CREATE TABLE oauth2_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (application_id, user_id)
);

CREATE TABLE app_emojis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    image_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_emojis_app ON app_emojis(application_id);

CREATE TABLE app_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret VARCHAR(128) NOT NULL DEFAULT '',
    event_types TEXT[] NOT NULL DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_webhooks_app ON app_webhooks(application_id);

CREATE TABLE app_testers (
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (application_id, user_id)
);

CREATE TABLE rich_presence_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'large',
    image_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rich_presence_assets_app ON rich_presence_assets(application_id);

-- +goose Down
DROP TABLE IF EXISTS rich_presence_assets;
DROP TABLE IF EXISTS app_testers;
DROP TABLE IF EXISTS app_webhooks;
DROP TABLE IF EXISTS app_emojis;
DROP TABLE IF EXISTS oauth2_authorizations;
DROP TABLE IF EXISTS oauth2_redirects;
DROP TABLE IF EXISTS bot_tokens;
DROP TABLE IF EXISTS applications;
