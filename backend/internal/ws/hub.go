package ws

import (
	"context"
	"encoding/json"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type StreamPermissionChecker interface {
	CanViewStream(ctx context.Context, streamID, userID string) bool
	CanSendMessages(ctx context.Context, streamID, userID string) bool
	CanConnectVoice(ctx context.Context, streamID, userID string) bool
}

type streamSubscription struct {
	client     *Client
	authorized bool
}

const conversationCallRingTTL = 45 * time.Second

type Hub struct {
	clients                   map[string]map[string]*Client             // userID -> sessionID -> client
	streamSubs                map[string]map[string]*streamSubscription // streamID -> sessionKey -> subscription
	voiceState                map[string]map[string]bool                // streamID -> set of userIDs in voice
	voiceDeafened             map[string]map[string]bool                // streamID -> set of deafened userIDs
	conversationVoiceState    map[string]map[string]bool                // conversationID -> set of userIDs in voice
	conversationVoiceDeafened map[string]map[string]bool                // conversationID -> set of deafened userIDs
	conversationCallRings     map[string]DMCallRingData                 // conversationID -> active DM call ring state
	voiceJoinGrants           map[string]map[string]time.Time           // userID -> streamID -> expiry
	register                  chan *Client
	unregister                chan *Client
	broadcast                 chan *BroadcastMessage
	mu                        sync.RWMutex
	db                        *pgxpool.Pool
	permChecker               StreamPermissionChecker
	missingPermCheckerOnce    sync.Once
}

type BroadcastMessage struct {
	StreamID string
	Data     []byte
	Exclude  string
}

func NewHub(db *pgxpool.Pool) *Hub {
	return &Hub{
		clients:                   make(map[string]map[string]*Client),
		streamSubs:                make(map[string]map[string]*streamSubscription),
		voiceState:                make(map[string]map[string]bool),
		voiceDeafened:             make(map[string]map[string]bool),
		conversationVoiceState:    make(map[string]map[string]bool),
		conversationVoiceDeafened: make(map[string]map[string]bool),
		conversationCallRings:     make(map[string]DMCallRingData),
		voiceJoinGrants:           make(map[string]map[string]time.Time),
		register:                  make(chan *Client),
		unregister:                make(chan *Client),
		broadcast:                 make(chan *BroadcastMessage, 256),
		db:                        db,
	}
}

func (h *Hub) SetPermissionChecker(checker StreamPermissionChecker) {
	h.permChecker = checker
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
			for _, sub := range h.streamSubs[msg.StreamID] {
				if !sub.authorized || sub.client.userID == msg.Exclude {
					continue
				}
				sub.client.Send(msg.Data)
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
		if _, err := h.db.Exec(ctx,
			`UPDATE users SET status = 0, last_seen = now(), updated_at = now() WHERE id = $1`, userID); err != nil {
			log.Printf("ws: failed to update offline presence for %s: %v", userID, err)
		}
	} else {
		if _, err := h.db.Exec(ctx,
			`UPDATE users SET status = $2, updated_at = now() WHERE id = $1`, userID, status); err != nil {
			log.Printf("ws: failed to update presence for %s: %v", userID, err)
		}
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

func (h *Hub) logMissingPermissionChecker() {
	h.missingPermCheckerOnce.Do(func() {
		log.Printf("ws: permission checker missing; call SetPermissionChecker before serving websocket auth")
	})
}

func (h *Hub) hubStreamIDs(hubID string) []string {
	if h.db == nil {
		return nil
	}
	ctx := context.Background()
	rows, err := h.db.Query(ctx, `SELECT id FROM streams WHERE hub_id = $1`, hubID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	streamIDs := make([]string, 0)
	for rows.Next() {
		var streamID string
		if err := rows.Scan(&streamID); err != nil {
			continue
		}
		streamIDs = append(streamIDs, streamID)
	}
	return streamIDs
}

func (h *Hub) unsubscribeClientFromStream(client *Client, streamID string) {
	client.Unsubscribe(streamID)
	sessionKey := client.userID + ":" + client.sessionID
	h.mu.Lock()
	if subs, ok := h.streamSubs[streamID]; ok {
		delete(subs, sessionKey)
		if len(subs) == 0 {
			delete(h.streamSubs, streamID)
		}
	}
	h.mu.Unlock()
}

func (h *Hub) setStreamSubscription(client *Client, streamID string, authorized bool) {
	client.Subscribe(streamID)
	sessionKey := client.userID + ":" + client.sessionID
	h.mu.Lock()
	if h.streamSubs[streamID] == nil {
		h.streamSubs[streamID] = make(map[string]*streamSubscription)
	}
	h.streamSubs[streamID][sessionKey] = &streamSubscription{client: client, authorized: authorized}
	h.mu.Unlock()
}

func (h *Hub) DropStreamSubscriptions(streamID string) {
	h.mu.Lock()
	subs := h.streamSubs[streamID]
	delete(h.streamSubs, streamID)
	h.mu.Unlock()
	for _, sub := range subs {
		sub.client.Unsubscribe(streamID)
	}
}

func (h *Hub) RefreshHubSubscriptions(hubID string) {
	streamIDs := h.hubStreamIDs(hubID)
	if len(streamIDs) == 0 {
		return
	}

	type snapshot struct {
		streamID   string
		sessionKey string
		userID     string
	}

	snapshots := make([]snapshot, 0)
	h.mu.RLock()
	for _, streamID := range streamIDs {
		for sessionKey, sub := range h.streamSubs[streamID] {
			snapshots = append(snapshots, snapshot{streamID: streamID, sessionKey: sessionKey, userID: sub.client.userID})
		}
	}
	h.mu.RUnlock()

	if len(snapshots) == 0 {
		return
	}

	updates := make(map[string]map[string]bool, len(streamIDs))
	checked := make(map[string]bool, len(snapshots))
	for _, snap := range snapshots {
		cacheKey := snap.streamID + ":" + snap.userID
		allowed, ok := checked[cacheKey]
		if !ok {
			allowed = h.canViewStream(snap.streamID, snap.userID)
			checked[cacheKey] = allowed
		}
		if updates[snap.streamID] == nil {
			updates[snap.streamID] = make(map[string]bool)
		}
		updates[snap.streamID][snap.sessionKey] = allowed
	}

	h.mu.Lock()
	for streamID, sessionUpdates := range updates {
		subs, ok := h.streamSubs[streamID]
		if !ok {
			continue
		}
		for sessionKey, allowed := range sessionUpdates {
			if sub, ok := subs[sessionKey]; ok {
				sub.authorized = allowed
			}
		}
	}
	h.mu.Unlock()
}

func (h *Hub) GrantVoiceJoinGrant(userID, streamID string, ttl time.Duration) {
	if userID == "" || streamID == "" || ttl <= 0 {
		return
	}
	h.mu.Lock()
	if h.voiceJoinGrants[userID] == nil {
		h.voiceJoinGrants[userID] = make(map[string]time.Time)
	}
	h.voiceJoinGrants[userID][streamID] = time.Now().Add(ttl)
	h.mu.Unlock()
}

func (h *Hub) HasVoiceJoinGrant(userID, streamID string) bool {
	now := time.Now()
	h.mu.Lock()
	defer h.mu.Unlock()
	streamGrants := h.voiceJoinGrants[userID]
	if len(streamGrants) == 0 {
		return false
	}
	expiresAt, ok := streamGrants[streamID]
	if !ok {
		return false
	}
	if now.After(expiresAt) {
		delete(streamGrants, streamID)
		if len(streamGrants) == 0 {
			delete(h.voiceJoinGrants, userID)
		}
		return false
	}
	return true
}

func (h *Hub) clearVoiceJoinGrant(userID, streamID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	streamGrants := h.voiceJoinGrants[userID]
	if len(streamGrants) == 0 {
		return
	}
	delete(streamGrants, streamID)
	if len(streamGrants) == 0 {
		delete(h.voiceJoinGrants, userID)
	}
}

func (h *Hub) clearVoiceJoinGrants(userID string) {
	h.mu.Lock()
	delete(h.voiceJoinGrants, userID)
	h.mu.Unlock()
}

func (h *Hub) canViewStream(streamID, userID string) bool {
	if h.permChecker == nil {
		h.logMissingPermissionChecker()
		return false
	}
	return h.permChecker.CanViewStream(context.Background(), streamID, userID)
}

func (h *Hub) canSendMessages(streamID, userID string) bool {
	if h.permChecker == nil {
		h.logMissingPermissionChecker()
		return false
	}
	return h.permChecker.CanSendMessages(context.Background(), streamID, userID)
}

func (h *Hub) canConnectVoice(streamID, userID string) bool {
	if h.permChecker == nil {
		h.logMissingPermissionChecker()
		return false
	}
	return h.permChecker.CanConnectVoice(context.Background(), streamID, userID)
}

func (h *Hub) isUserInVoiceStream(streamID, userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.voiceState[streamID] != nil && h.voiceState[streamID][userID]
}

func (h *Hub) isUserInVoiceConversation(conversationID, userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.conversationVoiceState[conversationID] != nil && h.conversationVoiceState[conversationID][userID]
}

func (h *Hub) canJoinVoiceStream(streamID, userID string) bool {
	if h.canConnectVoice(streamID, userID) {
		return true
	}
	return h.GetUserVoiceStreamID(userID) == streamID
}

func (h *Hub) canJoinVoiceConversation(conversationID, userID string) bool {
	if h.db == nil {
		return false
	}
	ctx := context.Background()
	var allowed bool
	err := h.db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2
		)`,
		conversationID, userID,
	).Scan(&allowed)
	return err == nil && allowed
}

func (h *Hub) removeUserFromOtherVoiceLocked(userID, keepStreamID, keepConversationID string) ([]string, []string) {
	removedStreams := make([]string, 0)
	for streamID, users := range h.voiceState {
		if keepStreamID != "" && streamID == keepStreamID {
			continue
		}
		if !users[userID] {
			continue
		}
		delete(users, userID)
		removedStreams = append(removedStreams, streamID)
		if len(users) == 0 {
			delete(h.voiceState, streamID)
		}
	}
	for streamID, deafened := range h.voiceDeafened {
		if !deafened[userID] {
			continue
		}
		delete(deafened, userID)
		if len(deafened) == 0 {
			delete(h.voiceDeafened, streamID)
		}
	}

	removedConversations := make([]string, 0)
	for conversationID, users := range h.conversationVoiceState {
		if keepConversationID != "" && conversationID == keepConversationID {
			continue
		}
		if !users[userID] {
			continue
		}
		delete(users, userID)
		removedConversations = append(removedConversations, conversationID)
		if len(users) == 0 {
			delete(h.conversationVoiceState, conversationID)
		}
	}
	for conversationID, deafened := range h.conversationVoiceDeafened {
		if !deafened[userID] {
			continue
		}
		delete(deafened, userID)
		if len(deafened) == 0 {
			delete(h.conversationVoiceDeafened, conversationID)
		}
	}

	return removedStreams, removedConversations
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
	if c == nil || evt == nil {
		return
	}

	switch evt.Op {
	case OpHeartbeat:
		c.Send(NewEvent(OpHeartbeatAck, nil))

	case OpSubscribe:
		var data SubscribeData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid subscribe payload user=%s: %v", c.userID, err)
			return
		}
		if data.StreamID == "" {
			return
		}
		authorized := h.canViewStream(data.StreamID, c.userID)
		if !authorized {
			h.unsubscribeClientFromStream(c, data.StreamID)
			return
		}
		h.setStreamSubscription(c, data.StreamID, authorized)

	case OpUnsubscribe:
		var data SubscribeData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid unsubscribe payload user=%s: %v", c.userID, err)
			return
		}
		if data.StreamID == "" {
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
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid typing payload user=%s: %v", c.userID, err)
			return
		}
		if data.StreamID == "" {
			return
		}
		if !h.canSendMessages(data.StreamID, c.userID) {
			return
		}
		h.BroadcastToStream(data.StreamID, NewEvent(OpTypingStart, TypingStartData{
			UserID:   c.userID,
			StreamID: data.StreamID,
		}), c.userID)

	case OpTypingStop:
		var data TypingData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid typing-stop payload user=%s: %v", c.userID, err)
			return
		}
		if data.StreamID == "" {
			return
		}
		if !h.canSendMessages(data.StreamID, c.userID) {
			return
		}
		h.BroadcastToStream(data.StreamID, NewEvent(OpTypingStop, TypingStopData{
			UserID:   c.userID,
			StreamID: data.StreamID,
		}), c.userID)

	case OpSetStatus:
		var data SetStatusData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid status payload user=%s: %v", c.userID, err)
			return
		}
		if data.Status < 1 || data.Status > 3 {
			return
		}
		go h.setPresence(c.userID, data.Status)

	case OpVoiceStateUpdate:
		var data VoiceStateClientData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid voice-state payload user=%s: %v", c.userID, err)
			return
		}
		if (data.StreamID == "" && data.ConversationID == "") || (data.StreamID != "" && data.ConversationID != "") {
			return
		}
		go h.handleVoiceState(c.userID, data.StreamID, data.ConversationID, data.Action)

	case OpVoiceSpeakingUpdate:
		var data VoiceSpeakingClientData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid voice-speaking payload user=%s: %v", c.userID, err)
			return
		}
		if (data.StreamID == "" && data.ConversationID == "") || (data.StreamID != "" && data.ConversationID != "") {
			return
		}
		go h.handleVoiceSpeaking(c.userID, data.StreamID, data.ConversationID, data.Speaking)

	case OpVoiceScreenShareUpdate:
		var data VoiceScreenShareClientData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid voice-screenshare payload user=%s: %v", c.userID, err)
			return
		}
		if (data.StreamID == "" && data.ConversationID == "") || (data.StreamID != "" && data.ConversationID != "") {
			return
		}
		go h.handleVoiceScreenShare(c.userID, data.StreamID, data.ConversationID, data.Sharing)

	case OpVoiceDeafenUpdate:
		var data VoiceDeafenClientData
		if err := json.Unmarshal(evt.Data, &data); err != nil {
			log.Printf("ws: invalid voice-deafen payload user=%s: %v", c.userID, err)
			return
		}
		if (data.StreamID == "" && data.ConversationID == "") || (data.StreamID != "" && data.ConversationID != "") {
			return
		}
		go h.handleVoiceDeafen(c.userID, data.StreamID, data.ConversationID, data.Deafened)
	}
}

func (h *Hub) handleVoiceState(userID, streamID, conversationID, action string) {
	if streamID != "" {
		h.handleStreamVoiceState(userID, streamID, action)
		return
	}
	if conversationID != "" {
		h.handleConversationVoiceState(userID, conversationID, action)
	}
}

func (h *Hub) handleStreamVoiceState(userID, streamID, action string) {
	switch action {
	case "join":
		if h.isUserInVoiceStream(streamID, userID) || !h.canJoinVoiceStream(streamID, userID) {
			return
		}
	case "leave":
		if !h.isUserInVoiceStream(streamID, userID) {
			return
		}
	default:
		return
	}

	h.mu.Lock()
	switch action {
	case "join":
		removedStreams, removedConversations := h.removeUserFromOtherVoiceLocked(userID, streamID, "")
		if h.voiceState[streamID] == nil {
			h.voiceState[streamID] = make(map[string]bool)
		}
		h.voiceState[streamID][userID] = true
		h.mu.Unlock()
		h.clearVoiceJoinGrant(userID, streamID)
		for _, removedStreamID := range removedStreams {
			h.broadcastVoiceState(removedStreamID, userID, "leave")
		}
		for _, removedConversationID := range removedConversations {
			h.broadcastConversationVoiceState(removedConversationID, userID, "leave")
		}
		h.broadcastVoiceState(streamID, userID, "join")
	case "leave":
		if users, ok := h.voiceState[streamID]; ok {
			delete(users, userID)
			if len(users) == 0 {
				delete(h.voiceState, streamID)
			}
		}
		if deafened, ok := h.voiceDeafened[streamID]; ok {
			delete(deafened, userID)
			if len(deafened) == 0 {
				delete(h.voiceDeafened, streamID)
			}
		}
		h.mu.Unlock()
		h.clearVoiceJoinGrant(userID, streamID)
		h.broadcastVoiceState(streamID, userID, "leave")
	default:
		h.mu.Unlock()
	}
}

func (h *Hub) handleConversationVoiceState(userID, conversationID, action string) {
	switch action {
	case "join":
		if h.isUserInVoiceConversation(conversationID, userID) || !h.canJoinVoiceConversation(conversationID, userID) {
			return
		}
	case "leave":
		if !h.isUserInVoiceConversation(conversationID, userID) {
			return
		}
	default:
		return
	}

	h.mu.Lock()
	switch action {
	case "join":
		removedStreams, removedConversations := h.removeUserFromOtherVoiceLocked(userID, "", conversationID)
		clearAnsweredRing := false
		if ring, ok := h.conversationCallRings[conversationID]; ok && ring.InitiatorID != userID {
			delete(h.conversationCallRings, conversationID)
			clearAnsweredRing = true
		}
		if h.conversationVoiceState[conversationID] == nil {
			h.conversationVoiceState[conversationID] = make(map[string]bool)
		}
		h.conversationVoiceState[conversationID][userID] = true
		h.mu.Unlock()
		for _, removedStreamID := range removedStreams {
			h.broadcastVoiceState(removedStreamID, userID, "leave")
		}
		for _, removedConversationID := range removedConversations {
			h.broadcastConversationVoiceState(removedConversationID, userID, "leave")
			h.cancelConversationCallRingIfInitiator(removedConversationID, userID, "cancelled")
		}
		if clearAnsweredRing {
			h.broadcastConversationCallRingEnd(conversationID, "answered")
		}
		h.broadcastConversationVoiceState(conversationID, userID, "join")
	case "leave":
		if users, ok := h.conversationVoiceState[conversationID]; ok {
			delete(users, userID)
			if len(users) == 0 {
				delete(h.conversationVoiceState, conversationID)
			}
		}
		if deafened, ok := h.conversationVoiceDeafened[conversationID]; ok {
			delete(deafened, userID)
			if len(deafened) == 0 {
				delete(h.conversationVoiceDeafened, conversationID)
			}
		}
		clearCancelledRing := false
		if ring, ok := h.conversationCallRings[conversationID]; ok && ring.InitiatorID == userID {
			delete(h.conversationCallRings, conversationID)
			clearCancelledRing = true
		}
		h.mu.Unlock()
		if clearCancelledRing {
			h.broadcastConversationCallRingEnd(conversationID, "cancelled")
		}
		h.broadcastConversationVoiceState(conversationID, userID, "leave")
	default:
		h.mu.Unlock()
	}
}

func (h *Hub) broadcastVoiceState(streamID, userID, action string) {
	h.broadcastToStreamObservers(streamID, NewEvent(OpVoiceStateUpdate, VoiceStateData{
		StreamID: streamID,
		UserID:   userID,
		Action:   action,
	}))
}

func (h *Hub) broadcastConversationVoiceState(conversationID, userID, action string) {
	h.broadcastToConversationMembers(conversationID, NewEvent(OpVoiceStateUpdate, VoiceStateData{
		ConversationID: conversationID,
		UserID:         userID,
		Action:         action,
	}))
}

func (h *Hub) broadcastConversationCallRing(ring DMCallRingData) {
	h.broadcastToConversationMembers(ring.ConversationID, NewEvent(OpDMCallRing, ring))
}

func (h *Hub) broadcastConversationCallRingEnd(conversationID, reason string) {
	h.broadcastToConversationMembers(conversationID, NewEvent(OpDMCallRingEnd, DMCallRingEndData{
		ConversationID: conversationID,
		Reason:         reason,
	}))
}

func (h *Hub) getHubMemberIDsForStream(streamID string) []string {
	if h.db == nil {
		return nil
	}
	ctx := context.Background()

	rows, err := h.db.Query(ctx,
		`SELECT DISTINCT hm.user_id
		 FROM hub_members hm
		 JOIN streams s ON s.hub_id = hm.hub_id
		 WHERE s.id = $1`, streamID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	userIDs := make([]string, 0)
	for rows.Next() {
		var memberID string
		if err := rows.Scan(&memberID); err != nil {
			continue
		}
		userIDs = append(userIDs, memberID)
	}
	return userIDs
}

func (h *Hub) broadcastToStreamObservers(streamID string, evt []byte) {
	memberIDs := h.getHubMemberIDsForStream(streamID)
	if len(memberIDs) == 0 {
		return
	}
	recipients := make([]string, 0, len(memberIDs))
	for _, memberID := range memberIDs {
		if h.canViewStream(streamID, memberID) || h.isUserInVoiceStream(streamID, memberID) {
			recipients = append(recipients, memberID)
		}
	}
	h.sendToUsers(recipients, evt)
}

func (h *Hub) getConversationMemberIDs(conversationID string) []string {
	if h.db == nil {
		return nil
	}
	ctx := context.Background()
	rows, err := h.db.Query(ctx,
		`SELECT user_id FROM conversation_members WHERE conversation_id = $1`, conversationID)
	if err != nil {
		return nil
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
	return userIDs
}

func (h *Hub) broadcastToConversationMembers(conversationID string, evt []byte) {
	memberIDs := h.getConversationMemberIDs(conversationID)
	if len(memberIDs) == 0 {
		return
	}
	h.sendToUsers(memberIDs, evt)
}

func (h *Hub) handleVoiceSpeaking(userID, streamID, conversationID string, speaking bool) {
	if streamID != "" {
		h.handleStreamVoiceSpeaking(userID, streamID, speaking)
		return
	}
	if conversationID != "" {
		h.handleConversationVoiceSpeaking(userID, conversationID, speaking)
	}
}

func (h *Hub) handleStreamVoiceSpeaking(userID, streamID string, speaking bool) {
	h.mu.RLock()
	inVoice := h.voiceState[streamID] != nil && h.voiceState[streamID][userID]
	h.mu.RUnlock()
	if !inVoice {
		return
	}

	h.broadcastToStreamObservers(streamID, NewEvent(OpVoiceSpeakingUpdate, VoiceSpeakingData{
		StreamID: streamID,
		UserID:   userID,
		Speaking: speaking,
	}))
}

func (h *Hub) handleConversationVoiceSpeaking(userID, conversationID string, speaking bool) {
	h.mu.RLock()
	inVoice := h.conversationVoiceState[conversationID] != nil && h.conversationVoiceState[conversationID][userID]
	h.mu.RUnlock()
	if !inVoice {
		return
	}

	h.broadcastToConversationMembers(conversationID, NewEvent(OpVoiceSpeakingUpdate, VoiceSpeakingData{
		ConversationID: conversationID,
		UserID:         userID,
		Speaking:       speaking,
	}))
}

func (h *Hub) handleVoiceScreenShare(userID, streamID, conversationID string, sharing bool) {
	if streamID != "" {
		h.handleStreamVoiceScreenShare(userID, streamID, sharing)
		return
	}
	if conversationID != "" {
		h.handleConversationVoiceScreenShare(userID, conversationID, sharing)
	}
}

func (h *Hub) handleStreamVoiceScreenShare(userID, streamID string, sharing bool) {
	h.mu.RLock()
	inVoice := h.voiceState[streamID] != nil && h.voiceState[streamID][userID]
	h.mu.RUnlock()
	if !inVoice {
		return
	}

	h.broadcastToStreamObservers(streamID, NewEvent(OpVoiceScreenShareUpdate, VoiceScreenShareData{
		StreamID: streamID,
		UserID:   userID,
		Sharing:  sharing,
	}))
}

func (h *Hub) handleConversationVoiceScreenShare(userID, conversationID string, sharing bool) {
	h.mu.RLock()
	inVoice := h.conversationVoiceState[conversationID] != nil && h.conversationVoiceState[conversationID][userID]
	h.mu.RUnlock()
	if !inVoice {
		return
	}

	h.broadcastToConversationMembers(conversationID, NewEvent(OpVoiceScreenShareUpdate, VoiceScreenShareData{
		ConversationID: conversationID,
		UserID:         userID,
		Sharing:        sharing,
	}))
}

func (h *Hub) handleVoiceDeafen(userID, streamID, conversationID string, deafened bool) {
	if streamID != "" {
		h.handleStreamVoiceDeafen(userID, streamID, deafened)
		return
	}
	if conversationID != "" {
		h.handleConversationVoiceDeafen(userID, conversationID, deafened)
	}
}

func (h *Hub) handleStreamVoiceDeafen(userID, streamID string, deafened bool) {
	h.mu.Lock()
	inVoice := h.voiceState[streamID] != nil && h.voiceState[streamID][userID]
	if inVoice {
		if deafened {
			if h.voiceDeafened[streamID] == nil {
				h.voiceDeafened[streamID] = make(map[string]bool)
			}
			h.voiceDeafened[streamID][userID] = true
		} else {
			if h.voiceDeafened[streamID] != nil {
				delete(h.voiceDeafened[streamID], userID)
				if len(h.voiceDeafened[streamID]) == 0 {
					delete(h.voiceDeafened, streamID)
				}
			}
		}
	}
	h.mu.Unlock()
	if !inVoice {
		return
	}

	h.broadcastToStreamObservers(streamID, NewEvent(OpVoiceDeafenUpdate, VoiceDeafenData{
		StreamID: streamID,
		UserID:   userID,
		Deafened: deafened,
	}))
}

func (h *Hub) handleConversationVoiceDeafen(userID, conversationID string, deafened bool) {
	h.mu.Lock()
	inVoice := h.conversationVoiceState[conversationID] != nil && h.conversationVoiceState[conversationID][userID]
	if inVoice {
		if deafened {
			if h.conversationVoiceDeafened[conversationID] == nil {
				h.conversationVoiceDeafened[conversationID] = make(map[string]bool)
			}
			h.conversationVoiceDeafened[conversationID][userID] = true
		} else {
			if h.conversationVoiceDeafened[conversationID] != nil {
				delete(h.conversationVoiceDeafened[conversationID], userID)
				if len(h.conversationVoiceDeafened[conversationID]) == 0 {
					delete(h.conversationVoiceDeafened, conversationID)
				}
			}
		}
	}
	h.mu.Unlock()
	if !inVoice {
		return
	}

	h.broadcastToConversationMembers(conversationID, NewEvent(OpVoiceDeafenUpdate, VoiceDeafenData{
		ConversationID: conversationID,
		UserID:         userID,
		Deafened:       deafened,
	}))
}

// removeUserFromAllVoice removes a user from all voice channels on disconnect
func (h *Hub) removeUserFromAllVoice(userID string) {
	h.mu.Lock()
	affectedStreams, affectedConversations := h.removeUserFromOtherVoiceLocked(userID, "", "")
	delete(h.voiceJoinGrants, userID)
	h.mu.Unlock()

	for _, streamID := range affectedStreams {
		h.broadcastVoiceState(streamID, userID, "leave")
	}
	for _, conversationID := range affectedConversations {
		h.broadcastConversationVoiceState(conversationID, userID, "leave")
		h.cancelConversationCallRingIfInitiator(conversationID, userID, "cancelled")
	}
}

func (h *Hub) buildConversationCallStateLocked(conversationID string) (DMConversationCallStateData, bool) {
	state := DMConversationCallStateData{ConversationID: conversationID}
	if users, ok := h.conversationVoiceState[conversationID]; ok && len(users) > 0 {
		state.MemberIDs = make([]string, 0, len(users))
		for userID := range users {
			state.MemberIDs = append(state.MemberIDs, userID)
		}
		sort.Strings(state.MemberIDs)
	}
	if ring, ok := h.conversationCallRings[conversationID]; ok {
		ringCopy := ring
		state.Ring = &ringCopy
	}
	if len(state.MemberIDs) == 0 && state.Ring == nil {
		return DMConversationCallStateData{}, false
	}
	return state, true
}

func (h *Hub) GetConversationCallState(conversationID string) DMConversationCallStateData {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if state, ok := h.buildConversationCallStateLocked(conversationID); ok {
		return state
	}
	return DMConversationCallStateData{ConversationID: conversationID}
}

func (h *Hub) GetConversationCallStatesForUser(ctx context.Context, userID string) ([]DMConversationCallStateData, error) {
	if h.db == nil {
		return []DMConversationCallStateData{}, nil
	}

	rows, err := h.db.Query(ctx,
		`SELECT conversation_id FROM conversation_members WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversationIDs := make([]string, 0)
	for rows.Next() {
		var conversationID string
		if err := rows.Scan(&conversationID); err != nil {
			continue
		}
		conversationIDs = append(conversationIDs, conversationID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	states := make([]DMConversationCallStateData, 0)
	for _, conversationID := range conversationIDs {
		state, ok := h.buildConversationCallStateLocked(conversationID)
		if !ok {
			continue
		}
		states = append(states, state)
	}
	return states, nil
}

func (h *Hub) StartConversationCallRing(conversationID, initiatorID, mode string) DMConversationCallStateData {
	now := time.Now().UTC()
	ring := DMCallRingData{
		ConversationID: conversationID,
		InitiatorID:    initiatorID,
		Mode:           mode,
		StartedAt:      now,
	}

	h.mu.Lock()
	if users, ok := h.conversationVoiceState[conversationID]; ok && len(users) > 0 {
		onlyInitiator := len(users) == 1 && users[initiatorID]
		if !onlyInitiator {
			state, _ := h.buildConversationCallStateLocked(conversationID)
			h.mu.Unlock()
			return state
		}
	}
	h.conversationCallRings[conversationID] = ring
	state, _ := h.buildConversationCallStateLocked(conversationID)
	h.mu.Unlock()

	h.broadcastConversationCallRing(ring)
	go h.expireConversationCallRing(conversationID, now)
	return state
}

func (h *Hub) CancelConversationCallRing(conversationID, initiatorID, reason string) bool {
	return h.cancelConversationCallRingIfInitiator(conversationID, initiatorID, reason)
}

func (h *Hub) cancelConversationCallRingIfInitiator(conversationID, initiatorID, reason string) bool {
	h.mu.Lock()
	ring, ok := h.conversationCallRings[conversationID]
	if !ok || ring.InitiatorID != initiatorID {
		h.mu.Unlock()
		return false
	}
	delete(h.conversationCallRings, conversationID)
	h.mu.Unlock()

	h.broadcastConversationCallRingEnd(conversationID, reason)
	return true
}

func (h *Hub) expireConversationCallRing(conversationID string, startedAt time.Time) {
	timer := time.NewTimer(conversationCallRingTTL)
	defer timer.Stop()
	<-timer.C

	h.mu.Lock()
	ring, ok := h.conversationCallRings[conversationID]
	if !ok || !ring.StartedAt.Equal(startedAt) {
		h.mu.Unlock()
		return
	}
	delete(h.conversationCallRings, conversationID)
	h.mu.Unlock()

	h.broadcastConversationCallRingEnd(conversationID, "timeout")
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

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	count := 0
	for _, sessions := range h.clients {
		count += len(sessions)
	}
	return count
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
	h.clearVoiceJoinGrants(userID)
	h.mu.Lock()
	currentStreamID := ""
	for streamID, users := range h.voiceState {
		if users[userID] {
			currentStreamID = streamID
			break
		}
	}
	if currentStreamID == targetStreamID && targetStreamID != "" {
		_, removedConversations := h.removeUserFromOtherVoiceLocked(userID, targetStreamID, "")
		h.mu.Unlock()
		for _, conversationID := range removedConversations {
			h.broadcastConversationVoiceState(conversationID, userID, "leave")
			h.cancelConversationCallRingIfInitiator(conversationID, userID, "cancelled")
		}
		return currentStreamID, len(removedConversations) > 0
	}
	removedStreams, removedConversations := h.removeUserFromOtherVoiceLocked(userID, targetStreamID, "")
	if targetStreamID != "" {
		if h.voiceState[targetStreamID] == nil {
			h.voiceState[targetStreamID] = make(map[string]bool)
		}
		h.voiceState[targetStreamID][userID] = true
	}
	h.mu.Unlock()

	for _, streamID := range removedStreams {
		h.broadcastVoiceState(streamID, userID, "leave")
	}
	for _, conversationID := range removedConversations {
		h.broadcastConversationVoiceState(conversationID, userID, "leave")
		h.cancelConversationCallRingIfInitiator(conversationID, userID, "cancelled")
	}
	if targetStreamID != "" {
		h.broadcastVoiceState(targetStreamID, userID, "join")
	}

	return currentStreamID, len(removedStreams) > 0 || len(removedConversations) > 0 || targetStreamID != ""
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
