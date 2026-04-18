package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/riftapp-cloud/riftapp/internal/middleware"
	"github.com/riftapp-cloud/riftapp/internal/user"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

// UserHandler handles user profile endpoints.
type UserHandler struct {
	service *user.Service
	hub     *ws.Hub
}

func NewUserHandler(service *user.Service, hub *ws.Hub) *UserHandler {
	return &UserHandler{service: service, hub: hub}
}

// GetMe returns the authenticated user's full profile.
// GET /api/users/@me
func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	u, err := h.service.GetProfile(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	applyLiveUserStatus(h.hub, u)

	writeData(w, http.StatusOK, u)
}

// UpdateMe patches the authenticated user's profile.
// PATCH /api/users/@me
func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var input user.UpdateProfileInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	updated, err := h.service.UpdateProfile(r.Context(), userID, input)
	if err != nil {
		status := http.StatusBadRequest
		switch {
		case errors.Is(err, user.ErrUsernameTaken):
			status = http.StatusConflict
		case errors.Is(err, user.ErrNothingToUpdate):
			status = http.StatusBadRequest
		}
		writeError(w, status, err.Error())
		return
	}
	applyLiveUserStatus(h.hub, updated)
	if h.hub != nil {
		publicUser := *updated
		publicUser.Email = nil
		h.hub.BroadcastUserUpdate(userID, ws.NewEvent(ws.OpUserUpdate, publicUser))
	}

	writeData(w, http.StatusOK, updated)
}

// SearchUser looks up a user by exact username.
// GET /api/users/search?q=username
func (h *UserHandler) SearchUser(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeError(w, http.StatusBadRequest, "q is required")
		return
	}

	u, err := h.service.SearchByUsername(r.Context(), q)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	applyLiveUserStatus(h.hub, u)
	u.Email = nil
	writeData(w, http.StatusOK, u)
}

// GetUser returns a public profile by user ID.
// GET /api/users/{userID}
func (h *UserHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "userID")

	u, err := h.service.GetProfile(r.Context(), targetID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	applyLiveUserStatus(h.hub, u)
	// Strip private fields for public view
	u.Email = nil
	writeData(w, http.StatusOK, u)
}
