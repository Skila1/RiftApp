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
  system_type?:
    | 'conversation_call_started'
    | 'conversation_video_call_started'
    | 'conversation_call_missed'
    | 'conversation_video_call_missed'
    | 'conversation_call_declined'
    | 'conversation_video_call_declined'
    | 'conversation_call_ended'
    | 'conversation_video_call_ended';
  content: string;
  edited_at?: string;
  created_at: string;
  reply_to_message_id?: string;
  forwarded_message_id?: string;
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
  type: string; // mention, message, invite, dm, dm_call, dm_call_missed
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
  owner_id?: string | null;
  name?: string | null;
  icon_url?: string | null;
  icon_updated_at?: string | null;
  icon_version?: string | null;
  is_group?: boolean;
  recipient?: User | null;
  members?: User[];
  last_message?: Message;
  unread_count?: number;
}

export type DMCallMode = 'audio' | 'video';
export type DMCallEndReason = 'answered' | 'cancelled' | 'declined' | 'timeout';

export interface DMCallRing {
  conversation_id: string;
  initiator_id: string;
  mode: DMCallMode;
  started_at: string;
  target_user_ids?: string[];
  declined_user_ids?: string[];
}

export interface DMCallRingEnd {
  conversation_id: string;
  reason: DMCallEndReason;
  initiator_id?: string;
  mode?: DMCallMode;
  started_at?: string;
  ended_at: string;
  ended_by_user_id?: string;
  answered_by_user_id?: string;
  target_user_ids?: string[];
  declined_user_ids?: string[];
  missed_user_ids?: string[];
}

export interface DMConversationCallState {
  conversation_id: string;
  member_ids: string[];
  ring?: DMCallRing | null;
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

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id?: string;
  message_id?: string;
  hub_id?: string;
  reason: string;
  category: string;
  status: string;
  moderator_id?: string;
  moderator_note?: string;
  auto_moderation?: {
    flagged: boolean;
    results: { classifier: string; flagged: boolean; confidence: number; severity: string }[];
  };
  created_at: string;
  resolved_at?: string;
  reporter_name?: string;
  reported_name?: string;
  message_content?: string;
  hub_name?: string;
}

export interface HubAutoModSettings {
  hub_id: string;
  enabled: boolean;
  classifiers: string[];
  toxicity_threshold: number;
  spam_threshold: number;
  nsfw_threshold: number;
}

export interface HubBan {
  hub_id: string;
  user_id: string;
  banned_by: string;
  reason: string;
  created_at: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
}

export interface SlashCommandOptionChoice {
  name: string;
  value: string;
}

export interface SlashCommandOption {
  name: string;
  description: string;
  type: number; // 3=string, 4=integer, 5=boolean, 6=user, 7=channel, 8=role, 10=number
  required: boolean;
  choices?: SlashCommandOptionChoice[];
}

export interface SlashCommand {
  id: string;
  application_id: string;
  guild_id?: string;
  name: string;
  description: string;
  options: SlashCommandOption[];
  type: number;
  created_at: string;
  updated_at: string;
  bot?: User;
}

export interface InteractionPayload {
  command_id: string;
  hub_id: string;
  stream_id: string;
  options: Record<string, string>;
}

export interface InteractionResponse {
  id: string;
  type: number;
  data?: {
    type?: number;
    data?: {
      content?: string;
    };
  };
}
