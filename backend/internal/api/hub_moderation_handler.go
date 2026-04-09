package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type HubModerationHandler struct {
	modRepo *repository.HubModerationRepo
	hubSvc  *service.HubService
	hubRepo *repository.HubRepo
}

func NewHubModerationHandler(modRepo *repository.HubModerationRepo, hubSvc *service.HubService, hubRepo *repository.HubRepo) *HubModerationHandler {
	return &HubModerationHandler{modRepo: modRepo, hubSvc: hubSvc, hubRepo: hubRepo}
}

func (h *HubModerationHandler) GetAutoModSettings(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if !h.hubSvc.HasPermission(r.Context(), hubID, userID, models.PermManageHub) {
		writeError(w, http.StatusForbidden, "missing permissions")
		return
	}
	settings, err := h.modRepo.GetSettings(r.Context(), hubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (h *HubModerationHandler) UpdateAutoModSettings(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if !h.hubSvc.HasPermission(r.Context(), hubID, userID, models.PermManageHub) {
		writeError(w, http.StatusForbidden, "missing permissions")
		return
	}
	var input repository.HubModerationSettings
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	input.HubID = hubID
	if err := h.modRepo.UpsertSettings(r.Context(), &input); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}
	settings, err := h.modRepo.GetSettings(r.Context(), hubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (h *HubModerationHandler) ListBans(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())
	if !h.hubSvc.HasPermission(r.Context(), hubID, userID, models.PermBanMembers) {
		writeError(w, http.StatusForbidden, "missing permissions")
		return
	}
	bans, err := h.modRepo.ListBans(r.Context(), hubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list bans")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"bans": bans})
}

func (h *HubModerationHandler) BanMember(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	targetID := chi.URLParam(r, "userID")
	userID := middleware.GetUserID(r.Context())
	if !h.hubSvc.HasPermission(r.Context(), hubID, userID, models.PermBanMembers) {
		writeError(w, http.StatusForbidden, "missing permissions")
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = readJSON(r, &body)

	if err := h.modRepo.CreateBan(r.Context(), hubID, targetID, userID, body.Reason); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ban user")
		return
	}
	if err := h.hubRepo.RemoveMember(r.Context(), hubID, targetID); err != nil {
		writeError(w, http.StatusInternalServerError, "ban recorded but failed to remove member from hub")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *HubModerationHandler) UnbanMember(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	targetID := chi.URLParam(r, "userID")
	userID := middleware.GetUserID(r.Context())
	if !h.hubSvc.HasPermission(r.Context(), hubID, userID, models.PermBanMembers) {
		writeError(w, http.StatusForbidden, "missing permissions")
		return
	}
	if err := h.modRepo.DeleteBan(r.Context(), hubID, targetID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unban user")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
