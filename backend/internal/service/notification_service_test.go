package service

import (
	"context"
	"testing"
	"time"
)

type pushObservation struct {
	userID  string
	payload PushPayload
	ctxErr  error
}

type recordingPushSender struct {
	started chan pushObservation
	release chan struct{}
}

func (s *recordingPushSender) SendToUser(ctx context.Context, userID string, payload PushPayload) error {
	if s.started != nil {
		s.started <- pushObservation{userID: userID, payload: payload, ctxErr: ctx.Err()}
	}
	if s.release != nil {
		<-s.release
	}
	return nil
}

func notificationTestStringPointer(value string) *string {
	return &value
}

func TestBuildPushDataPreservesReservedKeys(t *testing.T) {
	pushDataCopy := map[string]string{
		"type":            "override",
		"hub_id":          "other-hub",
		"stream_id":       "other-stream",
		"reference_id":    "other-ref",
		"conversation_id": "conv-1",
	}

	data := buildPushData("dm_call", notificationTestStringPointer("ref-1"), notificationTestStringPointer("hub-1"), notificationTestStringPointer("stream-1"), pushDataCopy)

	if data["type"] != "dm_call" {
		t.Fatalf("expected server-controlled type, got %q", data["type"])
	}
	if data["hub_id"] != "hub-1" {
		t.Fatalf("expected server-controlled hub_id, got %q", data["hub_id"])
	}
	if data["stream_id"] != "stream-1" {
		t.Fatalf("expected server-controlled stream_id, got %q", data["stream_id"])
	}
	if data["reference_id"] != "ref-1" {
		t.Fatalf("expected server-controlled reference_id, got %q", data["reference_id"])
	}
	if data["conversation_id"] != "conv-1" {
		t.Fatalf("expected custom push data to be preserved, got %q", data["conversation_id"])
	}
}

func TestNotificationServicePushUsersDispatchesAsync(t *testing.T) {
	svc := NewNotificationService(nil, nil)
	sender := &recordingPushSender{
		started: make(chan pushObservation, 1),
		release: make(chan struct{}),
	}
	svc.SetPushSender(sender)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan struct{})
	go func() {
		svc.PushUsers(ctx, []string{"user-1"}, PushPayload{
			Title: "Hello",
			Data:  map[string]string{"conversation_id": "conv-1"},
		})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected PushUsers to return without waiting for push delivery")
	}

	select {
	case observation := <-sender.started:
		if observation.userID != "user-1" {
			t.Fatalf("unexpected user ID: %q", observation.userID)
		}
		if observation.ctxErr != nil {
			t.Fatalf("expected background context for push send, got %v", observation.ctxErr)
		}
		if observation.payload.Data["conversation_id"] != "conv-1" {
			t.Fatalf("unexpected payload data: %#v", observation.payload.Data)
		}
	case <-time.After(time.Second):
		t.Fatal("expected async push delivery to start")
	}

	close(sender.release)
}
