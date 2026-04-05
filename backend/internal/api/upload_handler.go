package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/riftapp-cloud/riftapp/internal/config"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
)

const maxUploadSize = 2 << 30 // 2 GB
const maxAttachmentsPerMessage = 10

// Allowed MIME type prefixes/types for uploads
var allowedContentTypes = map[string]bool{
	"image/png":             true,
	"image/jpeg":            true,
	"image/gif":             true,
	"image/webp":            true,
	"image/svg+xml":         true,
	"video/mp4":             true,
	"video/webm":            true,
	"video/quicktime":       true,
	"video/x-matroska":      true,
	"video/x-msvideo":       true,
	"audio/mpeg":            true,
	"audio/ogg":             true,
	"audio/wav":             true,
	"application/pdf":       true,
	"text/plain":            true,
	"application/zip":       true,
	"application/x-tar":     true,
	"application/gzip":      true,
	"application/json":      true,
	"application/octet-stream": true,
}

type UploadHandler struct {
	client    *minio.Client
	bucket    string
	cfg       *config.Config
	db        *pgxpool.Pool
	publicURL string
}

func NewUploadHandler(cfg *config.Config, db *pgxpool.Pool) (*UploadHandler, error) {
	endpoint := strings.TrimPrefix(strings.TrimPrefix(cfg.S3Endpoint, "http://"), "https://")
	useSSL := strings.HasPrefix(cfg.S3Endpoint, "https://")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}

	// Ensure bucket exists
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, cfg.S3Bucket)
	if err != nil {
		return nil, fmt.Errorf("minio bucket check: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, cfg.S3Bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("minio make bucket: %w", err)
		}
		// Set bucket policy to public read
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
			return nil, fmt.Errorf("minio set policy: %w", err)
		}
	}

	publicBase := publicAssetURLBase(cfg)

	return &UploadHandler{client: client, bucket: cfg.S3Bucket, cfg: cfg, db: db, publicURL: publicBase}, nil
}

// publicAssetURLBase is the prefix for URLs stored in the DB (avatars, attachments).
// When S3_PUBLIC_URL is set, it must resolve through the API reverse proxy paths /s3/* and /api/s3/*
// (see router.go). We append "/s3" if missing so stored paths are always …/s3/{bucket}/{object}.
// When S3_PUBLIC_URL is empty, we fall back to S3_ENDPOINT (e.g. http://localhost:9000) for MinIO path-style URLs.
func publicAssetURLBase(cfg *config.Config) string {
	base := strings.TrimSpace(cfg.S3PublicURL)
	if base == "" {
		return strings.TrimRight(cfg.S3Endpoint, "/")
	}
	base = strings.TrimRight(base, "/")
	if !strings.HasSuffix(base, "/s3") {
		base += "/s3"
	}
	return base
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
	publicURL := fmt.Sprintf("%s/%s/%s", h.publicURL, h.bucket, objectName)

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

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":           attachID,
		"filename":     header.Filename,
		"url":          publicURL,
		"content_type": contentType,
		"size_bytes":   header.Size,
	})
}
