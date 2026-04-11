package database

import (
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestEmbeddedMigrationsHaveUniqueVersions(t *testing.T) {
	entries, err := fs.Glob(embedMigrations, "migrations/*.sql")
	if err != nil {
		t.Fatalf("glob embedded migrations: %v", err)
	}

	seen := make(map[int]string, len(entries))
	for _, entry := range entries {
		name := filepath.Base(entry)
		parts := strings.SplitN(name, "_", 2)
		if len(parts) != 2 || parts[0] == "" {
			t.Fatalf("migration %q does not use the expected NNN_description.sql naming", name)
		}

		version, err := strconv.Atoi(parts[0])
		if err != nil {
			t.Fatalf("migration %q has non-numeric version prefix %q: %v", name, parts[0], err)
		}

		if previous, ok := seen[version]; ok {
			t.Fatalf("duplicate migration version %d: %s and %s", version, previous, name)
		}
		seen[version] = name
	}
}
