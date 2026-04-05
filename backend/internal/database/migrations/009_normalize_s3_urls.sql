-- +goose Up
-- Rewrite absolute S3/MinIO URLs stored in the DB to relative /s3/{bucket}/{object} paths.
-- This makes URLs portable across environments; the frontend rewrites them to
-- /api/s3/… at render time (see publicAssetUrl.ts).

-- attachments.url  (e.g. "http://minio:9000/riftapp/abc.png"  →  "/s3/riftapp/abc.png")
--                  (e.g. "https://riftapp.io/riftapp/abc.png"  →  "/s3/riftapp/abc.png")
UPDATE attachments
SET url = '/s3' || regexp_replace(url, '^https?://[^/]+', '')
WHERE url ~ '^https?://';

-- Collapse double /s3/s3/ in case the backend already appended /s3 to S3_PUBLIC_URL
UPDATE attachments
SET url = regexp_replace(url, '^/s3/s3/', '/s3/')
WHERE url LIKE '/s3/s3/%';

-- users.avatar_url
UPDATE users
SET avatar_url = '/s3' || regexp_replace(avatar_url, '^https?://[^/]+', '')
WHERE avatar_url IS NOT NULL AND avatar_url ~ '^https?://';

UPDATE users
SET avatar_url = regexp_replace(avatar_url, '^/s3/s3/', '/s3/')
WHERE avatar_url IS NOT NULL AND avatar_url LIKE '/s3/s3/%';

-- hubs.icon_url
UPDATE hubs
SET icon_url = '/s3' || regexp_replace(icon_url, '^https?://[^/]+', '')
WHERE icon_url IS NOT NULL AND icon_url ~ '^https?://';

UPDATE hubs
SET icon_url = regexp_replace(icon_url, '^/s3/s3/', '/s3/')
WHERE icon_url IS NOT NULL AND icon_url LIKE '/s3/s3/%';

-- +goose Down
-- No reliable rollback: the original host prefixes are lost.
SELECT 1;
