-- +goose Up

CREATE TABLE IF NOT EXISTS admin_accounts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    totp_secret   TEXT,
    totp_enabled  BOOLEAN NOT NULL DEFAULT false,
    totp_method   TEXT NOT NULL DEFAULT 'app' CHECK (totp_method IN ('app', 'email')),
    role          TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('super_admin', 'admin', 'moderator')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_user ON admin_accounts(user_id);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id               TEXT PRIMARY KEY,
    admin_account_id TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
    token_hash       TEXT NOT NULL UNIQUE,
    ip_address       TEXT,
    user_agent       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL,
    revoked_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_account ON admin_sessions(admin_account_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token   ON admin_sessions(token_hash);

CREATE TABLE IF NOT EXISTS smtp_config (
    id           INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    host         TEXT NOT NULL DEFAULT '',
    port         INT NOT NULL DEFAULT 587,
    username     TEXT NOT NULL DEFAULT '',
    password     TEXT NOT NULL DEFAULT '',
    from_address TEXT NOT NULL DEFAULT '',
    from_name    TEXT NOT NULL DEFAULT 'RiftApp',
    tls_enabled  BOOLEAN NOT NULL DEFAULT true,
    enabled      BOOLEAN NOT NULL DEFAULT false,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   TEXT
);

INSERT INTO smtp_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS admin_accounts;
DROP TABLE IF EXISTS smtp_config;
