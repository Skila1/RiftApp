package api

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/riptide-cloud/riptide/internal/middleware"
	"github.com/riptide-cloud/riptide/internal/models"
)

type HubHandler struct {
	db     *pgxpool.Pool
	notifH *NotifHandler
}

func NewHubHandler(db *pgxpool.Pool) *HubHandler {
	return &HubHandler{db: db}
}

// ── Create ─────────────────────────────────────────────────────────

func (h *HubHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	hub := models.Hub{
		ID:        uuid.New().String(),
		Name:      body.Name,
		OwnerID:   userID,
		CreatedAt: time.Now(),
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO hubs (id, name, owner_id, created_at) VALUES ($1, $2, $3, $4)`,
		hub.ID, hub.Name, hub.OwnerID, hub.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create hub")
		return
	}

	// Add owner as member with owner role
	_, err = tx.Exec(ctx,
		`INSERT INTO hub_members (hub_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)`,
		hub.ID, userID, models.RoleOwner, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	// Create default "general" stream
	_, err = tx.Exec(ctx,
		`INSERT INTO streams (id, hub_id, name, type, position, created_at) VALUES ($1, $2, 'general', 0, 0, $3)`,
		uuid.New().String(), hub.ID, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create default stream")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, hub)
}

// ── Update ─────────────────────────────────────────────────────────

func (h *HubHandler) Update(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	if !h.canManage(r.Context(), hubID, userID) {
		writeError(w, http.StatusForbidden, "you do not have permission to edit this hub")
		return
	}

	var body struct {
		Name    *string `json:"name"`
		IconURL *string `json:"icon_url"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.Name == nil && body.IconURL == nil {
		writeError(w, http.StatusBadRequest, "no fields to update")
		return
	}

	// Build dynamic update
	setClauses := []string{}
	args := []interface{}{hubID}
	argIdx := 2

	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" || len(name) > 100 {
			writeError(w, http.StatusBadRequest, "name must be 1-100 characters")
			return
		}
		setClauses = append(setClauses, "name = $"+itoa(argIdx))
		args = append(args, name)
		argIdx++
	}

	if body.IconURL != nil {
		url := strings.TrimSpace(*body.IconURL)
		if len(url) > 512 {
			writeError(w, http.StatusBadRequest, "icon_url must be at most 512 characters")
			return
		}
		setClauses = append(setClauses, "icon_url = $"+itoa(argIdx))
		args = append(args, url)
		argIdx++
	}

	query := "UPDATE hubs SET " + strings.Join(setClauses, ", ") + " WHERE id = $1 RETURNING id, name, owner_id, icon_url, created_at"
	var hub models.Hub
	err := h.db.QueryRow(r.Context(), query, args...).Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.IconURL, &hub.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "hub not found")
		return
	}

	writeJSON(w, http.StatusOK, hub)
}

// ── List ───────────────────────────────────────────────────────────

func (h *HubHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	rows, err := h.db.Query(r.Context(),
		`SELECT h.id, h.name, h.owner_id, h.icon_url, h.created_at
		 FROM hubs h JOIN hub_members hm ON h.id = hm.hub_id
		 WHERE hm.user_id = $1
		 ORDER BY h.created_at`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	hubs := []models.Hub{}
	for rows.Next() {
		var hub models.Hub
		if err := rows.Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.IconURL, &hub.CreatedAt); err != nil {
			continue
		}
		hubs = append(hubs, hub)
	}

	writeJSON(w, http.StatusOK, hubs)
}

// ── Get ────────────────────────────────────────────────────────────

func (h *HubHandler) Get(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	if !h.isMember(r.Context(), hubID, userID) {
		writeError(w, http.StatusForbidden, "not a member")
		return
	}

	var hub models.Hub
	err := h.db.QueryRow(r.Context(),
		`SELECT id, name, owner_id, icon_url, created_at FROM hubs WHERE id = $1`, hubID,
	).Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.IconURL, &hub.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "hub not found")
		return
	}

	writeJSON(w, http.StatusOK, hub)
}

// ── Join (direct) ──────────────────────────────────────────────────

func (h *HubHandler) Join(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	if h.isMember(r.Context(), hubID, userID) {
		writeError(w, http.StatusConflict, "already a member")
		return
	}

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO hub_members (hub_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)`,
		hubID, userID, models.RoleMember, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to join")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "joined"})
}

// ── Leave ──────────────────────────────────────────────────────────

func (h *HubHandler) Leave(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	// Owners cannot leave their own hub
	var ownerID string
	err := h.db.QueryRow(r.Context(), `SELECT owner_id FROM hubs WHERE id = $1`, hubID).Scan(&ownerID)
	if err != nil {
		writeError(w, http.StatusNotFound, "hub not found")
		return
	}
	if ownerID == userID {
		writeError(w, http.StatusForbidden, "owner cannot leave the hub")
		return
	}

	_, err = h.db.Exec(r.Context(),
		`DELETE FROM hub_members WHERE hub_id = $1 AND user_id = $2`, hubID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to leave")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "left"})
}

// ── Members ────────────────────────────────────────────────────────

func (h *HubHandler) Members(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	if !h.isMember(r.Context(), hubID, userID) {
		writeError(w, http.StatusForbidden, "not a member")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.status, u.last_seen, hm.role
		 FROM users u JOIN hub_members hm ON u.id = hm.user_id
		 WHERE hm.hub_id = $1
		 ORDER BY CASE hm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, hm.joined_at`, hubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	type memberResponse struct {
		models.User
		Role string `json:"role"`
	}
	members := []memberResponse{}
	for rows.Next() {
		var m memberResponse
		if err := rows.Scan(&m.ID, &m.Username, &m.DisplayName, &m.AvatarURL, &m.Bio, &m.Status, &m.LastSeen, &m.Role); err != nil {
			continue
		}
		members = append(members, m)
	}

	writeJSON(w, http.StatusOK, members)
}

// ── Create Invite ──────────────────────────────────────────────────

func (h *HubHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	hubID := chi.URLParam(r, "hubID")
	userID := middleware.GetUserID(r.Context())

	if !h.canManage(r.Context(), hubID, userID) {
		writeError(w, http.StatusForbidden, "you do not have permission to create invites")
		return
	}

	var body struct {
		MaxUses   int    `json:"max_uses"`   // 0 = unlimited
		ExpiresIn *int   `json:"expires_in"` // seconds, nil = never
	}
	// Body is optional — defaults to unlimited, no expiry
	readJSON(r, &body)

	code, err := generateInviteCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate invite code")
		return
	}

	invite := models.HubInvite{
		ID:        uuid.New().String(),
		HubID:     hubID,
		CreatorID: userID,
		Code:      code,
		MaxUses:   body.MaxUses,
		Uses:      0,
		CreatedAt: time.Now(),
	}

	if body.ExpiresIn != nil && *body.ExpiresIn > 0 {
		exp := time.Now().Add(time.Duration(*body.ExpiresIn) * time.Second)
		invite.ExpiresAt = &exp
	}

	_, err = h.db.Exec(r.Context(),
		`INSERT INTO hub_invites (id, hub_id, creator_id, code, max_uses, uses, expires_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		invite.ID, invite.HubID, invite.CreatorID, invite.Code,
		invite.MaxUses, invite.Uses, invite.ExpiresAt, invite.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create invite")
		return
	}

	writeJSON(w, http.StatusCreated, invite)
}

// ── Join via Invite Code ───────────────────────────────────────────

func (h *HubHandler) JoinViaInvite(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	userID := middleware.GetUserID(r.Context())

	// Look up invite
	var invite models.HubInvite
	err := h.db.QueryRow(r.Context(),
		`SELECT id, hub_id, creator_id, code, max_uses, uses, expires_at, created_at
		 FROM hub_invites WHERE code = $1`, code,
	).Scan(&invite.ID, &invite.HubID, &invite.CreatorID, &invite.Code,
		&invite.MaxUses, &invite.Uses, &invite.ExpiresAt, &invite.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "invalid invite code")
		return
	}

	// Check expiry
	if invite.ExpiresAt != nil && time.Now().After(*invite.ExpiresAt) {
		writeError(w, http.StatusGone, "invite has expired")
		return
	}

	// Check max uses
	if invite.MaxUses > 0 && invite.Uses >= invite.MaxUses {
		writeError(w, http.StatusGone, "invite has reached maximum uses")
		return
	}

	// Check already a member
	if h.isMember(r.Context(), invite.HubID, userID) {
		writeError(w, http.StatusConflict, "already a member of this hub")
		return
	}

	// Join + increment uses in a transaction
	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO hub_members (hub_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)`,
		invite.HubID, userID, models.RoleMember, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to join hub")
		return
	}

	_, err = tx.Exec(ctx,
		`UPDATE hub_invites SET uses = uses + 1 WHERE id = $1`, invite.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Return the hub the user just joined
	var hub models.Hub
	h.db.QueryRow(ctx,
		`SELECT id, name, owner_id, icon_url, created_at FROM hubs WHERE id = $1`, invite.HubID,
	).Scan(&hub.ID, &hub.Name, &hub.OwnerID, &hub.IconURL, &hub.CreatedAt)

	// Notify the invite creator that someone joined (skip self-join)
	if h.notifH != nil && invite.CreatorID != userID {
		var joinerName string
		h.db.QueryRow(ctx,
			`SELECT display_name FROM users WHERE id = $1`, userID).Scan(&joinerName)
		title := joinerName + " joined " + hub.Name + " via your invite"
		go h.notifH.CreateNotification(invite.CreatorID, "invite", title, nil, nil, &invite.HubID, nil, &userID)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "joined",
		"hub":    hub,
	})
}

// ── Helpers ────────────────────────────────────────────────────────

func (h *HubHandler) isMember(ctx context.Context, hubID, userID string) bool {
	var exists bool
	h.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM hub_members WHERE hub_id = $1 AND user_id = $2)`,
		hubID, userID).Scan(&exists)
	return exists
}

// canManage returns true if the user's role in the hub grants PermManageHub.
func (h *HubHandler) canManage(ctx context.Context, hubID, userID string) bool {
	return memberHasPermission(ctx, h.db, hubID, userID, models.PermManageHub)
}

// generateInviteCode creates a cryptographically random 8-character
// alphanumeric invite code (base32, no padding).
func generateInviteCode() (string, error) {
	b := make([]byte, 5) // 5 bytes = 8 base32 chars
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)), nil
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}
