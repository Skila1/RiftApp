package service

import (
	"testing"
	"time"
)

func TestFormatConversationCallDurationLabel(t *testing.T) {
	startedAt := time.Date(2026, time.April, 11, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name    string
		endedAt time.Time
		want    string
	}{
		{
			name:    "seconds",
			endedAt: startedAt.Add(42 * time.Second),
			want:    "42s",
		},
		{
			name:    "minutes and seconds",
			endedAt: startedAt.Add(2*time.Minute + 3*time.Second),
			want:    "2m 03s",
		},
		{
			name:    "hours and minutes",
			endedAt: startedAt.Add(time.Hour + 5*time.Minute + 8*time.Second),
			want:    "1h 05m",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := formatConversationCallDurationLabel(&startedAt, tt.endedAt); got != tt.want {
				t.Fatalf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestConversationCallEndedMessageContentIncludesDuration(t *testing.T) {
	startedAt := time.Date(2026, time.April, 11, 10, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(3*time.Minute + 14*time.Second)

	if got := conversationCallEndedMessageContent("audio", &startedAt, endedAt); got != "Call ended after 3m 14s" {
		t.Fatalf("unexpected audio content: %q", got)
	}
	if got := conversationCallEndedMessageContent("video", &startedAt, endedAt); got != "Video call ended after 3m 14s" {
		t.Fatalf("unexpected video content: %q", got)
	}
	if got := conversationCallEndedMessageContent("audio", nil, endedAt); got != "Call ended" {
		t.Fatalf("unexpected fallback content: %q", got)
	}
}
