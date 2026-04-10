package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type DMHandler struct {
	svc *service.DMService
}

func NewDMHandler(svc *service.DMService) *DMHandler {
	return &DMHandler{svc: svc}
}

func (h *DMHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	convos, err := h.svc.ListConversations(r.Context(), userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, convos)
}

func (h *DMHandler) CreateOrOpen(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		RecipientID string `json:"recipient_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, created, err := h.svc.CreateOrOpen(r.Context(), userID, body.RecipientID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeData(w, status, result)
}

func (h *DMHandler) CreateOrOpenGroup(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		MemberIDs []string `json:"member_ids"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, created, err := h.svc.CreateOrOpenGroup(r.Context(), userID, body.MemberIDs)
	if err != nil {
		writeAppError(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeData(w, status, result)
}

func (h *DMHandler) Messages(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationID")
	userID := middleware.GetUserID(r.Context())
	limit := parseLimit(r)
	var before *string
	if b := r.URL.Query().Get("before"); b != "" {
		before = &b
	}
	messages, err := h.svc.ListMessages(r.Context(), convID, userID, before, limit)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, messages)
}

func (h *DMHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationID")
	userID := middleware.GetUserID(r.Context())
	var input service.SendDMInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	msg, err := h.svc.SendMessage(r.Context(), convID, userID, input)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, msg)
}

func (h *DMHandler) AckDM(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		MessageID string `json:"message_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.AckDM(r.Context(), convID, userID, body.MessageID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DMHandler) DMReadStates(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	states, err := h.svc.ReadStates(r.Context(), userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, states)
}
