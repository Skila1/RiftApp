package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type DiscordCompatHandler struct {
	devSvc    *service.DeveloperService
	hubRepo   *repository.HubRepo
	streamRepo *repository.StreamRepo
	msgRepo   *repository.MessageRepo
	rankRepo  *repository.RankRepo
	devRepo   *repository.DeveloperRepo
	db        *pgxpool.Pool
	baseURL   string
}

type DiscordCompatDeps struct {
	DeveloperService *service.DeveloperService
	HubRepo          *repository.HubRepo
	StreamRepo       *repository.StreamRepo
	MsgRepo          *repository.MessageRepo
	RankRepo         *repository.RankRepo
	DeveloperRepo    *repository.DeveloperRepo
	DB               *pgxpool.Pool
	BaseURL          string
}

func NewDiscordCompatHandler(deps DiscordCompatDeps) *DiscordCompatHandler {
	return &DiscordCompatHandler{
		devSvc:     deps.DeveloperService,
		hubRepo:    deps.HubRepo,
		streamRepo: deps.StreamRepo,
		msgRepo:    deps.MsgRepo,
		rankRepo:   deps.RankRepo,
		devRepo:    deps.DeveloperRepo,
		db:         deps.DB,
		baseURL:    deps.BaseURL,
	}
}

// Discord error response format
type discordError struct {
	Code    int                    `json:"code"`
	Message string                 `json:"message"`
	Errors  map[string]interface{} `json:"errors,omitempty"`
}

func writeDiscordError(w http.ResponseWriter, status int, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(discordError{Code: code, Message: message})
}

func writeDiscordJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// Auth middleware for Discord compat routes — parses "Bot <token>" or "Bearer <token>"
func (h *DiscordCompatHandler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeDiscordError(w, 401, 0, "401: Unauthorized")
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 {
			writeDiscordError(w, 401, 0, "401: Unauthorized")
			return
		}

		scheme := strings.ToLower(parts[0])
		token := parts[1]

		switch scheme {
		case "bot":
			botUserID, appID, err := h.devSvc.ValidateBotToken(r.Context(), token)
			if err != nil {
				writeDiscordError(w, 401, 0, "401: Unauthorized")
				return
			}
			ctx := r.Context()
			ctx = setBotUserID(ctx, botUserID)
			ctx = setAppID(ctx, appID)
			next.ServeHTTP(w, r.WithContext(ctx))
		default:
			writeDiscordError(w, 401, 0, "401: Unauthorized")
		}
	})
}

// GET /gateway
func (h *DiscordCompatHandler) GetGateway(w http.ResponseWriter, r *http.Request) {
	wsURL := strings.Replace(h.baseURL, "http", "ws", 1)
	writeDiscordJSON(w, 200, map[string]string{
		"url": wsURL + "/gateway/",
	})
}

// GET /gateway/bot
func (h *DiscordCompatHandler) GetGatewayBot(w http.ResponseWriter, r *http.Request) {
	wsURL := strings.Replace(h.baseURL, "http", "ws", 1)
	writeDiscordJSON(w, 200, map[string]interface{}{
		"url":    wsURL + "/gateway/",
		"shards": 1,
		"session_start_limit": map[string]interface{}{
			"total":           1000,
			"remaining":       999,
			"reset_after":     14400000,
			"max_concurrency": 1,
		},
	})
}

// GET /applications/@me
func (h *DiscordCompatHandler) GetApplicationMe(w http.ResponseWriter, r *http.Request) {
	appID := getAppID(r.Context())
	if appID == "" {
		writeDiscordError(w, 401, 0, "401: Unauthorized")
		return
	}
	app, err := h.devRepo.GetApplication(r.Context(), appID)
	if err != nil {
		writeDiscordError(w, 404, 10002, "Unknown Application")
		return
	}

	writeDiscordJSON(w, 200, h.toDiscordApplication(r.Context(), app))
}

// GET /users/@me
func (h *DiscordCompatHandler) GetUserMe(w http.ResponseWriter, r *http.Request) {
	botUserID := getBotUserID(r.Context())
	user, err := h.devRepo.GetUserByID(r.Context(), botUserID)
	if err != nil {
		writeDiscordError(w, 404, 10013, "Unknown User")
		return
	}
	writeDiscordJSON(w, 200, toDiscordUser(user))
}

// GET /users/{id}
func (h *DiscordCompatHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	user, err := h.devRepo.GetUserByID(r.Context(), userID)
	if err != nil {
		writeDiscordError(w, 404, 10013, "Unknown User")
		return
	}
	writeDiscordJSON(w, 200, toDiscordUser(user))
}

// GET /guilds/{id}
func (h *DiscordCompatHandler) GetGuild(w http.ResponseWriter, r *http.Request) {
	guildID := chi.URLParam(r, "id")
	hub, err := h.hubRepo.GetByID(r.Context(), guildID)
	if err != nil {
		writeDiscordError(w, 404, 10004, "Unknown Guild")
		return
	}
	writeDiscordJSON(w, 200, toDiscordGuild(hub))
}

// GET /guilds/{id}/channels
func (h *DiscordCompatHandler) GetGuildChannels(w http.ResponseWriter, r *http.Request) {
	guildID := chi.URLParam(r, "id")
	streams, err := h.streamRepo.ListByHub(r.Context(), guildID)
	if err != nil {
		writeDiscordError(w, 404, 10004, "Unknown Guild")
		return
	}
	channels := make([]map[string]interface{}, 0, len(streams))
	for _, s := range streams {
		channels = append(channels, toDiscordChannel(&s))
	}
	writeDiscordJSON(w, 200, channels)
}

// GET /guilds/{id}/members
func (h *DiscordCompatHandler) GetGuildMembers(w http.ResponseWriter, r *http.Request) {
	guildID := chi.URLParam(r, "id")
	members, err := h.hubRepo.ListMembers(r.Context(), guildID)
	if err != nil {
		writeDiscordJSON(w, 200, []interface{}{})
		return
	}
	result := make([]map[string]interface{}, 0, len(members))
	for _, m := range members {
		result = append(result, toDiscordMember(&m))
	}
	writeDiscordJSON(w, 200, result)
}

// GET /guilds/{id}/members/{uid}
func (h *DiscordCompatHandler) GetGuildMember(w http.ResponseWriter, r *http.Request) {
	guildID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "uid")
	members, err := h.hubRepo.ListMembers(r.Context(), guildID)
	if err != nil {
		writeDiscordError(w, 404, 10007, "Unknown Member")
		return
	}
	for _, m := range members {
		if m.ID == userID {
			writeDiscordJSON(w, 200, toDiscordMember(&m))
			return
		}
	}
	writeDiscordError(w, 404, 10007, "Unknown Member")
}

// GET /guilds/{id}/roles
func (h *DiscordCompatHandler) GetGuildRoles(w http.ResponseWriter, r *http.Request) {
	guildID := chi.URLParam(r, "id")
	ranks, err := h.rankRepo.ListByHub(r.Context(), guildID)
	if err != nil {
		writeDiscordJSON(w, 200, []interface{}{})
		return
	}
	roles := make([]map[string]interface{}, 0, len(ranks))
	for _, rank := range ranks {
		roles = append(roles, toDiscordRole(&rank))
	}
	writeDiscordJSON(w, 200, roles)
}

// GET /channels/{id}
func (h *DiscordCompatHandler) GetChannel(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "id")
	stream, err := h.streamRepo.GetByID(r.Context(), channelID)
	if err != nil {
		writeDiscordError(w, 404, 10003, "Unknown Channel")
		return
	}
	writeDiscordJSON(w, 200, toDiscordChannel(stream))
}

// GET /channels/{id}/messages
func (h *DiscordCompatHandler) GetChannelMessages(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "id")
	q := r.URL.Query()

	limit := 50
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	var before *string
	if v := q.Get("before"); v != "" {
		before = &v
	}

	msgs, err := h.msgRepo.ListByStream(r.Context(), channelID, before, limit)
	if err != nil {
		writeDiscordJSON(w, 200, []interface{}{})
		return
	}

	h.msgRepo.EnrichMessages(r.Context(), msgs)

	result := make([]map[string]interface{}, 0, len(msgs))
	for _, m := range msgs {
		result = append(result, toDiscordMessage(&m))
	}
	writeDiscordJSON(w, 200, result)
}

// POST /channels/{id}/messages
func (h *DiscordCompatHandler) CreateChannelMessage(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "id")
	botUserID := getBotUserID(r.Context())

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeDiscordError(w, 400, 50035, "Invalid Form Body")
		return
	}

	msg := &models.Message{
		StreamID: &channelID,
		AuthorID: botUserID,
		Content:  body.Content,
	}

	if err := h.msgRepo.Create(r.Context(), msg); err != nil {
		writeDiscordError(w, 500, 0, "Internal Server Error")
		return
	}

	writeDiscordJSON(w, 200, toDiscordMessage(msg))
}

// GET /channels/{id}/messages/{mid}
func (h *DiscordCompatHandler) GetChannelMessage(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "mid")
	msg, err := h.msgRepo.GetByID(r.Context(), msgID)
	if err != nil {
		writeDiscordError(w, 404, 10008, "Unknown Message")
		return
	}
	writeDiscordJSON(w, 200, toDiscordMessage(msg))
}

// DELETE /channels/{id}/messages/{mid}
func (h *DiscordCompatHandler) DeleteChannelMessage(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "mid")
	if err := h.msgRepo.Delete(r.Context(), msgID); err != nil {
		writeDiscordError(w, 404, 10008, "Unknown Message")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Conversion functions: RiftApp models -> Discord JSON shapes

func (h *DiscordCompatHandler) toDiscordApplication(ctx interface{ Value(any) any }, app *models.Application) map[string]interface{} {
	result := map[string]interface{}{
		"id":                       app.ID,
		"name":                     app.Name,
		"icon":                     app.Icon,
		"description":              app.Description,
		"bot_public":               app.BotPublic,
		"bot_require_code_grant":   app.BotRequireCodeGrant,
		"terms_of_service_url":     app.TermsOfServiceURL,
		"privacy_policy_url":       app.PrivacyPolicyURL,
		"verify_key":               app.VerifyKey,
		"flags":                    app.Flags,
		"tags":                     app.Tags,
		"interactions_endpoint_url": app.InteractionsEndpointURL,
		"role_connections_verification_url": app.RoleConnectionsVerificationURL,
		"install_params":           nil,
		"approximate_guild_count":  app.ApproximateGuildCount,
	}

	if app.Bot != nil {
		result["bot"] = toDiscordUser(app.Bot)
	}
	if app.Owner != nil {
		result["owner"] = toDiscordUser(app.Owner)
	}

	return result
}

func toDiscordUser(u *models.User) map[string]interface{} {
	discrim := "0000"
	flags := 0
	if u.IsBot {
		flags = 1 << 16 // VERIFIED_BOT flag
	}

	result := map[string]interface{}{
		"id":            u.ID,
		"username":      u.Username,
		"discriminator": discrim,
		"global_name":   u.DisplayName,
		"avatar":        u.AvatarURL,
		"bot":           u.IsBot,
		"system":        false,
		"banner":        nil,
		"accent_color":  nil,
		"public_flags":  flags,
	}
	return result
}

func toDiscordGuild(hub *models.Hub) map[string]interface{} {
	return map[string]interface{}{
		"id":                          hub.ID,
		"name":                        hub.Name,
		"icon":                        hub.IconURL,
		"splash":                      nil,
		"discovery_splash":            nil,
		"owner_id":                    hub.OwnerID,
		"region":                      "us-east",
		"afk_channel_id":              nil,
		"afk_timeout":                 300,
		"verification_level":          0,
		"default_message_notifications": 0,
		"explicit_content_filter":     0,
		"roles":                       []interface{}{},
		"emojis":                      []interface{}{},
		"features":                    []interface{}{},
		"mfa_level":                   0,
		"system_channel_id":           nil,
		"system_channel_flags":        0,
		"rules_channel_id":            nil,
		"max_members":                 500000,
		"vanity_url_code":             nil,
		"description":                 nil,
		"banner":                      hub.BannerURL,
		"premium_tier":                0,
		"premium_subscription_count":  0,
		"preferred_locale":            "en-US",
		"nsfw_level":                  0,
		"premium_progress_bar_enabled": false,
	}
}

func toDiscordChannel(s *models.Stream) map[string]interface{} {
	chType := 0
	if s.Type == 1 {
		chType = 2 // voice
	}

	return map[string]interface{}{
		"id":                     s.ID,
		"type":                   chType,
		"guild_id":               s.HubID,
		"name":                   s.Name,
		"position":               s.Position,
		"permission_overwrites":  []interface{}{},
		"nsfw":                   false,
		"topic":                  nil,
		"last_message_id":        nil,
		"rate_limit_per_user":    0,
	}
}

func toDiscordMember(m *repository.MemberWithRole) map[string]interface{} {
	user := map[string]interface{}{
		"id":            m.ID,
		"username":      m.Username,
		"discriminator": "0000",
		"global_name":   m.DisplayName,
		"avatar":        m.AvatarURL,
		"bot":           m.IsBot,
	}

	roles := []string{}
	if m.RankID != nil {
		roles = append(roles, *m.RankID)
	}

	return map[string]interface{}{
		"user":      user,
		"nick":      nil,
		"avatar":    nil,
		"roles":     roles,
		"joined_at": m.JoinedAt.Format("2006-01-02T15:04:05.000000+00:00"),
		"deaf":      false,
		"mute":      false,
	}
}

func toDiscordRole(r *models.Rank) map[string]interface{} {
	return map[string]interface{}{
		"id":           r.ID,
		"name":         r.Name,
		"color":        colorToInt(r.Color),
		"hoist":        false,
		"icon":         nil,
		"position":     r.Position,
		"permissions":  fmt.Sprintf("%d", mapPermissions(r.Permissions)),
		"managed":      false,
		"mentionable":  false,
	}
}

func toDiscordMessage(m *models.Message) map[string]interface{} {
	result := map[string]interface{}{
		"id":               m.ID,
		"type":             0,
		"content":          m.Content,
		"channel_id":       m.StreamID,
		"pinned":           m.Pinned,
		"tts":              false,
		"mention_everyone": false,
		"mentions":         []interface{}{},
		"mention_roles":    []interface{}{},
		"attachments":      toDiscordAttachments(m.Attachments),
		"embeds":           []interface{}{},
		"timestamp":        m.CreatedAt.Format("2006-01-02T15:04:05.000000+00:00"),
		"edited_timestamp": nil,
	}

	if m.EditedAt != nil {
		result["edited_timestamp"] = m.EditedAt.Format("2006-01-02T15:04:05.000000+00:00")
	}

	if m.Author != nil {
		result["author"] = toDiscordUser(m.Author)
	} else {
		result["author"] = map[string]interface{}{
			"id":            m.AuthorID,
			"username":      "unknown",
			"discriminator": "0000",
			"avatar":        nil,
		}
	}

	return result
}

func toDiscordAttachments(atts []models.Attachment) []map[string]interface{} {
	if len(atts) == 0 {
		return []map[string]interface{}{}
	}
	result := make([]map[string]interface{}, 0, len(atts))
	for _, a := range atts {
		result = append(result, map[string]interface{}{
			"id":           a.ID,
			"filename":     a.Filename,
			"url":          a.URL,
			"proxy_url":    a.URL,
			"size":         a.SizeBytes,
			"content_type": a.ContentType,
		})
	}
	return result
}

// Map RiftApp permission bits to Discord's permission bitfield format
func mapPermissions(riftPerms int64) int64 {
	var discord int64
	if riftPerms&models.PermViewStreams != 0 {
		discord |= 0x0000000000000400 // VIEW_CHANNEL
	}
	if riftPerms&models.PermSendMessages != 0 {
		discord |= 0x0000000000000800 // SEND_MESSAGES
	}
	if riftPerms&models.PermManageMessages != 0 {
		discord |= 0x0000000000002000 // MANAGE_MESSAGES
	}
	if riftPerms&models.PermManageStreams != 0 {
		discord |= 0x0000000000000010 // MANAGE_CHANNELS
	}
	if riftPerms&models.PermManageHub != 0 {
		discord |= 0x0000000000000020 // MANAGE_GUILD
	}
	if riftPerms&models.PermManageRanks != 0 {
		discord |= 0x0000000010000000 // MANAGE_ROLES
	}
	if riftPerms&models.PermKickMembers != 0 {
		discord |= 0x0000000000000002 // KICK_MEMBERS
	}
	if riftPerms&models.PermBanMembers != 0 {
		discord |= 0x0000000000000004 // BAN_MEMBERS
	}
	if riftPerms&models.PermConnectVoice != 0 {
		discord |= 0x0000000000100000 // CONNECT
	}
	if riftPerms&models.PermSpeakVoice != 0 {
		discord |= 0x0000000000200000 // SPEAK
	}
	if riftPerms&models.PermAdministrator != 0 {
		discord |= 0x0000000000000008 // ADMINISTRATOR
	}
	return discord
}

func colorToInt(hex string) int {
	hex = strings.TrimPrefix(hex, "#")
	val, err := strconv.ParseInt(hex, 16, 64)
	if err != nil {
		return 0
	}
	return int(val)
}
