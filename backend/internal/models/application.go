package models

import "time"

type Application struct {
	ID                             string    `json:"id"`
	OwnerID                        string    `json:"owner_id"`
	Name                           string    `json:"name"`
	Description                    string    `json:"description"`
	Icon                           *string   `json:"icon"`
	BotUserID                      *string   `json:"bot_user_id,omitempty"`
	BotPublic                      bool      `json:"bot_public"`
	BotRequireCodeGrant            bool      `json:"bot_require_code_grant"`
	VerifyKey                      string    `json:"verify_key"`
	Tags                           []string  `json:"tags"`
	TermsOfServiceURL              *string   `json:"terms_of_service_url,omitempty"`
	PrivacyPolicyURL               *string   `json:"privacy_policy_url,omitempty"`
	InteractionsEndpointURL        *string   `json:"interactions_endpoint_url,omitempty"`
	RoleConnectionsVerificationURL *string   `json:"role_connections_verification_url,omitempty"`
	CustomInstallURL               *string   `json:"custom_install_url,omitempty"`
	InstallParams                  *string   `json:"install_params,omitempty"`
	Flags                          int       `json:"flags"`
	CreatedAt                      time.Time `json:"created_at"`
	UpdatedAt                      time.Time `json:"updated_at"`
	Owner                          *User     `json:"owner,omitempty"`
	Bot                            *User     `json:"bot,omitempty"`
	ApproximateGuildCount          int       `json:"approximate_guild_count,omitempty"`
}

type BotToken struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	BotUserID     string    `json:"bot_user_id"`
	TokenHash     string    `json:"-"`
	CreatedAt     time.Time `json:"created_at"`
}

type OAuth2Redirect struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	RedirectURI   string    `json:"redirect_uri"`
	CreatedAt     time.Time `json:"created_at"`
}

type AppEmoji struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	Name          string    `json:"name"`
	ImageHash     string    `json:"image_hash"`
	CreatedAt     time.Time `json:"created_at"`
}

type AppWebhook struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	URL           string    `json:"url"`
	Secret        string    `json:"secret"`
	EventTypes    []string  `json:"event_types"`
	Enabled       bool      `json:"enabled"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type AppTester struct {
	ApplicationID string    `json:"application_id"`
	UserID        string    `json:"user_id"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	User          *User     `json:"user,omitempty"`
}

type RichPresenceAsset struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	Name          string    `json:"name"`
	Type          string    `json:"type"`
	ImageHash     string    `json:"image_hash"`
	CreatedAt     time.Time `json:"created_at"`
}

type ApplicationCommandOptionChoice struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ApplicationCommandOption struct {
	Name        string                          `json:"name"`
	Description string                          `json:"description"`
	Type        int                             `json:"type"`
	Required    bool                            `json:"required"`
	Choices     []ApplicationCommandOptionChoice `json:"choices,omitempty"`
}

type ApplicationCommand struct {
	ID            string                     `json:"id"`
	ApplicationID string                     `json:"application_id"`
	HubID         *string                    `json:"guild_id,omitempty"`
	Name          string                     `json:"name"`
	Description   string                     `json:"description"`
	Options       []ApplicationCommandOption `json:"options"`
	Type          int                        `json:"type"`
	CreatedAt     time.Time                  `json:"created_at"`
	UpdatedAt     time.Time                  `json:"updated_at"`
	Bot           *User                      `json:"bot,omitempty"`
}
