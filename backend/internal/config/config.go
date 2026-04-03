package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	JWTSecret   string
	S3Endpoint  string
	S3PublicURL string
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string
	LiveKitHost string
	LiveKitKey  string
	LiveKitSecret string
}

func Load() *Config {
	return &Config{
		Port:          getEnv("PORT", "8080"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://riptide:riptide_dev@localhost:5432/riptide?sslmode=disable"),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-change-me"),
		S3Endpoint:    getEnv("S3_ENDPOINT", "http://localhost:9000"),
		S3PublicURL:   getEnv("S3_PUBLIC_URL", ""), // falls back to S3_ENDPOINT if empty
		S3AccessKey:   getEnv("S3_ACCESS_KEY", "riptide"),
		S3SecretKey:   getEnv("S3_SECRET_KEY", "riptide_dev"),
		S3Bucket:      getEnv("S3_BUCKET", "riptide"),
		LiveKitHost:   getEnv("LIVEKIT_HOST", "ws://localhost:7880"),
		LiveKitKey:    getEnv("LIVEKIT_API_KEY", "devkey"),
		LiveKitSecret: getEnv("LIVEKIT_API_SECRET", "devsecret"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
