package api

import (
	"net/http"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/repository"
)

type DeviceTokenHandler struct {
	repo *repository.DeviceTokenRepo
}

func NewDeviceTokenHandler(repo *repository.DeviceTokenRepo) *DeviceTokenHandler {
	return &DeviceTokenHandler{repo: repo}
}

func (h *DeviceTokenHandler) Register(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		Token    string `json:"token"`
		Platform string `json:"platform"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.Token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}

	switch body.Platform {
	case "ios", "android", "web":
	default:
		writeError(w, http.StatusBadRequest, "platform must be ios, android, or web")
		return
	}

	dt, err := h.repo.Upsert(r.Context(), userID, body.Token, body.Platform)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to register device token")
		return
	}

	writeData(w, http.StatusOK, dt)
}

func (h *DeviceTokenHandler) Unregister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.Token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}

	if err := h.repo.Delete(r.Context(), body.Token); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unregister device token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
