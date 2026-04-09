package admin

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type AdminClaims struct {
	UserID    string `json:"uid"`
	Role      string `json:"role"`
	SessionID string `json:"sid"`
	jwt.RegisteredClaims
}

type AdminJWTManager struct {
	secret []byte
	ttl    time.Duration
}

func NewAdminJWTManager(secret string, ttl time.Duration) *AdminJWTManager {
	return &AdminJWTManager{secret: []byte(secret), ttl: ttl}
}

func (m *AdminJWTManager) Generate(userID, role, sessionID string) (string, error) {
	claims := AdminClaims{
		UserID:    userID,
		Role:      role,
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(m.ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "riftapp",
			Subject:   "admin_access",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *AdminJWTManager) GenerateLoginToken(userID, accountID string) (string, error) {
	claims := AdminClaims{
		UserID:    userID,
		SessionID: accountID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "riftapp",
			Subject:   "admin_login",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *AdminJWTManager) Validate(tokenStr string) (*AdminClaims, error) {
	return m.parse(tokenStr, "admin_access")
}

func (m *AdminJWTManager) ValidateLoginToken(tokenStr string) (*AdminClaims, error) {
	return m.parse(tokenStr, "admin_login")
}

func (m *AdminJWTManager) parse(tokenStr, subject string) (*AdminClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &AdminClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*AdminClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	sub, _ := claims.GetSubject()
	if sub != subject {
		return nil, errors.New("wrong token type")
	}
	return claims, nil
}
