import type { Block, Conversation, Friendship, Hub, Message, Notification, User } from '../types';

const ASSET_VERSION_PARAM = 'v';

function rewriteVersionParam(raw: string, version?: string, remove = false): string {
  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = beforeHash.indexOf('?');
  const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(query);

  if (remove) params.delete(ASSET_VERSION_PARAM);
  else if (version) params.set(ASSET_VERSION_PARAM, version);

  const nextQuery = params.toString();
  return `${path}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
}

export function withAssetVersion(raw: string | undefined | null, version: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!version) return trimmed;
  return rewriteVersionParam(trimmed, version);
}

export function stripAssetVersion(raw: string | undefined | null): string {
  if (raw == null) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return rewriteVersionParam(trimmed, undefined, true);
}

export function normalizeUser(user: User): User {
  return {
    ...user,
    is_bot: Boolean(user.is_bot),
    avatar_url: withAssetVersion(user.avatar_url, user.updated_at),
  };
}

export function normalizeUsers(users: User[]): User[] {
  return users.map(normalizeUser);
}

export function normalizeHub(hub: Hub): Hub {
  const version = hub.updated_at || hub.created_at;
  return {
    ...hub,
    icon_url: withAssetVersion(hub.icon_url, version),
    banner_url: withAssetVersion(hub.banner_url, version),
  };
}

export function normalizeHubs(hubs: Hub[]): Hub[] {
  return hubs.map(normalizeHub);
}

export function normalizeMessage(message: Message): Message {
  const normalizeReplyPreview = (reply?: Message): Message | undefined => {
    if (!reply) return reply;
    return {
      ...reply,
      pinned: Boolean(reply.pinned || reply.pinned_at),
      author: reply.author ? normalizeUser(reply.author) : reply.author,
      pinned_by: reply.pinned_by ? normalizeUser(reply.pinned_by) : reply.pinned_by,
    };
  };

  return {
    ...message,
    pinned: Boolean(message.pinned || message.pinned_at),
    author: message.author ? normalizeUser(message.author) : message.author,
    reply_to: normalizeReplyPreview(message.reply_to),
    pinned_by: message.pinned_by ? normalizeUser(message.pinned_by) : message.pinned_by,
  };
}

export function normalizeMessages(messages: Message[]): Message[] {
  return messages.map(normalizeMessage);
}

export function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    recipient: normalizeUser(conversation.recipient),
    members: conversation.members ? normalizeUsers(conversation.members) : conversation.members,
    last_message: conversation.last_message ? normalizeMessage(conversation.last_message) : conversation.last_message,
  };
}

export function normalizeNotification(notification: Notification): Notification {
  return {
    ...notification,
    actor: notification.actor ? normalizeUser(notification.actor) : notification.actor,
  };
}

export function normalizeFriendship(friendship: Friendship): Friendship {
  return {
    ...friendship,
    user: friendship.user ? normalizeUser(friendship.user) : friendship.user,
  };
}

export function normalizeBlock(block: Block): Block {
  return {
    ...block,
    user: block.user ? normalizeUser(block.user) : block.user,
  };
}