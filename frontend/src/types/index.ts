export interface User {
  id: string;
  username: string;
  email?: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  status: number; // 0=offline, 1=online, 2=idle, 3=dnd
  last_seen?: string;
  created_at: string;
  updated_at: string;
}

export interface Hub {
  id: string;
  name: string;
  owner_id: string;
  icon_url?: string;
  created_at: string;
}

export interface Stream {
  id: string;
  hub_id: string;
  name: string;
  type: number; // 0=text, 1=voice
  position: number;
  is_private: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  stream_id?: string;
  conversation_id?: string;
  author_id: string;
  content: string;
  edited_at?: string;
  created_at: string;
  author?: User;
  attachments?: Attachment[];
  reactions?: ReactionAgg[];
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

// WebSocket event types
export interface WSEvent {
  op: string;
  d: unknown;
}
