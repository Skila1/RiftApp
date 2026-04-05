package integration

import (
	"context"
	"testing"

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

	hubSvc := service.NewHubService(hubRepo, streamRepo, inviteRepo, notifRepo, hubNotifRepo, rankRepo)
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
	streamSvc := service.NewStreamService(streamRepo, hubSvc, msgRepo, notifRepo)

	stream, err := streamSvc.Create(ctx, hub.ID, ownerID, "general-2", 0, false, nil)
	if err != nil {
		t.Fatalf("Create stream failed: %v", err)
	}
	if stream.Name != "general-2" {
		t.Fatalf("expected 'general-2', got %q", stream.Name)
	}

	streams, err := streamSvc.List(ctx, hub.ID)
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
	streams, _ := service.NewStreamService(streamRepo, hubSvc, msgRepo, notifRepo).List(ctx, hub.ID)
	if len(streams) == 0 {
		t.Fatal("expected at least one stream")
	}
	streamID := streams[0].ID

	wsHub := ws.NewHub(nil)
	go wsHub.Run()

	notifSvc := service.NewNotificationService(notifRepo, wsHub)
	msgSvc := service.NewMessageService(msgRepo, streamRepo, hubSvc, notifSvc, wsHub, hubNotifRepo)

	msg, err := msgSvc.Create(ctx, ownerID, streamID, service.CreateMessageInput{
		Content: "Hello world!",
	})
	if err != nil {
		t.Fatalf("Create message failed: %v", err)
	}
	if msg.Content != "Hello world!" {
		t.Fatalf("expected 'Hello world!', got %q", msg.Content)
	}

	messages, err := msgSvc.List(ctx, streamID, nil, 50)
	if err != nil {
		t.Fatalf("List messages failed: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(messages))
	}
}
