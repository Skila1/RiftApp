package database

import (
	"context"
	"embed"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

func Migrate(pool *pgxpool.Pool) error {
	connConfig := pool.Config().ConnConfig
	db := stdlib.OpenDB(*connConfig)
	defer db.Close()

	// Goose uses database/sql, not the pool — its connections do not run pgxpool.AfterConnect.
	// Neon can leave search_path empty → "no schema has been selected to create in" for goose_db_version.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, "SET search_path TO public"); err != nil {
		return fmt.Errorf("set search_path for migrations: %w", err)
	}

	goose.SetBaseFS(embedMigrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("goose set dialect: %w", err)
	}

	current, _ := goose.GetDBVersion(db)
	log.Printf("[migrate] current schema version: %d", current)

	if err := goose.Up(db, "migrations"); err != nil {
		return fmt.Errorf("goose up (from version %d): %w", current, err)
	}

	after, _ := goose.GetDBVersion(db)
	if after != current {
		log.Printf("[migrate] migrated: version %d → %d", current, after)
	} else {
		log.Printf("[migrate] schema up-to-date at version %d", after)
	}
	return nil
}
