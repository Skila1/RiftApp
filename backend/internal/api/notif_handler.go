package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type NotifHandler struct {
	svc *service.NotificationService
}

func NewNotifHandler(svc *service.NotificationService) *NotifHandler {
	return &NotifHandler{svc: svc}
}

func (h *NotifHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	notifs, err := h.svc.List(r.Context(), userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, notifs)
}

func (h *NotifHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	notifID := chi.URLParam(r, "notifID")
	userID := middleware.GetUserID(r.Context())
	found, err := h.svc.MarkRead(r.Context(), notifID, userID)
	if err != nil || !found {
		writeError(w, http.StatusNotFound, "notification not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *NotifHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.MarkAllRead(r.Context(), userID); err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
