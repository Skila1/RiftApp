package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Hub struct {
	clients    map[string]map[string]*Client // userID -> sessionID -> client
	streamSubs map[string]map[string]*Client // streamID -> sessionKey -> client
	voiceState map[string]map[string]bool    // streamID -> set of userIDs in voice
	register   chan *Client
	unregister chan *Client
	broadcast  chan *BroadcastMessage
	mu         sync.RWMutex
	db         *pgxpool.Pool
}

type BroadcastMessage struct {
	StreamID string
	Data     []byte
	Exclude  string
}

func NewHub(db *pgxpool.Pool) *Hub {
	return &Hub{
		clients:    make(map[string]map[string]*Client),
		streamSubs: make(map[string]map[string]*Client),
		voiceState: make(map[string]map[string]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *BroadcastMessage, 256),
		db:         db,
	}
}

func GenerateSessionID() string {
	return uuid.New().String()
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if h.clients[client.userID] == nil {
				h.clients[client.userID] = make(map[string]*Client)
			}
			h.clients[client.userID][client.sessionID] = client
			sessionCount := len(h.clients[client.userID])
			h.mu.Unlock()
			log.Printf("ws: client connected user=%s session=%s (sessions=%d)", client.userID, client.sessionID, sessionCount)

			client.Send(NewEvent(OpReady, nil))

			if sessionCount == 1 {
				go h.setPresence(client.userID, 1)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			sessions, ok := h.clients[client.userID]
			if ok {
				if existing, found := sessions[client.sessionID]; found && existing == client {
					close(client.send)
					delete(sessions, client.sessionID)
					if len(sessions) == 0 {
						delete(h.clients, client.userID)
					}

					for _, streamID := range client.GetSubscribedStreams() {
						sessionKey := client.userID + ":" + client.sessionID
						if subs, ok := h.streamSubs[streamID]; ok {
							delete(subs, sessionKey)
							if len(subs) == 0 {
								delete(h.streamSubs, streamID)
							}
						}
					}
				}
			}
			remainingSessions := len(h.clients[client.userID])
			h.mu.Unlock()

			for _, streamID := range client.GetSubscribedStreams() {
				h.BroadcastToStream(streamID, NewEvent(OpTypingStop, TypingStopData{
					UserID:   client.userID,
					StreamID: streamID,
				}), "")
			}

			log.Printf("ws: client disconnected user=%s session=%s", client.userID, client.sessionID)

			if remainingSessions == 0 {
				go h.setPresence(client.userID, 0)
				go h.removeUserFromAllVoice(client.userID)
			}

		case msg := <-h.broadcast:
			h.mu.RLock()
			seen := make(map[string]bool)
			for _, client := range h.streamSubs[msg.StreamID] {
				if client.userID != msg.Exclude && !seen[client.userID+":"+client.sessionID] {
					seen[client.userID+":"+client.sessionID] = true
					client.Send(msg.Data)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) setPresence(userID string, status int) {
	if h.db == nil {
		return
	}
	ctx := context.Background()

	if status == 0 {
		_, _ = h.db.Exec(ctx,
			`UPDATE users SET status = 0, last_seen = now(), updated_at = now() WHERE id = $1`, userID)
	} else {
		_, _ = h.db.Exec(ctx,
			`UPDATE users SET status = $2, updated_at = now() WHERE id = $1`, userID, status)
	}

	recipients := make(map[string]struct{})

	rows, err := h.db.Query(ctx,
		`SELECT DISTINCT hm2.user_id
		 FROM hub_members hm1
		 JOIN hub_members hm2 ON hm1.hub_id = hm2.hub_id
		WHERE hm1.user_id = $1 AND hm2.user_id != $1`, userID)
	if err == nil {
		for rows.Next() {
			var coMemberID string
			if err := rows.Scan(&coMemberID); err != nil {
				continue
			}
			recipients[coMemberID] = struct{}{}
		}
		rows.Close()
	}

	rows2, err := h.db.Query(ctx,
		`SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
		 FROM friendships f
		 WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 1`, userID)
	if err == nil {
		for rows2.Next() {
			var friendID string
			if err := rows2.Scan(&friendID); err != nil {
				continue
			}
			if friendID != userID {
				recipients[friendID] = struct{}{}
			}
		}
		rows2.Close()
	}

	evt := NewEvent(OpPresenceUpdate, PresenceData{
		UserID: userID,
		Status: status,
	})

	h.mu.RLock()
	for rid := range recipients {
		if sessions, ok := h.clients[rid]; ok {
			for _, client := range sessions {
				client.Send(evt)
			}
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) BroadcastToStream(streamID string, data []byte, excludeUserID string) {
	h.broadcast <- &BroadcastMessage{
		StreamID: streamID,
		Data:     data,
		Exclude:  excludeUserID,
	}
}

func (h *Hub) SendToUser(userID string, data []byte) {
	h.mu.RLock()
	if sessions, ok := h.clients[userID]; ok {
		for _, client := range sessions {
			client.Send(data)
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) BroadcastToHubMembers(hubID string, data []byte) {
	if h.db == nil {
		return
	}
	ctx := context.Background()

	rows, err := h.db.Query(ctx, `SELECT user_id FROM hub_members WHERE hub_id = $1`, hubID)
	if err != nil {
		return
	}
	defer rows.Close()

	userIDs := make([]string, 0)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		userIDs = append(userIDs, userID)
	}
	h.sendToUsers(userIDs, data)
}

func (h *Hub) BroadcastUserUpdate(userID string, data []byte) {
	if h.db == nil {
		return
	}
	ctx := context.Background()
	recipients := map[string]struct{}{userID: {}}

	rows, err := h.db.Query(ctx,
		`SELECT DISTINCT hm2.user_id
		 FROM hub_members hm1
		 JOIN hub_members hm2 ON hm1.hub_id = hm2.hub_id
		 WHERE hm1.user_id = $1`, userID)
	if err == nil {
		for rows.Next() {
			var recipientID string
			if err := rows.Scan(&recipientID); err != nil {
				continue
			}
			recipients[recipientID] = struct{}{}
		}
		rows.Close()
	}

	rows, err = h.db.Query(ctx,
		`SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
		 FROM friendships f
		 WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 1`, userID)
	if err == nil {
		for rows.Next() {
			var recipientID string
			if err := rows.Scan(&recipientID); err != nil {
				continue
			}
			recipients[recipientID] = struct{}{}
		}
		rows.Close()
	}

	userIDs := make([]string, 0, len(recipients))
	for recipientID := range recipients {
		userIDs = append(userIDs, recipientID)
	}
	h.sendToUsers(userIDs, data)
}

func (h *Hub) sendToUsers(userIDs []string, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, userID := range userIDs {
		if sessions, ok := h.clients[userID]; ok {
			for _, client := range sessions {
				client.Send(data)
			}
		}
	}
}

func (h *Hub) handleClientEvent(c *Client, evt *Event) {
	switch evt.Op {
	case OpHeartbeat:
		c.Send(NewEvent(OpHeartbeatAck, nil))

	case OpSubscribe:
		var data SubscribeData
		if err := json.Unmarshal(evt.Data, &data); err != nil || data.StreamID == "" {
			return
		}
		c.Subscribe(data.StreamID)
		sessionKey := c.userID + ":" + c.sessionID
		h.mu.Lock()
		if h.streamSubs[data.StreamID] == nil {
			h.streamSubs[data.StreamID] = make(map[string]*Client)
		}
		h.streamSubs[data.StreamID][sessionKey] = c
		h.mu.Unlock()

	case OpUnsubscribe:
		var data SubscribeData
		if err := json.Unmarshal(evt.Data, &data); err != nil || data.StreamID == "" {
			return
		}
		c.Unsubscribe(data.StreamID)
		sessionKey := c.userID + ":" + c.sessionID
		h.mu.Lock()
		if subs, ok := h.streamSubs[data.StreamID]; ok {
			delete(subs, sessionKey)
			if len(subs) == 0 {
				delete(h.streamSubs, data.StreamID)
			}
		}
		h.mu.Unlock()

	case OpTyping:
		var data TypingData
		if err := json.Unmarshal(evt.Data, &data); err != nil || data.StreamID == "" {
			return
		}
		h.BroadcastToStream(data.StreamID, NewEvent(OpTypingStart, TypingStartData{
			UserID:   c.userID,
			StreamID: data.StreamID,
		}), c.userID)

	case OpTypingStop:
		var data TypingData
		if err := json.Unmarshal(evt.Data, &data); err != nil || data.StreamID == "" {
			return
		}
		h.BroadcastToStream(data.StreamID, NewEvent(OpTypingStop, TypingStopData{
			UserID:   c.userID,
			StreamID: data.StreamID,
		}), c.userID)

	case OpSetStatus:
		var data SetStatusData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			return
		}
		if data.Status < 1 || data.Status > 3 {
			return
		}
		go h.setPresence(c.userID, data.Status)

	case OpVoiceStateUpdate:
		var data VoiceStateClientData
		if err := json.Unmarshal(evt.Data, &data); err != nil || data.StreamID == "" {
			return
		}
		go h.handleVoiceState(c.userID, data.StreamID, data.Action)

	case OpVoiceSpeakingUpdate:
		var data VoiceSpeakingClientData
		if err := json.Unmarshal(evt.Data, &data); err != nil || data.StreamID == "" {
			return
		}
		go h.handleVoiceSpeaking(c.userID, data.StreamID, data.Speaking)

	case OpVoiceScreenShareUpdate:
		var data VoiceScreenShareClientData
		if err := json.Unmarshal(evt.Data, &data); err != nil || data.StreamID == "" {
			return
		}
		go h.handleVoiceScreenShare(c.userID, data.StreamID, data.Sharing)
	}
}

func (h *Hub) handleVoiceState(userID, streamID, action string) {
	h.mu.Lock()
	switch action {
	case "join":
		// Remove user from any other voice channel first
		for sid, users := range h.voiceState {
			if users[userID] {
				delete(users, userID)
				if len(users) == 0 {
					delete(h.voiceState, sid)
				}
				if sid != streamID {
					h.mu.Unlock()
					h.broadcastVoiceState(sid, userID, "leave")
					h.mu.Lock()
				}
			}
		}
		if h.voiceState[streamID] == nil {
			h.voiceState[streamID] = make(map[string]bool)
		}
		h.voiceState[streamID][userID] = true
		h.mu.Unlock()
		h.broadcastVoiceState(streamID, userID, "join")
	case "leave":
		if users, ok := h.voiceState[streamID]; ok {
			delete(users, userID)
			if len(users) == 0 {
				delete(h.voiceState, streamID)
			}
		}
		h.mu.Unlock()
		h.broadcastVoiceState(streamID, userID, "leave")
	default:
		h.mu.Unlock()
	}
}

func (h *Hub) broadcastVoiceState(streamID, userID, action string) {
	h.broadcastToHubMembers(streamID, NewEvent(OpVoiceStateUpdate, VoiceStateData{
		StreamID: streamID,
		UserID:   userID,
		Action:   action,
	}))
}

// broadcastToHubMembers sends evt to every connected member of the hub that owns streamID.
func (h *Hub) broadcastToHubMembers(streamID string, evt []byte) {
	if h.db == nil {
		return
	}
	ctx := context.Background()

	rows, err := h.db.Query(ctx,
		`SELECT DISTINCT hm.user_id
		 FROM hub_members hm
		 JOIN streams s ON s.hub_id = hm.hub_id
		 WHERE s.id = $1`, streamID)
	if err != nil {
		return
	}
	defer rows.Close()

	h.mu.RLock()
	for rows.Next() {
		var memberID string
		if err := rows.Scan(&memberID); err != nil {
			continue
		}
		if sessions, ok := h.clients[memberID]; ok {
			for _, client := range sessions {
				client.Send(evt)
			}
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) handleVoiceSpeaking(userID, streamID string, speaking bool) {
	h.mu.RLock()
	inVoice := h.voiceState[streamID] != nil && h.voiceState[streamID][userID]
	h.mu.RUnlock()
	if !inVoice {
		return
	}

	h.BroadcastToVoiceChannel(streamID, NewEvent(OpVoiceSpeakingUpdate, VoiceSpeakingData{
		StreamID: streamID,
		UserID:   userID,
		Speaking: speaking,
	}))
}

func (h *Hub) handleVoiceScreenShare(userID, streamID string, sharing bool) {
	h.mu.RLock()
	inVoice := h.voiceState[streamID] != nil && h.voiceState[streamID][userID]
	h.mu.RUnlock()
	if !inVoice {
		return
	}

	h.broadcastToHubMembers(streamID, NewEvent(OpVoiceScreenShareUpdate, VoiceScreenShareData{
		StreamID: streamID,
		UserID:   userID,
		Sharing:  sharing,
	}))
}

// removeUserFromAllVoice removes a user from all voice channels on disconnect
func (h *Hub) removeUserFromAllVoice(userID string) {
	h.mu.Lock()
	var affectedStreams []string
	for streamID, users := range h.voiceState {
		if users[userID] {
			delete(users, userID)
			affectedStreams = append(affectedStreams, streamID)
			if len(users) == 0 {
				delete(h.voiceState, streamID)
			}
		}
	}
	h.mu.Unlock()

	for _, streamID := range affectedStreams {
		h.broadcastVoiceState(streamID, userID, "leave")
	}
}

// GetVoiceStates returns all voice channel members for streams in a given hub
func (h *Hub) GetVoiceStates(hubID string) map[string][]string {
	if h.db == nil {
		return nil
	}
	ctx := context.Background()

	rows, err := h.db.Query(ctx,
		`SELECT id FROM streams WHERE hub_id = $1 AND type = 1`, hubID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var voiceStreamIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		voiceStreamIDs = append(voiceStreamIDs, id)
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make(map[string][]string)
	for _, sid := range voiceStreamIDs {
		if users, ok := h.voiceState[sid]; ok && len(users) > 0 {
			for uid := range users {
				result[sid] = append(result[sid], uid)
			}
		}
	}
	return result
}

func (h *Hub) IsOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	sessions, ok := h.clients[userID]
	return ok && len(sessions) > 0
}

// GetUserVoiceStreamID returns the stream the user is currently in voice for, or "".
func (h *Hub) GetUserVoiceStreamID(userID string) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for streamID, users := range h.voiceState {
		if users[userID] {
			return streamID
		}
	}
	return ""
}

// MoveUserToVoiceStream moves a user between voice channels and broadcasts the leave/join updates.
func (h *Hub) MoveUserToVoiceStream(userID, targetStreamID string) (string, bool) {
	h.mu.Lock()
	currentStreamID := ""
	for streamID, users := range h.voiceState {
		if users[userID] {
			currentStreamID = streamID
			break
		}
	}
	if currentStreamID == targetStreamID {
		h.mu.Unlock()
		return currentStreamID, false
	}
	if currentStreamID != "" {
		if users, ok := h.voiceState[currentStreamID]; ok {
			delete(users, userID)
			if len(users) == 0 {
				delete(h.voiceState, currentStreamID)
			}
		}
	}
	if targetStreamID != "" {
		if h.voiceState[targetStreamID] == nil {
			h.voiceState[targetStreamID] = make(map[string]bool)
		}
		h.voiceState[targetStreamID][userID] = true
	}
	h.mu.Unlock()

	if currentStreamID != "" {
		h.broadcastVoiceState(currentStreamID, userID, "leave")
	}
	if targetStreamID != "" {
		h.broadcastVoiceState(targetStreamID, userID, "join")
	}

	return currentStreamID, currentStreamID != "" || targetStreamID != ""
}

func (h *Hub) DisconnectUserFromVoice(userID string) (string, bool) {
	return h.MoveUserToVoiceStream(userID, "")
}

// BroadcastToVoiceChannel sends data to every user currently in voice for the given stream.
func (h *Hub) BroadcastToVoiceChannel(streamID string, data []byte) {
	h.mu.RLock()
	users, ok := h.voiceState[streamID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	// Collect user IDs while holding the lock
	userIDs := make([]string, 0, len(users))
	for uid := range users {
		userIDs = append(userIDs, uid)
	}
	// Send to each user's WebSocket sessions
	for _, uid := range userIDs {
		if sessions, ok := h.clients[uid]; ok {
			for _, client := range sessions {
				client.Send(data)
			}
		}
	}
	h.mu.RUnlock()
}
