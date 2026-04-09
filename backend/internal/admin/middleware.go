package admin

import (
	"context"
	"log"
	"net/http"
	"strings"
)

type adminContextKey string

const adminClaimsKey adminContextKey = "admin_claims"

func RequireAdmin(svc *Service, minRole string) func(http.Handler) http.Handler {
	minLevel := RoleLevel(minRole)
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

			claims, err := svc.ValidateSession(r.Context(), parts[1])
			if err != nil {
				log.Printf("admin-auth: session validation failed: %v", err)
				http.Error(w, `{"error":"invalid or expired admin session"}`, http.StatusUnauthorized)
				return
			}

			if RoleLevel(claims.Role) < minLevel {
				http.Error(w, `{"error":"insufficient permissions"}`, http.StatusForbidden)
				return
			}

			ctx := context.WithValue(r.Context(), adminClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetAdminClaims(ctx context.Context) *AdminClaims {
	if v, ok := ctx.Value(adminClaimsKey).(*AdminClaims); ok {
		return v
	}
	return nil
}
