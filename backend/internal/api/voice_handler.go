package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/livekit/protocol/auth"

	"github.com/riftapp-cloud/riftapp/internal/config"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type VoiceHandler struct {
	cfg    *config.Config
	hubSvc *service.HubService
	hub    *ws.Hub
}

func NewVoiceHandler(cfg *config.Config, hubSvc *service.HubService, hub *ws.Hub) *VoiceHandler {
	return &VoiceHandler{cfg: cfg, hubSvc: hubSvc, hub: hub}
}

func (h *VoiceHandler) Token(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	streamID := r.URL.Query().Get("streamID")
	if streamID == "" {
		streamID = chi.URLParam(r, "streamID")
	}
	if streamID == "" {
		writeError(w, http.StatusBadRequest, "streamID is required")
		return
	}

	hubID, err := h.hubSvc.GetStreamHubID(r.Context(), streamID, userID)
	if err != nil {
		writeError(w, http.StatusForbidden, "stream not found or access denied")
		return
	}
	_ = hubID

	roomName := "stream:" + streamID

	at := auth.NewAccessToken(h.cfg.LiveKitKey, h.cfg.LiveKitSecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     roomName,
	}
	at.SetVideoGrant(grant).
		SetIdentity(userID).
		SetValidFor(1 * time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate voice token")
		return
	}

	publicURL := h.cfg.LiveKitURL
	if publicURL == "" {
		writeError(w, http.StatusInternalServerError, "LIVEKIT_URL not configured")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"token": token,
		"url":   publicURL,
		"room":  roomName,
	})
}

func (h *VoiceHandler) States(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	if hubID == "" {
		writeError(w, http.StatusBadRequest, "hubID is required")
		return
	}

	states := h.hub.GetVoiceStates(hubID)
	if states == nil {
		states = make(map[string][]string)
	}
	writeJSON(w, http.StatusOK, states)
}
