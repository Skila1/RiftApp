package api

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/riftapp-cloud/riftapp/internal/config"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/moderation"
)

const maxUploadSize = 2 << 30 // 2 GB

// Allowed MIME type prefixes/types for uploads
var allowedContentTypes = map[string]bool{
	"image/png":                true,
	"image/jpeg":               true,
	"image/gif":                true,
	"image/webp":               true,
	"image/svg+xml":            true,
	"video/mp4":                true,
	"video/webm":               true,
	"video/quicktime":          true,
	"video/x-matroska":         true,
	"video/x-msvideo":          true,
	"audio/mpeg":               true,
	"audio/ogg":                true,
	"audio/wav":                true,
	"application/pdf":          true,
	"text/plain":               true,
	"application/zip":          true,
	"application/x-tar":        true,
	"application/gzip":         true,
	"application/json":         true,
	"application/octet-stream": true,
}

type UploadHandler struct {
	client *minio.Client
	bucket string
	cfg    *config.Config
	db     *pgxpool.Pool
	modSvc *moderation.Service
}

func (h *UploadHandler) SetModerationService(mod *moderation.Service) {
	h.modSvc = mod
}

func NewUploadHandler(cfg *config.Config, db *pgxpool.Pool) (*UploadHandler, error) {
	if strings.TrimSpace(cfg.S3Endpoint) == "" {
		return nil, fmt.Errorf("S3_ENDPOINT is required (e.g. Cloudflare R2 https://<account>.r2.cloudflarestorage.com)")
	}
	if strings.TrimSpace(cfg.S3Bucket) == "" {
		return nil, fmt.Errorf("S3_BUCKET is required")
	}
	if strings.TrimSpace(cfg.S3AccessKey) == "" || strings.TrimSpace(cfg.S3SecretKey) == "" {
		return nil, fmt.Errorf("S3_ACCESS_KEY and S3_SECRET_KEY are required")
	}

	raw := strings.TrimSpace(cfg.S3Endpoint)
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("S3_ENDPOINT parse: %w", err)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("S3_ENDPOINT must include a host (e.g. https://<account>.r2.cloudflarestorage.com)")
	}
	// minio-go rejects endpoints with paths; R2 is always host (+ optional port) only.
	endpointHost := u.Host
	useSSL := u.Scheme == "https" || u.Scheme == "wss"

	opts := minio.Options{
		Creds:  credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		Secure: useSSL,
	}
	if r := strings.TrimSpace(cfg.S3Region); r != "" {
		opts.Region = r
	}

	client, err := minio.New(endpointHost, &opts)
	if err != nil {
		return nil, fmt.Errorf("s3 client: %w", err)
	}

	ctx := context.Background()
	exists, err := client.BucketExists(ctx, cfg.S3Bucket)
	if err != nil {
		return nil, fmt.Errorf("s3 bucket check: %w", err)
	}
	if !exists {
		if !cfg.S3ManageBucket {
			return nil, fmt.Errorf("s3 bucket %q does not exist; create it or set S3_MANAGE_BUCKET=true", cfg.S3Bucket)
		}
		if err := client.MakeBucket(ctx, cfg.S3Bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("s3 make bucket: %w", err)
		}
		policy := fmt.Sprintf(`{
			"Version":"2012-10-17",
			"Statement":[{
				"Effect":"Allow",
				"Principal":"*",
				"Action":["s3:GetObject"],
				"Resource":["arn:aws:s3:::%s/*"]
			}]
		}`, cfg.S3Bucket)
		if err := client.SetBucketPolicy(ctx, cfg.S3Bucket, policy); err != nil {
			log.Printf("upload init: set bucket public read policy skipped: %v", err)
		}
	}

	return &UploadHandler{client: client, bucket: cfg.S3Bucket, cfg: cfg, db: db}, nil
}

func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "file too large (max 2 GB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	// Enforce file size on the server side (defense in depth)
	if header.Size > maxUploadSize {
		writeError(w, http.StatusRequestEntityTooLarge, "file too large (max 2 GB)")
		return
	}

	// Detect content type from first 512 bytes
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	detectedType := http.DetectContentType(buf[:n])
	// Reset file reader
	if _, err := file.Seek(0, 0); err != nil {
		writeError(w, http.StatusInternalServerError, "upload failed")
		return
	}

	// Use detected type, but allow client header if detection yields octet-stream
	contentType := detectedType
	if contentType == "application/octet-stream" {
		if ct := header.Header.Get("Content-Type"); ct != "" {
			contentType = ct
		}
	}

	// Validate content type
	if !allowedContentTypes[contentType] {
		writeError(w, http.StatusBadRequest, "unsupported file type: "+contentType)
		return
	}

	ext := path.Ext(header.Filename)
	objectName := uuid.New().String() + ext
	attachID := uuid.New().String()
	// Relative path that the frontend rewrites to /api/s3/… via publicAssetUrl().
	publicURL := fmt.Sprintf("/s3/%s/%s", h.bucket, objectName)

	// Insert DB record first (with uploader_id and created_at for orphan cleanup)
	_, err = h.db.Exec(r.Context(),
		`INSERT INTO attachments (id, uploader_id, filename, url, content_type, size_bytes, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		attachID, userID, header.Filename, publicURL, contentType, header.Size, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save attachment")
		return
	}

	// Upload to S3
	_, err = h.client.PutObject(r.Context(), h.bucket, objectName, file, header.Size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		// Rollback DB record
		_, delErr := h.db.Exec(r.Context(), `DELETE FROM attachments WHERE id = $1`, attachID)
		if delErr != nil {
			log.Printf("upload: failed to rollback attachment %s: %v", attachID, delErr)
		}
		writeError(w, http.StatusInternalServerError, "upload failed")
		return
	}

	writeData(w, http.StatusOK, map[string]interface{}{
		"id":           attachID,
		"filename":     header.Filename,
		"url":          publicURL,
		"content_type": contentType,
		"size_bytes":   header.Size,
	})

	if h.modSvc != nil && strings.HasPrefix(contentType, "image/") {
		go h.moderateImage(attachID, publicURL)
	}
}

func (h *UploadHandler) moderateImage(attachID, publicURL string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	objectName := strings.TrimPrefix(publicURL, fmt.Sprintf("/s3/%s/", h.bucket))
	presignedURL, err := h.client.PresignedGetObject(ctx, h.bucket, objectName, 5*time.Minute, nil)
	if err != nil {
		log.Printf("moderation: failed to generate presigned URL for %s: %v", attachID, err)
		return
	}

	result := h.modSvc.CheckImage(ctx, presignedURL.String())
	if result != nil && result.Flagged {
		log.Printf("moderation: flagged image %s (category=%s confidence=%.2f)", attachID, result.Category, result.Confidence)
		_, _ = h.db.Exec(ctx, `UPDATE attachments SET moderation_status = 'flagged' WHERE id = $1`, attachID)
		_ = h.client.RemoveObject(ctx, h.bucket, strings.TrimPrefix(publicURL, fmt.Sprintf("/s3/%s/", h.bucket)), minio.RemoveObjectOptions{})
	} else {
		_, _ = h.db.Exec(ctx, `UPDATE attachments SET moderation_status = 'clean' WHERE id = $1`, attachID)
	}
}

// ServeObject streams a file from S3/R2 using authenticated access.
// Registered for GET /s3/* and GET /api/s3/* — the chi wildcard gives
// the "{bucket}/{object}" portion of the path.
func (h *UploadHandler) ServeObject(w http.ResponseWriter, r *http.Request) {
	objPath := chi.URLParam(r, "*")
	if objPath == "" {
		http.NotFound(w, r)
		return
	}

	idx := strings.IndexByte(objPath, '/')
	if idx < 0 || idx == len(objPath)-1 {
		http.NotFound(w, r)
		return
	}
	bucket, objectName := objPath[:idx], objPath[idx+1:]

	if bucket != h.bucket {
		http.NotFound(w, r)
		return
	}

	obj, err := h.client.GetObject(r.Context(), bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer obj.Close()

	stat, err := obj.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}

	if match := r.Header.Get("If-None-Match"); match != "" && match == stat.ETag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	w.Header().Set("Content-Type", stat.ContentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", stat.Size))
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", stat.ETag)

	io.Copy(w, obj)
}

// DeleteByURL removes an object from S3/R2 given a public URL like "/s3/{bucket}/{objectName}".
// Implements service.FileDeleter. Best-effort: logs errors but never returns them,
// so DB deletes are never rolled back because of a missing/already-deleted file.
func (h *UploadHandler) DeleteByURL(ctx context.Context, fileURL string) error {
	// Expected format: /s3/{bucket}/{objectName}
	trimmed := strings.TrimPrefix(fileURL, "/s3/")
	if trimmed == fileURL {
		log.Printf("file-delete: unrecognised URL format: %s", fileURL)
		return nil
	}
	idx := strings.IndexByte(trimmed, '/')
	if idx < 0 || idx == len(trimmed)-1 {
		log.Printf("file-delete: unrecognised URL format: %s", fileURL)
		return nil
	}
	bucket, objectName := trimmed[:idx], trimmed[idx+1:]
	if bucket != h.bucket {
		log.Printf("file-delete: bucket mismatch (%s != %s) for %s", bucket, h.bucket, fileURL)
		return nil
	}
	if err := h.client.RemoveObject(ctx, bucket, objectName, minio.RemoveObjectOptions{}); err != nil {
		log.Printf("file-delete: failed to remove %s: %v", fileURL, err)
	}
	return nil
}
