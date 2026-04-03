package api

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"

	"github.com/riptide-cloud/riptide/internal/auth"
	wsHub "github.com/riptide-cloud/riptide/internal/ws"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // TODO: restrict in production
	},
}

type WSHandler struct {
	hub         *wsHub.Hub
	authService *auth.Service
}

func NewWSHandler(hub *wsHub.Hub, authService *auth.Service) *WSHandler {
	return &WSHandler{hub: hub, authService: authService}
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

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	client := wsHub.NewClient(h.hub, conn, claims.UserID)
	h.hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}
