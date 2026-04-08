package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/riftapp-cloud/riftapp/internal/api"
	"github.com/riftapp-cloud/riftapp/internal/auth"
	"github.com/riftapp-cloud/riftapp/internal/config"
	"github.com/riftapp-cloud/riftapp/internal/database"
	"github.com/riftapp-cloud/riftapp/internal/pubsub"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/user"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("connected to database")

	if err := database.Migrate(db); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	log.Println("database migrated")

	// Repositories
	hubRepo := repository.NewHubRepo(db)
	streamRepo := repository.NewStreamRepo(db)
	msgRepo := repository.NewMessageRepo(db)
	dmRepo := repository.NewDMRepo(db)
	notifRepo := repository.NewNotificationRepo(db)
	hubNotifRepo := repository.NewHubNotificationSettingsRepo(db)
	streamNotifRepo := repository.NewStreamNotificationSettingsRepo(db)
	inviteRepo := repository.NewInviteRepo(db)

	// Auth & User services (existing)
	authService := auth.NewService(db, cfg.JWTSecret)
	userRepo := user.NewRepo(db)
	userService := user.NewService(userRepo)

	// Redis (used for future cross-instance pub/sub)
	redisBroker, err := pubsub.NewRedisBroker(cfg.RedisURL)
	if err != nil {
		log.Printf("warning: Redis unavailable: %v", err)
	} else {
		log.Println("connected to Redis")
		defer redisBroker.Close()
	}

	// WebSocket hub
	wsHub := ws.NewHub(db)
	go wsHub.Run()

	// Services
	catRepo := repository.NewCategoryRepo(db)
	friendRepo := repository.NewFriendshipRepo(db)
	blockRepo := repository.NewBlockRepo(db)
	notifSvc := service.NewNotificationService(notifRepo, wsHub)
	customRepo := repository.NewHubCustomizationRepo(db)
	rankRepo := repository.NewRankRepo(db)
	hubSvc := service.NewHubService(hubRepo, streamRepo, inviteRepo, notifRepo, hubNotifRepo, rankRepo)
	customSvc := service.NewHubCustomizationService(customRepo, hubRepo, rankRepo)
	streamSvc := service.NewStreamService(streamRepo, hubSvc, msgRepo, notifRepo, streamNotifRepo)
	catSvc := service.NewCategoryService(catRepo, hubSvc)
	msgSvc := service.NewMessageService(msgRepo, streamRepo, hubSvc, notifSvc, wsHub, hubNotifRepo, streamNotifRepo)
	dmSvc := service.NewDMService(dmRepo, msgRepo, notifSvc, wsHub)
	friendSvc := service.NewFriendService(friendRepo, blockRepo, wsHub)
	rankSvc := service.NewRankService(rankRepo, hubRepo)

	// Upload handler (MinIO/S3)
	uploadH, err := api.NewUploadHandler(cfg, db)
	if err != nil {
		log.Printf("warning: file uploads disabled: %v", err)
	}

	// Wire S3 file cleanup for customization deletes.
	if uploadH != nil {
		customSvc.SetFileDeleter(uploadH)
	}

	// Router
	router := api.NewRouter(api.RouterDeps{
		AuthService:             authService,
		UserService:             userService,
		HubService:              hubSvc,
		StreamService:           streamSvc,
		CategoryService:         catSvc,
		MsgService:              msgSvc,
		DMService:               dmSvc,
		NotifService:            notifSvc,
		FriendService:           friendSvc,
		RankService:             rankSvc,
		HubCustomizationService: customSvc,
		HubCustomizationRepo:    customRepo,
		WSHub:                   wsHub,
		Config:                  cfg,
		UploadHandler:           uploadH,
		NotifRepo:               notifRepo,
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("riftapp server starting on :%s", cfg.Port)
		log.Printf("  → REST API: http://localhost:%s/api", cfg.Port)
		log.Printf("  → WebSocket: ws://localhost:%s/ws", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("received signal %s, shutting down gracefully…", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}

	log.Println("server stopped")
}
