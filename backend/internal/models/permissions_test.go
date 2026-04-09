package models

import "testing"

func TestHasPermission_Single(t *testing.T) {
	if !HasPermission(PermSendMessages, PermSendMessages) {
		t.Error("expected send perm to include itself")
	}
	if HasPermission(PermSendMessages, PermManageHub) {
		t.Error("send perm should not include manage hub")
	}
}

func TestHasPermission_Admin(t *testing.T) {
	if !HasPermission(PermAdministrator, PermSendMessages) {
		t.Error("administrator should have all permissions")
	}
	if !HasPermission(PermAdministrator, PermManageHub) {
		t.Error("administrator should have manage hub")
	}
}

func TestHasPermission_Combined(t *testing.T) {
	perms := PermSendMessages | PermViewStreams
	if !HasPermission(perms, PermSendMessages) {
		t.Error("expected send perm")
	}
	if !HasPermission(perms, PermViewStreams) {
		t.Error("expected view perm")
	}
	if HasPermission(perms, PermManageStreams) {
		t.Error("should not have manage streams")
	}
}

func TestRoleHasPermission(t *testing.T) {
	tests := []struct {
		role   string
		perm   int64
		expect bool
	}{
		{RoleOwner, PermSendMessages, true},
		{RoleOwner, PermManageHub, true},
		{RoleAdmin, PermManageHub, true},
		{RoleAdmin, PermSendMessages, true},
		{RoleAdmin, PermConnectVoice, true},
		{RoleAdmin, PermUseSoundboard, true},
		{RoleMember, PermSendMessages, false},
		{RoleMember, PermManageHub, false},
		{RoleMember, PermConnectVoice, false},
		{RoleMember, PermUseSoundboard, false},
		{"unknown", PermSendMessages, false},
	}
	for _, tt := range tests {
		got := RoleHasPermission(tt.role, tt.perm)
		if got != tt.expect {
			t.Errorf("RoleHasPermission(%q, %d) = %v, want %v", tt.role, tt.perm, got, tt.expect)
		}
	}
}

func TestRolePermissions_OwnerIsAdmin(t *testing.T) {
	if RolePermissions[RoleOwner]&PermAdministrator == 0 {
		t.Error("owner should have administrator bit set")
	}
}

func TestPermDefault(t *testing.T) {
	if PermDefault&PermViewStreams == 0 {
		t.Error("default should include view streams")
	}
	if PermDefault&PermSendMessages == 0 {
		t.Error("default should include send messages")
	}
	if PermDefault&PermConnectVoice == 0 {
		t.Error("default should include connect voice")
	}
	if PermDefault&PermSpeakVoice == 0 {
		t.Error("default should include speak voice")
	}
	if PermDefault&PermUseSoundboard == 0 {
		t.Error("default should include soundboard")
	}
	if PermDefault&PermManageHub != 0 {
		t.Error("default should not include manage hub")
	}
}
