package integration

import (
	"context"
	"testing"

	"github.com/riftapp-cloud/riftapp/internal/auth"
)

func TestAuth_RegisterAndLogin(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()
	svc := auth.NewService(testPool, "integration-test-secret")

	resp, err := svc.Register(ctx, auth.RegisterInput{
		Username: "testuser",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if resp.User.Username != "testuser" {
		t.Fatalf("expected username 'testuser', got %q", resp.User.Username)
	}
	if resp.AccessToken == "" || resp.RefreshToken == "" {
		t.Fatal("expected non-empty tokens")
	}

	loginResp, err := svc.Login(ctx, auth.LoginInput{
		Username: "testuser",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if loginResp.User.ID != resp.User.ID {
		t.Fatal("login returned different user ID")
	}
}

func TestAuth_DuplicateUsername(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()
	svc := auth.NewService(testPool, "integration-test-secret")

	_, err := svc.Register(ctx, auth.RegisterInput{
		Username: "dupuser",
		Password: "password123",
	})
	if err != nil {
		t.Fatalf("first register failed: %v", err)
	}

	_, err = svc.Register(ctx, auth.RegisterInput{
		Username: "dupuser",
		Password: "password456",
	})
	if err == nil {
		t.Fatal("expected error for duplicate username")
	}
	if err != auth.ErrUsernameTaken {
		t.Fatalf("expected ErrUsernameTaken, got: %v", err)
	}
}

func TestAuth_WrongPassword(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()
	svc := auth.NewService(testPool, "integration-test-secret")

	_, _ = svc.Register(ctx, auth.RegisterInput{
		Username: "wrongpw",
		Password: "correctpassword",
	})

	_, err := svc.Login(ctx, auth.LoginInput{
		Username: "wrongpw",
		Password: "wrongpassword",
	})
	if err != auth.ErrInvalidCredentials {
		t.Fatalf("expected ErrInvalidCredentials, got: %v", err)
	}
}

func TestAuth_RefreshTokenFlow(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()
	svc := auth.NewService(testPool, "integration-test-secret")

	resp, _ := svc.Register(ctx, auth.RegisterInput{
		Username: "refreshuser",
		Password: "password123",
	})

	refreshed, err := svc.RefreshTokens(ctx, resp.RefreshToken)
	if err != nil {
		t.Fatalf("RefreshTokens failed: %v", err)
	}
	if refreshed.AccessToken == "" {
		t.Fatal("expected non-empty access token")
	}

	_, err = svc.RefreshTokens(ctx, resp.RefreshToken)
	if err == nil {
		t.Fatal("expected error: old refresh token should be invalidated after rotation")
	}
}

func TestAuth_Logout(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()
	svc := auth.NewService(testPool, "integration-test-secret")

	resp, _ := svc.Register(ctx, auth.RegisterInput{
		Username: "logoutuser",
		Password: "password123",
	})

	err := svc.Logout(ctx, resp.RefreshToken)
	if err != nil {
		t.Fatalf("Logout failed: %v", err)
	}

	_, err = svc.RefreshTokens(ctx, resp.RefreshToken)
	if err == nil {
		t.Fatal("expected error: refresh token should be revoked after logout")
	}
}

func TestAuth_GetUser(t *testing.T) {
	cleanTables(t)
	ctx := context.Background()
	svc := auth.NewService(testPool, "integration-test-secret")

	resp, _ := svc.Register(ctx, auth.RegisterInput{
		Username: "getmeuser",
		Password: "password123",
	})

	user, err := svc.GetUser(ctx, resp.User.ID)
	if err != nil {
		t.Fatalf("GetUser failed: %v", err)
	}
	if user.Username != "getmeuser" {
		t.Fatalf("expected 'getmeuser', got %q", user.Username)
	}
}
