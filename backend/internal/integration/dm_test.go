package integration

import (
	"context"
	"testing"

	"github.com/riftapp-cloud/riftapp/internal/auth"
	"github.com/riftapp-cloud/riftapp/internal/repository"
	"github.com/riftapp-cloud/riftapp/internal/service"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

func TestDMReadStatesIgnoreOwnMessages(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()

	authSvc := auth.NewService(testPool, "integration-test-secret")
	sender, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "dm_sender",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("register sender failed: %v", err)
	}

	recipient, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "dm_recipient",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("register recipient failed: %v", err)
	}

	dmSvc := service.NewDMService(
		repository.NewDMRepo(testPool),
		repository.NewMessageRepo(testPool),
		nil,
		ws.NewHub(testPool),
	)

	conversation, _, err := dmSvc.CreateOrOpen(ctx, sender.User.ID, recipient.User.ID)
	if err != nil {
		t.Fatalf("create or open dm failed: %v", err)
	}

	if _, err := dmSvc.SendMessage(ctx, conversation.ID, sender.User.ID, service.SendDMInput{
		Content: "https://riftapp.io/invite/test-code",
	}); err != nil {
		t.Fatalf("send dm message failed: %v", err)
	}

	senderStates, err := dmSvc.ReadStates(ctx, sender.User.ID)
	if err != nil {
		t.Fatalf("read sender states failed: %v", err)
	}
	if unread := unreadCountForConversation(senderStates, conversation.ID); unread != 0 {
		t.Fatalf("expected sender unread count 0, got %d", unread)
	}

	recipientStates, err := dmSvc.ReadStates(ctx, recipient.User.ID)
	if err != nil {
		t.Fatalf("read recipient states failed: %v", err)
	}
	if unread := unreadCountForConversation(recipientStates, conversation.ID); unread != 1 {
		t.Fatalf("expected recipient unread count 1, got %d", unread)
	}
}

func TestGroupDMOwnerPermissionsAndTransfer(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()

	authSvc := auth.NewService(testPool, "integration-test-secret")
	owner, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "group_owner",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("register owner failed: %v", err)
	}

	memberOne, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "group_member_one",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("register first member failed: %v", err)
	}

	memberTwo, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "group_member_two",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("register second member failed: %v", err)
	}

	dmRepo := repository.NewDMRepo(testPool)
	dmSvc := service.NewDMService(
		dmRepo,
		repository.NewMessageRepo(testPool),
		nil,
		ws.NewHub(testPool),
	)

	conversation, _, err := dmSvc.CreateOrOpenGroup(ctx, owner.User.ID, []string{memberOne.User.ID, memberTwo.User.ID})
	if err != nil {
		t.Fatalf("create group dm failed: %v", err)
	}
	if conversation.OwnerID == nil || *conversation.OwnerID != owner.User.ID {
		t.Fatalf("expected returned conversation owner %q, got %v", owner.User.ID, conversation.OwnerID)
	}

	storedConversation, err := dmRepo.GetConversation(ctx, conversation.ID)
	if err != nil {
		t.Fatalf("load stored conversation failed: %v", err)
	}
	if storedConversation.OwnerID == nil || *storedConversation.OwnerID != owner.User.ID {
		t.Fatalf("expected conversation owner %q, got %v", owner.User.ID, storedConversation.OwnerID)
	}

	if err := dmSvc.RemoveMember(ctx, memberOne.User.ID, conversation.ID, memberTwo.User.ID); err == nil {
		t.Fatal("expected non-owner removal to fail")
	}

	if err := dmSvc.LeaveConversation(ctx, owner.User.ID, conversation.ID); err != nil {
		t.Fatalf("owner leave failed: %v", err)
	}

	storedConversation, err = dmRepo.GetConversation(ctx, conversation.ID)
	if err != nil {
		t.Fatalf("load conversation after owner leave failed: %v", err)
	}
	if storedConversation.OwnerID == nil || *storedConversation.OwnerID != memberOne.User.ID {
		t.Fatalf("expected ownership to transfer to %q, got %v", memberOne.User.ID, storedConversation.OwnerID)
	}

	remainingMembers, err := dmRepo.GetAllMembers(ctx, conversation.ID)
	if err != nil {
		t.Fatalf("load remaining members after owner leave failed: %v", err)
	}
	if len(remainingMembers) != 2 || remainingMembers[0] != memberOne.User.ID || remainingMembers[1] != memberTwo.User.ID {
		t.Fatalf("unexpected remaining members after owner leave: %v", remainingMembers)
	}

	if err := dmSvc.RemoveMember(ctx, memberOne.User.ID, conversation.ID, memberTwo.User.ID); err != nil {
		t.Fatalf("new owner removal failed: %v", err)
	}

	remainingMembers, err = dmRepo.GetAllMembers(ctx, conversation.ID)
	if err != nil {
		t.Fatalf("load remaining members after new owner removal failed: %v", err)
	}
	if len(remainingMembers) != 1 || remainingMembers[0] != memberOne.User.ID {
		t.Fatalf("unexpected remaining members after new owner removal: %v", remainingMembers)
	}
}

func TestGroupDMCreateWithSameMembersCreatesNewConversation(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()

	authSvc := auth.NewService(testPool, "integration-test-secret")
	creatorOne, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "group_creator_one",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("register first creator failed: %v", err)
	}

	creatorTwo, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "group_creator_two",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("register second creator failed: %v", err)
	}

	memberThree, err := authSvc.Register(ctx, auth.RegisterInput{
		Username: "group_creator_three",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("register third member failed: %v", err)
	}

	dmRepo := repository.NewDMRepo(testPool)
	dmSvc := service.NewDMService(
		dmRepo,
		repository.NewMessageRepo(testPool),
		nil,
		ws.NewHub(testPool),
	)

	firstConversation, firstCreated, err := dmSvc.CreateOrOpenGroup(ctx, creatorOne.User.ID, []string{creatorTwo.User.ID, memberThree.User.ID})
	if err != nil {
		t.Fatalf("create first group dm failed: %v", err)
	}
	if !firstCreated {
		t.Fatal("expected first group dm creation to report created")
	}
	if firstConversation.OwnerID == nil || *firstConversation.OwnerID != creatorOne.User.ID {
		t.Fatalf("expected first conversation owner %q, got %v", creatorOne.User.ID, firstConversation.OwnerID)
	}

	secondConversation, secondCreated, err := dmSvc.CreateOrOpenGroup(ctx, creatorTwo.User.ID, []string{creatorOne.User.ID, memberThree.User.ID})
	if err != nil {
		t.Fatalf("create second group dm failed: %v", err)
	}
	if !secondCreated {
		t.Fatal("expected second group dm creation to report created")
	}
	if secondConversation.ID == firstConversation.ID {
		t.Fatalf("expected distinct group conversations, both ids were %q", firstConversation.ID)
	}
	if secondConversation.OwnerID == nil || *secondConversation.OwnerID != creatorTwo.User.ID {
		t.Fatalf("expected second conversation owner %q, got %v", creatorTwo.User.ID, secondConversation.OwnerID)
	}

	storedSecondConversation, err := dmRepo.GetConversation(ctx, secondConversation.ID)
	if err != nil {
		t.Fatalf("load second stored conversation failed: %v", err)
	}
	if storedSecondConversation.OwnerID == nil || *storedSecondConversation.OwnerID != creatorTwo.User.ID {
		t.Fatalf("expected stored second conversation owner %q, got %v", creatorTwo.User.ID, storedSecondConversation.OwnerID)
	}
}

func unreadCountForConversation(states []repository.DMReadState, conversationID string) int {
	for _, state := range states {
		if state.ConversationID == conversationID {
			return state.UnreadCount
		}
	}
	return -1
}
