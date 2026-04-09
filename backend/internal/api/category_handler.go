package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type CategoryHandler struct {
	svc *service.CategoryService
	hub *ws.Hub
}

func NewCategoryHandler(svc *service.CategoryService, hub *ws.Hub) *CategoryHandler {
	return &CategoryHandler{svc: svc, hub: hub}
}

func (h *CategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	cat, err := h.svc.Create(r.Context(), hubID, userID, body.Name)
	if err != nil {
		writeAppError(w, err)
		return
	}
	h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpCategoryUpdate, map[string]string{"hub_id": hubID}))
	writeData(w, http.StatusCreated, cat)
}

func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	cats, err := h.svc.List(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, cats)
}

func (h *CategoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	categoryID := chi.URLParam(r, "categoryID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Delete(r.Context(), hubID, userID, categoryID); err != nil {
		writeAppError(w, err)
		return
	}
	h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpCategoryUpdate, map[string]string{"hub_id": hubID}))
	w.WriteHeader(http.StatusNoContent)
}

func (h *CategoryHandler) Patch(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	categoryID := chi.URLParam(r, "categoryID")
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
	cat, err := h.svc.Update(r.Context(), hubID, userID, categoryID, body.Name)
	if err != nil {
		writeAppError(w, err)
		return
	}
	h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpCategoryUpdate, map[string]string{"hub_id": hubID}))
	writeData(w, http.StatusOK, cat)
}

func (h *CategoryHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Categories []struct {
			ID       string `json:"id"`
			Position int    `json:"position"`
		} `json:"categories"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.ReorderCategories(r.Context(), hubID, userID, body.Categories); err != nil {
		writeAppError(w, err)
		return
	}
	h.hub.BroadcastToHubMembers(hubID, ws.NewEvent(ws.OpCategoryUpdate, map[string]string{"hub_id": hubID}))
	w.WriteHeader(http.StatusNoContent)
}
