-- +goose Up
ALTER TABLE hubs ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- +goose Down
ALTER TABLE hubs DROP COLUMN IF EXISTS banner_url;
