package ws

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type allowAllPermissionChecker struct{}

func (allowAllPermissionChecker) CanViewStream(context.Context, string, string) bool   { return true }
func (allowAllPermissionChecker) CanSendMessages(context.Context, string, string) bool { return true }
func (allowAllPermissionChecker) CanConnectVoice(context.Context, string, string) bool { return true }

func newTestHub() *Hub {
	return &Hub{
		clients:         make(map[string]map[string]*Client),
		streamSubs:      make(map[string]map[string]*streamSubscription),
		voiceJoinGrants: make(map[string]map[string]time.Time),
		register:        make(chan *Client),
		unregister:      make(chan *Client),
		broadcast:       make(chan *BroadcastMessage, 256),
		db:              nil,
	}
}

func newTestClient(hub *Hub, userID, sessionID string) *Client {
	return &Client{
		hub:       hub,
		conn:      nil,
		send:      make(chan []byte, 256),
		userID:    userID,
		sessionID: sessionID,
		streams:   make(map[string]bool),
	}
}

func drainOne(c *Client, timeout time.Duration) ([]byte, bool) {
	select {
	case msg := <-c.send:
		return msg, true
	case <-time.After(timeout):
		return nil, false
	}
}

func TestClient_Subscribe(t *testing.T) {
	hub := newTestHub()
	c := newTestClient(hub, "user1", "sess1")

	c.Subscribe("stream-a")
	if !c.IsSubscribed("stream-a") {
		t.Error("expected subscribed to stream-a")
	}
	if c.IsSubscribed("stream-b") {
		t.Error("should not be subscribed to stream-b")
	}
}

func TestClient_Unsubscribe(t *testing.T) {
	hub := newTestHub()
	c := newTestClient(hub, "user1", "sess1")

	c.Subscribe("stream-a")
	c.Unsubscribe("stream-a")
	if c.IsSubscribed("stream-a") {
		t.Error("expected unsubscribed from stream-a")
	}
}

func TestClient_GetSubscribedStreams(t *testing.T) {
	hub := newTestHub()
	c := newTestClient(hub, "user1", "sess1")

	c.Subscribe("stream-a")
	c.Subscribe("stream-b")

	streams := c.GetSubscribedStreams()
	if len(streams) != 2 {
		t.Fatalf("expected 2 streams, got %d", len(streams))
	}
}

func TestClient_Send(t *testing.T) {
	hub := newTestHub()
	c := newTestClient(hub, "user1", "sess1")

	c.Send([]byte("hello"))
	data, ok := drainOne(c, time.Second)
	if !ok {
		t.Fatal("expected message")
	}
	if string(data) != "hello" {
		t.Fatalf("expected 'hello', got %q", string(data))
	}
}

func TestHub_BroadcastToStream(t *testing.T) {
	hub := newTestHub()
	go hub.Run()

	c1 := newTestClient(hub, "user1", "sess1")
	c2 := newTestClient(hub, "user2", "sess2")

	hub.register <- c1
	drainOne(c1, time.Second)

	hub.register <- c2
	drainOne(c2, time.Second)

	hub.setStreamSubscription(c1, "stream-a", true)
	hub.setStreamSubscription(c2, "stream-a", true)

	hub.BroadcastToStream("stream-a", []byte(`{"op":"test"}`), "")

	_, ok1 := drainOne(c1, time.Second)
	_, ok2 := drainOne(c2, time.Second)
	if !ok1 || !ok2 {
		t.Fatal("expected both clients to receive the broadcast")
	}
}

func TestHub_BroadcastToStream_Exclude(t *testing.T) {
	hub := newTestHub()
	go hub.Run()

	c1 := newTestClient(hub, "user1", "sess1")
	c2 := newTestClient(hub, "user2", "sess2")

	hub.register <- c1
	drainOne(c1, time.Second)
	hub.register <- c2
	drainOne(c2, time.Second)

	hub.setStreamSubscription(c1, "stream-a", true)
	hub.setStreamSubscription(c2, "stream-a", true)

	hub.BroadcastToStream("stream-a", []byte(`{"op":"test"}`), "user1")

	_, ok2 := drainOne(c2, time.Second)
	if !ok2 {
		t.Fatal("user2 should receive broadcast")
	}

	_, ok1 := drainOne(c1, 200*time.Millisecond)
	if ok1 {
		t.Fatal("user1 should be excluded from broadcast")
	}
}

func TestHub_SendToUser(t *testing.T) {
	hub := newTestHub()
	go hub.Run()

	c := newTestClient(hub, "user1", "sess1")
	hub.register <- c
	drainOne(c, time.Second)

	hub.SendToUser("user1", []byte(`{"op":"hello"}`))
	data, ok := drainOne(c, time.Second)
	if !ok {
		t.Fatal("expected message")
	}
	if string(data) != `{"op":"hello"}` {
		t.Fatalf("got %q", string(data))
	}
}

func TestHub_SendToUser_MultiSession(t *testing.T) {
	hub := newTestHub()
	go hub.Run()

	c1 := newTestClient(hub, "user1", "sess1")
	c2 := newTestClient(hub, "user1", "sess2")

	hub.register <- c1
	drainOne(c1, time.Second)
	hub.register <- c2
	drainOne(c2, time.Second)

	hub.SendToUser("user1", []byte(`{"op":"notify"}`))

	_, ok1 := drainOne(c1, time.Second)
	_, ok2 := drainOne(c2, time.Second)
	if !ok1 || !ok2 {
		t.Fatal("both sessions should receive the message")
	}
}

func TestHub_IsOnline(t *testing.T) {
	hub := newTestHub()
	go hub.Run()

	if hub.IsOnline("user1") {
		t.Fatal("user1 should not be online")
	}

	c := newTestClient(hub, "user1", "sess1")
	hub.register <- c
	drainOne(c, time.Second)

	time.Sleep(50 * time.Millisecond)

	if !hub.IsOnline("user1") {
		t.Fatal("user1 should be online after registration")
	}
}

func TestHub_HandleHeartbeat(t *testing.T) {
	hub := newTestHub()
	go hub.Run()

	c := newTestClient(hub, "user1", "sess1")
	hub.register <- c
	drainOne(c, time.Second)

	evt := &Event{Op: OpHeartbeat}
	hub.handleClientEvent(c, evt)

	data, ok := drainOne(c, time.Second)
	if !ok {
		t.Fatal("expected heartbeat_ack")
	}

	var resp Event
	json.Unmarshal(data, &resp)
	if resp.Op != OpHeartbeatAck {
		t.Fatalf("expected heartbeat_ack, got %s", resp.Op)
	}
}

func TestHub_HandleSubscribe(t *testing.T) {
	hub := newTestHub()
	hub.SetPermissionChecker(allowAllPermissionChecker{})
	go hub.Run()

	c := newTestClient(hub, "user1", "sess1")
	hub.register <- c
	drainOne(c, time.Second)

	subData, _ := json.Marshal(SubscribeData{StreamID: "stream-1"})
	evt := &Event{Op: OpSubscribe, Data: subData}
	hub.handleClientEvent(c, evt)

	time.Sleep(50 * time.Millisecond)

	if !c.IsSubscribed("stream-1") {
		t.Fatal("client should be subscribed to stream-1")
	}

	hub.mu.RLock()
	_, inSubs := hub.streamSubs["stream-1"]["user1:sess1"]
	hub.mu.RUnlock()
	if !inSubs {
		t.Fatal("client should be in streamSubs")
	}
}

func TestHub_HandleUnsubscribe(t *testing.T) {
	hub := newTestHub()
	hub.SetPermissionChecker(allowAllPermissionChecker{})
	go hub.Run()

	c := newTestClient(hub, "user1", "sess1")
	hub.register <- c
	drainOne(c, time.Second)

	subData, _ := json.Marshal(SubscribeData{StreamID: "stream-1"})
	hub.handleClientEvent(c, &Event{Op: OpSubscribe, Data: subData})
	time.Sleep(50 * time.Millisecond)

	hub.handleClientEvent(c, &Event{Op: OpUnsubscribe, Data: subData})
	time.Sleep(50 * time.Millisecond)

	if c.IsSubscribed("stream-1") {
		t.Fatal("client should not be subscribed to stream-1")
	}

	hub.mu.RLock()
	subs := hub.streamSubs["stream-1"]
	hub.mu.RUnlock()
	if len(subs) > 0 {
		t.Fatal("streamSubs should be empty for stream-1")
	}
}

func TestGenerateSessionID(t *testing.T) {
	id1 := GenerateSessionID()
	id2 := GenerateSessionID()
	if id1 == "" || id2 == "" {
		t.Fatal("session IDs should not be empty")
	}
	if id1 == id2 {
		t.Fatal("session IDs should be unique")
	}
}

func TestNewEvent(t *testing.T) {
	data := NewEvent(OpMessageCreate, map[string]string{"id": "msg-1"})
	var evt Event
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if evt.Op != OpMessageCreate {
		t.Fatalf("expected %s, got %s", OpMessageCreate, evt.Op)
	}
}
