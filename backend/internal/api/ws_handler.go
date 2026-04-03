package api

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"

	"github.com/riptide-cloud/riptide/internal/auth"
	wsHub "github.com/riptide-cloud/riptide/internal/ws"
)

type WSHandler struct {
	hub            *wsHub.Hub
	authService    *auth.Service
	upgrader       websocket.Upgrader
}

func NewWSHandler(hub *wsHub.Hub, authService *auth.Service, allowedOrigins []string) *WSHandler {
	originSet := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		originSet[o] = true
	}
	return &WSHandler{
		hub:         hub,
		authService: authService,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				return originSet[origin]
			},
		},
	}
}

func (h *WSHandler) Handle(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	claims, err := h.authService.ValidateToken(token)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	client := wsHub.NewClient(h.hub, conn, claims.UserID, wsHub.GenerateSessionID())
	h.hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}
