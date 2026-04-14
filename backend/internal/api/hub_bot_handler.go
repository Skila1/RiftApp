package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riftapp-cloud/riftapp/internal/botengine"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

var validTemplateTypes = map[string]bool{
	"moderation": true,
	"welcome":    true,
	"music":      true,
	"utility":    true,
	"leveling":   true,
}

type HubBotHandler struct {
	hubBotRepo *repository.HubBotRepo
	hubSvc     *service.HubService
	hubRepo    *repository.HubRepo
	db         *pgxpool.Pool
	engine     *botengine.Engine
}

func NewHubBotHandler(
	hubBotRepo *repository.HubBotRepo,
	hubSvc *service.HubService,
	hubRepo *repository.HubRepo,
	db *pgxpool.Pool,
	engine *botengine.Engine,
) *HubBotHandler {
	return &HubBotHandler{
		hubBotRepo: hubBotRepo,
		hubSvc:     hubSvc,
		hubRepo:    hubRepo,
		db:         db,
		engine:     engine,
	}
}

func (h *HubBotHandler) ListHubBots(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	bots, err := h.hubBotRepo.ListByHub(r.Context(), hubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list bots")
		return
	}
	if bots == nil {
		bots = []repository.HubBot{}
	}
	writeData(w, http.StatusOK, bots)
}

func (h *HubBotHandler) CreateHubBot(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	if !h.hubSvc.HasPermission(r.Context(), hubID, userID, models.PermManageHub) {
		writeError(w, http.StatusForbidden, "manage hub permission required")
		return
	}

	var body struct {
		TemplateType string          `json:"template_type"`
		Config       json.RawMessage `json:"config"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if !validTemplateTypes[body.TemplateType] {
		writeError(w, http.StatusBadRequest, "invalid template type")
		return
	}

	if existing, _ := h.hubBotRepo.GetByHubAndTemplate(r.Context(), hubID, body.TemplateType); existing != nil {
		writeError(w, http.StatusConflict, "bot template already enabled for this hub")
		return
	}

	botUserID := uuid.New().String()
	displayName := templateDisplayName(body.TemplateType)
	username := "rift-" + body.TemplateType + "-" + hubID[:8]

	_, _ = h.db.Exec(r.Context(),
		`INSERT INTO users (id, username, display_name, password_hash, is_bot, status, created_at, updated_at)
		 VALUES ($1, $2, $3, '', true, 1, now(), now()) ON CONFLICT DO NOTHING`,
		botUserID, username, displayName)

	if body.Config == nil {
		body.Config = json.RawMessage(`{}`)
	}

	bot := &repository.HubBot{
		ID:           uuid.New().String(),
		HubID:        hubID,
		BotUserID:    botUserID,
		TemplateType: body.TemplateType,
		Config:       body.Config,
		Enabled:      true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := h.hubBotRepo.Create(r.Context(), bot); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create bot: "+err.Error())
		return
	}

	if h.hubRepo != nil {
		_ = h.hubRepo.AddMember(r.Context(), hubID, botUserID, models.RoleMember)
	}

	if h.engine != nil {
		h.engine.InvalidateHub(hubID)
	}

	writeData(w, http.StatusCreated, bot)
}

func (h *HubBotHandler) UpdateHubBot(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	botID := chi.URLParam(r, "botID")
	userID := middleware.GetUserID(r.Context())

	if !h.hubSvc.HasPermission(r.Context(), hubID, userID, models.PermManageHub) {
		writeError(w, http.StatusForbidden, "manage hub permission required")
		return
	}

	bot, err := h.hubBotRepo.GetByID(r.Context(), botID)
	if err != nil || bot.HubID != hubID {
		writeError(w, http.StatusNotFound, "bot not found")
		return
	}

	var body struct {
		Config  json.RawMessage `json:"config"`
		Enabled *bool           `json:"enabled"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cfg := bot.Config
	if body.Config != nil {
		cfg = body.Config
	}
	enabled := bot.Enabled
	if body.Enabled != nil {
		enabled = *body.Enabled
	}

	if err := h.hubBotRepo.Update(r.Context(), botID, cfg, enabled); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update bot")
		return
	}

	if h.engine != nil {
		h.engine.InvalidateHub(hubID)
	}

	bot.Config = cfg
	bot.Enabled = enabled
	writeData(w, http.StatusOK, bot)
}

func (h *HubBotHandler) DeleteHubBot(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	botID := chi.URLParam(r, "botID")
	userID := middleware.GetUserID(r.Context())

	if !h.hubSvc.HasPermission(r.Context(), hubID, userID, models.PermManageHub) {
		writeError(w, http.StatusForbidden, "manage hub permission required")
		return
	}

	bot, err := h.hubBotRepo.GetByID(r.Context(), botID)
	if err != nil || bot.HubID != hubID {
		writeError(w, http.StatusNotFound, "bot not found")
		return
	}

	if err := h.hubBotRepo.Delete(r.Context(), botID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete bot")
		return
	}

	if h.hubRepo != nil {
		_ = h.hubRepo.RemoveMember(r.Context(), hubID, bot.BotUserID)
	}

	if h.engine != nil {
		h.engine.InvalidateHub(hubID)
	}

	w.WriteHeader(http.StatusNoContent)
}

func templateDisplayName(templateType string) string {
	switch templateType {
	case "moderation":
		return "Rift Mod Bot"
	case "welcome":
		return "Rift Welcome Bot"
	case "music":
		return "Rift Music Bot"
	case "utility":
		return "Rift Utility Bot"
	case "leveling":
		return "Rift Leveling Bot"
	default:
		return "Rift Bot"
	}
}
