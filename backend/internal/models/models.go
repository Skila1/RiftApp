package models

import "time"

type User struct {
	ID           string     `json:"id"`
	Username     string     `json:"username"`
	Email        *string    `json:"email,omitempty"`
	PasswordHash string     `json:"-"`
	IsBot        bool       `json:"is_bot"`
	DisplayName  string     `json:"display_name"`
	AvatarURL    *string    `json:"avatar_url,omitempty"`
	Bio          *string    `json:"bio,omitempty"`
	Status       int        `json:"status"` // 0=offline, 1=online, 2=idle, 3=dnd
	LastSeen     *time.Time `json:"last_seen,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	BannedAt     *time.Time `json:"banned_at,omitempty"`
}

type Hub struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	OwnerID            string    `json:"owner_id"`
	IconURL            *string   `json:"icon_url,omitempty"`
	BannerURL          *string   `json:"banner_url,omitempty"`
	DefaultPermissions int64     `json:"default_permissions,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type HubMember struct {
	HubID    string    `json:"hub_id"`
	UserID   string    `json:"user_id"`
	Role     string    `json:"role"`
	RankID   *string   `json:"rank_id,omitempty"`
	JoinedAt time.Time `json:"joined_at"`
	User     *User     `json:"user,omitempty"`
}

type Rank struct {
	ID          string    `json:"id"`
	HubID       string    `json:"hub_id"`
	Name        string    `json:"name"`
	Color       string    `json:"color"`
	Permissions int64     `json:"permissions"`
	Position    int       `json:"position"`
	CreatedAt   time.Time `json:"created_at"`
}

type Category struct {
	ID        string    `json:"id"`
	HubID     string    `json:"hub_id"`
	Name      string    `json:"name"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
}

type Stream struct {
	ID         string    `json:"id"`
	HubID      string    `json:"hub_id"`
	Name       string    `json:"name"`
	Type       int       `json:"type"` // 0=text, 1=voice
	Position   int       `json:"position"`
	IsPrivate  bool      `json:"is_private"`
	CategoryID *string   `json:"category_id"`
	Bitrate    int       `json:"bitrate"`
	UserLimit  int       `json:"user_limit"`
	Region     string    `json:"region"`
	CreatedAt  time.Time `json:"created_at"`
}

const (
	StreamPermissionTargetEveryone = "everyone"
	StreamPermissionTargetRole     = "role"
)

type StreamPermissionOverwrite struct {
	StreamID   string    `json:"stream_id,omitempty"`
	TargetType string    `json:"target_type"`
	TargetID   string    `json:"target_id"`
	Allow      int64     `json:"allow"`
	Deny       int64     `json:"deny"`
	CreatedAt  time.Time `json:"created_at,omitempty"`
}

type Message struct {
	ID                 string        `json:"id"`
	StreamID           *string       `json:"stream_id,omitempty"`
	ConversationID     *string       `json:"conversation_id,omitempty"`
	AuthorID           string        `json:"author_id"`
	AuthorType         string        `json:"author_type"`
	SystemType         *string       `json:"system_type,omitempty"`
	Content            string        `json:"content"`
	EditedAt           *time.Time    `json:"edited_at,omitempty"`
	CreatedAt          time.Time     `json:"created_at"`
	ReplyToMessageID   *string       `json:"reply_to_message_id,omitempty"`
	ForwardedMessageID *string       `json:"forwarded_message_id,omitempty"`
	WebhookName        *string       `json:"webhook_name,omitempty"`
	WebhookAvatarURL   *string       `json:"webhook_avatar_url,omitempty"`
	Pinned             bool          `json:"pinned"`
	PinnedAt           *time.Time    `json:"pinned_at,omitempty"`
	PinnedByID         *string       `json:"pinned_by_id,omitempty"`
	Author             *User         `json:"author,omitempty"`
	ReplyTo            *Message      `json:"reply_to,omitempty"`
	PinnedBy           *User         `json:"pinned_by,omitempty"`
	Attachments        []Attachment  `json:"attachments,omitempty"`
	Reactions          []ReactionAgg `json:"reactions,omitempty"`
}

const (
	MessageSystemTypeConversationCallStarted       = "conversation_call_started"
	MessageSystemTypeConversationVideoCallStarted  = "conversation_video_call_started"
	MessageSystemTypeConversationCallMissed        = "conversation_call_missed"
	MessageSystemTypeConversationVideoCallMissed   = "conversation_video_call_missed"
	MessageSystemTypeConversationCallDeclined      = "conversation_call_declined"
	MessageSystemTypeConversationVideoCallDeclined = "conversation_video_call_declined"
	MessageSystemTypeConversationCallEnded         = "conversation_call_ended"
	MessageSystemTypeConversationVideoCallEnded    = "conversation_video_call_ended"
)

type Attachment struct {
	ID          string `json:"id"`
	MessageID   string `json:"message_id"`
	Filename    string `json:"filename"`
	URL         string `json:"url"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
}

type Reaction struct {
	MessageID string    `json:"message_id"`
	UserID    string    `json:"user_id"`
	Emoji     string    `json:"emoji"`
	EmojiID   *string   `json:"emoji_id,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type ReactionAgg struct {
	Emoji   string   `json:"emoji"`
	EmojiID *string  `json:"emoji_id,omitempty"`
	FileURL *string  `json:"file_url,omitempty"`
	Count   int      `json:"count"`
	Users   []string `json:"users"`
}

type DirectMessage struct {
	ID         string     `json:"id"`
	SenderID   string     `json:"sender_id"`
	ReceiverID string     `json:"receiver_id"`
	Content    string     `json:"content"`
	EditedAt   *time.Time `json:"edited_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	Sender     *User      `json:"sender,omitempty"`
}

type Friendship struct {
	UserID    string    `json:"user_id"`
	FriendID  string    `json:"friend_id"`
	Status    int       `json:"status"` // 0=pending, 1=accepted
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	User      *User     `json:"user,omitempty"`
}

type Block struct {
	BlockerID string    `json:"blocker_id"`
	BlockedID string    `json:"blocked_id"`
	CreatedAt time.Time `json:"created_at"`
	User      *User     `json:"user,omitempty"`
}

type HubInvite struct {
	ID        string     `json:"id"`
	HubID     string     `json:"hub_id"`
	CreatorID string     `json:"creator_id"`
	Code      string     `json:"code"`
	MaxUses   int        `json:"max_uses"`
	Uses      int        `json:"uses"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	Hub       *Hub       `json:"hub,omitempty"`
}

type Conversation struct {
	ID          string    `json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	OwnerID     *string   `json:"owner_id,omitempty"`
	Name        *string   `json:"name,omitempty"`
	IconURL     *string   `json:"icon_url,omitempty"`
	IsGroup     bool      `json:"is_group"`
	Members     []User    `json:"members,omitempty"`
	LastMessage *Message  `json:"last_message,omitempty"`
}

type Notification struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Type        string    `json:"type"` // mention, invite, dm
	Title       string    `json:"title"`
	Body        *string   `json:"body,omitempty"`
	ReferenceID *string   `json:"reference_id,omitempty"`
	HubID       *string   `json:"hub_id,omitempty"`
	StreamID    *string   `json:"stream_id,omitempty"`
	ActorID     *string   `json:"actor_id,omitempty"`
	Read        bool      `json:"read"`
	CreatedAt   time.Time `json:"created_at"`
	Actor       *User     `json:"actor,omitempty"`
}

type HubEmoji struct {
	ID        string    `json:"id"`
	HubID     string    `json:"hub_id"`
	Name      string    `json:"name"`
	FileURL   string    `json:"file_url"`
	CreatedAt time.Time `json:"created_at"`
}

type HubSticker struct {
	ID        string    `json:"id"`
	HubID     string    `json:"hub_id"`
	Name      string    `json:"name"`
	FileURL   string    `json:"file_url"`
	CreatedAt time.Time `json:"created_at"`
}

type HubSound struct {
	ID        string    `json:"id"`
	HubID     string    `json:"hub_id"`
	Name      string    `json:"name"`
	FileURL   string    `json:"file_url"`
	CreatedAt time.Time `json:"created_at"`
}
