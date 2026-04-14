package api

import (
	"github.com/riftapp-cloud/riftapp/internal/models"
	"github.com/riftapp-cloud/riftapp/internal/ws"
)

func applyLiveUserStatus(hub *ws.Hub, user *models.User) {
	if hub == nil || user == nil || user.ID == "" {
		return
	}

	if hub.IsOnline(user.ID) {
		if user.Status <= 0 {
			user.Status = 1
		}
		return
	}

	user.Status = 0
}

func applyLiveStatusesToFriendships(hub *ws.Hub, friendships []models.Friendship) {
	for index := range friendships {
		applyLiveUserStatus(hub, friendships[index].User)
	}
}

func applyLiveStatusesToBlocks(hub *ws.Hub, blocks []models.Block) {
	for index := range blocks {
		applyLiveUserStatus(hub, blocks[index].User)
	}
}
