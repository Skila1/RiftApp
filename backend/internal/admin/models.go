package admin

import "time"

type Account struct {
	ID                 string    `json:"id"`
	UserID             string    `json:"user_id"`
	PasswordHash       string    `json:"-"`
	TOTPSecret         *string   `json:"-"`
	TOTPEnabled        bool      `json:"totp_enabled"`
	TOTPMethod         string    `json:"totp_method"`
	Role               string    `json:"role"`
	MustChangePassword bool      `json:"-"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`

	Username    string  `json:"username,omitempty"`
	Email       *string `json:"email,omitempty"`
	DisplayName string  `json:"display_name,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}

type Session struct {
	ID             string     `json:"id"`
	AdminAccountID string     `json:"admin_account_id"`
	IPAddress      string     `json:"ip_address"`
	UserAgent      string     `json:"user_agent"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	RevokedAt      *time.Time `json:"revoked_at,omitempty"`

	Username    string  `json:"username,omitempty"`
	Email       *string `json:"email,omitempty"`
	DisplayName string  `json:"display_name,omitempty"`
}

const (
	RoleSuperAdmin = "super_admin"
	RoleAdmin      = "admin"
	RoleModerator  = "moderator"
)

func RoleLevel(role string) int {
	switch role {
	case RoleSuperAdmin:
		return 3
	case RoleAdmin:
		return 2
	case RoleModerator:
		return 1
	default:
		return 0
	}
}

func ValidRole(role string) bool {
	return role == RoleSuperAdmin || role == RoleAdmin || role == RoleModerator
}
