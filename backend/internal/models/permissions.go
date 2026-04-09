package models

// Permission bitfield constants for Ranks
const (
	PermViewStreams    int64 = 1 << 0
	PermSendMessages   int64 = 1 << 1
	PermManageMessages int64 = 1 << 2
	PermManageStreams  int64 = 1 << 3
	PermManageHub      int64 = 1 << 4
	PermManageRanks    int64 = 1 << 5
	PermKickMembers    int64 = 1 << 6
	PermBanMembers     int64 = 1 << 7
	PermConnectVoice   int64 = 1 << 8
	PermSpeakVoice     int64 = 1 << 9
	PermUseSoundboard  int64 = 1 << 10
	PermAdministrator  int64 = 1 << 31

	// Default permissions for @everyone
	PermDefault = PermViewStreams | PermSendMessages | PermConnectVoice | PermSpeakVoice | PermUseSoundboard
)

// Role constants
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleMember = "member"
)

// RolePermissions maps each role to its effective permission bitfield.
var RolePermissions = map[string]int64{
	RoleOwner:  PermAdministrator,
	RoleAdmin:  PermManageHub | PermManageStreams | PermManageMessages | PermSendMessages | PermViewStreams | PermKickMembers | PermConnectVoice | PermSpeakVoice | PermUseSoundboard,
	RoleMember: 0,
}

func HasPermission(perms, flag int64) bool {
	if perms&PermAdministrator != 0 {
		return true
	}
	return perms&flag != 0
}

// RoleHasPermission checks whether the given role grants the specified permission.
func RoleHasPermission(role string, flag int64) bool {
	perms, ok := RolePermissions[role]
	if !ok {
		return false
	}
	return HasPermission(perms, flag)
}
