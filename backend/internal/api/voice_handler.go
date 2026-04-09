package api

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/livekit/protocol/auth"

	"github.com/riftapp-cloud/riftapp/internal/config"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type VoiceHandler struct {
	cfg        *config.Config
	hubSvc     *service.HubService
	streamSvc  *service.StreamService
	hub        *ws.Hub
	customRepo *repository.HubCustomizationRepo
	// Per-user soundboard rate limiter: userID -> last play timestamps
	sbMu       sync.Mutex
	sbLastPlay map[string][]time.Time
}

const (
	soundboardMaxPlays = 3
	soundboardWindow   = 5 * time.Second
)

func NewVoiceHandler(cfg *config.Config, hubSvc *service.HubService, streamSvc *service.StreamService, hub *ws.Hub, customRepo *repository.HubCustomizationRepo) *VoiceHandler {
	return &VoiceHandler{
		cfg:        cfg,
		hubSvc:     hubSvc,
		streamSvc:  streamSvc,
		hub:        hub,
		customRepo: customRepo,
		sbLastPlay: make(map[string][]time.Time),
	}
}

type moveVoiceUserInput struct {
	UserID         string `json:"user_id"`
	TargetStreamID string `json:"target_stream_id"`
}

type disconnectVoiceUserInput struct {
	UserID string `json:"user_id"`
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

	stream, err := h.hubSvc.GetStreamForMember(r.Context(), streamID, userID)
	if err != nil {
		writeError(w, http.StatusForbidden, "stream not found or access denied")
		return
	}
	if stream.Type != 1 {
		writeError(w, http.StatusBadRequest, "stream is not a voice channel")
		return
	}
	forcedAdmission := h.hub.GetUserVoiceStreamID(userID) == streamID
	if !h.hubSvc.HasStreamPermission(r.Context(), streamID, userID, models.PermConnectVoice) && !forcedAdmission {
		writeError(w, http.StatusForbidden, "you do not have permission to connect to voice")
		return
	}

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

	writeData(w, http.StatusOK, map[string]string{
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

	userID := middleware.GetUserID(r.Context())
	visible, err := h.hubSvc.GetVisibleStreamIDSet(r.Context(), hubID, userID)
	if err != nil {
		writeError(w, http.StatusForbidden, "hub not found or access denied")
		return
	}
	states := h.hub.GetVoiceStates(hubID)
	if states == nil {
		states = make(map[string][]string)
	}
	for streamID := range states {
		if _, ok := visible[streamID]; !ok {
			delete(states, streamID)
		}
	}
	writeData(w, http.StatusOK, states)
}

func (h *VoiceHandler) MoveUser(w http.ResponseWriter, r *http.Request) {
	requesterID := middleware.GetUserID(r.Context())
	hubID := chi.URLParam(r, "hubID")
	if hubID == "" {
		writeError(w, http.StatusBadRequest, "hubID is required")
		return
	}
	if !h.canModerateVoice(r.Context(), hubID, requesterID) {
		writeError(w, http.StatusForbidden, "you do not have permission to move voice users")
		return
	}

	var input moveVoiceUserInput
	if err := readJSON(r, &input); err != nil || input.UserID == "" || input.TargetStreamID == "" {
		writeError(w, http.StatusBadRequest, "user_id and target_stream_id are required")
		return
	}

	targetHubID, err := h.hubSvc.GetStreamHubID(r.Context(), input.TargetStreamID, requesterID)
	if err != nil || targetHubID != hubID {
		writeError(w, http.StatusBadRequest, "target stream is invalid")
		return
	}
	targetStream, err := h.streamSvc.Get(r.Context(), input.TargetStreamID, requesterID)
	if err != nil || targetStream.Type != 1 {
		writeError(w, http.StatusBadRequest, "target stream must be a voice channel")
		return
	}

	currentStreamID := h.hub.GetUserVoiceStreamID(input.UserID)
	if currentStreamID == "" {
		writeError(w, http.StatusBadRequest, "user is not connected to voice")
		return
	}
	currentHubID, err := h.hubSvc.GetStreamHubID(r.Context(), currentStreamID, requesterID)
	if err != nil || currentHubID != hubID {
		writeError(w, http.StatusBadRequest, "user is not connected to voice in this hub")
		return
	}
	if currentStreamID == input.TargetStreamID {
		writeData(w, http.StatusOK, map[string]string{"status": "noop"})
		return
	}

	if _, changed := h.hub.MoveUserToVoiceStream(input.UserID, input.TargetStreamID); !changed {
		writeData(w, http.StatusOK, map[string]string{"status": "noop"})
		return
	}
	h.hub.SendToUser(input.UserID, ws.NewEvent(ws.OpVoiceMove, ws.VoiceMoveData{StreamID: input.TargetStreamID}))

	writeData(w, http.StatusOK, map[string]string{"status": "moved"})
}

func (h *VoiceHandler) DisconnectUser(w http.ResponseWriter, r *http.Request) {
	requesterID := middleware.GetUserID(r.Context())
	hubID := chi.URLParam(r, "hubID")
	if hubID == "" {
		writeError(w, http.StatusBadRequest, "hubID is required")
		return
	}
	if !h.canModerateVoice(r.Context(), hubID, requesterID) {
		writeError(w, http.StatusForbidden, "you do not have permission to disconnect voice users")
		return
	}

	var input disconnectVoiceUserInput
	if err := readJSON(r, &input); err != nil || input.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id is required")
		return
	}

	currentStreamID := h.hub.GetUserVoiceStreamID(input.UserID)
	if currentStreamID == "" {
		writeError(w, http.StatusBadRequest, "user is not connected to voice")
		return
	}
	currentHubID, err := h.hubSvc.GetStreamHubID(r.Context(), currentStreamID, requesterID)
	if err != nil || currentHubID != hubID {
		writeError(w, http.StatusBadRequest, "user is not connected to voice in this hub")
		return
	}

	if _, changed := h.hub.DisconnectUserFromVoice(input.UserID); !changed {
		writeData(w, http.StatusOK, map[string]string{"status": "noop"})
		return
	}
	h.hub.SendToUser(input.UserID, ws.NewEvent(ws.OpVoiceDisconnect, nil))

	writeData(w, http.StatusOK, map[string]string{"status": "disconnected"})
}

func (h *VoiceHandler) PlaySound(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	hubID := chi.URLParam(r, "hubID")
	soundID := chi.URLParam(r, "soundID")

	if hubID == "" || soundID == "" {
		writeError(w, http.StatusBadRequest, "hubID and soundID are required")
		return
	}

	// Rate limit: max 3 plays per 5 seconds per user
	if !h.soundboardAllow(userID) {
		writeError(w, http.StatusTooManyRequests, "soundboard rate limit exceeded, try again shortly")
		return
	}

	// Verify user is in a voice channel for this hub
	streamID := h.hub.GetUserVoiceStreamID(userID)
	if streamID == "" {
		writeError(w, http.StatusBadRequest, "you must be in a voice channel to play sounds")
		return
	}
	currentHubID, err := h.hubSvc.GetStreamHubID(r.Context(), streamID, userID)
	if err != nil || currentHubID != hubID {
		writeError(w, http.StatusBadRequest, "you must be in a voice channel for this hub")
		return
	}
	if !h.hubSvc.HasStreamPermission(r.Context(), streamID, userID, models.PermUseSoundboard) {
		writeError(w, http.StatusForbidden, "you do not have permission to use soundboard")
		return
	}

	// Fetch the sound
	sound, err := h.customRepo.GetSound(r.Context(), hubID, soundID)
	if err != nil {
		writeError(w, http.StatusNotFound, "sound not found")
		return
	}

	// Broadcast soundboard_play event to all users in the voice channel
	evt := ws.NewEvent(ws.OpSoundboardPlay, map[string]string{
		"stream_id": streamID,
		"sound_id":  sound.ID,
		"name":      sound.Name,
		"file_url":  sound.FileURL,
		"user_id":   userID,
	})
	h.hub.BroadcastToVoiceChannel(streamID, evt)

	writeData(w, http.StatusOK, map[string]string{"status": "playing"})
}

func (h *VoiceHandler) soundboardAllow(userID string) bool {
	h.sbMu.Lock()
	defer h.sbMu.Unlock()

	now := time.Now()
	cutoff := now.Add(-soundboardWindow)

	// Filter out old timestamps
	timestamps := h.sbLastPlay[userID]
	filtered := timestamps[:0]
	for _, t := range timestamps {
		if t.After(cutoff) {
			filtered = append(filtered, t)
		}
	}

	if len(filtered) >= soundboardMaxPlays {
		h.sbLastPlay[userID] = filtered
		return false
	}

	h.sbLastPlay[userID] = append(filtered, now)
	return true
}

func (h *VoiceHandler) canModerateVoice(ctx context.Context, hubID, userID string) bool {
	return h.hubSvc.HasPermission(ctx, hubID, userID, models.PermKickMembers) ||
		h.hubSvc.HasPermission(ctx, hubID, userID, models.PermManageStreams) ||
		h.hubSvc.HasPermission(ctx, hubID, userID, models.PermManageHub)
}
