package database

import (
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
