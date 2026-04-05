export const PermViewStreams = 1 << 0;
export const PermSendMessages = 1 << 1;
export const PermManageMessages = 1 << 2;
export const PermManageStreams = 1 << 3;
export const PermManageHub = 1 << 4;
export const PermManageRanks = 1 << 5;
export const PermKickMembers = 1 << 6;
export const PermBanMembers = 1 << 7;
export const PermConnectVoice = 1 << 8;
export const PermSpeakVoice = 1 << 9;
export const PermUseSoundboard = 1 << 10;
export const PermAdministrator = 1 << 31;

export function hasPermission(perms: number | undefined, flag: number): boolean {
  if (!perms) return false;
  if ((perms & PermAdministrator) !== 0) return true;
  return (perms & flag) !== 0;
}

export function canModerateVoice(perms: number | undefined): boolean {
  return hasPermission(perms, PermKickMembers)
    || hasPermission(perms, PermManageStreams)
    || hasPermission(perms, PermManageHub);
}
