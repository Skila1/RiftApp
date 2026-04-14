package api

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type HubHandler struct {
	svc       *service.HubService
	notifSvc  *service.NotificationService
	notifRepo *repository.NotificationRepo
	hub       *ws.Hub
}

func NewHubHandler(svc *service.HubService, notifSvc *service.NotificationService, notifRepo *repository.NotificationRepo, hub *ws.Hub) *HubHandler {
	return &HubHandler{svc: svc, notifSvc: notifSvc, notifRepo: notifRepo, hub: hub}
}

func (h *HubHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	hub, err := h.svc.Create(r.Context(), userID, body.Name)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, hub)
}

func (h *HubHandler) PreviewDiscordTemplate(w http.ResponseWriter, r *http.Request) {
	input := r.URL.Query().Get("input")
	preview, err := h.svc.PreviewDiscordTemplate(r.Context(), input)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, preview)
}

func (h *HubHandler) ImportDiscordTemplate(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Input string `json:"input"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	hub, err := h.svc.ImportDiscordTemplate(r.Context(), userID, body.Input)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, map[string]any{"hub": hub})
}

func (h *HubHandler) Get(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	hub, err := h.svc.Get(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, hub)
}

func (h *HubHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	hubs, err := h.svc.List(r.Context(), userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, hubs)
}

func (h *HubHandler) Delete(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Delete(r.Context(), hubID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HubHandler) Update(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name      *string `json:"name"`
		IconURL   *string `json:"icon_url"`
		BannerURL *string `json:"banner_url"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	hub, err := h.svc.Update(r.Context(), hubID, userID, body.Name, body.IconURL, body.BannerURL)
	if err != nil {
		writeAppError(w, err)
		return
	}
	if h.hub != nil {
		h.hub.BroadcastToHubMembers(hub.ID, ws.NewEvent(ws.OpHubUpdate, hub))
	}
	writeData(w, http.StatusOK, hub)
}

func (h *HubHandler) Join(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Join(r.Context(), hubID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, map[string]string{"status": "joined"})
}

func (h *HubHandler) Leave(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if err := h.svc.Leave(r.Context(), hubID, userID); err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, map[string]string{"status": "left"})
}

func (h *HubHandler) Members(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	members, err := h.svc.Members(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	for index := range members {
		applyLiveUserStatus(h.hub, &members[index].User)
	}
	writeData(w, http.StatusOK, members)
}

func (h *HubHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	var body struct {
		MaxUses   int  `json:"max_uses"`
		ExpiresIn *int `json:"expires_in"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	invite, err := h.svc.CreateInvite(r.Context(), hubID, userID, body.MaxUses, body.ExpiresIn)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, invite)
}

func (h *HubHandler) GetInviteInfo(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	info, err := h.svc.GetInviteInfo(r.Context(), code)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, info)
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
		go func() {
			notifCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			h.notifSvc.Create(notifCtx, creatorID, "invite", title, nil, nil, &hub.ID, nil, &userID)
		}()
	}

	writeData(w, http.StatusOK, map[string]interface{}{"status": "joined", "hub": hub})
}

func (h *HubHandler) GetNotificationSettings(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	st, err := h.svc.GetNotificationSettings(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, st)
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
	writeData(w, http.StatusOK, st)
}

func (h *HubHandler) MyPermissions(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	perms, err := h.svc.GetEffectivePermissions(r.Context(), hubID, userID)
	if err != nil {
		writeAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, map[string]int64{"permissions": perms})
}
