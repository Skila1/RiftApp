package database

import (
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

func TestEmbeddedMigrationsHaveUniqueVersions(t *testing.T) {
	entries, err := fs.Glob(embedMigrations, "migrations/*.sql")
	if err != nil {
		t.Fatalf("glob embedded migrations: %v", err)
	}

	seen := make(map[string]string, len(entries))
	for _, entry := range entries {
		name := filepath.Base(entry)
		parts := strings.SplitN(name, "_", 2)
		if len(parts) != 2 || parts[0] == "" {
			t.Fatalf("migration %q does not use the expected NNN_description.sql naming", name)
		}

		if previous, ok := seen[parts[0]]; ok {
			t.Fatalf("duplicate migration version %s: %s and %s", parts[0], previous, name)
		}
		seen[parts[0]] = name
	}
}