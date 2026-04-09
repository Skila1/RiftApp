package push

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"

	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
)

type Service struct {
	client    *messaging.Client
	tokenRepo *repository.DeviceTokenRepo
}

func NewService(tokenRepo *repository.DeviceTokenRepo) (*Service, error) {
	ctx := context.Background()

	var opts []option.ClientOption

	if credsJSON := os.Getenv("FIREBASE_CREDENTIALS_JSON"); credsJSON != "" {
		opts = append(opts, option.WithCredentialsJSON([]byte(credsJSON)))
	} else if credsFile := os.Getenv("FIREBASE_CREDENTIALS_FILE"); credsFile != "" {
		opts = append(opts, option.WithCredentialsFile(credsFile))
	} else {
		return nil, fmt.Errorf("push: no Firebase credentials configured (set FIREBASE_CREDENTIALS_JSON or FIREBASE_CREDENTIALS_FILE)")
	}

	app, err := firebase.NewApp(ctx, nil, opts...)
	if err != nil {
		return nil, fmt.Errorf("push: firebase init: %w", err)
	}

	client, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("push: messaging client: %w", err)
	}

	return &Service{client: client, tokenRepo: tokenRepo}, nil
}

func (s *Service) SendToUser(ctx context.Context, userID string, p service.PushPayload) error {
	tokens, err := s.tokenRepo.ListByUserID(ctx, userID)
	if err != nil {
		return fmt.Errorf("push: list tokens: %w", err)
	}
	if len(tokens) == 0 {
		return nil
	}

	var registrationTokens []string
	for _, t := range tokens {
		registrationTokens = append(registrationTokens, t.Token)
	}

	msg := &messaging.MulticastMessage{
		Tokens: registrationTokens,
		Notification: &messaging.Notification{
			Title: p.Title,
			Body:  p.Body,
		},
		Data: p.Data,
		Android: &messaging.AndroidConfig{
			Priority:    "high",
			CollapseKey: p.CollapseKey,
		},
		APNS: &messaging.APNSConfig{
			Headers: map[string]string{
				"apns-priority": "10",
			},
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{
					Sound:            "default",
					MutableContent:   true,
					ThreadID:         p.CollapseKey,
					ContentAvailable: true,
				},
			},
		},
	}

	if p.BadgeCount != nil {
		msg.APNS.Payload.Aps.Badge = p.BadgeCount
	}

	resp, err := s.client.SendEachForMulticast(ctx, msg)
	if err != nil {
		return fmt.Errorf("push: send: %w", err)
	}

	if resp.FailureCount > 0 {
		for i, r := range resp.Responses {
			if r.Error != nil {
				log.Printf("push: token %d failed: %v", i, r.Error)
				if isTokenInvalid(r.Error) {
					_ = s.tokenRepo.Delete(ctx, tokens[i].UserID, registrationTokens[i])
				}
			}
		}
	}

	return nil
}

func (s *Service) SendToUsers(ctx context.Context, userIDs []string, p service.PushPayload) {
	for _, uid := range userIDs {
		if err := s.SendToUser(ctx, uid, p); err != nil {
			log.Printf("push: send to user %s: %v", uid, err)
		}
	}
}

func isTokenInvalid(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	for _, code := range []string{
		"registration-token-not-registered",
		"invalid-registration-token",
	} {
		if containsStr(errStr, code) {
			return true
		}
	}
	return false
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func MarshalData(v any) map[string]string {
	b, _ := json.Marshal(v)
	return map[string]string{"payload": string(b)}
}
