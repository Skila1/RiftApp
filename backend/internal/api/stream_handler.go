package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type StreamHandler struct {
	svc *service.StreamService
	hub *ws.Hub
}

func NewStreamHandler(svc *service.StreamService, hub *ws.Hub) *StreamHandler {
	return &StreamHandler{svc: svc, hub: hub}
}

func (h *StreamHandler) broadcastStreamUpdate(hubID string) {
	if h.hub == nil || hubID == "" {
		return
	}
	h.hub.RefreshHubSubscriptions(hubID)
	h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpStreamUpdate, map[string]string{"hub_id": hubID}))
}

func (h *StreamHandler) Create(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name       string  `json:"name"`
		Type       int     `json:"type"`
		IsPrivate  bool    `json:"is_private"`
		CategoryID *string `json:"category_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	stream, err := h.svc.Create(r.Context(), hubID, userID, body.Name, body.Type, body.IsPrivate, body.CategoryID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	h.broadcastStreamUpdate(hubID)
	writeData(w, http.StatusCreated, stream)
}

func (h *StreamHandler) List(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	streams, err := h.svc.List(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, streams)
}

func (h *StreamHandler) Get(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	stream, err := h.svc.Get(r.Context(), streamID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, stream)
}

func (h *StreamHandler) GetPermissions(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	overwrites, err := h.svc.GetPermissions(r.Context(), streamID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, map[string]any{"permission_overwrites": overwrites})
}

func (h *StreamHandler) PutPermissions(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		PermissionOverwrites []models.StreamPermissionOverwrite `json:"permission_overwrites"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	overwrites, err := h.svc.UpdatePermissions(r.Context(), streamID, userID, body.PermissionOverwrites)
	if err != nil {
		writeAppError(w, err)
		return
	}
	hubID, _ := h.svc.GetHubID(r.Context(), streamID)
	if hubID != "" {
		h.broadcastStreamUpdate(hubID)
	}
	writeData(w, http.StatusOK, map[string]any{"permission_overwrites": overwrites})
}

func (h *StreamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	hubID, _ := h.svc.GetHubID(r.Context(), streamID)
	if err := h.svc.Delete(r.Context(), streamID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	if hubID != "" {
		if h.hub != nil {
			h.hub.DropStreamSubscriptions(streamID)
		}
		h.broadcastStreamUpdate(hubID)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *StreamHandler) Patch(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name      *string `json:"name"`
		Bitrate   *int    `json:"bitrate"`
		UserLimit *int    `json:"user_limit"`
		Region    *string `json:"region"`
		IsPrivate *bool   `json:"is_private"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == nil && body.Bitrate == nil && body.UserLimit == nil && body.Region == nil && body.IsPrivate == nil {
		writeError(w, http.StatusBadRequest, "no fields to update")
		return
	}
	stream, err := h.svc.Patch(r.Context(), streamID, userID, body.Name, body.Bitrate, body.UserLimit, body.Region, body.IsPrivate)
	if err != nil {
		writeAppError(w, err)
		return
	}
	h.broadcastStreamUpdate(stream.HubID)
	writeData(w, http.StatusOK, stream)
}

func (h *StreamHandler) GetNotificationSettings(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	st, err := h.svc.GetNotificationSettings(r.Context(), streamID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, st)
}

func (h *StreamHandler) PatchNotificationSettings(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	var body repository.StreamNotificationSettings
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	st, err := h.svc.UpdateNotificationSettings(r.Context(), streamID, userID, body)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, st)
}

func (h *StreamHandler) Ack(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		MessageID string `json:"message_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.Ack(r.Context(), streamID, userID, body.MessageID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *StreamHandler) ReadStates(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	states, err := h.svc.ReadStates(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, states)
}

func (h *StreamHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Streams []struct {
			ID         string  `json:"id"`
			Position   int     `json:"position"`
			CategoryID *string `json:"category_id"`
		} `json:"streams"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.ReorderStreams(r.Context(), hubID, userID, body.Streams); err != nil {
		writeAppError(w, err)
		return
	}
	h.broadcastStreamUpdate(hubID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *StreamHandler) MarkHubRead(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.MarkAllReadInHub(r.Context(), hubID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseLimit(r *http.Request) int {
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	return limit
}
