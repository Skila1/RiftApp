package buildinfo

import (
	"os"
	"strings"
)

var (
	CommitSHA = "dev"
	BuildID   = ""
)

type Info struct {
	CommitSHA string `json:"commit_sha"`
	BuildID   string `json:"build_id"`
}

func Current() Info {
	return Info{
		CommitSHA: resolveValue(CommitSHA, "RIFT_BACKEND_BUILD_SHA", "GITHUB_SHA"),
		BuildID:   resolveValue(BuildID, "RIFT_BACKEND_BUILD_ID"),
	}
}

func resolveValue(primary string, envKeys ...string) string {
	trimmedPrimary := strings.TrimSpace(primary)
	if trimmedPrimary != "" && trimmedPrimary != "unknown" {
		return trimmedPrimary
	}

	for _, envKey := range envKeys {
		if value := strings.TrimSpace(os.Getenv(envKey)); value != "" {
			return value
		}
	}

	return trimmedPrimary
}