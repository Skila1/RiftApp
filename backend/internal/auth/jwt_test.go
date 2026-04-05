package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestGenerateAccessToken(t *testing.T) {
	jm := NewJWTManager("test-secret")
	token, err := jm.GenerateAccessToken("user-123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestValidateAccessToken(t *testing.T) {
	jm := NewJWTManager("test-secret")
	token, _ := jm.GenerateAccessToken("user-123")

	claims, err := jm.ValidateAccessToken(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Fatalf("expected user-123, got %s", claims.UserID)
	}
}

func TestValidateAccessToken_WrongSecret(t *testing.T) {
	jm1 := NewJWTManager("secret-1")
	jm2 := NewJWTManager("secret-2")
	token, _ := jm1.GenerateAccessToken("user-123")

	_, err := jm2.ValidateAccessToken(token)
	if err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestRefreshToken(t *testing.T) {
	jm := NewJWTManager("test-secret")
	token, _ := jm.GenerateRefreshToken("user-456")

	claims, err := jm.ValidateRefreshToken(token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.UserID != "user-456" {
		t.Fatalf("expected user-456, got %s", claims.UserID)
	}
}

func TestAccessToken_CannotBeUsedAsRefresh(t *testing.T) {
	jm := NewJWTManager("test-secret")
	token, _ := jm.GenerateAccessToken("user-123")

	_, err := jm.ValidateRefreshToken(token)
	if err == nil {
		t.Fatal("expected error: access token used as refresh")
	}
}

func TestRefreshToken_CannotBeUsedAsAccess(t *testing.T) {
	jm := NewJWTManager("test-secret")
	token, _ := jm.GenerateRefreshToken("user-123")

	_, err := jm.ValidateAccessToken(token)
	if err == nil {
		t.Fatal("expected error: refresh token used as access")
	}
}

func TestExpiredToken(t *testing.T) {
	jm := &JWTManager{secret: []byte("test-secret")}
	claims := Claims{
		UserID: "user-123",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			Issuer:    "riftapp",
			Subject:   "access",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString(jm.secret)

	_, err := jm.ValidateAccessToken(tokenStr)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}
