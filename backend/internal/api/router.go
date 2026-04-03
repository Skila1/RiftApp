package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riptide-cloud/riptide/internal/auth"
	"github.com/riptide-cloud/riptide/internal/config"
	"github.com/riptide-cloud/riptide/internal/middleware"
	"github.com/riptide-cloud/riptide/internal/user"
	"github.com/riptide-cloud/riptide/internal/ws"
)

func NewRouter(db *pgxpool.Pool, authService *auth.Service, userService *user.Service, wsHub *ws.Hub, cfg *config.Config, uploadH *UploadHandler) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(chiMiddleware.RealIP)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Handlers
	authH := NewAuthHandler(authService)
	userH := NewUserHandler(userService)
	hubH := NewHubHandler(db)
	streamH := NewStreamHandler(db)
	msgH := NewMessageHandler(db, wsHub)
	wsH := NewWSHandler(wsHub, authService)
	voiceH := NewVoiceHandler(cfg, db)
	notifH := NewNotifHandler(db, wsHub)
	dmH := NewDMHandler(db, wsHub)

	// Inject notifHandler into message + hub + dm handlers for triggering notifications
	msgH.notifH = notifH
	hubH.notifH = notifH
	dmH.notifH = notifH

	// WebSocket
	r.Get("/ws", wsH.Handle)

	// Health check (unauthenticated, for Docker/orchestrator probes)
	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Public auth routes
	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", authH.Register)
		r.Post("/login", authH.Login)
		r.Post("/refresh", authH.Refresh)
	})

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(authService))

		// User profile
		r.Get("/api/users/@me", userH.GetMe)
		r.Patch("/api/users/@me", userH.UpdateMe)
		r.Get("/api/users/search", userH.SearchUser)
		r.Get("/api/users/{userID}", userH.GetUser)

		// Hubs
		r.Post("/api/hubs", hubH.Create)
		r.Get("/api/hubs", hubH.List)
		r.Get("/api/hubs/{hubID}", hubH.Get)
		r.Patch("/api/hubs/{hubID}", hubH.Update)
		r.Post("/api/hubs/{hubID}/join", hubH.Join)
		r.Post("/api/hubs/{hubID}/leave", hubH.Leave)
		r.Get("/api/hubs/{hubID}/members", hubH.Members)
		r.Post("/api/hubs/{hubID}/invite", hubH.CreateInvite)

		// Invites
		r.Post("/api/invites/{code}", hubH.JoinViaInvite)

		// Streams
		r.Post("/api/hubs/{hubID}/streams", streamH.Create)
		r.Get("/api/hubs/{hubID}/streams", streamH.List)
		r.Get("/api/hubs/{hubID}/read-states", streamH.ReadStates)
		r.Get("/api/streams/{streamID}", streamH.Get)
		r.Delete("/api/streams/{streamID}", streamH.Delete)
		r.Put("/api/streams/{streamID}/ack", streamH.Ack)

		// Messages
		r.Get("/api/streams/{streamID}/messages", msgH.List)
		r.Post("/api/streams/{streamID}/messages", msgH.Create)
		r.Patch("/api/messages/{messageID}", msgH.Update)
		r.Delete("/api/messages/{messageID}", msgH.Delete)

		// Reactions
		r.Post("/api/messages/{messageID}/reactions", msgH.AddReaction)
		r.Delete("/api/messages/{messageID}/reactions/{emoji}", msgH.RemoveReaction)

		// Voice
		r.Get("/api/voice/token", voiceH.Token)

		// Uploads
		r.Post("/api/upload", uploadH.Upload)

		// Notifications
		r.Get("/api/notifications", notifH.List)
		r.Patch("/api/notifications/{notifID}/read", notifH.MarkRead)
		r.Post("/api/notifications/read-all", notifH.MarkAllRead)

		// Direct Messages
		r.Get("/api/dms", dmH.List)
		r.Post("/api/dms", dmH.CreateOrOpen)
		r.Get("/api/dms/read-states", dmH.DMReadStates)
		r.Get("/api/dms/{conversationID}/messages", dmH.Messages)
		r.Post("/api/dms/{conversationID}/messages", dmH.SendMessage)
		r.Put("/api/dms/{conversationID}/ack", dmH.AckDM)
	})

	return r
}
