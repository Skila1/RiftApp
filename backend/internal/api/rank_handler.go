package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type RankHandler struct {
	svc *service.RankService
	hub *ws.Hub
}

func NewRankHandler(svc *service.RankService, hub *ws.Hub) *RankHandler {
	return &RankHandler{svc: svc, hub: hub}
}

func (h *RankHandler) List(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	ranks, err := h.svc.List(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, ranks)
}

func (h *RankHandler) Create(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name        string `json:"name"`
		Color       string `json:"color"`
		Permissions int64  `json:"permissions"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rank, err := h.svc.Create(r.Context(), hubID, userID, body.Name, body.Color, body.Permissions)
	if err != nil {
		writeAppError(w, err)
		return
	}
	if h.hub != nil {
		h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpRoleUpdate, map[string]string{"hub_id": hubID}))
	}
	writeData(w, http.StatusCreated, rank)
}

func (h *RankHandler) Update(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	rankID := chi.URLParam(r, "rankID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name        *string `json:"name"`
		Color       *string `json:"color"`
		Permissions *int64  `json:"permissions"`
		Position    *int    `json:"position"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rank, err := h.svc.Update(r.Context(), hubID, userID, rankID, body.Name, body.Color, body.Permissions, body.Position)
	if err != nil {
		writeAppError(w, err)
		return
	}
	if h.hub != nil {
		h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpRoleUpdate, map[string]string{"hub_id": hubID}))
	}
	writeData(w, http.StatusOK, rank)
}

func (h *RankHandler) Delete(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	rankID := chi.URLParam(r, "rankID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Delete(r.Context(), hubID, userID, rankID); err != nil {
		writeAppError(w, err)
		return
	}
	if h.hub != nil {
		h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpRoleUpdate, map[string]string{"hub_id": hubID}))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RankHandler) AssignRank(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	targetUserID := chi.URLParam(r, "userID")
	rankID := chi.URLParam(r, "rankID")
	userID := middleware.GetUserID(r.Context())

	if err := h.svc.AssignRank(r.Context(), hubID, userID, targetUserID, rankID); err != nil {
		writeAppError(w, err)
		return
	}
	if h.hub != nil {
		h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpRoleUpdate, map[string]string{"hub_id": hubID}))
	}
	writeData(w, http.StatusOK, map[string]string{"status": "assigned"})
}

func (h *RankHandler) RemoveRank(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	targetUserID := chi.URLParam(r, "userID")
	userID := middleware.GetUserID(r.Context())

	if err := h.svc.RemoveRank(r.Context(), hubID, userID, targetUserID); err != nil {
		writeAppError(w, err)
		return
	}
	if h.hub != nil {
		h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpRoleUpdate, map[string]string{"hub_id": hubID}))
	}
	writeData(w, http.StatusOK, map[string]string{"status": "removed"})
}
