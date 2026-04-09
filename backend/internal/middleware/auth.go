package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/riftapp-cloud/riftapp/internal/auth"
)

type contextKey string

const UserIDKey contextKey = "user_id"

type BanChecker interface {
	IsBanned(ctx context.Context, userID string) (bool, error)
}

func Auth(authService *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				http.Error(w, `{"error":"missing authorization"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(header, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
				return
			}

			claims, err := authService.ValidateToken(parts[1])
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func BanCheck(checker BanChecker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := GetUserID(r.Context())
			if userID != "" {
				banned, err := checker.IsBanned(r.Context(), userID)
				if err != nil {
					log.Printf("ban-check: failed to check ban status for %s: %v", userID, err)
					http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
					return
				}
				if banned {
					http.Error(w, `{"error":"account suspended"}`, http.StatusForbidden)
					return
				}
			}
			next.ServeHTTP(w, r.WithContext(r.Context()))
		})
	}
}

func GetUserID(ctx context.Context) string {
	if v, ok := ctx.Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}
