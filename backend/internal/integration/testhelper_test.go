package integration

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/riftapp-cloud/riftapp/internal/database"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	ctx := context.Background()

	pgContainer, err := runPostgresContainer(ctx)
	if err != nil {
		if shouldSkipIntegration(err) {
			fmt.Printf("skipping integration tests: %v\n", err)
			os.Exit(0)
		}
		fmt.Printf("failed to start postgres container: %v\n", err)
		os.Exit(1)
	}

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		fmt.Printf("failed to get connection string: %v\n", err)
		os.Exit(1)
	}

	testPool, err = pgxpool.New(ctx, connStr)
	if err != nil {
		fmt.Printf("failed to connect to test db: %v\n", err)
		os.Exit(1)
	}

	if err := database.Migrate(testPool); err != nil {
		fmt.Printf("failed to run migrations: %v\n", err)
		os.Exit(1)
	}

	code := m.Run()

	testPool.Close()
	pgContainer.Terminate(ctx)
	os.Exit(code)
}

func runPostgresContainer(ctx context.Context) (_ *postgres.PostgresContainer, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("%v", recovered)
		}
	}()

	return postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("riftapp_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
}

func shouldSkipIntegration(err error) bool {
	if err == nil {
		return false
	}
	if runtime.GOOS != "windows" {
		return false
	}
	message := err.Error()
	return strings.Contains(message, "rootless Docker is not supported on Windows") ||
		strings.Contains(message, "not supported on Windows")
}

func cleanTables(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	tables := []string{
		"refresh_tokens", "notifications", "reactions", "attachments", "messages",
		"dm_read_states", "stream_read_states", "conversation_members", "conversations",
		"direct_messages", "friendships", "hub_invites", "ranks",
		"streams", "hub_members", "hubs", "users",
	}
	for _, table := range tables {
		testPool.Exec(ctx, fmt.Sprintf("DELETE FROM %s", table))
	}
}
