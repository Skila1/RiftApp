package api

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"golang.org/x/time/rate"

	"github.com/riftapp-cloud/riftapp/internal/auth"
	"github.com/riftapp-cloud/riftapp/internal/config"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/user"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type RouterDeps struct {
	AuthService     *auth.Service
	UserService     *user.Service
	HubService      *service.HubService
	StreamService   *service.StreamService
	CategoryService *service.CategoryService
	MsgService      *service.MessageService
	DMService       *service.DMService
	NotifService    *service.NotificationService
	FriendService   *service.FriendService
	WSHub           *ws.Hub
	Config          *config.Config
	UploadHandler   *UploadHandler
	NotifRepo       *repository.NotificationRepo
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
	userH := NewUserHandler(deps.UserService)
	hubH := NewHubHandler(deps.HubService, deps.NotifService, deps.NotifRepo)
	streamH := NewStreamHandler(deps.StreamService)
	catH := NewCategoryHandler(deps.CategoryService)
	msgH := NewMessageHandler(deps.MsgService)
	wsH := NewWSHandler(deps.WSHub, deps.AuthService, deps.Config.AllowedOrigins)
	voiceH := NewVoiceHandler(deps.Config, deps.HubService, deps.WSHub)
	notifH := NewNotifHandler(deps.NotifService)
	dmH := NewDMHandler(deps.DMService)
	friendH := NewFriendHandler(deps.FriendService)

	r.Get("/ws", wsH.Handle)

	// Reverse proxy for S3/MinIO assets (avatars, attachments)
	if s3Target, err := url.Parse(deps.Config.S3Endpoint); err == nil {
		s3Proxy := httputil.NewSingleHostReverseProxy(s3Target)
		r.Handle("/s3/*", http.StripPrefix("/s3", s3Proxy))
		// Same proxy under /api/s3 so the SPA can load media via the API path (same-origin as /api).
		r.Handle("/api/s3/*", http.StripPrefix("/api/s3", s3Proxy))
	}

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	publicRL := middleware.NewRateLimiter(rate.Every(12*time.Second), 5)
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
		r.Use(middleware.RateLimit(authRL))

		r.Get("/api/users/@me", userH.GetMe)
		r.Patch("/api/users/@me", userH.UpdateMe)
		r.Get("/api/users/search", userH.SearchUser)
		r.Get("/api/users/{userID}", userH.GetUser)

		r.Post("/api/hubs", hubH.Create)
		r.Get("/api/hubs", hubH.List)
		r.Get("/api/hubs/{hubID}", hubH.Get)
		r.Patch("/api/hubs/{hubID}", hubH.Update)
		r.Delete("/api/hubs/{hubID}", hubH.Delete)
		r.Post("/api/hubs/{hubID}/join", hubH.Join)
		r.Post("/api/hubs/{hubID}/leave", hubH.Leave)
		r.Get("/api/hubs/{hubID}/members", hubH.Members)
		r.Post("/api/hubs/{hubID}/invite", hubH.CreateInvite)

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
		r.Get("/api/streams/{streamID}", streamH.Get)
		r.Patch("/api/streams/{streamID}", streamH.Patch)
		r.Delete("/api/streams/{streamID}", streamH.Delete)
		r.Put("/api/streams/{streamID}/ack", streamH.Ack)

		r.Get("/api/streams/{streamID}/messages", msgH.List)
		r.Post("/api/streams/{streamID}/messages", msgH.Create)
		r.Patch("/api/messages/{messageID}", msgH.Update)
		r.Delete("/api/messages/{messageID}", msgH.Delete)

		r.Post("/api/messages/{messageID}/reactions", msgH.AddReaction)
		r.Delete("/api/messages/{messageID}/reactions/{emoji}", msgH.RemoveReaction)

		r.Get("/api/voice/token", voiceH.Token)
		r.Get("/api/hubs/{hubID}/voice-states", voiceH.States)

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
		r.Get("/api/dms/read-states", dmH.DMReadStates)
		r.Get("/api/dms/{conversationID}/messages", dmH.Messages)
		r.Post("/api/dms/{conversationID}/messages", dmH.SendMessage)
		r.Put("/api/dms/{conversationID}/ack", dmH.AckDM)
	})

	return r
}
