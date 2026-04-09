package api

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type DeveloperHandler struct {
	svc *service.DeveloperService
}

func NewDeveloperHandler(svc *service.DeveloperService) *DeveloperHandler {
	return &DeveloperHandler{svc: svc}
}

func (h *DeveloperHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	resp, err := h.svc.GetMe(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeData(w, http.StatusOK, resp)
}

func (h *DeveloperHandler) CreateApplication(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	app, token, err := h.svc.CreateApplication(r.Context(), userID, body.Name)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, service.ErrAppNameRequired) || errors.Is(err, service.ErrAppNameTooLong) {
			status = http.StatusBadRequest
		}
		writeError(w, status, err.Error())
		return
	}

	writeData(w, http.StatusCreated, map[string]interface{}{
		"application": app,
		"bot_token":   token,
	})
}

func (h *DeveloperHandler) ListApplications(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	apps, err := h.svc.ListApplications(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if apps == nil {
		apps = make([]*models.Application, 0)
	}
	writeData(w, http.StatusOK, apps)
}

func (h *DeveloperHandler) GetApplication(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	app, err := h.svc.GetApplication(r.Context(), appID, userID)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, app)
}

func (h *DeveloperHandler) UpdateApplication(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	var updates map[string]interface{}
	if err := readJSON(r, &updates); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	app, err := h.svc.UpdateApplication(r.Context(), appID, userID, updates)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, app)
}

func (h *DeveloperHandler) DeleteApplication(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	if err := h.svc.DeleteApplication(r.Context(), appID, userID); err != nil {
		h.handleAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Bot endpoints

func (h *DeveloperHandler) GetBotSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	app, err := h.svc.GetBotSettings(r.Context(), appID, userID)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, app)
}

func (h *DeveloperHandler) UpdateBotSettings(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	var updates map[string]interface{}
	if err := readJSON(r, &updates); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	app, err := h.svc.UpdateBotSettings(r.Context(), appID, userID, updates)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, app)
}

func (h *DeveloperHandler) ResetBotToken(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	token, err := h.svc.ResetBotToken(r.Context(), appID, userID)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, map[string]string{"token": token})
}

// OAuth2 redirect endpoints

func (h *DeveloperHandler) ListOAuth2Redirects(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	redirects, err := h.svc.ListOAuth2Redirects(r.Context(), appID, userID)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, redirects)
}

func (h *DeveloperHandler) CreateOAuth2Redirect(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	var body struct {
		RedirectURI string `json:"redirect_uri"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	rd, err := h.svc.CreateOAuth2Redirect(r.Context(), appID, userID, body.RedirectURI)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, rd)
}

func (h *DeveloperHandler) DeleteOAuth2Redirect(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")
	redirectID := chi.URLParam(r, "redirectID")

	if err := h.svc.DeleteOAuth2Redirect(r.Context(), appID, userID, redirectID); err != nil {
		h.handleAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Emoji endpoints

func (h *DeveloperHandler) ListAppEmojis(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	emojis, err := h.svc.ListAppEmojis(r.Context(), appID, userID)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, emojis)
}

func (h *DeveloperHandler) CreateAppEmoji(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	var body struct {
		Name      string `json:"name"`
		ImageHash string `json:"image_hash"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	emoji, err := h.svc.CreateAppEmoji(r.Context(), appID, userID, body.Name, body.ImageHash)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, emoji)
}

func (h *DeveloperHandler) DeleteAppEmoji(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")
	emojiID := chi.URLParam(r, "emojiID")

	if err := h.svc.DeleteAppEmoji(r.Context(), appID, userID, emojiID); err != nil {
		h.handleAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Webhook endpoints

func (h *DeveloperHandler) ListAppWebhooks(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	webhooks, err := h.svc.ListAppWebhooks(r.Context(), appID, userID)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, webhooks)
}

func (h *DeveloperHandler) CreateAppWebhook(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	var body struct {
		URL        string   `json:"url"`
		Secret     string   `json:"secret"`
		EventTypes []string `json:"event_types"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	webhook, err := h.svc.CreateAppWebhook(r.Context(), appID, userID, body.URL, body.Secret, body.EventTypes)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, webhook)
}

func (h *DeveloperHandler) DeleteAppWebhook(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")
	webhookID := chi.URLParam(r, "webhookID")

	if err := h.svc.DeleteAppWebhook(r.Context(), appID, userID, webhookID); err != nil {
		h.handleAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Tester endpoints

func (h *DeveloperHandler) ListAppTesters(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	testers, err := h.svc.ListAppTesters(r.Context(), appID, userID)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, testers)
}

func (h *DeveloperHandler) AddAppTester(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	var body struct {
		UserID string `json:"user_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.AddAppTester(r.Context(), appID, userID, body.UserID); err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, map[string]string{"status": "ok"})
}

func (h *DeveloperHandler) RemoveAppTester(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")
	testerID := chi.URLParam(r, "testerID")

	if err := h.svc.RemoveAppTester(r.Context(), appID, userID, testerID); err != nil {
		h.handleAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Rich Presence asset endpoints

func (h *DeveloperHandler) ListRichPresenceAssets(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	assets, err := h.svc.ListRichPresenceAssets(r.Context(), appID, userID)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusOK, assets)
}

func (h *DeveloperHandler) CreateRichPresenceAsset(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")

	var body struct {
		Name      string `json:"name"`
		Type      string `json:"type"`
		ImageHash string `json:"image_hash"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	asset, err := h.svc.CreateRichPresenceAsset(r.Context(), appID, userID, body.Name, body.Type, body.ImageHash)
	if err != nil {
		h.handleAppError(w, err)
		return
	}
	writeData(w, http.StatusCreated, asset)
}

func (h *DeveloperHandler) DeleteRichPresenceAsset(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	appID := chi.URLParam(r, "appID")
	assetID := chi.URLParam(r, "assetID")

	if err := h.svc.DeleteRichPresenceAsset(r.Context(), appID, userID, assetID); err != nil {
		h.handleAppError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DeveloperHandler) handleAppError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrAppNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, service.ErrAppForbidden):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, service.ErrAppNameRequired), errors.Is(err, service.ErrAppNameTooLong), errors.Is(err, service.ErrTooManyTags):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

// ImportDiscordBot imports a Discord bot configuration by fetching its profile from Discord's API.
func (h *DeveloperHandler) ImportDiscordBot(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var body struct {
		BotToken string `json:"bot_token"`
		Name     string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.BotToken == "" && body.Name == "" {
		writeError(w, http.StatusBadRequest, "provide either a bot_token to import from Discord or a name to create a new app")
		return
	}

	appName := body.Name
	if appName == "" {
		appName = "Imported Bot"
	}

	if body.BotToken != "" {
		info, err := fetchDiscordBotInfo(body.BotToken)
		if err == nil && info.Username != "" {
			appName = info.Username
		}
	}

	app, token, err := h.svc.CreateApplication(r.Context(), userID, appName)
	if err != nil {
		h.handleAppError(w, err)
		return
	}

	writeData(w, http.StatusCreated, map[string]interface{}{
		"application": app,
		"bot_token":   token,
		"imported":    body.BotToken != "",
	})
}
