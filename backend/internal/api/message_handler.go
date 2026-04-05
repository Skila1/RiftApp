package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type MessageHandler struct {
	svc *service.MessageService
}

func NewMessageHandler(svc *service.MessageService) *MessageHandler {
	return &MessageHandler{svc: svc}
}

func (h *MessageHandler) List(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	limit := parseLimit(r)
	var before *string
	if b := r.URL.Query().Get("before"); b != "" {
		before = &b
	}
	messages, err := h.svc.List(r.Context(), streamID, before, limit)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, messages)
}

func (h *MessageHandler) Create(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamID")
	userID := middleware.GetUserID(r.Context())
	var input service.CreateMessageInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	msg, err := h.svc.Create(r.Context(), userID, streamID, input)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, msg)
}

func (h *MessageHandler) Update(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Content string `json:"content"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	msg, err := h.svc.Update(r.Context(), msgID, userID, body.Content)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, msg)
}

func (h *MessageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Delete(r.Context(), msgID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *MessageHandler) AddReaction(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Emoji string `json:"emoji"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if _, err := h.svc.ToggleReaction(r.Context(), msgID, userID, body.Emoji); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *MessageHandler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	emoji := chi.URLParam(r, "emoji")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.RemoveReaction(r.Context(), msgID, userID, emoji); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
