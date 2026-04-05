package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type HubHandler struct {
	svc       *service.HubService
	notifSvc  *service.NotificationService
	notifRepo *repository.NotificationRepo
}

func NewHubHandler(svc *service.HubService, notifSvc *service.NotificationService, notifRepo *repository.NotificationRepo) *HubHandler {
	return &HubHandler{svc: svc, notifSvc: notifSvc, notifRepo: notifRepo}
}

func (h *HubHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeAppError(w, err)
		return
	}
	hub, err := h.svc.Create(r.Context(), userID, body.Name)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, hub)
}

func (h *HubHandler) Get(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	hub, err := h.svc.Get(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, hub)
}

func (h *HubHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	hubs, err := h.svc.List(r.Context(), userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, hubs)
}

func (h *HubHandler) Update(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name    *string `json:"name"`
		IconURL *string `json:"icon_url"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	hub, err := h.svc.Update(r.Context(), hubID, userID, body.Name, body.IconURL)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, hub)
}

func (h *HubHandler) Join(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Join(r.Context(), hubID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "joined"})
}

func (h *HubHandler) Leave(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Leave(r.Context(), hubID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "left"})
}

func (h *HubHandler) Members(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	members, err := h.svc.Members(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func (h *HubHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		MaxUses   int  `json:"max_uses"`
		ExpiresIn *int `json:"expires_in"`
	}
	readJSON(r, &body)
	invite, err := h.svc.CreateInvite(r.Context(), hubID, userID, body.MaxUses, body.ExpiresIn)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, invite)
}

func (h *HubHandler) GetInviteInfo(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	info, err := h.svc.GetInviteInfo(r.Context(), code)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (h *HubHandler) JoinViaInvite(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	userID := middleware.GetUserID(r.Context())
	hub, creatorID, err := h.svc.JoinViaInvite(r.Context(), code, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}

	if creatorID != userID && h.notifSvc != nil && hub != nil && h.svc.ShouldDeliverInviteJoinNotif(r.Context(), creatorID, hub.ID) {
		joinerName, _ := h.notifRepo.GetDisplayName(r.Context(), userID)
		title := joinerName + " joined " + hub.Name + " via your invite"
		go h.notifSvc.Create(creatorID, "invite", title, nil, nil, &hub.ID, nil, &userID)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "joined", "hub": hub})
}

func (h *HubHandler) GetNotificationSettings(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	st, err := h.svc.GetNotificationSettings(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *HubHandler) PatchNotificationSettings(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body repository.HubNotificationSettings
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	st, err := h.svc.UpdateNotificationSettings(r.Context(), hubID, userID, body)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}
