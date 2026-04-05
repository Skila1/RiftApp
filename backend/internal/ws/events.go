package ws

import "encoding/json"

// Event is the wire format for all WebSocket messages
type Event struct {
	Op   string          `json:"op"`
	Data json.RawMessage `json:"d,omitempty"`
}

// Operation codes
const (
	OpSubscribe            = "subscribe"
	OpUnsubscribe          = "unsubscribe"
	OpHeartbeat            = "heartbeat"
	OpHeartbeatAck         = "heartbeat_ack"
	OpReady                = "ready"
	OpTyping               = "typing"
	OpTypingStart          = "typing_start"
	OpTypingStop           = "typing_stop"
	OpMessageCreate        = "message_create"
	OpMessageUpdate        = "message_update"
	OpMessageDelete        = "message_delete"
	OpReactionAdd          = "reaction_add"
	OpReactionRemove       = "reaction_remove"
	OpPresenceUpdate       = "presence_update"
	OpSetStatus            = "set_status"
	OpNotificationCreate   = "notification_create"
	OpDMMessageCreate      = "dm_message_create"
	OpDMConversationCreate = "dm_conversation_create"
	OpVoiceStateUpdate     = "voice_state_update"
	OpFriendRequest        = "friend_request"
	OpFriendAccept         = "friend_accept"
	OpFriendRemove         = "friend_remove"
	OpSoundboardPlay       = "soundboard_play"
	OpHubUpdate            = "hub_update"
	OpUserUpdate           = "user_update"
	OpVoiceMove            = "voice_move"
	OpVoiceDisconnect      = "voice_disconnect"
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
	StreamID string `json:"stream_id"`
	UserID   string `json:"user_id"`
	Action   string `json:"action"` // "join" or "leave"
}

type VoiceStateClientData struct {
	StreamID string `json:"stream_id"`
	Action   string `json:"action"`
}

type VoiceMoveData struct {
	StreamID string `json:"stream_id"`
}

func NewEvent(op string, data interface{}) []byte {
	d, _ := json.Marshal(data)
	evt := Event{Op: op, Data: d}
	b, _ := json.Marshal(evt)
	return b
}
