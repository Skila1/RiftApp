package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

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
	u, err := h.svc.GetUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	sa := false
	if u.Email != nil {
		sa = service.IsSuperAdmin(*u.Email)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user_id":        userID,
		"is_super_admin": sa,
	})
}

func (h *DeveloperHandler) CreateApplication(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	app, token, err := h.svc.CreateApplication(r.Context(), userID, body.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"application": app,
		"bot_token":   token,
	})
}

func (h *DeveloperHandler) ListApplications(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	u, _ := h.svc.GetUserByID(r.Context(), userID)
	sa := false
	if u != nil && u.Email != nil {
		sa = service.IsSuperAdmin(*u.Email)
	}
	apps, err := h.svc.ListApplications(r.Context(), userID, sa)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if apps == nil {
		apps = make([]*models.Application, 0)
	}
	writeJSON(w, http.StatusOK, apps)
}

func (h *DeveloperHandler) GetApplication(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	app, err := h.svc.GetApplication(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	userID := middleware.GetUserID(r.Context())
	u, _ := h.svc.GetUserByID(r.Context(), userID)
	sa := false
	if u != nil && u.Email != nil {
		sa = service.IsSuperAdmin(*u.Email)
	}
	if !h.svc.CanAccessApplication(r.Context(), app.OwnerID, userID, sa) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (h *DeveloperHandler) UpdateApplication(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	app, err := h.svc.GetApplication(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	userID := middleware.GetUserID(r.Context())
	u, _ := h.svc.GetUserByID(r.Context(), userID)
	sa := false
	if u != nil && u.Email != nil {
		sa = service.IsSuperAdmin(*u.Email)
	}
	if !h.svc.CanAccessApplication(r.Context(), app.OwnerID, userID, sa) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body map[string]interface{}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if v, ok := body["name"].(string); ok {
		app.Name = v
	}
	if v, ok := body["description"].(string); ok {
		app.Description = v
	}
	if v, ok := body["icon"]; ok {
		if s, ok := v.(string); ok {
			app.Icon = &s
		} else {
			app.Icon = nil
		}
	}
	if v, ok := body["bot_public"].(bool); ok {
		app.BotPublic = v
	}
	if v, ok := body["bot_require_code_grant"].(bool); ok {
		app.BotRequireCodeGrant = v
	}
	if v, ok := body["tags"].([]interface{}); ok {
		tags := make([]string, 0, len(v))
		for _, t := range v {
			if s, ok := t.(string); ok {
				tags = append(tags, s)
			}
		}
		app.Tags = tags
	}
	if v, ok := body["terms_of_service_url"]; ok {
		if s, ok := v.(string); ok {
			app.TermsOfServiceURL = &s
		} else {
			app.TermsOfServiceURL = nil
		}
	}
	if v, ok := body["privacy_policy_url"]; ok {
		if s, ok := v.(string); ok {
			app.PrivacyPolicyURL = &s
		} else {
			app.PrivacyPolicyURL = nil
		}
	}
	if v, ok := body["interactions_endpoint_url"]; ok {
		if s, ok := v.(string); ok {
			app.InteractionsEndpointURL = &s
		} else {
			app.InteractionsEndpointURL = nil
		}
	}
	if v, ok := body["role_connections_verification_url"]; ok {
		if s, ok := v.(string); ok {
			app.RoleConnectionsVerificationURL = &s
		} else {
			app.RoleConnectionsVerificationURL = nil
		}
	}
	if v, ok := body["custom_install_url"]; ok {
		if s, ok := v.(string); ok {
			app.CustomInstallURL = &s
		} else {
			app.CustomInstallURL = nil
		}
	}
	if v, ok := body["flags"].(float64); ok {
		app.Flags = int(v)
	}
	if err := h.svc.UpdateApplication(r.Context(), app); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (h *DeveloperHandler) DeleteApplication(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	app, err := h.svc.GetApplication(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	userID := middleware.GetUserID(r.Context())
	u, _ := h.svc.GetUserByID(r.Context(), userID)
	sa := false
	if u != nil && u.Email != nil {
		sa = service.IsSuperAdmin(*u.Email)
	}
	if !h.svc.CanAccessApplication(r.Context(), app.OwnerID, userID, sa) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	if err := h.svc.DeleteApplication(r.Context(), appID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DeveloperHandler) ResetBotToken(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	app, err := h.svc.GetApplication(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	userID := middleware.GetUserID(r.Context())
	u, _ := h.svc.GetUserByID(r.Context(), userID)
	sa := false
	if u != nil && u.Email != nil {
		sa = service.IsSuperAdmin(*u.Email)
	}
	if !h.svc.CanAccessApplication(r.Context(), app.OwnerID, userID, sa) {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	token, err := h.svc.ResetBotToken(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"bot_token": token})
}

func (h *DeveloperHandler) GetBotSettings(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	bot, err := h.svc.GetBotUser(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusNotFound, "bot not found")
		return
	}
	app, _ := h.svc.GetApplication(r.Context(), appID)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"bot":                    bot,
		"bot_public":             app.BotPublic,
		"bot_require_code_grant": app.BotRequireCodeGrant,
		"flags":                  app.Flags,
	})
}

func (h *DeveloperHandler) UpdateBotSettings(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	app, err := h.svc.GetApplication(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	var body map[string]interface{}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	var avatarPtr *string
	if v, ok := body["avatar_url"].(string); ok {
		avatarPtr = &v
	}
	if v, ok := body["username"].(string); ok && app.BotUserID != nil {
		_ = h.svc.UpdateBotUser(r.Context(), *app.BotUserID, v, v, avatarPtr)
	} else if avatarPtr != nil && app.BotUserID != nil {
		botUser, _ := h.svc.GetBotUser(r.Context(), appID)
		if botUser != nil {
			_ = h.svc.UpdateBotUser(r.Context(), *app.BotUserID, botUser.Username, botUser.DisplayName, avatarPtr)
		}
	}
	if v, ok := body["bot_public"].(bool); ok {
		app.BotPublic = v
	}
	if v, ok := body["bot_require_code_grant"].(bool); ok {
		app.BotRequireCodeGrant = v
	}
	if v, ok := body["flags"].(float64); ok {
		app.Flags = int(v)
	}
	_ = h.svc.UpdateApplication(r.Context(), app)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ─── Sub-resources ─────────────────────────────────────────────────────────

func (h *DeveloperHandler) CreateOAuth2Redirect(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	var body struct {
		RedirectURI string `json:"redirect_uri"`
	}
	if err := readJSON(r, &body); err != nil || body.RedirectURI == "" {
		writeError(w, http.StatusBadRequest, "redirect_uri is required")
		return
	}
	rd := &models.OAuth2Redirect{ApplicationID: appID, RedirectURI: body.RedirectURI}
	if err := h.svc.CreateOAuth2Redirect(r.Context(), rd); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, rd)
}

func (h *DeveloperHandler) ListOAuth2Redirects(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	rds, err := h.svc.ListOAuth2Redirects(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rds)
}

func (h *DeveloperHandler) DeleteOAuth2Redirect(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "redirectID")
	if err := h.svc.DeleteOAuth2Redirect(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DeveloperHandler) CreateAppEmoji(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	var body struct {
		Name      string `json:"name"`
		ImageHash string `json:"image_hash"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	e := &models.AppEmoji{ApplicationID: appID, Name: body.Name, ImageHash: body.ImageHash}
	if err := h.svc.CreateAppEmoji(r.Context(), e); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, e)
}

func (h *DeveloperHandler) ListAppEmojis(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	es, err := h.svc.ListAppEmojis(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, es)
}

func (h *DeveloperHandler) DeleteAppEmoji(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "emojiID")
	if err := h.svc.DeleteAppEmoji(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DeveloperHandler) CreateAppWebhook(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	var body struct {
		URL        string   `json:"url"`
		Secret     string   `json:"secret"`
		EventTypes []string `json:"event_types"`
	}
	if err := readJSON(r, &body); err != nil || body.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	wh := &models.AppWebhook{ApplicationID: appID, URL: body.URL, Secret: body.Secret, EventTypes: body.EventTypes, Enabled: true}
	if err := h.svc.CreateAppWebhook(r.Context(), wh); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, wh)
}

func (h *DeveloperHandler) ListAppWebhooks(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	whs, err := h.svc.ListAppWebhooks(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, whs)
}

func (h *DeveloperHandler) DeleteAppWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "webhookID")
	if err := h.svc.DeleteAppWebhook(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DeveloperHandler) AddAppTester(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	var body struct {
		UserID string `json:"user_id"`
	}
	if err := readJSON(r, &body); err != nil || body.UserID == "" {
		writeError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if err := h.svc.AddAppTester(r.Context(), appID, body.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (h *DeveloperHandler) ListAppTesters(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	ts, err := h.svc.ListAppTesters(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ts)
}

func (h *DeveloperHandler) RemoveAppTester(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	userID := chi.URLParam(r, "userID")
	if err := h.svc.RemoveAppTester(r.Context(), appID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DeveloperHandler) CreateRichPresenceAsset(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	var body struct {
		Name      string `json:"name"`
		Type      string `json:"type"`
		ImageHash string `json:"image_hash"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if body.Type == "" {
		body.Type = "large"
	}
	a := &models.RichPresenceAsset{ApplicationID: appID, Name: body.Name, Type: body.Type, ImageHash: body.ImageHash}
	if err := h.svc.CreateRichPresenceAsset(r.Context(), a); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (h *DeveloperHandler) ListRichPresenceAssets(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	as, err := h.svc.ListRichPresenceAssets(r.Context(), appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, as)
}

func (h *DeveloperHandler) DeleteRichPresenceAsset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "assetID")
	if err := h.svc.DeleteRichPresenceAsset(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Import Discord Bot (full profile via GET /applications/@me) ────────────

func (h *DeveloperHandler) ImportDiscordBot(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		BotToken string `json:"bot_token"`
		Name     string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil || body.BotToken == "" {
		writeError(w, http.StatusBadRequest, "bot_token is required")
		return
	}

	discordApp, err := fetchDiscordApplicationInfo(body.BotToken)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to fetch Discord application: "+err.Error())
		return
	}
	if body.Name != "" {
		discordApp.Name = body.Name
	}
	if discordApp.Name == "" {
		discordApp.Name = "Imported Bot"
	}

	result, err := h.svc.ImportDiscordApplication(r.Context(), userID, discordApp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"application": result.Application,
		"bot_token":   result.BotToken,
		"imported":    true,
	})
}

// fetchDiscordApplicationInfo calls Discord's GET /api/v10/applications/@me
// and GET /api/v10/users/@me with the provided bot token.
func fetchDiscordApplicationInfo(botToken string) (*service.DiscordApplicationInfo, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	appReq, err := http.NewRequest("GET", "https://discord.com/api/v10/applications/@me", nil)
	if err != nil {
		return nil, err
	}
	appReq.Header.Set("Authorization", "Bot "+botToken)
	appResp, err := client.Do(appReq)
	if err != nil {
		return nil, err
	}
	defer appResp.Body.Close()
	if appResp.StatusCode != http.StatusOK {
		return nil, errors.New("Discord returned " + appResp.Status)
	}

	var discordResp struct {
		ID                             string   `json:"id"`
		Name                           string   `json:"name"`
		Description                    string   `json:"description"`
		Icon                           string   `json:"icon"`
		BotPublic                      bool     `json:"bot_public"`
		BotRequireCodeGrant            bool     `json:"bot_require_code_grant"`
		Tags                           []string `json:"tags"`
		TermsOfServiceURL              string   `json:"terms_of_service_url"`
		PrivacyPolicyURL               string   `json:"privacy_policy_url"`
		CustomInstallURL               string   `json:"custom_install_url"`
		InteractionsEndpointURL        string   `json:"interactions_endpoint_url"`
		RoleConnectionsVerificationURL string   `json:"role_connections_verification_url"`
		VerifyKey                      string   `json:"verify_key"`
		Flags                          int      `json:"flags"`
	}
	if err := json.NewDecoder(appResp.Body).Decode(&discordResp); err != nil {
		return nil, err
	}

	info := &service.DiscordApplicationInfo{
		ID:                             discordResp.ID,
		Name:                           discordResp.Name,
		Description:                    discordResp.Description,
		Icon:                           discordResp.Icon,
		BotPublic:                      discordResp.BotPublic,
		BotRequireCodeGrant:            discordResp.BotRequireCodeGrant,
		Tags:                           discordResp.Tags,
		TermsOfServiceURL:              discordResp.TermsOfServiceURL,
		PrivacyPolicyURL:               discordResp.PrivacyPolicyURL,
		CustomInstallURL:               discordResp.CustomInstallURL,
		InteractionsEndpointURL:        discordResp.InteractionsEndpointURL,
		RoleConnectionsVerificationURL: discordResp.RoleConnectionsVerificationURL,
		VerifyKey:                      discordResp.VerifyKey,
		Flags:                          discordResp.Flags,
	}

	botReq, _ := http.NewRequest("GET", "https://discord.com/api/v10/users/@me", nil)
	botReq.Header.Set("Authorization", "Bot "+botToken)
	botResp, err := client.Do(botReq)
	if err == nil && botResp.StatusCode == http.StatusOK {
		defer botResp.Body.Close()
		var botUser struct {
			Username string `json:"username"`
			Avatar   string `json:"avatar"`
		}
		if json.NewDecoder(botResp.Body).Decode(&botUser) == nil {
			info.BotUsername = botUser.Username
			info.BotAvatar = botUser.Avatar
		}
	}

	return info, nil
}
