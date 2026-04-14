package botengine

import (
	"github.com/riftapp-cloud/riftapp/internal/models"
)

type BuiltinCommand struct {
	Name        string
	Description string
	Options     []models.ApplicationCommandOption
}

var TemplateCommands = map[string][]BuiltinCommand{
	"music": {
		{Name: "play", Description: "Play a song or add it to the queue", Options: []models.ApplicationCommandOption{
			{Name: "query", Description: "Song name or URL", Type: 3, Required: true},
		}},
		{Name: "pause", Description: "Pause or resume the current track"},
		{Name: "skip", Description: "Skip to the next track in the queue"},
		{Name: "stop", Description: "Stop playback and clear the queue"},
		{Name: "queue", Description: "Show the current music queue"},
		{Name: "volume", Description: "Set or view the playback volume", Options: []models.ApplicationCommandOption{
			{Name: "level", Description: "Volume level (0-100)", Type: 4},
		}},
		{Name: "nowplaying", Description: "Show the currently playing track"},
		{Name: "loop", Description: "Toggle loop mode"},
		{Name: "shuffle", Description: "Toggle shuffle mode"},
	},
	"utility": {
		{Name: "poll", Description: "Create a poll", Options: []models.ApplicationCommandOption{
			{Name: "question", Description: "The poll question", Type: 3, Required: true},
			{Name: "option1", Description: "First option", Type: 3, Required: true},
			{Name: "option2", Description: "Second option", Type: 3, Required: true},
			{Name: "option3", Description: "Third option", Type: 3},
			{Name: "option4", Description: "Fourth option", Type: 3},
			{Name: "option5", Description: "Fifth option", Type: 3},
		}},
		{Name: "remind", Description: "Set a reminder", Options: []models.ApplicationCommandOption{
			{Name: "time", Description: "When to remind (e.g. 30m, 2h, 1d)", Type: 3, Required: true},
			{Name: "message", Description: "What to remind you about", Type: 3, Required: true},
		}},
		{Name: "serverinfo", Description: "Show server information"},
		{Name: "announce", Description: "Send a formatted announcement", Options: []models.ApplicationCommandOption{
			{Name: "message", Description: "The announcement message", Type: 3, Required: true},
		}},
	},
	"leveling": {
		{Name: "rank", Description: "View your or someone's rank card", Options: []models.ApplicationCommandOption{
			{Name: "user", Description: "User to check (leave empty for yourself)", Type: 6},
		}},
		{Name: "leaderboard", Description: "View the XP leaderboard"},
	},
	"moderation": {},
	"welcome":    {},
}
