package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/riptide-cloud/riptide/internal/api"
	"github.com/riptide-cloud/riptide/internal/auth"
	"github.com/riptide-cloud/riptide/internal/config"
	"github.com/riptide-cloud/riptide/internal/database"
	"github.com/riptide-cloud/riptide/internal/user"
	"github.com/riptide-cloud/riptide/internal/ws"
)

func main() {
	cfg := config.Load()

	// Database
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("connected to database")

	// Run migrations
	if err := database.Migrate(db); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	log.Println("database migrated")

	// Services
	authService := auth.NewService(db, cfg.JWTSecret)
	userRepo := user.NewRepo(db)
	userService := user.NewService(userRepo)

	// WebSocket hub
	wsHub := ws.NewHub(db)
	go wsHub.Run()

	// Upload handler (MinIO/S3)
	uploadH, err := api.NewUploadHandler(cfg, db)
	if err != nil {
		log.Printf("warning: file uploads disabled: %v", err)
	}

	// Router
	router := api.NewRouter(db, authService, userService, wsHub, cfg, uploadH)

	// HTTP server with graceful shutdown
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("riptide server starting on :%s", cfg.Port)
		log.Printf("  → REST API: http://localhost:%s/api", cfg.Port)
		log.Printf("  → WebSocket: ws://localhost:%s/ws", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("received signal %s, shutting down gracefully…", sig)

	// Give outstanding requests up to 10s to finish
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}

	log.Println("server stopped")
}
