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
		if user.Status <= models.UserStatusOffline {
			user.Status = models.UserStatusOnline
		}
		return
	}

	user.Status = models.UserStatusOffline
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
