package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	JWTSecret      string
	AllowedOrigins []string
	S3Endpoint     string
	S3PublicURL    string // No longer used for stored URLs (now relative), kept for backward compat.
	S3AccessKey    string
	S3SecretKey    string
	S3Bucket       string
	S3Region       string
	S3ManageBucket bool
	LiveKitURL     string
	LiveKitKey     string
	LiveKitSecret  string
}

func Load() *Config {
	cfg := &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://riftapp:riftapp_dev@localhost:5432/riftapp?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-change-me"),
		AllowedOrigins: parseOrigins(getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")),
		S3Endpoint:     getEnv("S3_ENDPOINT", ""),
		S3PublicURL:    getEnv("S3_PUBLIC_URL", ""),
		S3AccessKey:    getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey:    getEnv("S3_SECRET_KEY", ""),
		S3Bucket:       getEnv("S3_BUCKET", ""),
		S3Region:       getEnv("S3_REGION", ""),
		S3ManageBucket: envBool("S3_MANAGE_BUCKET", true),
		LiveKitURL:     getEnv("LIVEKIT_URL", ""),
		LiveKitKey:     getEnv("LIVEKIT_API_KEY", "devkey"),
		LiveKitSecret:  getEnv("LIVEKIT_API_SECRET", "devsecret"),
	}
	if cfg.JWTSecret == "dev-secret-change-me" {
		log.Println("WARNING: JWT_SECRET is set to the default dev value. Set a strong secret in production.")
	}
	if cfg.LiveKitKey == "devkey" || cfg.LiveKitSecret == "devsecret" {
		log.Println("WARNING: LiveKit API key/secret are set to default dev values. Set real credentials in production.")
	}
	if isProductionEnv() && strings.Contains(cfg.DatabaseURL, "sslmode=disable") {
		log.Println("WARNING: DATABASE_URL uses sslmode=disable while ENV/GO_ENV suggests production; use TLS (e.g. Neon).")
	}
	return cfg
}

func isProductionEnv() bool {
	e := strings.ToLower(strings.TrimSpace(os.Getenv("ENV")))
	g := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
	return e == "production" || g == "production"
}

func envBool(key string, defaultVal bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return defaultVal
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return defaultVal
	}
	return b
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
