-- +goose Up
-- Migration 009 incorrectly converted external CDN URLs (Discord, etc.) by
-- stripping the host and prepending /s3. This restores them.
--
-- Discord CDN paths: /avatars/*, /icons/*, /banners/*, /embed/*, /splashes/*
-- These were originally https://cdn.discordapp.com/... and became /s3/avatars/... etc.

-- users.avatar_url
UPDATE users
SET avatar_url = 'https://cdn.discordapp.com' || regexp_replace(avatar_url, '^/s3', '')
WHERE avatar_url IS NOT NULL
  AND (avatar_url LIKE '/s3/avatars/%'
    OR avatar_url LIKE '/s3/embed/%');

-- hubs.icon_url
UPDATE hubs
SET icon_url = 'https://cdn.discordapp.com' || regexp_replace(icon_url, '^/s3', '')
WHERE icon_url IS NOT NULL
  AND (icon_url LIKE '/s3/icons/%'
    OR icon_url LIKE '/s3/avatars/%'
    OR icon_url LIKE '/s3/banners/%'
    OR icon_url LIKE '/s3/splashes/%');

-- attachments.url (unlikely but just in case)
UPDATE attachments
SET url = 'https://cdn.discordapp.com' || regexp_replace(url, '^/s3', '')
WHERE url LIKE '/s3/avatars/%'
   OR url LIKE '/s3/icons/%'
   OR url LIKE '/s3/embed/%';

-- +goose Down
-- No rollback needed; this is a data fix.
SELECT 1;
