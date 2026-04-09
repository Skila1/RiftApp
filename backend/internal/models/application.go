package models

import "time"

type Application struct {
	ID                             string     `json:"id"`
	OwnerID                        string     `json:"owner_id"`
	Name                           string     `json:"name"`
	Description                    string     `json:"description"`
	Icon                           *string    `json:"icon"`
	BotUserID                      *string    `json:"bot_user_id,omitempty"`
	BotPublic                      bool       `json:"bot_public"`
	BotRequireCodeGrant            bool       `json:"bot_require_code_grant"`
	VerifyKey                      string     `json:"verify_key"`
	Tags                           []string   `json:"tags"`
	TermsOfServiceURL              *string    `json:"terms_of_service_url,omitempty"`
	PrivacyPolicyURL               *string    `json:"privacy_policy_url,omitempty"`
	InteractionsEndpointURL        *string    `json:"interactions_endpoint_url,omitempty"`
	RoleConnectionsVerificationURL *string    `json:"role_connections_verification_url,omitempty"`
	CustomInstallURL               *string    `json:"custom_install_url,omitempty"`
	InstallParams                  *string    `json:"install_params,omitempty"` // JSONB stored as string
	Flags                          int        `json:"flags"`
	CreatedAt                      time.Time  `json:"created_at"`
	UpdatedAt                      time.Time  `json:"updated_at"`
	Owner                          *User      `json:"owner,omitempty"`
	Bot                            *User      `json:"bot,omitempty"`
	ApproximateGuildCount          int        `json:"approximate_guild_count,omitempty"`
	ApproximateUserInstallCount    int        `json:"approximate_user_install_count,omitempty"`
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

type OAuth2Authorization struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	UserID        string    `json:"user_id"`
	Scopes        []string  `json:"scopes"`
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
	Status        string    `json:"status"` // pending, accepted
	CreatedAt     time.Time `json:"created_at"`
	User          *User     `json:"user,omitempty"`
}

type RichPresenceAsset struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	Name          string    `json:"name"`
	Type          string    `json:"type"` // large, small
	ImageHash     string    `json:"image_hash"`
	CreatedAt     time.Time `json:"created_at"`
}

// Application flags matching Discord's bitfield
const (
	AppFlagGatewayPresence             = 1 << 12
	AppFlagGatewayPresenceLimited      = 1 << 13
	AppFlagGatewayGuildMembers         = 1 << 14
	AppFlagGatewayGuildMembersLimited  = 1 << 15
	AppFlagGatewayMessageContent       = 1 << 18
	AppFlagGatewayMessageContentLimited = 1 << 19
)

// Gateway intents matching Discord's bitfield
const (
	IntentGuilds                = 1 << 0
	IntentGuildMembers          = 1 << 1
	IntentGuildModeration       = 1 << 2
	IntentGuildExpressions      = 1 << 3
	IntentGuildIntegrations     = 1 << 4
	IntentGuildWebhooks         = 1 << 5
	IntentGuildInvites          = 1 << 6
	IntentGuildVoiceStates      = 1 << 7
	IntentGuildPresences        = 1 << 8
	IntentGuildMessages         = 1 << 9
	IntentGuildMessageReactions = 1 << 10
	IntentGuildMessageTyping    = 1 << 11
	IntentDirectMessages        = 1 << 12
	IntentDirectMessageReactions = 1 << 13
	IntentDirectMessageTyping   = 1 << 14
	IntentMessageContent        = 1 << 15
)
