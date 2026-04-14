package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/riftapp-cloud/riftapp/internal/admin"
	"github.com/riftapp-cloud/riftapp/internal/api"
	"github.com/riftapp-cloud/riftapp/internal/auth"
	"github.com/riftapp-cloud/riftapp/internal/config"
	"github.com/riftapp-cloud/riftapp/internal/database"
	"github.com/riftapp-cloud/riftapp/internal/moderation"
	"github.com/riftapp-cloud/riftapp/internal/pubsub"
	"github.com/riftapp-cloud/riftapp/internal/push"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/smtp"
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
	streamPermRepo := repository.NewStreamPermissionRepo(db)

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

	// Services
	catRepo := repository.NewCategoryRepo(db)
	friendRepo := repository.NewFriendshipRepo(db)
	blockRepo := repository.NewBlockRepo(db)
	notifSvc := service.NewNotificationService(notifRepo, wsHub)
	customRepo := repository.NewHubCustomizationRepo(db)
	rankRepo := repository.NewRankRepo(db)
	hubSvc := service.NewHubService(hubRepo, streamRepo, streamPermRepo, inviteRepo, notifRepo, hubNotifRepo, rankRepo)
	customSvc := service.NewHubCustomizationService(customRepo, hubRepo, rankRepo)
	streamSvc := service.NewStreamService(streamRepo, streamPermRepo, hubSvc, msgRepo, notifRepo, streamNotifRepo)
	catSvc := service.NewCategoryService(catRepo, hubSvc)
	msgSvc := service.NewMessageService(msgRepo, streamRepo, hubSvc, notifSvc, wsHub, hubNotifRepo, streamNotifRepo)
	dmSvc := service.NewDMService(dmRepo, msgRepo, notifSvc, wsHub)
	friendSvc := service.NewFriendService(friendRepo, blockRepo, wsHub)
	rankSvc := service.NewRankService(rankRepo, hubRepo)
	wsHub.SetPermissionChecker(hubSvc)
	go wsHub.Run()

	// Developer portal
	devRepo := repository.NewDeveloperRepo(db)
	devSvc := service.NewDeveloperService(devRepo)

	// Content moderation (LocalMod)
	var modSvc *moderation.Service
	if cfg.LocalModURL != "" {
		modClient := moderation.NewClient(cfg.LocalModURL)
		if err := modClient.Health(context.Background()); err != nil {
			log.Printf("warning: LocalMod unreachable (%s): %v — moderation disabled", cfg.LocalModURL, err)
		} else {
			modSvc = moderation.NewService(modClient)
			log.Printf("connected to LocalMod at %s", cfg.LocalModURL)
		}
	}

	// Wire content moderation into services
	if modSvc != nil {
		msgSvc.SetModerationService(modSvc)
		dmSvc.SetModerationService(modSvc)
		hubSvc.SetModerationService(modSvc)
		userService.SetModerationService(modSvc)
	}

	// Report & moderation system
	reportRepo := repository.NewReportRepo(db)
	reportSvc := service.NewReportService(reportRepo, modSvc, msgRepo, userRepo, notifSvc)
	hubModRepo := repository.NewHubModerationRepo(db)

	// Device token repo for push notifications
	deviceTokenRepo := repository.NewDeviceTokenRepo(db)

	// Application command repo for slash commands
	appCommandRepo := repository.NewAppCommandRepo(db)

	// Push notification service (Firebase Cloud Messaging)
	pushSvc, err := push.NewService(deviceTokenRepo)
	if err != nil {
		log.Printf("warning: push notifications disabled: %v", err)
	} else {
		notifSvc.SetPushSender(pushSvc)
		log.Println("push notifications enabled (FCM)")
	}

	// Upload handler (S3-compatible storage, e.g. Cloudflare R2)
	uploadH, err := api.NewUploadHandler(cfg, db)
	if err != nil {
		log.Printf("warning: file uploads disabled: %v", err)
	}

	// Wire S3 file cleanup for customization deletes.
	if uploadH != nil {
		customSvc.SetFileDeleter(uploadH)
		if modSvc != nil {
			uploadH.SetModerationService(modSvc)
		}
	}

	// SMTP service
	smtpSvc := smtp.NewService(db)

	// Admin panel service
	seedEmails := map[string]bool{}
	if envSeeds := os.Getenv("RIFTAPP_SEED_ADMIN_EMAILS"); envSeeds != "" {
		for _, e := range strings.Split(envSeeds, ",") {
			if trimmed := strings.TrimSpace(e); trimmed != "" {
				seedEmails[trimmed] = true
			}
		}
	}
	adminRepo := admin.NewRepo(db)
	adminSvc := admin.NewService(adminRepo, cfg.JWTSecret, seedEmails)
	adminSvc.SetEmailSender(smtpSvc)
	if len(seedEmails) > 0 && os.Getenv("RIFTAPP_BOOTSTRAP_ADMIN_SEED") == "true" {
		adminSvc.EnsureSeedAdmins(context.Background())
	}

	// Router
	router := api.NewRouter(api.RouterDeps{
		AuthService:             authService,
		UserService:             userService,
		UserRepo:                userRepo,
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
		DeveloperService:        devSvc,
		DeveloperRepo:           devRepo,
		HubRepo:                 hubRepo,
		StreamRepo:              streamRepo,
		MsgRepo:                 msgRepo,
		RankRepo:                rankRepo,
		WSHub:                   wsHub,
		Config:                  cfg,
		UploadHandler:           uploadH,
		NotifRepo:               notifRepo,
		ModerationService:       modSvc,
		ReportService:           reportSvc,
		HubModerationRepo:       hubModRepo,
		DeviceTokenRepo:         deviceTokenRepo,
		AppCommandRepo:          appCommandRepo,
		DB:                      db,
		AdminService:            adminSvc,
		SMTPService:             smtpSvc,
		DBPool:                  db,
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
