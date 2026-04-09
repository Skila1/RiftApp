export interface User {
  id: string;
  username: string;
  email?: string;
  is_bot?: boolean;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  status: number; // 0=offline, 1=online, 2=idle, 3=dnd
  last_seen?: string;
  created_at: string;
  updated_at: string;
  /** Set when user is loaded from `GET /hubs/:id/members` (owner | admin | member). */
  role?: string;
  /** Set when user is loaded from `GET /hubs/:id/members` and has a custom role assigned. */
  rank_id?: string;
  /** Set when user is loaded from `GET /hubs/:id/members`; when they joined that hub. */
  joined_at?: string;
}

export interface HubRole {
  id: string;
  hub_id: string;
  name: string;
  color: string;
  permissions: number;
  position: number;
  created_at: string;
}

export interface HubPermissions {
  permissions: number;
}

export interface Hub {
  id: string;
  name: string;
  owner_id: string;
  icon_url?: string;
  banner_url?: string;
  created_at: string;
  updated_at: string;
}

export interface DiscordTemplatePreviewChannel {
  name: string;
  type: 'text' | 'voice';
}

export interface DiscordTemplatePreviewCategory {
  name: string;
  channels: DiscordTemplatePreviewChannel[];
}

export interface DiscordTemplatePreviewRole {
  name: string;
  color: string;
}

export interface DiscordTemplatePreview {
  code: string;
  name: string;
  description?: string;
  source_guild_name: string;
  suggested_hub_name: string;
  category_count: number;
  text_channel_count: number;
  voice_channel_count: number;
  role_count: number;
  categories: DiscordTemplatePreviewCategory[];
  uncategorized_channels: DiscordTemplatePreviewChannel[];
  roles: DiscordTemplatePreviewRole[];
  unsupported_features?: string[];
}

export interface Category {
  id: string;
  hub_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Stream {
  id: string;
  hub_id: string;
  name: string;
  type: number; // 0=text, 1=voice
  position: number;
  is_private: boolean;
  category_id?: string | null;
  bitrate: number;
  user_limit: number;
  region: string;
  created_at: string;
}

export type StreamPermissionTargetType = 'everyone' | 'role';

export interface StreamPermissionOverwrite {
  stream_id?: string;
  target_type: StreamPermissionTargetType;
  target_id: string;
  allow: number;
  deny: number;
  created_at?: string;
}

export interface Message {
  id: string;
  stream_id?: string;
  conversation_id?: string;
  author_id: string;
  author_type?: 'user' | 'bot' | 'webhook';
  content: string;
  edited_at?: string;
  created_at: string;
  reply_to_message_id?: string;
  webhook_name?: string;
  webhook_avatar_url?: string;
  pinned: boolean;
  pinned_at?: string;
  pinned_by_id?: string;
  author?: User;
  reply_to?: Message;
  pinned_by?: User;
  attachments?: Attachment[];
  reactions?: ReactionAgg[];
}

export type NotificationLevel = 'all' | 'mentions_only' | 'nothing';

export interface MessageSearchFilters {
  query?: string;
  stream_id?: string;
  author_id?: string;
  author_type?: 'user' | 'bot' | 'webhook';
  mentions?: string;
  has?: 'file' | 'image' | 'video' | 'audio' | 'link';
  before?: string;
  after?: string;
  on?: string;
  during?: string;
  pinned?: boolean;
  link?: boolean;
  filename?: string;
  ext?: string;
  limit?: number;
}

export interface Attachment {
  id: string;
  message_id: string;
  filename: string;
  url: string;
  content_type: string;
  size_bytes: number;
}

export interface ReactionAgg {
  emoji: string;
  emoji_id?: string;
  file_url?: string;
  count: number;
  users: string[];
}

export interface HubInvite {
  id: string;
  hub_id: string;
  creator_id: string;
  code: string;
  max_uses: number;
  uses: number;
  expires_at?: string;
  created_at: string;
}

/** Per-user notification preferences for a hub (Discord-style). */
export interface HubNotificationSettings {
  notification_level: NotificationLevel;
  suppress_everyone: boolean;
  suppress_role_mentions: boolean;
  suppress_highlights: boolean;
  mute_events: boolean;
  mobile_push: boolean;
  hide_muted_channels: boolean;
  server_muted: boolean;
}

export interface StreamNotificationSettings {
  notification_level: NotificationLevel;
  suppress_everyone: boolean;
  suppress_role_mentions: boolean;
  suppress_highlights: boolean;
  mute_events: boolean;
  mobile_push: boolean;
  hide_muted_channels: boolean;
  channel_muted: boolean;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string; // mention, invite, dm
  title: string;
  body?: string;
  reference_id?: string;
  hub_id?: string;
  stream_id?: string;
  actor_id?: string;
  read: boolean;
  created_at: string;
  actor?: User;
}

export interface StreamReadState {
  stream_id: string;
  last_read_message_id: string;
  unread_count: number;
}

export interface DMReadState {
  conversation_id: string;
  last_read_message_id: string;
  unread_count: number;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  recipient: User;
  last_message?: Message;
  unread_count?: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface Friendship {
  user_id: string;
  friend_id: string;
  status: number; // 0=pending, 1=accepted
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface Block {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  user?: User;
}

export type RelationshipType = 'none' | 'friends' | 'pending_incoming' | 'pending_outgoing' | 'blocked' | 'blocked_by';

export interface HubEmoji {
  id: string;
  hub_id: string;
  name: string;
  file_url: string;
  created_at: string;
}

export interface HubSticker {
  id: string;
  hub_id: string;
  name: string;
  file_url: string;
  created_at: string;
}

export interface HubSound {
  id: string;
  hub_id: string;
  name: string;
  file_url: string;
  created_at: string;
}

// WebSocket event types
export interface WSEvent {
  op: string;
  d: unknown;
}

// Developer Portal types
export interface Application {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  icon?: string | null;
  bot_user_id?: string;
  bot_public: boolean;
  bot_require_code_grant: boolean;
  verify_key: string;
  tags: string[];
  terms_of_service_url?: string | null;
  privacy_policy_url?: string | null;
  interactions_endpoint_url?: string | null;
  role_connections_verification_url?: string | null;
  custom_install_url?: string | null;
  install_params?: string | null;
  flags: number;
  created_at: string;
  updated_at: string;
  owner?: User;
  bot?: User;
  approximate_guild_count?: number;
  approximate_user_install_count?: number;
}

export interface OAuth2Redirect {
  id: string;
  application_id: string;
  redirect_uri: string;
  created_at: string;
}

export interface AppEmoji {
  id: string;
  application_id: string;
  name: string;
  image_hash: string;
  created_at: string;
}

export interface AppWebhook {
  id: string;
  application_id: string;
  url: string;
  secret: string;
  event_types: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppTester {
  application_id: string;
  user_id: string;
  status: string;
  created_at: string;
  user?: User;
}

export interface RichPresenceAsset {
  id: string;
  application_id: string;
  name: string;
  type: string;
  image_hash: string;
  created_at: string;
}

export interface DeveloperMeResponse {
  is_super_admin: boolean;
}
