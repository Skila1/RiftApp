package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type FriendHandler struct {
	svc *service.FriendService
}

func NewFriendHandler(svc *service.FriendService) *FriendHandler {
	return &FriendHandler{svc: svc}
}

func (h *FriendHandler) SendRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		UserID   string `json:"user_id"`
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	targetID := body.UserID
	if targetID == "" && body.Username != "" {
		targetID = body.Username
	}
	if targetID == "" {
		writeError(w, http.StatusBadRequest, "user_id or username required")
		return
	}
	if err := h.svc.SendRequest(r.Context(), userID, targetID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "request_sent"})
}

func (h *FriendHandler) Accept(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	targetID := chi.URLParam(r, "userID")
	if err := h.svc.AcceptRequest(r.Context(), userID, targetID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
}

func (h *FriendHandler) Reject(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	targetID := chi.URLParam(r, "userID")
	if err := h.svc.RejectRequest(r.Context(), userID, targetID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

func (h *FriendHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	targetID := chi.URLParam(r, "userID")
	if err := h.svc.CancelRequest(r.Context(), userID, targetID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

func (h *FriendHandler) Remove(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	targetID := chi.URLParam(r, "userID")
	if err := h.svc.RemoveFriend(r.Context(), userID, targetID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func (h *FriendHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	friends, err := h.svc.ListFriends(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list friends")
		return
	}
	writeJSON(w, http.StatusOK, friends)
}

func (h *FriendHandler) PendingIncoming(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	list, err := h.svc.ListPendingIncoming(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list pending")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *FriendHandler) PendingOutgoing(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	list, err := h.svc.ListPendingOutgoing(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list pending")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *FriendHandler) CountPending(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	count, err := h.svc.CountPending(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to count pending")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": count})
}

func (h *FriendHandler) Block(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}
	if err := h.svc.Block(r.Context(), userID, body.UserID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "blocked"})
}

func (h *FriendHandler) Unblock(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	targetID := chi.URLParam(r, "userID")
	if err := h.svc.Unblock(r.Context(), userID, targetID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "unblocked"})
}

func (h *FriendHandler) ListBlocked(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	list, err := h.svc.ListBlocked(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list blocked")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *FriendHandler) Relationship(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	targetID := chi.URLParam(r, "userID")
	rel, err := h.svc.GetRelationship(r.Context(), userID, targetID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get relationship")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"relationship": rel})
}
