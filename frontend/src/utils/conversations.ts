import type { Conversation, User } from '../types';

export function getUserLabel(user?: User): string {
  const displayName = user?.display_name?.trim();
  if (displayName) return displayName;
  const username = user?.username?.trim();
  if (username) return username;
  return 'Unknown User';
}

export function getConversationMembers(conversation?: Conversation | null): User[] {
  if (!conversation) return [];
  if (conversation.members && conversation.members.length > 0) {
    return conversation.members;
  }
  return conversation.recipient ? [conversation.recipient] : [];
}

export function getConversationOtherMembers(conversation?: Conversation | null, viewerUserId?: string | null): User[] {
  const members = getConversationMembers(conversation);
  if (!viewerUserId) return members;
  const others = members.filter((member) => member.id !== viewerUserId);
  return others.length > 0 ? others : members;
}

export function isGroupConversation(conversation?: Conversation | null, viewerUserId?: string | null): boolean {
  return Boolean(conversation?.is_group) || getConversationOtherMembers(conversation, viewerUserId).length > 1;
}

export function getConversationTitle(conversation?: Conversation | null, viewerUserId?: string | null): string {
  const customName = conversation?.name?.trim();
  if (customName) return customName;

  const others = getConversationOtherMembers(conversation, viewerUserId);
  if (others.length === 0) return 'Direct Message';
  if (others.length === 1) return getUserLabel(others[0]);

  const labels = others.map(getUserLabel);
  if (labels.length <= 3) {
    return labels.join(', ');
  }
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

export function getConversationSubtitle(conversation?: Conversation | null, viewerUserId?: string | null): string {
  const others = getConversationOtherMembers(conversation, viewerUserId);
  if (others.length === 0) return 'No members';

  if (isGroupConversation(conversation, viewerUserId)) {
    const labels = others.map(getUserLabel);
    if (labels.length <= 3) {
      return labels.join(', ');
    }
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
  }

  const usernames = others
    .map((member) => member.username?.trim())
    .filter((value): value is string => Boolean(value));

  if (usernames.length === 0) {
    return getConversationTitle(conversation, viewerUserId);
  }
  if (usernames.length <= 3) {
    return usernames.map((username) => `@${username}`).join(', ');
  }
  return `${usernames.slice(0, 2).map((username) => `@${username}`).join(', ')} +${usernames.length - 2}`;
}

export function getConversationAvatarUsers(
  conversation?: Conversation | null,
  viewerUserId?: string | null,
  limit = 2,
): User[] {
  return getConversationOtherMembers(conversation, viewerUserId).slice(0, limit);
}

export function getConversationIconUrl(conversation?: Conversation | null): string | undefined {
  const iconUrl = conversation?.icon_url?.trim();
  return iconUrl ? iconUrl : undefined;
}
