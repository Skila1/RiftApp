package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type StreamHandler struct {
	svc *service.StreamService
}

func NewStreamHandler(svc *service.StreamService) *StreamHandler {
	return &StreamHandler{svc: svc}
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
	writeJSON(w, http.StatusCreated, stream)
}

func (h *StreamHandler) List(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	streams, err := h.svc.List(r.Context(), hubID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, streams)
}

func (h *StreamHandler) Get(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	stream, err := h.svc.Get(r.Context(), streamID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stream)
}

func (h *StreamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Delete(r.Context(), streamID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *StreamHandler) Patch(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name *string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == nil {
		writeError(w, http.StatusBadRequest, "no fields to update")
		return
	}
	stream, err := h.svc.Patch(r.Context(), streamID, userID, body.Name)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stream)
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
	writeJSON(w, http.StatusOK, states)
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
