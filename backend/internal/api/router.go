package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/time/rate"

	"github.com/riftapp-cloud/riftapp/internal/admin"
	"github.com/riftapp-cloud/riftapp/internal/auth"
	"github.com/riftapp-cloud/riftapp/internal/config"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/moderation"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/smtp"
	"github.com/riftapp-cloud/riftapp/internal/user"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type RouterDeps struct {
	AuthService             *auth.Service
	UserService             *user.Service
	UserRepo                *user.Repo
	HubService              *service.HubService
	StreamService           *service.StreamService
	CategoryService         *service.CategoryService
	MsgService              *service.MessageService
	DMService               *service.DMService
	NotifService            *service.NotificationService
	FriendService           *service.FriendService
	RankService             *service.RankService
	HubCustomizationService *service.HubCustomizationService
	HubCustomizationRepo    *repository.HubCustomizationRepo
	DeveloperService        *service.DeveloperService
	DeveloperRepo           *repository.DeveloperRepo
	HubRepo                 *repository.HubRepo
	StreamRepo              *repository.StreamRepo
	MsgRepo                 *repository.MessageRepo
	RankRepo                *repository.RankRepo
	WSHub                   *ws.Hub
	Config                  *config.Config
	UploadHandler           *UploadHandler
	NotifRepo               *repository.NotificationRepo
	ModerationService       *moderation.Service
	ReportService           *service.ReportService
	HubModerationRepo       *repository.HubModerationRepo
	DeviceTokenRepo         *repository.DeviceTokenRepo
	DB                      interface{}
	AdminService            *admin.Service
	SMTPService             *smtp.Service
	DBPool                  *pgxpool.Pool
}

func NewRouter(deps RouterDeps) *chi.Mux {
	r := chi.NewRouter()

	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(chiMiddleware.RealIP)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   deps.Config.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	authH := NewAuthHandler(deps.AuthService)
	userH := NewUserHandler(deps.UserService, deps.WSHub)
	hubH := NewHubHandler(deps.HubService, deps.NotifService, deps.NotifRepo, deps.WSHub)
	customH := NewHubCustomizationHandler(deps.HubCustomizationService)
	rankH := NewRankHandler(deps.RankService, deps.WSHub)
	streamH := NewStreamHandler(deps.StreamService, deps.WSHub)
	catH := NewCategoryHandler(deps.CategoryService, deps.WSHub)
	msgH := NewMessageHandler(deps.MsgService, deps.DMService)
	wsH := NewWSHandler(deps.WSHub, deps.AuthService, deps.Config.AllowedOrigins)
	voiceH := NewVoiceHandler(deps.Config, deps.HubService, deps.StreamService, deps.DMService, deps.WSHub, deps.HubCustomizationRepo)
	notifH := NewNotifHandler(deps.NotifService)
	dmH := NewDMHandler(deps.DMService)
	friendH := NewFriendHandler(deps.FriendService, deps.UserService)

	var devH *DeveloperHandler
	if deps.DeveloperService != nil {
		devH = NewDeveloperHandler(deps.DeveloperService, deps.HubService, deps.HubRepo)
	}

	var reportH *ReportHandler
	if deps.ReportService != nil && deps.DeveloperService != nil {
		reportH = NewReportHandler(deps.ReportService, deps.DeveloperService)
	}

	var hubModH *HubModerationHandler
	if deps.HubModerationRepo != nil && deps.HubService != nil && deps.HubRepo != nil {
		hubModH = NewHubModerationHandler(deps.HubModerationRepo, deps.HubService, deps.HubRepo)
	}

	var deviceTokenH *DeviceTokenHandler
	if deps.DeviceTokenRepo != nil {
		deviceTokenH = NewDeviceTokenHandler(deps.DeviceTokenRepo)
	}

	r.Get("/ws", wsH.Handle)

	// Authenticated S3/R2 file serving (avatars, attachments).
	// Uses the S3 API client with credentials instead of an anonymous reverse proxy.
	if deps.UploadHandler != nil {
		r.Get("/s3/*", deps.UploadHandler.ServeObject)
		r.Get("/api/s3/*", deps.UploadHandler.ServeObject)
	}

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}
	r.Get("/health", healthHandler)
	r.Get("/api/health", healthHandler)

	// Link unfurl (OG metadata) — authenticated + rate-limited separately.
	unfurlRL := middleware.NewRateLimiter(rate.Every(2*time.Second), 10)
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(deps.AuthService))
		r.Use(middleware.RateLimit(unfurlRL))
		r.Get("/api/unfurl", HandleUnfurl)
	})

	publicRL := middleware.NewRateLimiter(rate.Every(6*time.Second), 10)
	r.Route("/api/auth", func(r chi.Router) {
		r.Use(middleware.RateLimit(publicRL))
		r.Post("/register", authH.Register)
		r.Post("/login", authH.Login)
		r.Post("/refresh", authH.Refresh)
		r.With(middleware.Auth(deps.AuthService)).Post("/logout", authH.Logout)
	})

	// Generous burst so rapid hub switching (many parallel hub-scoped requests) does not 429.
	authRL := middleware.NewRateLimiter(rate.Every(time.Second), 120)
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(deps.AuthService))
		if deps.UserRepo != nil {
			r.Use(middleware.BanCheck(deps.UserRepo))
		}
		r.Use(middleware.RateLimit(authRL))

		r.Get("/api/users/@me", userH.GetMe)
		r.Patch("/api/users/@me", userH.UpdateMe)
		r.Get("/api/users/search", userH.SearchUser)
		r.Get("/api/users/{userID}", userH.GetUser)

		r.Post("/api/hubs", hubH.Create)
		r.Post("/api/hubs/import-discord-template", hubH.ImportDiscordTemplate)
		r.Get("/api/hubs", hubH.List)
		r.Get("/api/hubs/{hubID}", hubH.Get)
		r.Patch("/api/hubs/{hubID}", hubH.Update)
		r.Delete("/api/hubs/{hubID}", hubH.Delete)
		r.Post("/api/hubs/{hubID}/join", hubH.Join)
		r.Post("/api/hubs/{hubID}/leave", hubH.Leave)
		r.Get("/api/hubs/{hubID}/members", hubH.Members)
		r.Post("/api/hubs/{hubID}/invite", hubH.CreateInvite)
		r.Get("/api/hubs/{hubID}/permissions", hubH.MyPermissions)

		r.Get("/api/hubs/{hubID}/roles", rankH.List)
		r.Post("/api/hubs/{hubID}/roles", rankH.Create)
		r.Patch("/api/hubs/{hubID}/roles/{rankID}", rankH.Update)
		r.Delete("/api/hubs/{hubID}/roles/{rankID}", rankH.Delete)
		r.Post("/api/hubs/{hubID}/members/{userID}/roles/{rankID}", rankH.AssignRank)
		r.Delete("/api/hubs/{hubID}/members/{userID}/roles", rankH.RemoveRank)

		r.Get("/api/hubs/{hubID}/emojis", customH.ListEmojis)
		r.Get("/api/hubs/{hubID}/stickers", customH.ListStickers)
		r.Get("/api/hubs/{hubID}/sounds", customH.ListSounds)
		r.Get("/api/discord/templates/preview", hubH.PreviewDiscordTemplate)

		r.Get("/api/invites/{code}", hubH.GetInviteInfo)
		r.Post("/api/invites/{code}", hubH.JoinViaInvite)

		r.Post("/api/hubs/{hubID}/streams", streamH.Create)
		r.Get("/api/hubs/{hubID}/streams", streamH.List)
		r.Get("/api/hubs/{hubID}/read-states", streamH.ReadStates)
		r.Post("/api/hubs/{hubID}/mark-read", streamH.MarkHubRead)
		r.Get("/api/hubs/{hubID}/notification-settings", hubH.GetNotificationSettings)
		r.Patch("/api/hubs/{hubID}/notification-settings", hubH.PatchNotificationSettings)

		r.Post("/api/hubs/{hubID}/categories", catH.Create)
		r.Get("/api/hubs/{hubID}/categories", catH.List)
		r.Delete("/api/hubs/{hubID}/categories/{categoryID}", catH.Delete)
		r.Patch("/api/hubs/{hubID}/categories/{categoryID}", catH.Patch)
		r.Put("/api/hubs/{hubID}/categories/reorder", catH.Reorder)
		r.Get("/api/streams/{streamID}", streamH.Get)
		r.Patch("/api/streams/{streamID}", streamH.Patch)
		r.Get("/api/streams/{streamID}/permissions", streamH.GetPermissions)
		r.Put("/api/streams/{streamID}/permissions", streamH.PutPermissions)
		r.Get("/api/streams/{streamID}/notification-settings", streamH.GetNotificationSettings)
		r.Patch("/api/streams/{streamID}/notification-settings", streamH.PatchNotificationSettings)
		r.Delete("/api/streams/{streamID}", streamH.Delete)
		r.Put("/api/hubs/{hubID}/streams/reorder", streamH.Reorder)
		r.Put("/api/streams/{streamID}/ack", streamH.Ack)

		r.Get("/api/streams/{streamID}/messages", msgH.List)
		r.Post("/api/streams/{streamID}/messages", msgH.Create)
		r.Get("/api/streams/{streamID}/pins", msgH.ListPinned)
		r.Get("/api/dms/{conversationID}/pins", msgH.ListConversationPinned)
		r.Get("/api/hubs/{hubID}/messages/search", msgH.Search)
		r.Get("/api/dms/{conversationID}/messages/search", msgH.SearchConversation)
		r.Patch("/api/messages/{messageID}", msgH.Update)
		r.Delete("/api/messages/{messageID}", msgH.Delete)
		r.Post("/api/messages/{messageID}/forward", msgH.Forward)
		r.Put("/api/messages/{messageID}/pin", msgH.Pin)
		r.Delete("/api/messages/{messageID}/pin", msgH.Unpin)

		r.Post("/api/messages/{messageID}/reactions", msgH.AddReaction)
		r.Delete("/api/messages/{messageID}/reactions/{emoji}", msgH.RemoveReaction)

		r.Get("/api/voice/token", voiceH.Token)
		r.Get("/api/hubs/{hubID}/voice-states", voiceH.States)
		r.Post("/api/hubs/{hubID}/voice/move", voiceH.MoveUser)
		r.Post("/api/hubs/{hubID}/voice/disconnect", voiceH.DisconnectUser)
		r.Post("/api/hubs/{hubID}/sounds/{soundID}/play", voiceH.PlaySound)

		if deps.UploadHandler != nil {
			r.Post("/api/upload", deps.UploadHandler.Upload)
		}

		r.Get("/api/notifications", notifH.List)
		r.Patch("/api/notifications/{notifID}/read", notifH.MarkRead)
		r.Post("/api/notifications/read-all", notifH.MarkAllRead)

		r.Get("/api/friends", friendH.List)
		r.Post("/api/friends/request", friendH.SendRequest)
		r.Get("/api/friends/pending/incoming", friendH.PendingIncoming)
		r.Get("/api/friends/pending/outgoing", friendH.PendingOutgoing)
		r.Get("/api/friends/pending/count", friendH.CountPending)
		r.Post("/api/friends/{userID}/accept", friendH.Accept)
		r.Post("/api/friends/{userID}/reject", friendH.Reject)
		r.Post("/api/friends/{userID}/cancel", friendH.Cancel)
		r.Delete("/api/friends/{userID}", friendH.Remove)
		r.Get("/api/relationships/{userID}", friendH.Relationship)
		r.Post("/api/blocks", friendH.Block)
		r.Delete("/api/blocks/{userID}", friendH.Unblock)
		r.Get("/api/blocks", friendH.ListBlocked)

		r.Get("/api/dms", dmH.List)
		r.Post("/api/dms", dmH.CreateOrOpen)
		r.Post("/api/dms/groups", dmH.CreateOrOpenGroup)
		r.Get("/api/dms/call-states", dmH.ListCallStates)
		r.Get("/api/dms/read-states", dmH.DMReadStates)
		r.Patch("/api/dms/{conversationID}", dmH.PatchConversation)
		r.Post("/api/dms/{conversationID}/members", dmH.AddMembers)
		r.Delete("/api/dms/{conversationID}/members/{userID}", dmH.RemoveMember)
		r.Post("/api/dms/{conversationID}/leave", dmH.LeaveConversation)
		r.Post("/api/dms/{conversationID}/call/ring", dmH.StartCallRing)
		r.Post("/api/dms/{conversationID}/call/ring/cancel", dmH.CancelCallRing)
		r.Get("/api/dms/{conversationID}/messages", dmH.Messages)
		r.Post("/api/dms/{conversationID}/messages", dmH.SendMessage)
		r.Put("/api/dms/{conversationID}/ack", dmH.AckDM)

		if devH != nil {
			r.Get("/api/developers/me", devH.GetMe)
			r.Post("/api/developers/applications", devH.CreateApplication)
			r.Get("/api/developers/applications", devH.ListApplications)
			r.Get("/api/developers/applications/{appID}", devH.GetApplication)
			r.Patch("/api/developers/applications/{appID}", devH.UpdateApplication)
			r.Delete("/api/developers/applications/{appID}", devH.DeleteApplication)
			r.Post("/api/developers/applications/{appID}/bot/reset-token", devH.ResetBotToken)
			r.Get("/api/developers/applications/{appID}/bot", devH.GetBotSettings)
			r.Patch("/api/developers/applications/{appID}/bot", devH.UpdateBotSettings)
			r.Post("/api/developers/applications/{appID}/oauth2/redirects", devH.CreateOAuth2Redirect)
			r.Get("/api/developers/applications/{appID}/oauth2/redirects", devH.ListOAuth2Redirects)
			r.Delete("/api/developers/applications/{appID}/oauth2/redirects/{redirectID}", devH.DeleteOAuth2Redirect)
			r.Post("/api/developers/applications/{appID}/emojis", devH.CreateAppEmoji)
			r.Get("/api/developers/applications/{appID}/emojis", devH.ListAppEmojis)
			r.Delete("/api/developers/applications/{appID}/emojis/{emojiID}", devH.DeleteAppEmoji)
			r.Post("/api/developers/applications/{appID}/webhooks", devH.CreateAppWebhook)
			r.Get("/api/developers/applications/{appID}/webhooks", devH.ListAppWebhooks)
			r.Delete("/api/developers/applications/{appID}/webhooks/{webhookID}", devH.DeleteAppWebhook)
			r.Post("/api/developers/applications/{appID}/testers", devH.AddAppTester)
			r.Get("/api/developers/applications/{appID}/testers", devH.ListAppTesters)
			r.Delete("/api/developers/applications/{appID}/testers/{userID}", devH.RemoveAppTester)
			r.Post("/api/developers/applications/{appID}/rich-presence/assets", devH.CreateRichPresenceAsset)
			r.Get("/api/developers/applications/{appID}/rich-presence/assets", devH.ListRichPresenceAssets)
			r.Delete("/api/developers/applications/{appID}/rich-presence/assets/{assetID}", devH.DeleteRichPresenceAsset)
			r.Post("/api/developers/import-discord", devH.ImportDiscordBot)
			r.Post("/api/developers/applications/{appID}/add-to-hub", devH.AddBotToHub)
		}

		if reportH != nil {
			r.Post("/api/reports", reportH.CreateReport)
		}

		if hubModH != nil {
			r.Get("/api/hubs/{hubID}/automod", hubModH.GetAutoModSettings)
			r.Put("/api/hubs/{hubID}/automod", hubModH.UpdateAutoModSettings)
			r.Get("/api/hubs/{hubID}/bans", hubModH.ListBans)
			r.Post("/api/hubs/{hubID}/bans/{userID}", hubModH.BanMember)
			r.Delete("/api/hubs/{hubID}/bans/{userID}", hubModH.UnbanMember)
		}

		if deviceTokenH != nil {
			r.Post("/api/device-tokens", deviceTokenH.Register)
			r.Delete("/api/device-tokens", deviceTokenH.Unregister)
		}
	})

	// Customization write routes — tighter rate limit (5 req / 10s to prevent abuse).
	customWriteRL := middleware.NewRateLimiter(rate.Every(10*time.Second), 5)
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(deps.AuthService))
		if deps.UserRepo != nil {
			r.Use(middleware.BanCheck(deps.UserRepo))
		}
		r.Use(middleware.RateLimit(customWriteRL))

		r.Post("/api/hubs/{hubID}/emojis", customH.CreateEmoji)
		r.Delete("/api/hubs/{hubID}/emojis/{emojiID}", customH.DeleteEmoji)
		r.Post("/api/hubs/{hubID}/stickers", customH.CreateSticker)
		r.Delete("/api/hubs/{hubID}/stickers/{stickerID}", customH.DeleteSticker)
		r.Post("/api/hubs/{hubID}/sounds", customH.CreateSound)
		r.Delete("/api/hubs/{hubID}/sounds/{soundID}", customH.DeleteSound)
	})

	// Discord-compatible REST API (v9/v10) for bot libraries
	if deps.DeveloperService != nil && deps.DeveloperRepo != nil && deps.HubService != nil && deps.HubRepo != nil && deps.StreamService != nil && deps.StreamRepo != nil && deps.MsgService != nil && deps.MsgRepo != nil && deps.RankRepo != nil {
		dcH := NewDiscordCompatHandler(DiscordCompatDeps{
			DevSvc:     deps.DeveloperService,
			HubSvc:     deps.HubService,
			StreamSvc:  deps.StreamService,
			MsgSvc:     deps.MsgService,
			HubRepo:    deps.HubRepo,
			StreamRepo: deps.StreamRepo,
			MsgRepo:    deps.MsgRepo,
			RankRepo:   deps.RankRepo,
			DevRepo:    deps.DeveloperRepo,
			BaseURL:    "",
		})
		gwH := NewDiscordGatewayHandler(
			deps.DeveloperService,
			deps.DeveloperRepo,
			deps.HubService,
			deps.StreamService,
			deps.RankRepo,
			deps.Config.AllowedOrigins,
		)

		r.Get("/gateway/", gwH.Handle)
		r.Get("/gateway", gwH.Handle)

		mountDiscordRoutes := func(prefix string) {
			r.Route(prefix, func(r chi.Router) {
				r.Get("/gateway", dcH.GetGateway)
				r.Group(func(r chi.Router) {
					r.Use(dcH.AuthMiddleware)
					r.Get("/gateway/bot", dcH.GetGatewayBot)
					r.Get("/applications/@me", dcH.GetApplicationMe)
					r.Get("/users/@me", dcH.GetUserMe)
					r.Get("/users/{userID}", dcH.GetUser)
					r.Get("/guilds/{guildID}", dcH.GetGuild)
					r.Get("/guilds/{guildID}/channels", dcH.GetGuildChannels)
					r.Get("/guilds/{guildID}/members", dcH.GetGuildMembers)
					r.Get("/guilds/{guildID}/members/{userID}", dcH.GetGuildMember)
					r.Get("/guilds/{guildID}/roles", dcH.GetGuildRoles)
					r.Get("/channels/{channelID}", dcH.GetChannel)
					r.Get("/channels/{channelID}/messages", dcH.GetChannelMessages)
					r.Post("/channels/{channelID}/messages", dcH.CreateChannelMessage)
					r.Get("/channels/{channelID}/messages/{messageID}", dcH.GetChannelMessage)
					r.Delete("/channels/{channelID}/messages/{messageID}", dcH.DeleteChannelMessage)
				})
			})
		}
		mountDiscordRoutes("/api/v10")
		mountDiscordRoutes("/api/v9")
	}

	// --- Super Admin Panel ---
	if deps.AdminService != nil {
		adminAuthH := NewAdminAuthHandler(deps.AdminService)
		adminH := NewAdminHandler(deps.AdminService, deps.SMTPService, deps.DBPool, deps.WSHub, deps.ModerationService)

		adminAuthRL := middleware.NewRateLimiter(rate.Every(3*time.Second), 5)
		r.Route("/api/admin/auth", func(r chi.Router) {
			r.Use(middleware.RateLimit(adminAuthRL))
			r.Post("/login", adminAuthH.Login)
			r.Post("/verify-2fa", adminAuthH.Verify2FA)
			r.Post("/setup-totp", adminAuthH.SetupTOTP)
			r.Post("/confirm-totp", adminAuthH.ConfirmTOTP)
			r.Post("/set-password", adminAuthH.SetPassword)
		})

		// Authenticated admin logout + me
		r.Group(func(r chi.Router) {
			r.Use(admin.RequireAdmin(deps.AdminService, admin.RoleModerator))
			r.Post("/api/admin/auth/logout", adminAuthH.Logout)
			r.Get("/api/admin/auth/me", adminAuthH.GetMe)
		})

		// Moderator+ routes
		r.Group(func(r chi.Router) {
			r.Use(admin.RequireAdmin(deps.AdminService, admin.RoleModerator))
			r.Get("/api/admin/users", adminH.ListUsers)
			r.Get("/api/admin/users/{userID}", adminH.GetUser)
			r.Get("/api/admin/analytics", adminH.Analytics)

			if reportH != nil {
				r.Get("/api/admin/reports", reportH.ListReports)
				r.Get("/api/admin/reports/{reportID}", reportH.GetReport)
				r.Patch("/api/admin/reports/{reportID}", reportH.UpdateReport)
				r.Post("/api/admin/reports/{reportID}/action", reportH.TakeAction)
				r.Get("/api/admin/moderation/stats", reportH.Stats)
			}
		})

		// Admin+ routes
		r.Group(func(r chi.Router) {
			r.Use(admin.RequireAdmin(deps.AdminService, admin.RoleAdmin))
			r.Patch("/api/admin/users/{userID}", adminH.EditUser)
			r.Post("/api/admin/users/{userID}/ban", adminH.BanUser)
			r.Delete("/api/admin/users/{userID}/ban", adminH.UnbanUser)
			r.Get("/api/admin/hubs", adminH.ListHubs)
			r.Get("/api/admin/hubs/{hubID}", adminH.GetHub)
			r.Get("/api/admin/sessions/users", adminH.ListUserSessions)
			r.Delete("/api/admin/sessions/{sessionID}", adminH.RevokeSession)
			r.Get("/api/admin/status", adminH.Status)
		})

		// Super admin routes
		r.Group(func(r chi.Router) {
			r.Use(admin.RequireAdmin(deps.AdminService, admin.RoleSuperAdmin))
			r.Delete("/api/admin/hubs/{hubID}", adminH.DeleteHub)
			r.Get("/api/admin/sessions/admin", adminH.ListAdminSessions)
			r.Get("/api/admin/smtp", adminH.GetSMTPConfig)
			r.Put("/api/admin/smtp", adminH.UpdateSMTPConfig)
			r.Post("/api/admin/smtp/test", adminH.SendTestEmail)
			r.Get("/api/admin/accounts", adminH.ListAccounts)
			r.Post("/api/admin/accounts", adminH.CreateAccount)
			r.Patch("/api/admin/accounts/{accountID}", adminH.UpdateAccount)
			r.Delete("/api/admin/accounts/{accountID}", adminH.DeleteAccount)
			r.Post("/api/admin/accounts/{accountID}/reset-totp", adminH.ResetAccountTOTP)
		})
	}

	return r
}
