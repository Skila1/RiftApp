-- +goose Up
-- Riptide → RiftApp rebrand
--
-- Application tables do not store the product name. This migration updates stored URLs
-- that may still reference the old bucket/host (e.g. MinIO bucket "riptide", CDN host).
--
-- To rename an existing PostgreSQL database and role from "riptide" to "riftapp", stop the
-- app and run the following as a superuser connected to database "postgres" (not inside
-- goose — ALTER DATABASE RENAME cannot run in a transaction, and you cannot rename the DB
-- you are connected to):
--
--   SELECT pg_terminate_backend(pid)
--   FROM pg_stat_activity
--   WHERE datname = 'riptide' AND pid <> pg_backend_pid();
--
--   ALTER DATABASE riptide RENAME TO riftapp;
--   ALTER ROLE riptide RENAME TO riftapp;
--
-- Then set DATABASE_URL to use the riftapp role and database (and password if changed).

UPDATE users
SET avatar_url = replace(replace(replace(avatar_url, 'RIPTIDE', 'RIFTAPP'), 'Riptide', 'RiftApp'), 'riptide', 'riftapp')
WHERE avatar_url IS NOT NULL AND avatar_url ILIKE '%riptide%';

UPDATE hubs
SET icon_url = replace(replace(replace(icon_url, 'RIPTIDE', 'RIFTAPP'), 'Riptide', 'RiftApp'), 'riptide', 'riftapp')
WHERE icon_url IS NOT NULL AND icon_url ILIKE '%riptide%';

UPDATE attachments
SET url = replace(replace(replace(url, 'RIPTIDE', 'RIFTAPP'), 'Riptide', 'RiftApp'), 'riptide', 'riftapp')
WHERE url ILIKE '%riptide%';

-- +goose Down
-- URL substitutions are not safely reversible if new "riftapp" URLs were stored after the Up migration.
SELECT 1;
