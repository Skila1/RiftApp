package ws

import (
	"encoding/json"
	"time"
)

// Event is the wire format for all WebSocket messages
type Event struct {
	Op   string          `json:"op"`
	Data json.RawMessage `json:"d,omitempty"`
}

// Operation codes
const (
	OpSubscribe              = "subscribe"
	OpUnsubscribe            = "unsubscribe"
	OpHeartbeat              = "heartbeat"
	OpHeartbeatAck           = "heartbeat_ack"
	OpReady                  = "ready"
	OpTyping                 = "typing"
	OpTypingStart            = "typing_start"
	OpTypingStop             = "typing_stop"
	OpMessageCreate          = "message_create"
	OpMessageUpdate          = "message_update"
	OpMessageDelete          = "message_delete"
	OpReactionAdd            = "reaction_add"
	OpReactionRemove         = "reaction_remove"
	OpPresenceUpdate         = "presence_update"
	OpSetStatus              = "set_status"
	OpNotificationCreate     = "notification_create"
	OpDMMessageCreate        = "dm_message_create"
	OpDMConversationCreate   = "dm_conversation_create"
	OpDMConversationUpdate   = "dm_conversation_update"
	OpDMConversationDelete   = "dm_conversation_delete"
	OpDMCallRing             = "dm_call_ring"
	OpDMCallRingEnd          = "dm_call_ring_end"
	OpVoiceStateUpdate       = "voice_state_update"
	OpFriendRequest          = "friend_request"
	OpFriendAccept           = "friend_accept"
	OpFriendRemove           = "friend_remove"
	OpSoundboardPlay         = "soundboard_play"
	OpHubUpdate              = "hub_update"
	OpUserUpdate             = "user_update"
	OpVoiceMove              = "voice_move"
	OpVoiceDisconnect        = "voice_disconnect"
	OpVoiceSpeakingUpdate    = "voice_speaking_update"
	OpVoiceScreenShareUpdate = "voice_screen_share_update"
	OpVoiceDeafenUpdate      = "voice_deafen_update"
	OpRoleUpdate             = "role_update"
	OpStreamUpdate           = "stream_update"
	OpCategoryUpdate         = "category_update"
)

type SubscribeData struct {
	StreamID string `json:"stream_id"`
}

type TypingData struct {
	StreamID string `json:"stream_id"`
}

type TypingStartData struct {
	UserID   string `json:"user_id"`
	StreamID string `json:"stream_id"`
}

type TypingStopData struct {
	UserID   string `json:"user_id"`
	StreamID string `json:"stream_id"`
}

type PresenceData struct {
	UserID string `json:"user_id"`
	Status int    `json:"status"`
}

type SetStatusData struct {
	Status int `json:"status"`
}

type VoiceStateData struct {
	StreamID       string `json:"stream_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	UserID         string `json:"user_id"`
	Action         string `json:"action"` // "join" or "leave"
}

type VoiceStateClientData struct {
	StreamID       string `json:"stream_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	Action         string `json:"action"`
}

type VoiceMoveData struct {
	StreamID string `json:"stream_id"`
}

type VoiceSpeakingData struct {
	StreamID       string `json:"stream_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	UserID         string `json:"user_id"`
	Speaking       bool   `json:"speaking"`
}

type VoiceSpeakingClientData struct {
	StreamID       string `json:"stream_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	Speaking       bool   `json:"speaking"`
}

type VoiceScreenShareData struct {
	StreamID       string `json:"stream_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	UserID         string `json:"user_id"`
	Sharing        bool   `json:"sharing"`
}

type VoiceScreenShareClientData struct {
	StreamID       string `json:"stream_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	Sharing        bool   `json:"sharing"`
}

type VoiceDeafenData struct {
	StreamID       string `json:"stream_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	UserID         string `json:"user_id"`
	Deafened       bool   `json:"deafened"`
}

type VoiceDeafenClientData struct {
	StreamID       string `json:"stream_id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	Deafened       bool   `json:"deafened"`
}

type DMConversationDeleteData struct {
	ConversationID string `json:"conversation_id"`
}

type DMCallRingData struct {
	ConversationID string    `json:"conversation_id"`
	InitiatorID    string    `json:"initiator_id"`
	Mode           string    `json:"mode"`
	StartedAt      time.Time `json:"started_at"`
}

type DMCallRingEndData struct {
	ConversationID string `json:"conversation_id"`
	Reason         string `json:"reason"`
}

type DMConversationCallStateData struct {
	ConversationID string          `json:"conversation_id"`
	MemberIDs      []string        `json:"member_ids,omitempty"`
	Ring           *DMCallRingData `json:"ring,omitempty"`
}

func NewEvent(op string, data interface{}) []byte {
	d, _ := json.Marshal(data)
	evt := Event{Op: op, Data: d}
	b, _ := json.Marshal(evt)
	return b
}
