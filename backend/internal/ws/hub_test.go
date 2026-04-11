package ws

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

type allowAllPermissionChecker struct{}

func (allowAllPermissionChecker) CanViewStream(context.Context, string, string) bool   { return true }
func (allowAllPermissionChecker) CanSendMessages(context.Context, string, string) bool { return true }
func (allowAllPermissionChecker) CanConnectVoice(context.Context, string, string) bool { return true }

func newTestHub() *Hub {
	return &Hub{
		clients:                   make(map[string]map[string]*Client),
		streamSubs:                make(map[string]map[string]*streamSubscription),
		voiceState:                make(map[string]map[string]bool),
		voiceDeafened:             make(map[string]map[string]bool),
		conversationMembers:       make(map[string][]string),
		conversationVoiceState:    make(map[string]map[string]bool),
		conversationVoiceDeafened: make(map[string]map[string]bool),
		conversationCallRings:     make(map[string]DMCallRingData),
		conversationActiveCalls:   make(map[string]conversationActiveCallState),
		voiceJoinGrants:           make(map[string]map[string]time.Time),
		register:                  make(chan *Client),
		unregister:                make(chan *Client),
		broadcast:                 make(chan *BroadcastMessage, 256),
		db:                        nil,
	}
}

type testConversationCallRecorder struct {
	ringEnds chan DMCallRingEndData
	callEnds chan DMConversationCallEndedData
}

func (r *testConversationCallRecorder) RecordConversationCallRingEnd(data DMCallRingEndData) {
	if r == nil || r.ringEnds == nil {
		return
	}
	r.ringEnds <- data
}

func (r *testConversationCallRecorder) RecordConversationCallEnded(data DMConversationCallEndedData) {
	if r == nil || r.callEnds == nil {
		return
	}
	r.callEnds <- data
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

func drainEvent(t *testing.T, c *Client, timeout time.Duration) Event {
	t.Helper()
	data, ok := drainOne(c, timeout)
	if !ok {
		t.Fatal("expected websocket event")
	}
	var evt Event
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("failed to decode websocket event: %v", err)
	}
	return evt
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

func TestHub_StartConversationCallRingIncludesTargets(t *testing.T) {
	hub := newTestHub()
	hub.SetConversationMembers("conv-1", []string{"user-1", "user-2", "user-3"})

	state, started := hub.StartConversationCallRing("conv-1", "user-1", "video")
	if !started {
		t.Fatal("expected DM call ring to start")
	}
	if state.Ring == nil {
		t.Fatal("expected DM call ring state")
	}
	if !reflect.DeepEqual(state.Ring.TargetUserIDs, []string{"user-2", "user-3"}) {
		t.Fatalf("unexpected ring targets: %#v", state.Ring.TargetUserIDs)
	}
	if len(state.Ring.DeclinedUserIDs) != 0 {
		t.Fatalf("expected no declined users, got %#v", state.Ring.DeclinedUserIDs)
	}
}

func TestHub_DeclineConversationCallRingBroadcastsUpdatedRing(t *testing.T) {
	hub := newTestHub()
	go hub.Run()

	initiator := newTestClient(hub, "user-1", "sess-1")
	recipient := newTestClient(hub, "user-2", "sess-2")
	observer := newTestClient(hub, "user-3", "sess-3")

	hub.register <- initiator
	drainOne(initiator, time.Second)
	hub.register <- recipient
	drainOne(recipient, time.Second)
	hub.register <- observer
	drainOne(observer, time.Second)

	hub.SetConversationMembers("conv-1", []string{"user-1", "user-2", "user-3"})
	_, started := hub.StartConversationCallRing("conv-1", "user-1", "audio")
	if !started {
		t.Fatal("expected DM call ring to start")
	}
	drainEvent(t, initiator, time.Second)
	drainEvent(t, recipient, time.Second)
	drainEvent(t, observer, time.Second)

	state := hub.DeclineConversationCallRing("conv-1", "user-2")
	if state.Ring == nil {
		t.Fatal("expected DM call ring to remain active after one decline")
	}
	if !reflect.DeepEqual(state.Ring.DeclinedUserIDs, []string{"user-2"}) {
		t.Fatalf("unexpected declined users: %#v", state.Ring.DeclinedUserIDs)
	}

	evt := drainEvent(t, initiator, time.Second)
	if evt.Op != OpDMCallRing {
		t.Fatalf("expected %s event, got %s", OpDMCallRing, evt.Op)
	}
	var ring DMCallRingData
	if err := json.Unmarshal(evt.Data, &ring); err != nil {
		t.Fatalf("failed to decode ring payload: %v", err)
	}
	if !reflect.DeepEqual(ring.DeclinedUserIDs, []string{"user-2"}) {
		t.Fatalf("unexpected broadcast declined users: %#v", ring.DeclinedUserIDs)
	}
}

func TestHub_DeclineConversationCallRingEndsWhenAllTargetsDecline(t *testing.T) {
	hub := newTestHub()
	go hub.Run()

	initiator := newTestClient(hub, "user-1", "sess-1")
	recipientOne := newTestClient(hub, "user-2", "sess-2")
	recipientTwo := newTestClient(hub, "user-3", "sess-3")

	hub.register <- initiator
	drainOne(initiator, time.Second)
	hub.register <- recipientOne
	drainOne(recipientOne, time.Second)
	hub.register <- recipientTwo
	drainOne(recipientTwo, time.Second)

	hub.SetConversationMembers("conv-1", []string{"user-1", "user-2", "user-3"})
	_, started := hub.StartConversationCallRing("conv-1", "user-1", "audio")
	if !started {
		t.Fatal("expected DM call ring to start")
	}
	drainEvent(t, initiator, time.Second)
	drainEvent(t, recipientOne, time.Second)
	drainEvent(t, recipientTwo, time.Second)

	hub.DeclineConversationCallRing("conv-1", "user-2")
	drainEvent(t, initiator, time.Second)
	drainEvent(t, recipientOne, time.Second)
	drainEvent(t, recipientTwo, time.Second)

	hub.mu.Lock()
	hub.conversationVoiceState["conv-1"] = map[string]bool{"user-1": true}
	hub.mu.Unlock()

	state := hub.DeclineConversationCallRing("conv-1", "user-3")
	if !reflect.DeepEqual(state.MemberIDs, []string{"user-1"}) {
		t.Fatalf("unexpected conversation member IDs after final decline: %#v", state.MemberIDs)
	}
	if state.Ring != nil {
		t.Fatalf("expected ring to be cleared after final decline, got %#v", state.Ring)
	}

	evt := drainEvent(t, initiator, time.Second)
	if evt.Op != OpDMCallRingEnd {
		t.Fatalf("expected %s event, got %s", OpDMCallRingEnd, evt.Op)
	}
	var end DMCallRingEndData
	if err := json.Unmarshal(evt.Data, &end); err != nil {
		t.Fatalf("failed to decode ring end payload: %v", err)
	}
	if end.Reason != "declined" {
		t.Fatalf("expected declined reason, got %s", end.Reason)
	}
	if !reflect.DeepEqual(end.DeclinedUserIDs, []string{"user-2", "user-3"}) {
		t.Fatalf("unexpected declined user IDs: %#v", end.DeclinedUserIDs)
	}
}

func TestHub_BuildConversationCallRingEndDataLockedMarksMissedUsers(t *testing.T) {
	hub := newTestHub()
	ring := DMCallRingData{
		ConversationID:  "conv-1",
		InitiatorID:     "user-1",
		Mode:            "audio",
		StartedAt:       time.Now().Add(-time.Minute).UTC(),
		TargetUserIDs:   []string{"user-2", "user-3"},
		DeclinedUserIDs: []string{"user-3"},
	}

	hub.mu.Lock()
	end := hub.buildConversationCallRingEndDataLocked(ring, "timeout", "", "", time.Now().UTC())
	hub.mu.Unlock()

	if !reflect.DeepEqual(end.MissedUserIDs, []string{"user-2"}) {
		t.Fatalf("unexpected missed user IDs: %#v", end.MissedUserIDs)
	}
}

func TestHub_BroadcastConversationCallRingEndRecordsHistory(t *testing.T) {
	hub := newTestHub()
	recorder := &testConversationCallRecorder{ringEnds: make(chan DMCallRingEndData, 1)}
	hub.SetConversationCallHistoryRecorder(recorder)

	hub.broadcastConversationCallRingEnd(DMCallRingEndData{
		ConversationID: "conv-1",
		Reason:         "timeout",
		InitiatorID:    "user-1",
		Mode:           "video",
		EndedAt:        time.Now().UTC(),
	})

	select {
	case record := <-recorder.ringEnds:
		if record.Reason != "timeout" {
			t.Fatalf("expected timeout record, got %s", record.Reason)
		}
		if record.Mode != "video" {
			t.Fatalf("expected video mode, got %s", record.Mode)
		}
	case <-time.After(time.Second):
		t.Fatal("expected ring-end history record")
	}
}

func TestHub_ConversationCallEndsWhenLastParticipantLeaves(t *testing.T) {
	hub := newTestHub()
	recorder := &testConversationCallRecorder{callEnds: make(chan DMConversationCallEndedData, 1)}
	hub.SetConversationCallHistoryRecorder(recorder)
	hub.SetConversationMembers("conv-1", []string{"user-1"})
	hub.conversationVoiceState["conv-1"] = map[string]bool{"user-1": true}
	hub.conversationActiveCalls["conv-1"] = conversationActiveCallState{
		Mode:      "video",
		StartedAt: time.Now().Add(-time.Minute).UTC(),
	}

	hub.handleConversationVoiceState("user-1", "conv-1", "leave")

	select {
	case record := <-recorder.callEnds:
		if record.ConversationID != "conv-1" {
			t.Fatalf("unexpected conversation ID: %s", record.ConversationID)
		}
		if record.Mode != "video" {
			t.Fatalf("expected video mode, got %s", record.Mode)
		}
		if record.EndedByUserID != "user-1" {
			t.Fatalf("unexpected ended-by user: %s", record.EndedByUserID)
		}
	case <-time.After(time.Second):
		t.Fatal("expected conversation call-ended record")
	}
}
