package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riftapp-cloud/riftapp/internal/admin"
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/moderation"
	"github.com/riftapp-cloud/riftapp/internal/smtp"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

type AdminHandler struct {
	adminSvc *admin.Service
	smtpSvc  *smtp.Service
	db       *pgxpool.Pool
	wsHub    *ws.Hub
	modSvc   *moderation.Service
	startAt  time.Time
}

func NewAdminHandler(
	adminSvc *admin.Service,
	smtpSvc *smtp.Service,
	db *pgxpool.Pool,
	wsHub *ws.Hub,
	modSvc *moderation.Service,
) *AdminHandler {
	return &AdminHandler{
		adminSvc: adminSvc,
		smtpSvc:  smtpSvc,
		db:       db,
		wsHub:    wsHub,
		modSvc:   modSvc,
		startAt:  time.Now(),
	}
}

// --- Users ---

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	var total int
	if search != "" {
		h.db.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM users WHERE lower(username) LIKE '%' || lower($1) || '%' OR email LIKE '%' || lower($1) || '%'`, search).Scan(&total)
	} else {
		h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&total)
	}

	var query string
	var args []interface{}
	if search != "" {
		query = `SELECT id, username, email, display_name, avatar_url, bio, status, last_seen, created_at, updated_at, banned_at, is_bot
				 FROM users WHERE lower(username) LIKE '%' || lower($1) || '%' OR email LIKE '%' || lower($1) || '%'
				 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		args = []interface{}{search, limit, offset}
	} else {
		query = `SELECT id, username, email, display_name, avatar_url, bio, status, last_seen, created_at, updated_at, banned_at, is_bot
				 FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`
		args = []interface{}{limit, offset}
	}

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	defer rows.Close()

	type AdminUser struct {
		ID          string     `json:"id"`
		Username    string     `json:"username"`
		Email       *string    `json:"email,omitempty"`
		DisplayName string     `json:"display_name"`
		AvatarURL   *string    `json:"avatar_url,omitempty"`
		Bio         *string    `json:"bio,omitempty"`
		Status      int        `json:"status"`
		LastSeen    *time.Time `json:"last_seen,omitempty"`
		CreatedAt   time.Time  `json:"created_at"`
		UpdatedAt   time.Time  `json:"updated_at"`
		BannedAt    *time.Time `json:"banned_at,omitempty"`
		IsBot       bool       `json:"is_bot"`
	}

	var users []AdminUser
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Status, &u.LastSeen, &u.CreatedAt, &u.UpdatedAt, &u.BannedAt, &u.IsBot); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		users = append(users, u)
	}
	if users == nil {
		users = []AdminUser{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"users": users, "total": total})
}

func (h *AdminHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")

	type UserDetail struct {
		ID           string     `json:"id"`
		Username     string     `json:"username"`
		Email        *string    `json:"email,omitempty"`
		DisplayName  string     `json:"display_name"`
		AvatarURL    *string    `json:"avatar_url,omitempty"`
		Bio          *string    `json:"bio,omitempty"`
		Status       int        `json:"status"`
		LastSeen     *time.Time `json:"last_seen,omitempty"`
		CreatedAt    time.Time  `json:"created_at"`
		UpdatedAt    time.Time  `json:"updated_at"`
		BannedAt     *time.Time `json:"banned_at,omitempty"`
		IsBot        bool       `json:"is_bot"`
		HubCount     int        `json:"hub_count"`
		MessageCount int        `json:"message_count"`
	}

	var u UserDetail
	err := h.db.QueryRow(r.Context(),
		`SELECT id, username, email, display_name, avatar_url, bio, status, last_seen, created_at, updated_at, banned_at, is_bot
		 FROM users WHERE id = $1`, userID,
	).Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Status, &u.LastSeen, &u.CreatedAt, &u.UpdatedAt, &u.BannedAt, &u.IsBot)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM hub_members WHERE user_id = $1`, userID).Scan(&u.HubCount)
	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM messages WHERE author_id = $1`, userID).Scan(&u.MessageCount)

	writeJSON(w, http.StatusOK, u)
}

func (h *AdminHandler) BanUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	cmd, err := h.db.Exec(r.Context(),
		`UPDATE users SET banned_at = now(), status = $2, updated_at = now() WHERE id = $1 AND banned_at IS NULL`, userID, models.UserStatusOffline)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ban user")
		return
	}
	if cmd.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "user not found or already banned")
		return
	}
	claims := admin.GetAdminClaims(r.Context())
	log.Printf("admin: user %s banned by %s", userID, claims.UserID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) UnbanUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	cmd, err := h.db.Exec(r.Context(),
		`UPDATE users SET banned_at = NULL, updated_at = now() WHERE id = $1 AND banned_at IS NOT NULL`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unban user")
		return
	}
	if cmd.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "user not found or not banned")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) EditUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	var body struct {
		Username    *string `json:"username"`
		DisplayName *string `json:"display_name"`
		Bio         *string `json:"bio"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	setClauses := []string{}
	args := []interface{}{userID}
	idx := 2
	if body.Username != nil {
		setClauses = append(setClauses, fmt.Sprintf("username = $%d", idx))
		args = append(args, *body.Username)
		idx++
	}
	if body.DisplayName != nil {
		setClauses = append(setClauses, fmt.Sprintf("display_name = $%d", idx))
		args = append(args, *body.DisplayName)
		idx++
	}
	if body.Bio != nil {
		setClauses = append(setClauses, fmt.Sprintf("bio = $%d", idx))
		args = append(args, *body.Bio)
		idx++
	}
	if len(setClauses) == 0 {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	query := fmt.Sprintf("UPDATE users SET %s, updated_at = now() WHERE id = $1", strings.Join(setClauses, ", "))
	cmd, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update user")
		return
	}
	if cmd.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Hubs ---

func (h *AdminHandler) ListHubs(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	type AdminHub struct {
		ID          string    `json:"id"`
		Name        string    `json:"name"`
		OwnerID     string    `json:"owner_id"`
		OwnerName   string    `json:"owner_name"`
		IconURL     *string   `json:"icon_url,omitempty"`
		MemberCount int       `json:"member_count"`
		CreatedAt   time.Time `json:"created_at"`
	}

	var total int
	if search != "" {
		h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM hubs WHERE lower(name) LIKE '%' || lower($1) || '%'`, search).Scan(&total)
	} else {
		h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM hubs`).Scan(&total)
	}

	var query string
	var args []interface{}
	if search != "" {
		query = `SELECT h.id, h.name, h.owner_id, COALESCE(u.display_name, u.username), h.icon_url,
				 (SELECT COUNT(*) FROM hub_members hm WHERE hm.hub_id = h.id), h.created_at
				 FROM hubs h JOIN users u ON h.owner_id = u.id
				 WHERE lower(h.name) LIKE '%' || lower($1) || '%'
				 ORDER BY h.created_at DESC LIMIT $2 OFFSET $3`
		args = []interface{}{search, limit, offset}
	} else {
		query = `SELECT h.id, h.name, h.owner_id, COALESCE(u.display_name, u.username), h.icon_url,
				 (SELECT COUNT(*) FROM hub_members hm WHERE hm.hub_id = h.id), h.created_at
				 FROM hubs h JOIN users u ON h.owner_id = u.id
				 ORDER BY h.created_at DESC LIMIT $1 OFFSET $2`
		args = []interface{}{limit, offset}
	}

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list hubs")
		return
	}
	defer rows.Close()

	var hubs []AdminHub
	for rows.Next() {
		var hub AdminHub
		if err := rows.Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.OwnerName, &hub.IconURL, &hub.MemberCount, &hub.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		hubs = append(hubs, hub)
	}
	if hubs == nil {
		hubs = []AdminHub{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"hubs": hubs, "total": total})
}

func (h *AdminHandler) GetHub(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")

	type HubDetail struct {
		ID           string    `json:"id"`
		Name         string    `json:"name"`
		OwnerID      string    `json:"owner_id"`
		OwnerName    string    `json:"owner_name"`
		IconURL      *string   `json:"icon_url,omitempty"`
		BannerURL    *string   `json:"banner_url,omitempty"`
		MemberCount  int       `json:"member_count"`
		StreamCount  int       `json:"stream_count"`
		MessageCount int       `json:"message_count"`
		CreatedAt    time.Time `json:"created_at"`
	}

	var hub HubDetail
	err := h.db.QueryRow(r.Context(),
		`SELECT h.id, h.name, h.owner_id, COALESCE(u.display_name, u.username), h.icon_url, h.banner_url, h.created_at
		 FROM hubs h JOIN users u ON h.owner_id = u.id WHERE h.id = $1`, hubID,
	).Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.OwnerName, &hub.IconURL, &hub.BannerURL, &hub.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "hub not found")
		return
	}

	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM hub_members WHERE hub_id = $1`, hubID).Scan(&hub.MemberCount)
	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM streams WHERE hub_id = $1`, hubID).Scan(&hub.StreamCount)
	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM messages m JOIN streams s ON m.stream_id = s.id WHERE s.hub_id = $1`, hubID).Scan(&hub.MessageCount)

	writeJSON(w, http.StatusOK, hub)
}

func (h *AdminHandler) DeleteHub(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	cmd, err := h.db.Exec(r.Context(), `DELETE FROM hubs WHERE id = $1`, hubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete hub")
		return
	}
	if cmd.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "hub not found")
		return
	}
	claims := admin.GetAdminClaims(r.Context())
	log.Printf("admin: hub %s deleted by %s", hubID, claims.UserID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Analytics ---

func (h *AdminHandler) Analytics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	stats := make(map[string]interface{})

	scan := func(q string, args ...any) int {
		var n int
		h.db.QueryRow(ctx, q, args...).Scan(&n)
		return n
	}

	stats["total_users"] = scan(`SELECT COUNT(*) FROM users`)
	stats["total_bots"] = scan(`SELECT COUNT(*) FROM users WHERE is_bot = true`)
	stats["banned_users"] = scan(`SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL`)
	stats["online_users"] = scan(`SELECT COUNT(*) FROM users WHERE status > $1`, models.UserStatusOffline)
	stats["total_hubs"] = scan(`SELECT COUNT(*) FROM hubs`)
	stats["total_messages"] = scan(`SELECT COUNT(*) FROM messages`)
	stats["total_dms"] = scan(`SELECT COUNT(*) FROM messages WHERE conversation_id IS NOT NULL`)
	stats["total_reports"] = scan(`SELECT COUNT(*) FROM reports`)
	stats["open_reports"] = scan(`SELECT COUNT(*) FROM reports WHERE status = 'open'`)
	stats["active_sessions"] = scan(`SELECT COUNT(*) FROM refresh_tokens WHERE expires_at > now()`)

	stats["new_users_24h"] = scan(`SELECT COUNT(*) FROM users WHERE created_at > now() - interval '24 hours'`)
	stats["new_users_7d"] = scan(`SELECT COUNT(*) FROM users WHERE created_at > now() - interval '7 days'`)
	stats["messages_24h"] = scan(`SELECT COUNT(*) FROM messages WHERE created_at > now() - interval '24 hours'`)
	stats["messages_7d"] = scan(`SELECT COUNT(*) FROM messages WHERE created_at > now() - interval '7 days'`)

	writeJSON(w, http.StatusOK, stats)
}

// --- Sessions ---

func (h *AdminHandler) ListAdminSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := h.adminSvc.ListAdminSessions(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	if sessions == nil {
		sessions = []admin.Session{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"sessions": sessions})
}

func (h *AdminHandler) ListUserSessions(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	sessions, total, err := h.adminSvc.ListUserSessions(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	if sessions == nil {
		sessions = []admin.UserSession{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"sessions": sessions, "total": total})
}

func (h *AdminHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "sessionID")
	var body struct {
		Type string `json:"type"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	claims := admin.GetAdminClaims(r.Context())

	var err error
	switch body.Type {
	case "user":
		err = h.adminSvc.RevokeUserSession(r.Context(), id)
	case "admin":
		if admin.RoleLevel(claims.Role) < admin.RoleLevel(admin.RoleSuperAdmin) {
			writeError(w, http.StatusForbidden, "only super admins can revoke admin sessions")
			return
		}
		err = h.adminSvc.RevokeAdminSession(r.Context(), id)
	default:
		writeError(w, http.StatusBadRequest, "type must be 'user' or 'admin'")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to revoke session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Status ---

func (h *AdminHandler) Status(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	status := map[string]interface{}{
		"uptime_seconds": int(time.Since(h.startAt).Seconds()),
		"go_version":     runtime.Version(),
		"goroutines":     runtime.NumGoroutine(),
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	status["memory_mb"] = int(memStats.Alloc / 1024 / 1024)

	status["database"] = checkDB(ctx, h.db)

	if h.wsHub != nil {
		status["websocket_connections"] = h.wsHub.ClientCount()
	}

	if h.modSvc != nil {
		status["localmod"] = "connected"
	} else {
		status["localmod"] = "disabled"
	}

	if h.smtpSvc != nil {
		if err := h.smtpSvc.TestConnection(ctx); err != nil {
			status["smtp"] = fmt.Sprintf("error: %v", err)
		} else {
			status["smtp"] = "connected"
		}
	} else {
		status["smtp"] = "not configured"
	}

	writeJSON(w, http.StatusOK, status)
}

func checkDB(ctx context.Context, db *pgxpool.Pool) string {
	var one int
	if err := db.QueryRow(ctx, `SELECT 1`).Scan(&one); err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return "connected"
}

// --- SMTP ---

func (h *AdminHandler) GetSMTPConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.smtpSvc.GetConfig(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"configured": false})
		return
	}
	cfg.Password = ""
	writeJSON(w, http.StatusOK, cfg)
}

func (h *AdminHandler) UpdateSMTPConfig(w http.ResponseWriter, r *http.Request) {
	var body smtp.Config
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.Password == "" {
		existing, err := h.smtpSvc.GetConfig(r.Context())
		if err == nil {
			body.Password = existing.Password
		}
	}

	claims := admin.GetAdminClaims(r.Context())
	cfg, err := h.smtpSvc.UpdateConfig(r.Context(), &body, claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update smtp config")
		return
	}
	cfg.Password = ""
	writeJSON(w, http.StatusOK, cfg)
}

func (h *AdminHandler) SendTestEmail(w http.ResponseWriter, r *http.Request) {
	var body struct {
		To string `json:"to"`
	}
	if err := readJSON(r, &body); err != nil || body.To == "" {
		writeError(w, http.StatusBadRequest, "email address required")
		return
	}

	if err := h.smtpSvc.SendTestEmail(r.Context(), body.To); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to send: %v", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Admin Accounts ---

func (h *AdminHandler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	accounts, err := h.adminSvc.ListAccounts(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list accounts")
		return
	}
	if accounts == nil {
		accounts = []admin.Account{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"accounts": accounts})
}

func (h *AdminHandler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID   string `json:"user_id"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.UserID == "" || body.Password == "" || body.Role == "" {
		writeError(w, http.StatusBadRequest, "user_id, password and role required")
		return
	}

	acct, err := h.adminSvc.CreateAccount(r.Context(), body.UserID, body.Password, body.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to create account: %v", err))
		return
	}
	writeJSON(w, http.StatusCreated, acct)
}

func (h *AdminHandler) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "accountID")
	var body struct {
		Role string `json:"role"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.adminSvc.UpdateRole(r.Context(), id, body.Role); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update role")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "accountID")
	if err := h.adminSvc.DeleteAccount(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete account")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) ResetAccountTOTP(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "accountID")
	if err := h.adminSvc.ResetTOTP(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reset 2fa")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
