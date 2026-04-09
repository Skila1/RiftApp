package api

import (
	"errors"
	"net"
	"net/http"
	"strings"

	"github.com/riftapp-cloud/riftapp/internal/admin"
)

type AdminAuthHandler struct {
	svc *admin.Service
}

func NewAdminAuthHandler(svc *admin.Service) *AdminAuthHandler {
	return &AdminAuthHandler{svc: svc}
}

func (h *AdminAuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Email == "" || body.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password required")
		return
	}

	ip := extractClientIP(r)
	ua := r.UserAgent()
	result, err := h.svc.Login(r.Context(), body.Email, body.Password, ip, ua)
	if err != nil {
		if errors.Is(err, admin.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *AdminAuthHandler) Verify2FA(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LoginToken string `json:"login_token"`
		Code       string `json:"code"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ip := extractClientIP(r)
	ua := r.UserAgent()
	result, err := h.svc.Verify2FA(r.Context(), body.LoginToken, body.Code, ip, ua)
	if err != nil {
		if errors.Is(err, admin.ErrInvalidCredentials) || errors.Is(err, admin.ErrInvalidTOTPCode) {
			writeError(w, http.StatusUnauthorized, "invalid code")
			return
		}
		writeError(w, http.StatusInternalServerError, "verification failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *AdminAuthHandler) SetupTOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LoginToken string `json:"login_token"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	result, err := h.svc.SetupTOTP(r.Context(), body.LoginToken)
	if err != nil {
		if errors.Is(err, admin.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid login token")
			return
		}
		writeError(w, http.StatusInternalServerError, "setup failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *AdminAuthHandler) ConfirmTOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LoginToken string `json:"login_token"`
		Code       string `json:"code"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ip := extractClientIP(r)
	ua := r.UserAgent()
	result, err := h.svc.ConfirmTOTP(r.Context(), body.LoginToken, body.Code, ip, ua)
	if err != nil {
		if errors.Is(err, admin.ErrInvalidCredentials) || errors.Is(err, admin.ErrInvalidTOTPCode) {
			writeError(w, http.StatusUnauthorized, "invalid code")
			return
		}
		writeError(w, http.StatusInternalServerError, "confirmation failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *AdminAuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	claims := admin.GetAdminClaims(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	header := r.Header.Get("Authorization")
	parts := strings.SplitN(header, " ", 2)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && parts[1] != "" {
		_ = h.svc.Logout(r.Context(), parts[1])
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminAuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	claims := admin.GetAdminClaims(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	acct, err := h.svc.GetAccountByID(r.Context(), claims.SessionID)
	if err != nil {
		writeError(w, http.StatusNotFound, "account not found")
		return
	}
	writeJSON(w, http.StatusOK, acct)
}

func (h *AdminAuthHandler) SetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LoginToken  string `json:"login_token"`
		NewPassword string `json:"new_password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.LoginToken == "" || body.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "login_token and new_password required")
		return
	}
	if len(body.NewPassword) < 12 {
		writeError(w, http.StatusBadRequest, "password must be at least 12 characters")
		return
	}

	if err := h.svc.SetInitialPassword(r.Context(), body.LoginToken, body.NewPassword); err != nil {
		if errors.Is(err, admin.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid or expired login token")
			return
		}
		if errors.Is(err, admin.ErrAccessDenied) {
			writeError(w, http.StatusForbidden, "password change not required for this account")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to set password")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func extractClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if ip := strings.TrimSpace(strings.SplitN(xff, ",", 2)[0]); ip != "" {
			return ip
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
