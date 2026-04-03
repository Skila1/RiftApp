package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Hub struct {
	clients    map[string]*Client            // userID → client
	streamSubs map[string]map[string]*Client // streamID → userID → client
	register   chan *Client
	unregister chan *Client
	broadcast  chan *BroadcastMessage
	mu         sync.RWMutex
	db         *pgxpool.Pool
}

type BroadcastMessage struct {
	StreamID string
	Data     []byte
	Exclude  string // userID to exclude
}

func NewHub(db *pgxpool.Pool) *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		streamSubs: make(map[string]map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *BroadcastMessage, 256),
		db:         db,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			// Close existing connection for same user (multi-tab scenario)
			if old, ok := h.clients[client.userID]; ok {
				close(old.send)
				old.conn.Close() // Force-close old conn so ReadPump/WritePump exit immediately
				delete(h.clients, client.userID)
			}
			h.clients[client.userID] = client
			h.mu.Unlock()
			log.Printf("ws: client connected user=%s (total=%d)", client.userID, len(h.clients))

			// Send ready event to the new client
			client.Send(NewEvent(OpReady, nil))

			// Set user online in DB and broadcast presence
			go h.setPresence(client.userID, 1)

		case client := <-h.unregister:
			h.mu.Lock()
			removed := false
			if existing, ok := h.clients[client.userID]; ok && existing == client {
				close(client.send)
				delete(h.clients, client.userID)
				removed = true
				// Clean up all stream subscriptions for this client
				for _, streamID := range client.GetSubscribedStreams() {
					if subs, ok := h.streamSubs[streamID]; ok {
						delete(subs, client.userID)
						if len(subs) == 0 {
							delete(h.streamSubs, streamID)
						}
					}
				}
			}
			h.mu.Unlock()

			if !removed {
				// This was a stale connection (replaced by a newer one). Skip cleanup.
				break
			}

			// Broadcast typing_stop for every stream this client was subscribed to
			for _, streamID := range client.GetSubscribedStreams() {
				h.BroadcastToStream(streamID, NewEvent(OpTypingStop, TypingStopData{
					UserID:   client.userID,
					StreamID: streamID,
				}), "")
			}

			log.Printf("ws: client disconnected user=%s", client.userID)

			// Set user offline in DB and broadcast presence
			go h.setPresence(client.userID, 0)

		case msg := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.streamSubs[msg.StreamID] {
				if client.userID != msg.Exclude {
					client.Send(msg.Data)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// setPresence updates status in the DB and broadcasts to co-members.
func (h *Hub) setPresence(userID string, status int) {
	ctx := context.Background()

	if status == 0 {
		// Offline: set last_seen
		_, _ = h.db.Exec(ctx,
			`UPDATE users SET status = 0, last_seen = now(), updated_at = now() WHERE id = $1`, userID)
	} else {
		_, _ = h.db.Exec(ctx,
			`UPDATE users SET status = $2, updated_at = now() WHERE id = $1`, userID, status)
	}

	// Find all co-members (users sharing a hub)
	rows, err := h.db.Query(ctx,
		`SELECT DISTINCT hm2.user_id
		 FROM hub_members hm1
		 JOIN hub_members hm2 ON hm1.hub_id = hm2.hub_id
		WHERE hm1.user_id = $1 AND hm2.user_id != $1`, userID)
	if err != nil {
		return
	}
	defer rows.Close()

	evt := NewEvent(OpPresenceUpdate, PresenceData{
		UserID: userID,
		Status: status,
	})

	h.mu.RLock()
	for rows.Next() {
		var coMemberID string
		if err := rows.Scan(&coMemberID); err != nil {
			continue
		}
		if client, ok := h.clients[coMemberID]; ok {
			client.Send(evt)
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
	if client, ok := h.clients[userID]; ok {
		client.Send(data)
	}
	h.mu.RUnlock()
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
		h.mu.Lock()
		if h.streamSubs[data.StreamID] == nil {
			h.streamSubs[data.StreamID] = make(map[string]*Client)
		}
		h.streamSubs[data.StreamID][c.userID] = c
		h.mu.Unlock()

	case OpUnsubscribe:
		var data SubscribeData
		if err := json.Unmarshal(evt.Data, &data); err != nil || data.StreamID == "" {
			return
		}
		c.Unsubscribe(data.StreamID)
		h.mu.Lock()
		if subs, ok := h.streamSubs[data.StreamID]; ok {
			delete(subs, c.userID)
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
		// Validate status: 1=online, 2=idle, 3=dnd (can't set offline while connected)
		if data.Status < 1 || data.Status > 3 {
			return
		}
		go h.setPresence(c.userID, data.Status)
	}
}

func (h *Hub) IsOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.clients[userID]
	return ok
}
