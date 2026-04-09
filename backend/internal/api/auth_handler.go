package api

import (
	"errors"
	"io"
	"net/http"

	"github.com/riftapp-cloud/riftapp/internal/auth"
	"github.com/riftapp-cloud/riftapp/internal/middleware"
)

type AuthHandler struct {
	service *auth.Service
}

func NewAuthHandler(service *auth.Service) *AuthHandler {
	return &AuthHandler{service: service}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var input auth.RegisterInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resp, err := h.service.Register(r.Context(), input)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUsernameTaken):
			writeError(w, http.StatusConflict, "username already taken")
		case errors.Is(err, auth.ErrEmailTaken):
			writeError(w, http.StatusConflict, "email already taken")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}

	writeData(w, http.StatusCreated, resp)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var input auth.LoginInput
	if err := readJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resp, err := h.service.Login(r.Context(), input)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		if errors.Is(err, auth.ErrAccountSuspended) {
			writeError(w, http.StatusForbidden, "account suspended")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeData(w, http.StatusOK, resp)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := readJSON(r, &body); err != nil || body.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "refresh_token required")
		return
	}

	resp, err := h.service.RefreshTokens(r.Context(), body.RefreshToken)
	if err != nil {
		if errors.Is(err, auth.ErrAccountSuspended) {
			writeError(w, http.StatusForbidden, "account suspended")
			return
		}
		writeError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	writeData(w, http.StatusOK, resp)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	_ = middleware.GetUserID(r.Context())
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := readJSON(r, &body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.RefreshToken != "" {
		h.service.Logout(r.Context(), body.RefreshToken)
	}
	w.WriteHeader(http.StatusNoContent)
}
