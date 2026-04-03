package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/livekit/protocol/auth"

	"github.com/riptide-cloud/riptide/internal/config"
	"github.com/riptide-cloud/riptide/internal/middleware"
	"github.com/riptide-cloud/riptide/internal/service"
)

type VoiceHandler struct {
	cfg    *config.Config
	hubSvc *service.HubService
}

func NewVoiceHandler(cfg *config.Config, hubSvc *service.HubService) *VoiceHandler {
	return &VoiceHandler{cfg: cfg, hubSvc: hubSvc}
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
		publicURL = h.cfg.LiveKitHost
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"token": token,
		"url":   publicURL,
		"room":  roomName,
	})
}
