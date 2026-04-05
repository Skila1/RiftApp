package config

import (
	"os"
	"strings"
)

type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	JWTSecret      string
	AllowedOrigins []string
	S3Endpoint     string
	// S3PublicURL is the browser-facing base for attachment/avatar URLs. If set, it should be your API
	// origin (no trailing slash); the server stores URLs as {S3PublicURL}/s3/{bucket}/{object}. Leave empty
	// to use S3Endpoint (e.g. local MinIO path-style URLs).
	S3PublicURL    string
	S3AccessKey    string
	S3SecretKey    string
	S3Bucket       string
	LiveKitURL     string
	LiveKitKey     string
	LiveKitSecret  string
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://riftapp:riftapp_dev@localhost:5432/riftapp?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-change-me"),
		AllowedOrigins: parseOrigins(getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")),
		S3Endpoint:     getEnv("S3_ENDPOINT", "http://localhost:9000"),
		S3PublicURL:    getEnv("S3_PUBLIC_URL", ""),
		S3AccessKey:    getEnv("S3_ACCESS_KEY", "riftapp"),
		S3SecretKey:    getEnv("S3_SECRET_KEY", "riftapp_dev"),
		S3Bucket:       getEnv("S3_BUCKET", "riftapp"),
		LiveKitURL:     getEnv("LIVEKIT_URL", ""),
		LiveKitKey:     getEnv("LIVEKIT_API_KEY", "devkey"),
		LiveKitSecret:  getEnv("LIVEKIT_API_SECRET", "devsecret"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseOrigins(s string) []string {
	parts := strings.Split(s, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			origins = append(origins, p)
		}
	}
	return origins
}
