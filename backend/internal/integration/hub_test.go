package integration

import (
	"context"
	"testing"
	"time"

	"github.com/riftapp-cloud/riftapp/internal/auth"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

func setupHubTest(t *testing.T) (*service.HubService, string) {
	t.Helper()
	cleanTables(t)
	ctx := context.Background()

	authSvc := auth.NewService(testPool, "test-secret")
	resp, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "hubowner",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	hubRepo := repository.NewHubRepo(testPool)
	streamRepo := repository.NewStreamRepo(testPool)
	inviteRepo := repository.NewInviteRepo(testPool)
	notifRepo := repository.NewNotificationRepo(testPool)
	hubNotifRepo := repository.NewHubNotificationSettingsRepo(testPool)
	rankRepo := repository.NewRankRepo(testPool)
	streamPermRepo := repository.NewStreamPermissionRepo(testPool)

	hubSvc := service.NewHubService(hubRepo, streamRepo, streamPermRepo, inviteRepo, notifRepo, hubNotifRepo, rankRepo)
	return hubSvc, resp.User.ID
}

func TestHub_CreateAndGet(t *testing.T) {
	hubSvc, userID := setupHubTest(t)
	ctx := context.Background()

	hub, err := hubSvc.Create(ctx, userID, "Test Hub")
	if err != nil {
		t.Fatalf("Create hub failed: %v", err)
	}
	if hub.Name != "Test Hub" {
		t.Fatalf("expected 'Test Hub', got %q", hub.Name)
	}
	if hub.OwnerID != userID {
		t.Fatalf("expected owner %q, got %q", userID, hub.OwnerID)
	}

	got, err := hubSvc.Get(ctx, hub.ID, userID)
	if err != nil {
		t.Fatalf("Get hub failed: %v", err)
	}
	if got.ID != hub.ID {
		t.Fatal("hub ID mismatch")
	}
}

func TestHub_ListHubs(t *testing.T) {
	hubSvc, userID := setupHubTest(t)
	ctx := context.Background()

	hubSvc.Create(ctx, userID, "Hub A")
	hubSvc.Create(ctx, userID, "Hub B")

	hubs, err := hubSvc.List(ctx, userID)
	if err != nil {
		t.Fatalf("List hubs failed: %v", err)
	}
	if len(hubs) < 2 {
		t.Fatalf("expected at least 2 hubs, got %d", len(hubs))
	}
}

func TestHub_JoinAndLeave(t *testing.T) {
	hubSvc, ownerID := setupHubTest(t)
	ctx := context.Background()

	authSvc := auth.NewService(testPool, "test-secret")
	memberResp, _ := authSvc.Register(ctx, auth.RegisterInput{
		Username: "joiner",
		Password: "password123",
	})
	memberID := memberResp.User.ID

	hub, _ := hubSvc.Create(ctx, ownerID, "Join Hub")

	err := hubSvc.Join(ctx, hub.ID, memberID)
	if err != nil {
		t.Fatalf("Join failed: %v", err)
	}

	err = hubSvc.Join(ctx, hub.ID, memberID)
	if err == nil {
		t.Fatal("expected conflict error for double join")
	}

	err = hubSvc.Leave(ctx, hub.ID, memberID)
	if err != nil {
		t.Fatalf("Leave failed: %v", err)
	}
}

func TestHub_OwnerCannotLeave(t *testing.T) {
	hubSvc, ownerID := setupHubTest(t)
	ctx := context.Background()

	hub, _ := hubSvc.Create(ctx, ownerID, "Owner Hub")

	err := hubSvc.Leave(ctx, hub.ID, ownerID)
	if err == nil {
		t.Fatal("expected error: owner should not be able to leave")
	}
}

func TestHub_NonMemberCannotAccess(t *testing.T) {
	hubSvc, ownerID := setupHubTest(t)
	ctx := context.Background()

	authSvc := auth.NewService(testPool, "test-secret")
	outsiderResp, _ := authSvc.Register(ctx, auth.RegisterInput{
		Username: "outsider",
		Password: "password123",
	})

	hub, _ := hubSvc.Create(ctx, ownerID, "Secret Hub")

	_, err := hubSvc.Get(ctx, hub.ID, outsiderResp.User.ID)
	if err == nil {
		t.Fatal("expected forbidden error for non-member")
	}
}

func TestHub_Members(t *testing.T) {
	hubSvc, ownerID := setupHubTest(t)
	ctx := context.Background()

	hub, _ := hubSvc.Create(ctx, ownerID, "Members Hub")

	members, err := hubSvc.Members(ctx, hub.ID, ownerID)
	if err != nil {
		t.Fatalf("Members failed: %v", err)
	}
	if len(members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(members))
	}
}

func TestHub_CreateInviteAndJoin(t *testing.T) {
	hubSvc, ownerID := setupHubTest(t)
	ctx := context.Background()

	hub, _ := hubSvc.Create(ctx, ownerID, "Invite Hub")

	invite, err := hubSvc.CreateInvite(ctx, hub.ID, ownerID, 0, nil)
	if err != nil {
		t.Fatalf("CreateInvite failed: %v", err)
	}
	if invite.Code == "" {
		t.Fatal("expected non-empty invite code")
	}

	authSvc := auth.NewService(testPool, "test-secret")
	joinerResp, _ := authSvc.Register(ctx, auth.RegisterInput{
		Username: "invitejoiner",
		Password: "password123",
	})

	joinedHub, _, err := hubSvc.JoinViaInvite(ctx, invite.Code, joinerResp.User.ID)
	if err != nil {
		t.Fatalf("JoinViaInvite failed: %v", err)
	}
	if joinedHub.ID != hub.ID {
		t.Fatal("joined wrong hub")
	}
}

func TestStream_CreateAndList(t *testing.T) {
	hubSvc, ownerID := setupHubTest(t)
	ctx := context.Background()

	hub, _ := hubSvc.Create(ctx, ownerID, "Stream Hub")

	streamRepo := repository.NewStreamRepo(testPool)
	msgRepo := repository.NewMessageRepo(testPool)
	notifRepo := repository.NewNotificationRepo(testPool)
	streamNotifRepo := repository.NewStreamNotificationSettingsRepo(testPool)
	streamPermRepo := repository.NewStreamPermissionRepo(testPool)
	streamSvc := service.NewStreamService(streamRepo, streamPermRepo, hubSvc, msgRepo, notifRepo, streamNotifRepo)

	stream, err := streamSvc.Create(ctx, hub.ID, ownerID, "general-2", 0, false, nil)
	if err != nil {
		t.Fatalf("Create stream failed: %v", err)
	}
	if stream.Name != "general-2" {
		t.Fatalf("expected 'general-2', got %q", stream.Name)
	}

	streams, err := streamSvc.List(ctx, hub.ID, ownerID)
	if err != nil {
		t.Fatalf("List streams failed: %v", err)
	}
	if len(streams) < 2 {
		t.Fatalf("expected at least 2 streams (default + created), got %d", len(streams))
	}
}

func TestMessage_CreateAndList(t *testing.T) {
	hubSvc, ownerID := setupHubTest(t)
	ctx := context.Background()

	hub, _ := hubSvc.Create(ctx, ownerID, "Msg Hub")

	streamRepo := repository.NewStreamRepo(testPool)
	msgRepo := repository.NewMessageRepo(testPool)
	notifRepo := repository.NewNotificationRepo(testPool)
	hubNotifRepo := repository.NewHubNotificationSettingsRepo(testPool)
	streamNotifRepo := repository.NewStreamNotificationSettingsRepo(testPool)
	streamPermRepo := repository.NewStreamPermissionRepo(testPool)
	streams, _ := service.NewStreamService(streamRepo, streamPermRepo, hubSvc, msgRepo, notifRepo, streamNotifRepo).List(ctx, hub.ID, ownerID)
	if len(streams) == 0 {
		t.Fatal("expected at least one stream")
	}
	streamID := streams[0].ID

	wsHub := ws.NewHub(nil)
	go wsHub.Run()

	notifSvc := service.NewNotificationService(notifRepo, wsHub)
	msgSvc := service.NewMessageService(msgRepo, streamRepo, hubSvc, notifSvc, wsHub, hubNotifRepo, streamNotifRepo)

	msg, err := msgSvc.Create(ctx, ownerID, streamID, service.CreateMessageInput{
		Content: "Hello world!",
	})
	if err != nil {
		t.Fatalf("Create message failed: %v", err)
	}
	if msg.Content != "Hello world!" {
		t.Fatalf("expected 'Hello world!', got %q", msg.Content)
	}

	messages, err := msgSvc.List(ctx, ownerID, streamID, nil, 50)
	if err != nil {
		t.Fatalf("List messages failed: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(messages))
	}
}

func TestMessage_CreateHonorsHubAndStreamNotificationSettings(t *testing.T) {
	hubSvc, ownerID := setupHubTest(t)
	ctx := context.Background()

	authSvc := auth.NewService(testPool, "test-secret")
	registerUser := func(username string) string {
		t.Helper()
		resp, err := authSvc.Register(ctx, auth.RegisterInput{
			Username: username,
			Password: "password123",
		})
		if err != nil {
			t.Fatalf("failed to register %s: %v", username, err)
		}
		return resp.User.ID
	}

	hub, err := hubSvc.Create(ctx, ownerID, "Notif Hub")
	if err != nil {
		t.Fatalf("Create hub failed: %v", err)
	}

	allUserID := registerUser("notifall")
	mentionsUserID := registerUser("notifmentions")
	nothingUserID := registerUser("notifnothing")
	overrideAllUserID := registerUser("notifoverrideall")
	streamMentionsUserID := registerUser("notifstreammentions")
	serverMutedUserID := registerUser("notifservermuted")
	channelMutedUserID := registerUser("notifchannelmuted")

	memberIDs := []string{
		allUserID,
		mentionsUserID,
		nothingUserID,
		overrideAllUserID,
		streamMentionsUserID,
		serverMutedUserID,
		channelMutedUserID,
	}
	for _, memberID := range memberIDs {
		if err := hubSvc.Join(ctx, hub.ID, memberID); err != nil {
			t.Fatalf("Join failed for %s: %v", memberID, err)
		}
	}

	streamRepo := repository.NewStreamRepo(testPool)
	msgRepo := repository.NewMessageRepo(testPool)
	notifRepo := repository.NewNotificationRepo(testPool)
	hubNotifRepo := repository.NewHubNotificationSettingsRepo(testPool)
	streamNotifRepo := repository.NewStreamNotificationSettingsRepo(testPool)
	streamPermRepo := repository.NewStreamPermissionRepo(testPool)
	streamSvc := service.NewStreamService(streamRepo, streamPermRepo, hubSvc, msgRepo, notifRepo, streamNotifRepo)
	streams, err := streamSvc.List(ctx, hub.ID, ownerID)
	if err != nil {
		t.Fatalf("List streams failed: %v", err)
	}
	if len(streams) == 0 {
		t.Fatal("expected at least one stream")
	}
	streamID := streams[0].ID

	allSettings := repository.DefaultHubNotificationSettings()
	allSettings.NotificationLevel = "all"
	if err := hubNotifRepo.Upsert(ctx, allUserID, hub.ID, allSettings); err != nil {
		t.Fatalf("failed to save all-user hub settings: %v", err)
	}

	nothingSettings := repository.DefaultHubNotificationSettings()
	nothingSettings.NotificationLevel = "nothing"
	if err := hubNotifRepo.Upsert(ctx, nothingUserID, hub.ID, nothingSettings); err != nil {
		t.Fatalf("failed to save nothing-user hub settings: %v", err)
	}
	if err := hubNotifRepo.Upsert(ctx, overrideAllUserID, hub.ID, nothingSettings); err != nil {
		t.Fatalf("failed to save override-all hub settings: %v", err)
	}

	streamAllSettings := repository.DefaultStreamNotificationSettings()
	streamAllSettings.NotificationLevel = "all"
	if err := streamNotifRepo.Upsert(ctx, overrideAllUserID, streamID, streamAllSettings); err != nil {
		t.Fatalf("failed to save override-all stream settings: %v", err)
	}

	streamMentionsHubSettings := repository.DefaultHubNotificationSettings()
	streamMentionsHubSettings.NotificationLevel = "all"
	if err := hubNotifRepo.Upsert(ctx, streamMentionsUserID, hub.ID, streamMentionsHubSettings); err != nil {
		t.Fatalf("failed to save stream-mentions hub settings: %v", err)
	}
	streamMentionsSettings := repository.DefaultStreamNotificationSettings()
	streamMentionsSettings.NotificationLevel = "mentions_only"
	if err := streamNotifRepo.Upsert(ctx, streamMentionsUserID, streamID, streamMentionsSettings); err != nil {
		t.Fatalf("failed to save stream-mentions stream settings: %v", err)
	}

	serverMutedSettings := repository.DefaultHubNotificationSettings()
	serverMutedSettings.NotificationLevel = "all"
	serverMutedSettings.ServerMuted = true
	if err := hubNotifRepo.Upsert(ctx, serverMutedUserID, hub.ID, serverMutedSettings); err != nil {
		t.Fatalf("failed to save server-muted hub settings: %v", err)
	}

	channelMutedHubSettings := repository.DefaultHubNotificationSettings()
	channelMutedHubSettings.NotificationLevel = "all"
	if err := hubNotifRepo.Upsert(ctx, channelMutedUserID, hub.ID, channelMutedHubSettings); err != nil {
		t.Fatalf("failed to save channel-muted hub settings: %v", err)
	}
	channelMutedSettings := repository.DefaultStreamNotificationSettings()
	channelMutedSettings.NotificationLevel = "all"
	channelMutedSettings.ChannelMuted = true
	if err := streamNotifRepo.Upsert(ctx, channelMutedUserID, streamID, channelMutedSettings); err != nil {
		t.Fatalf("failed to save channel-muted stream settings: %v", err)
	}

	wsHub := ws.NewHub(nil)
	go wsHub.Run()

	notifSvc := service.NewNotificationService(notifRepo, wsHub)
	msgSvc := service.NewMessageService(msgRepo, streamRepo, hubSvc, notifSvc, wsHub, hubNotifRepo, streamNotifRepo)

	if _, err := msgSvc.Create(ctx, ownerID, streamID, service.CreateMessageInput{Content: "Server notification check"}); err != nil {
		t.Fatalf("Create message failed: %v", err)
	}

	waitForNotificationTotals(t, notifRepo, map[string]int{
		allUserID:             1,
		mentionsUserID:        0,
		nothingUserID:         0,
		overrideAllUserID:     1,
		streamMentionsUserID:  0,
		serverMutedUserID:     0,
		channelMutedUserID:    0,
	})
	assertNotificationTypes(t, notifRepo, allUserID, map[string]int{"message": 1})
	assertNotificationTypes(t, notifRepo, overrideAllUserID, map[string]int{"message": 1})
	assertNotificationTypes(t, notifRepo, mentionsUserID, map[string]int{})
	assertNotificationTypes(t, notifRepo, nothingUserID, map[string]int{})
	assertNotificationTypes(t, notifRepo, streamMentionsUserID, map[string]int{})
	assertNotificationTypes(t, notifRepo, serverMutedUserID, map[string]int{})
	assertNotificationTypes(t, notifRepo, channelMutedUserID, map[string]int{})

	if _, err := testPool.Exec(ctx, `DELETE FROM notifications`); err != nil {
		t.Fatalf("failed to clear notifications: %v", err)
	}

	if _, err := msgSvc.Create(ctx, ownerID, streamID, service.CreateMessageInput{
		Content: "@notifmentions @notifoverrideall @notifstreammentions @notifnothing @notifservermuted @notifchannelmuted check this out",
	}); err != nil {
		t.Fatalf("Create mention message failed: %v", err)
	}

	waitForNotificationTotals(t, notifRepo, map[string]int{
		allUserID:             1,
		mentionsUserID:        1,
		nothingUserID:         0,
		overrideAllUserID:     1,
		streamMentionsUserID:  1,
		serverMutedUserID:     0,
		channelMutedUserID:    0,
	})
	assertNotificationTypes(t, notifRepo, allUserID, map[string]int{"message": 1})
	assertNotificationTypes(t, notifRepo, mentionsUserID, map[string]int{"mention": 1})
	assertNotificationTypes(t, notifRepo, overrideAllUserID, map[string]int{"mention": 1})
	assertNotificationTypes(t, notifRepo, streamMentionsUserID, map[string]int{"mention": 1})
	assertNotificationTypes(t, notifRepo, nothingUserID, map[string]int{})
	assertNotificationTypes(t, notifRepo, serverMutedUserID, map[string]int{})
	assertNotificationTypes(t, notifRepo, channelMutedUserID, map[string]int{})
}

func waitForNotificationTotals(t *testing.T, notifRepo *repository.NotificationRepo, expectedTotals map[string]int) {
	t.Helper()
	ctx := context.Background()
	deadline := time.Now().Add(2 * time.Second)

	for {
		ready := true
		for userID, expectedTotal := range expectedTotals {
			notifications, err := notifRepo.List(ctx, userID)
			if err != nil {
				t.Fatalf("failed to list notifications for %s: %v", userID, err)
			}
			if len(notifications) != expectedTotal {
				ready = false
				break
			}
		}
		if ready {
			time.Sleep(75 * time.Millisecond)
			stable := true
			for userID, expectedTotal := range expectedTotals {
				notifications, err := notifRepo.List(ctx, userID)
				if err != nil {
					t.Fatalf("failed to list notifications for %s: %v", userID, err)
				}
				if len(notifications) != expectedTotal {
					stable = false
					break
				}
			}
			if stable {
				return
			}
		}
		if time.Now().After(deadline) {
			break
		}
		time.Sleep(25 * time.Millisecond)
	}

	for userID, expectedTotal := range expectedTotals {
		notifications, err := notifRepo.List(ctx, userID)
		if err != nil {
			t.Fatalf("failed to list notifications for %s: %v", userID, err)
		}
		if len(notifications) != expectedTotal {
			t.Fatalf("expected %d notifications for %s, got %d", expectedTotal, userID, len(notifications))
		}
	}
}

func assertNotificationTypes(t *testing.T, notifRepo *repository.NotificationRepo, userID string, expected map[string]int) {
	t.Helper()
	notifications, err := notifRepo.List(context.Background(), userID)
	if err != nil {
		t.Fatalf("failed to list notifications for %s: %v", userID, err)
	}

	actual := make(map[string]int)
	for _, notification := range notifications {
		actual[notification.Type]++
	}
	if len(actual) != len(expected) {
		t.Fatalf("expected notification types %v for %s, got %v", expected, userID, actual)
	}
	for notifType, expectedCount := range expected {
		if actual[notifType] != expectedCount {
			t.Fatalf("expected %d %s notifications for %s, got %d", expectedCount, notifType, userID, actual[notifType])
		}
	}
}
