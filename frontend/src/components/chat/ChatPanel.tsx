import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../../api/client';
import { useStreamStore } from '../../stores/streamStore';
import { useHubStore } from '../../stores/hubStore';
import { useMessageStore } from '../../stores/messageStore';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { useNotificationStore } from '../../stores/notificationStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useWsSend } from '../../hooks/useWebSocket';
import MessageInput from './MessageInput';
import MessageItem from './MessageItem';
import PinSystemMessage from './PinSystemMessage';
import TypingIndicator from './TypingIndicator';
import UpdateActionButton from '../shared/UpdateActionButton';
import type {
  Message,
  MessageSearchFilters,
  Notification,
  StreamNotificationSettings,
  User,
} from '../../types';
import type { ChatTimelineItem } from '../../utils/chatTimeline';
import { buildChatTimeline } from '../../utils/chatTimeline';
import { normalizeMessages } from '../../utils/entityAssets';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { subscribeToChatSearchRequests } from '../../utils/chatSearchBridge';
import { jumpToMessageId } from '../../utils/messageJump';

type HeaderPanel = 'notifications' | 'pins' | 'search' | 'inbox' | null;
type StreamNotificationToggleKey =
  | 'suppress_everyone'
  | 'suppress_role_mentions'
  | 'suppress_highlights'
  | 'mute_events'
  | 'mobile_push'
  | 'hide_muted_channels';

const DEFAULT_STREAM_NOTIFICATION: StreamNotificationSettings = {
  notification_level: 'mentions_only',
  suppress_everyone: false,
  suppress_role_mentions: false,
  suppress_highlights: false,
  mute_events: false,
  mobile_push: true,
  hide_muted_channels: false,
  channel_muted: false,
};

const STREAM_NOTIFICATION_TOGGLES: ReadonlyArray<readonly [StreamNotificationToggleKey, string]> = [
  ['suppress_everyone', 'Suppress @everyone and @here'],
  ['suppress_role_mentions', 'Suppress role mentions'],
  ['suppress_highlights', 'Suppress highlights'],
  ['mute_events', 'Mute new events'],
  ['mobile_push', 'Mobile push notifications'],
  ['hide_muted_channels', 'Hide muted channels'],
];

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCompactTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTimestamp(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return formatCompactTimestamp(dateStr);
  }
}

function countSearchFilters(filters: MessageSearchFilters): number {
  let count = 0;
  if (filters.stream_id) count += 1;
  if (filters.author_id) count += 1;
  if (filters.author_type) count += 1;
  if (filters.mentions) count += 1;
  if (filters.has) count += 1;
  if (filters.before) count += 1;
  if (filters.after) count += 1;
  if (filters.on) count += 1;
  if (filters.during) count += 1;
  if (filters.pinned) count += 1;
  if (filters.link) count += 1;
  if (filters.filename) count += 1;
  if (filters.ext) count += 1;
  return count;
}

function cleanSearchFilters(filters: MessageSearchFilters): MessageSearchFilters {
  const next: MessageSearchFilters = {
    limit: filters.limit ?? 25,
  };
  if (filters.query?.trim()) next.query = filters.query.trim();
  if (filters.stream_id) next.stream_id = filters.stream_id;
  if (filters.author_id) next.author_id = filters.author_id;
  if (filters.author_type) next.author_type = filters.author_type;
  if (filters.mentions?.trim()) next.mentions = filters.mentions.trim().replace(/^@/, '');
  if (filters.has) next.has = filters.has;
  if (filters.before) next.before = filters.before;
  if (filters.after) next.after = filters.after;
  if (filters.on) next.on = filters.on;
  if (filters.during) next.during = filters.during;
  if (filters.pinned) next.pinned = true;
  if (filters.link) next.link = true;
  if (filters.filename?.trim()) next.filename = filters.filename.trim();
  if (filters.ext?.trim()) next.ext = filters.ext.trim();
  return next;
}

function getUserLabel(user?: User): string {
  if (!user) return 'Unknown user';
  return user.display_name || user.username;
}

function getUserInitial(user?: User): string {
  const label = getUserLabel(user).trim();
  return label ? label[0].toUpperCase() : '?';
}

function getMessagePreview(message: Message): string {
  const content = message.content.trim();
  if (content) return content;
  if (message.attachments?.length) {
    return message.attachments.length === 1
      ? `Attachment: ${message.attachments[0].filename}`
      : `${message.attachments.length} attachments`;
  }
  return 'No message content';
}

function notifLevelSubtitle(level: StreamNotificationSettings['notification_level']): string {
  switch (level) {
    case 'all':
      return 'All messages';
    case 'nothing':
      return 'Nothing';
    default:
      return 'Only @mentions';
  }
}

function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 1 0-12 0v3.17a2 2 0 0 1-.6 1.42L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  );
}

function IconPin(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m14 9 7 7" />
      <path d="m4 20 6-6" />
      <path d="m8 16 8-8" />
      <path d="m13 4 7 7" />
      <path d="m10 7 7 7" />
    </svg>
  );
}

function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconInbox(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 12h-4l-3 4H9l-3-4H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconRefresh(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function UserAvatar({
  user,
  sizeClass = 'w-9 h-9',
  textClass = 'text-sm',
}: {
  user?: User;
  sizeClass?: string;
  textClass?: string;
}) {
  if (user?.avatar_url) {
    return (
      <img
        src={publicAssetUrl(user.avatar_url)}
        alt=""
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-riftapp-accent/15 text-riftapp-accent flex items-center justify-center shrink-0`}>
      <span className={`${textClass} font-semibold uppercase`}>{getUserInitial(user)}</span>
    </div>
  );
}

function HeaderIconButton({
  label,
  title,
  active,
  onClick,
  badge,
  tone = 'default',
  children,
}: {
  label: string;
  title?: string;
  active?: boolean;
  onClick: () => void;
  badge?: number | string;
  tone?: 'default' | 'success';
  children: ReactNode;
}) {
  const success = tone === 'success';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={`relative inline-flex h-8 items-center justify-center rounded-md border px-2 transition-colors ${
        success
          ? 'border-[#2f8555] bg-[#248046] text-white hover:bg-[#2d9d58]'
          : active
            ? 'border-riftapp-border-light bg-riftapp-content-elevated text-[#f2f3f5]'
            : 'border-transparent bg-transparent text-[#aeb4bf] hover:bg-riftapp-content-elevated hover:text-[#f2f3f5]'
      }`}
    >
      <span className="inline-flex items-center justify-center">{children}</span>
      {badge != null && badge !== 0 && badge !== '' && (
        <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-[#f23f43] px-1.5 py-[1px] text-[10px] font-bold leading-4 text-white shadow-sm">
          {badge}
        </span>
      )}
    </button>
  );
}

function FloatingPanel({
  title,
  subtitle,
  widthClass = 'w-[380px]',
  actions,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  widthClass?: string;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`${widthClass} overflow-hidden rounded-2xl border border-white/10 bg-[#111214]/95 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-scale-in`}>
      <div className="flex items-start justify-between gap-3 border-b border-white/6 px-4 py-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-[#f2f3f5]">{title}</h4>
          {subtitle ? <p className="mt-0.5 text-xs text-[#949ba4]">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#949ba4] transition-colors hover:bg-[#232428] hover:text-[#f2f3f5]"
            aria-label="Close panel"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="max-h-[min(72vh,680px)] overflow-y-auto p-3">{children}</div>
    </div>
  );
}

function EmptyPanelState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 bg-[#0f1012] px-5 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1b1d22] text-[#b5bac1]">
        {icon}
      </div>
      <h5 className="text-sm font-semibold text-[#f2f3f5]">{title}</h5>
      <p className="mt-1 max-w-[260px] text-xs leading-5 text-[#949ba4]">{description}</p>
    </div>
  );
}

function MessagePreviewCard({
  message,
  streamName,
  onOpen,
  extraLabel,
}: {
  message: Message;
  streamName?: string;
  onOpen: () => void;
  extraLabel?: string;
}) {
  const attachmentLabel = message.attachments?.length
    ? message.attachments.map((attachment) => attachment.filename).join(', ')
    : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-white/6 bg-[#17181c] px-3 py-3 text-left transition-colors hover:bg-[#1d1f24]"
    >
      <div className="flex items-start gap-3">
        <UserAvatar user={message.author} sizeClass="w-9 h-9" textClass="text-xs" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[#f2f3f5]">{getUserLabel(message.author)}</span>
            {streamName ? (
              <span className="rounded-md bg-[#232428] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#b5bac1]">
                #{streamName}
              </span>
            ) : null}
            {message.pinned ? (
              <span className="rounded-md bg-[#1f4129] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7adf8f]">
                Pinned
              </span>
            ) : null}
            {extraLabel ? (
              <span className="rounded-md bg-[#2a1e12] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f0b232]">
                {extraLabel}
              </span>
            ) : null}
            <span className="text-[11px] text-[#949ba4]">{formatCompactTimestamp(message.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#dbdee1]">
            {getMessagePreview(message)}
          </p>
          {attachmentLabel ? (
            <p className="mt-2 truncate text-[11px] text-[#949ba4]">{attachmentLabel}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function NotificationPreviewCard({
  notification,
  onOpen,
  onMarkRead,
  streamName,
}: {
  notification: Notification;
  onOpen: () => void;
  onMarkRead: () => void;
  streamName?: string;
}) {
  const unread = !notification.read;

  return (
    <div className="rounded-xl border border-white/6 bg-[#17181c] px-3 py-3">
      <div className="flex items-start gap-3">
        <UserAvatar user={notification.actor} sizeClass="w-9 h-9" textClass="text-xs" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#f2f3f5]">{notification.title}</span>
                {streamName ? (
                  <span className="rounded-md bg-[#232428] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#b5bac1]">
                    #{streamName}
                  </span>
                ) : null}
                {unread ? <span className="h-2 w-2 rounded-full bg-[#5865f2]" /> : null}
              </div>
              {notification.body ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#dbdee1]">
                  {notification.body}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-[#949ba4]">{formatRelativeTimestamp(notification.created_at)}</p>
            </button>
            {unread ? (
              <button
                type="button"
                onClick={onMarkRead}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-[#b5bac1] transition-colors hover:bg-[#232428] hover:text-[#f2f3f5]"
              >
                Mark read
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelSectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">{children}</div>;
}

function SearchField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">{label}</span>
      {children}
    </label>
  );
}

function NotificationToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/6 bg-[#17181c] px-3 py-3 text-left transition-colors hover:bg-[#1d1f24]"
    >
      <span className="text-sm text-[#dbdee1]">{label}</span>
      <span className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${checked ? 'bg-[#5865f2]' : 'bg-[#4e5058]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}
interface ChatPanelProps {
  showMemberList: boolean;
  onToggleMemberList: () => void;
}

export default function ChatPanel({
  showMemberList,
  onToggleMemberList,
}: ChatPanelProps) {
  const messages = useMessageStore((s) => s.messages);
  const messagesLoading = useMessageStore((s) => s.messagesLoading);
  const pinMutationVersion = useMessageStore((s) => s.pinMutationVersion);
  const pinSystemEventsByStream = useMessageStore((s) => s.pinSystemEventsByStream);
  const activeStreamId = useStreamStore((s) => s.activeStreamId);
  const streams = useStreamStore((s) => s.streams);
  const user = useAuthStore((s) => s.user);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const hubs = useHubStore((s) => s.hubs);
  const hubMembers = usePresenceStore((s) => s.hubMembers);
  const notifications = useNotificationStore((s) => s.notifications);
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);
  const markNotifRead = useNotificationStore((s) => s.markNotifRead);
  const markAllNotifsRead = useNotificationStore((s) => s.markAllNotifsRead);
  const bottomRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const floatingPanelRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const wasNearBottomRef = useRef(true);
  const pendingJumpMessageIdRef = useRef<string | null>(null);
  const send = useWsSend();
  const lastReadMessageIds = useStreamStore((s) => s.lastReadMessageIds);

  // DM state
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const dmMessages = useDMStore((s) => s.dmMessages);
  const dmMessagesLoading = useDMStore((s) => s.dmMessagesLoading);
  const conversations = useDMStore((s) => s.conversations);
  const sendDMMessage = useDMStore((s) => s.sendDMMessage);
  const ackDM = useDMStore((s) => s.ackDM);

  const isDMMode = !!activeConversationId;

  const activeStream = useMemo(
    () => streams.find((s) => s.id === activeStreamId),
    [streams, activeStreamId]
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const activeHub = useMemo(
    () => hubs.find((hub) => hub.id === activeHubId),
    [hubs, activeHubId],
  );

  const streamMap = useMemo(
    () => new Map(streams.map((stream) => [stream.id, stream])),
    [streams],
  );

  const textStreamsInHub = useMemo(
    () => streams.filter((stream) => stream.hub_id === activeHubId && stream.type === 0),
    [streams, activeHubId],
  );

  const memberOptions = useMemo(() => {
    const members = Object.values(hubMembers);
    return [...members].sort((a, b) => getUserLabel(a).localeCompare(getUserLabel(b)));
  }, [hubMembers]);

  const displayMessages = isDMMode ? dmMessages : messages;
  const isLoading = isDMMode ? dmMessagesLoading : messagesLoading;
  const pinSystemEvents = useMemo(
    () => (!isDMMode && activeStreamId ? pinSystemEventsByStream[activeStreamId] ?? [] : []),
    [activeStreamId, isDMMode, pinSystemEventsByStream],
  );
  const timelineItems = useMemo<ChatTimelineItem[]>(
    () => (
      isDMMode
        ? displayMessages.map((message) => ({
            kind: 'message' as const,
            id: message.id,
            timestamp: message.created_at,
            message,
          }))
        : buildChatTimeline(displayMessages, pinSystemEvents)
    ),
    [displayMessages, isDMMode, pinSystemEvents],
  );

  const [activePanel, setActivePanel] = useState<HeaderPanel>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  const [pinnedError, setPinnedError] = useState<string | null>(null);
  const [searchFilters, setSearchFilters] = useState<MessageSearchFilters>({ query: '', limit: 25 });
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [streamNotifSettings, setStreamNotifSettings] = useState<StreamNotificationSettings | null>(null);
  const [notifSettingsLoading, setNotifSettingsLoading] = useState(false);
  const [inboxTab, setInboxTab] = useState<'mentions' | 'unread'>('mentions');

  const inboxItems = useMemo(() => {
    if (inboxTab === 'mentions') {
      return notifications.filter((notification) => notification.type === 'mention');
    }
    return notifications.filter((notification) => !notification.read);
  }, [notifications, inboxTab]);

  const activeSearchFilterCount = useMemo(() => countSearchFilters(searchFilters), [searchFilters]);

  // Compute unread divider position for stream messages
  const firstUnreadIndex = useMemo(() => {
    if (isDMMode || !activeStreamId) return -1;
    const lastReadId = lastReadMessageIds[activeStreamId];
    if (!lastReadId) return -1; // no read state => don't show divider
    const idx = displayMessages.findIndex((m) => m.id === lastReadId);
    if (idx < 0 || idx >= displayMessages.length - 1) return -1;
    return idx + 1; // first unread is the message after lastReadId
  }, [isDMMode, activeStreamId, lastReadMessageIds, displayMessages]);

  const onTyping = useCallback(() => {
    if (activeStreamId) {
      send('typing', { stream_id: activeStreamId });
    }
  }, [activeStreamId, send]);

  const onTypingStop = useCallback(() => {
    if (activeStreamId) {
      send('typing_stop', { stream_id: activeStreamId });
    }
  }, [activeStreamId, send]);

  const NEAR_BOTTOM_THRESHOLD = 50;
  const [showNewMsgBanner, setShowNewMsgBanner] = useState(false);

  // --- Per-channel scroll position cache ---
  const scrollCacheRef = useRef<Record<string, { scrollTop: number; scrollHeight: number }>>({});
  const pendingRestoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const needsScrollToBottomRef = useRef(true);

  const channelKey = isDMMode
    ? `dm-${activeConversationId}`
    : `${activeHubId}-${activeStreamId}`;
  const channelKeyRef = useRef(channelKey);

  const saveScrollPos = useCallback(() => {
    const el = scrollContainerRef.current;
    const key = channelKeyRef.current;
    if (!el || !key) return;
    scrollCacheRef.current[key] = { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasNearBottomRef.current = distBottom < NEAR_BOTTOM_THRESHOLD;
    if (wasNearBottomRef.current) setShowNewMsgBanner(false);
    saveScrollPos();
  }, [saveScrollPos]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    setShowNewMsgBanner(false);
    wasNearBottomRef.current = true;
    saveScrollPos();
  }, [saveScrollPos]);

  const hasScrolledToUnread = useRef(false);
  const prevHubIdForScrollRef = useRef<string | null>(null);

  // Channel/server switch — useLayoutEffect so refs update BEFORE paint
  useLayoutEffect(() => {
    // Don't read scroll position from DOM here — by the time this layoutEffect
    // runs React has already committed the new content, so el.scrollTop may be
    // reset to 0.  The handleScroll callback continuously writes to the cache,
    // so the departing channel's position is already saved there.

    const prevHub = prevHubIdForScrollRef.current;
    const hubChanged = !isDMMode && prevHub !== null && prevHub !== activeHubId;
    prevHubIdForScrollRef.current = activeHubId;

    const newKey = isDMMode ? `dm-${activeConversationId}` : `${activeHubId}-${activeStreamId}`;
    channelKeyRef.current = newKey;

    const saved = scrollCacheRef.current[newKey];

    hasScrolledToUnread.current = false;
    prevMessageCountRef.current = 0;
    setShowNewMsgBanner(false);

    if (hubChanged && activeStreamId) {
      delete scrollCacheRef.current[newKey];
      pendingRestoreRef.current = null;
      needsScrollToBottomRef.current = true;
      wasNearBottomRef.current = true;
      return;
    }

    if (saved) {
      pendingRestoreRef.current = saved;
      needsScrollToBottomRef.current = false;
      wasNearBottomRef.current = false;
    } else {
      pendingRestoreRef.current = null;
      needsScrollToBottomRef.current = true;
      wasNearBottomRef.current = true;
    }
  }, [activeStreamId, activeConversationId, activeHubId, isDMMode]);

  // After tab sleep, refresh messages but restore scroll (hub switch uses layout effect to jump to bottom).
  useEffect(() => {
    const onVis = () => {
      const el = scrollContainerRef.current;
      const snapKey = channelKeyRef.current;
      if (document.visibilityState === 'hidden') {
        if (el && snapKey) {
          scrollCacheRef.current[snapKey] = { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
        }
        return;
      }
      if (document.visibilityState !== 'visible') return;

      const savedSnap =
        snapKey && scrollCacheRef.current[snapKey]
          ? { ...scrollCacheRef.current[snapKey] }
          : null;

      const restore = () => {
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            const container = scrollContainerRef.current;
            if (!container) return;
            if (savedSnap) {
              const delta = container.scrollHeight - savedSnap.scrollHeight;
              container.scrollTop = Math.max(0, savedSnap.scrollTop + delta);
              const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
              wasNearBottomRef.current = dist < NEAR_BOTTOM_THRESHOLD;
            }
            const k = channelKeyRef.current;
            if (k) {
              scrollCacheRef.current[k] = {
                scrollTop: container.scrollTop,
                scrollHeight: container.scrollHeight,
              };
            }
          });
        });
      };

      if (isDMMode && activeConversationId) {
        const convId = activeConversationId;
        void useDMStore.getState().loadDMMessages(convId).finally(() => {
          if (useDMStore.getState().activeConversationId !== convId) return;
          restore();
        });
        return;
      }

      if (!isDMMode && activeStreamId) {
        const streamId = activeStreamId;
        void useMessageStore
          .getState()
          .loadMessages(streamId, { force: true })
          .finally(() => {
            if (useStreamStore.getState().activeStreamId !== streamId) return;
            restore();
          });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [activeStreamId, activeHubId, isDMMode, activeConversationId]);

  // Main scroll positioning — fires after channel-switch layoutEffect (declaration order)
  useLayoutEffect(() => {
    // Skip when loading or during transient hub-switch state (no active channel)
    if (isLoading || (!activeStreamId && !activeConversationId)) return;

    const el = scrollContainerRef.current;
    const bottomEl = bottomRef.current;

    // 1) Restore saved scroll position
    if (pendingRestoreRef.current && el) {
      const saved = pendingRestoreRef.current;
      pendingRestoreRef.current = null;
      const delta = el.scrollHeight - saved.scrollHeight;
      el.scrollTop = saved.scrollTop + delta;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      wasNearBottomRef.current = dist < NEAR_BOTTOM_THRESHOLD;
      prevMessageCountRef.current = timelineItems.length;
      hasScrolledToUnread.current = true;
      return;
    }

    // 2) First-time channel visit — scroll to bottom
    if (needsScrollToBottomRef.current && bottomEl && timelineItems.length > 0) {
      needsScrollToBottomRef.current = false;
      bottomEl.scrollIntoView({ behavior: 'auto' });
      wasNearBottomRef.current = true;
      prevMessageCountRef.current = timelineItems.length;
      hasScrolledToUnread.current = true;
      return;
    }

    // 3) Scroll to unread divider on first load (no saved pos)
    if (!hasScrolledToUnread.current && unreadRef.current) {
      unreadRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
      hasScrolledToUnread.current = true;
      prevMessageCountRef.current = timelineItems.length;
      if (el) {
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        wasNearBottomRef.current = dist < NEAR_BOTTOM_THRESHOLD;
      }
      return;
    }

    if (!el || !bottomEl) {
      prevMessageCountRef.current = timelineItems.length;
      return;
    }

    // 4) New messages while viewing a channel
    const grew = timelineItems.length > prevMessageCountRef.current;
    prevMessageCountRef.current = timelineItems.length;

    if (grew && wasNearBottomRef.current) {
      bottomEl.scrollIntoView({ behavior: 'auto' });
    } else if (grew) {
      setShowNewMsgBanner(true);
    }
  }, [activeStreamId, activeConversationId, timelineItems.length, isLoading, firstUnreadIndex]);

  // Ack DM conversation when it becomes active and messages have loaded
  useEffect(() => {
    if (isDMMode && activeConversationId && !isLoading && dmMessages.length > 0) {
      ackDM(activeConversationId);
    }
  }, [isDMMode, activeConversationId, isLoading, dmMessages.length, ackDM]);

  const showWelcome = !activeStreamId && !activeConversationId;

  const focusMessage = useCallback((messageId: string) => {
    return jumpToMessageId(messageId);
  }, []);

  const closePanel = useCallback(() => setActivePanel(null), []);

  const togglePanel = useCallback((panel: Exclude<HeaderPanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  const refreshPinnedMessages = useCallback(async () => {
    if (!activeStreamId || isDMMode) return;
    setPinnedLoading(true);
    setPinnedError(null);
    try {
      const items = normalizeMessages(await api.getPinnedMessages(activeStreamId));
      setPinnedMessages(items);
    } catch (error) {
      setPinnedError(error instanceof Error ? error.message : 'Could not load pinned messages');
    } finally {
      setPinnedLoading(false);
    }
  }, [activeStreamId, isDMMode]);

  const openPinnedMessageFromTimeline = useCallback(
    async (messageId: string) => {
      if (!activeStreamId) return;
      if (focusMessage(messageId)) return;
      await useMessageStore.getState().ensureMessageLoaded(activeStreamId, messageId);
      requestAnimationFrame(() => {
        focusMessage(messageId);
      });
    },
    [activeStreamId, focusMessage],
  );

  const openPinnedMessagesPanel = useCallback(() => {
    setActivePanel('pins');
    void refreshPinnedMessages();
  }, [refreshPinnedMessages]);

  const refreshStreamNotificationSettings = useCallback(async () => {
    if (!activeStreamId || isDMMode) return;
    setNotifSettingsLoading(true);
    try {
      setStreamNotifSettings(await api.getStreamNotificationSettings(activeStreamId));
    } catch {
      setStreamNotifSettings(DEFAULT_STREAM_NOTIFICATION);
    } finally {
      setNotifSettingsLoading(false);
    }
  }, [activeStreamId, isDMMode]);

  const patchStreamNotificationSettings = useCallback(
    async (patch: Partial<StreamNotificationSettings>) => {
      if (!activeStreamId || !streamNotifSettings) return;
      const next = { ...streamNotifSettings, ...patch };
      setStreamNotifSettings(next);
      try {
        setStreamNotifSettings(await api.patchStreamNotificationSettings(activeStreamId, next));
      } catch {
        await refreshStreamNotificationSettings();
      }
    },
    [activeStreamId, streamNotifSettings, refreshStreamNotificationSettings],
  );

  const updateSearchFilter = useCallback(
    <K extends keyof MessageSearchFilters>(key: K, value: MessageSearchFilters[K] | undefined) => {
      setSearchFilters((current) => ({
        ...current,
        [key]: value,
      }));
    },
    [],
  );

  const resetSearch = useCallback(() => {
    setSearchFilters({ query: '', limit: 25 });
    setSearchResults([]);
    setSearchError(null);
    setSearchPerformed(false);
  }, []);

  const runSearch = useCallback(async (overrides?: Partial<MessageSearchFilters>) => {
    if (!activeHubId || isDMMode) return;
    const nextFilters = {
      ...searchFilters,
      ...overrides,
    };
    setActivePanel('search');
    setSearchLoading(true);
    setSearchError(null);
    setSearchPerformed(true);
    setSearchFilters(nextFilters);
    try {
      const results = normalizeMessages(await api.searchHubMessages(activeHubId, cleanSearchFilters(nextFilters)));
      setSearchResults(results);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Could not search messages');
    } finally {
      setSearchLoading(false);
    }
  }, [activeHubId, isDMMode, searchFilters]);

  useEffect(() => {
    return subscribeToChatSearchRequests((detail) => {
      if (isDMMode || !activeHubId) return;

      const nextQuery = typeof detail.query === 'string' ? detail.query : (searchFilters.query ?? '');
      const normalizedQuery = nextQuery.trim();
      const queryValue = normalizedQuery.length > 0 ? normalizedQuery : undefined;

      if (detail.run) {
        void runSearch({ query: queryValue });
        return;
      }

      setSearchFilters((current) => ({
        ...current,
        query: queryValue,
      }));
      setActivePanel('search');
    });
  }, [activeHubId, isDMMode, runSearch, searchFilters.query]);

  const openStreamMessage = useCallback(
    async (message: Pick<Message, 'id' | 'stream_id'>, hubId = activeHubId ?? undefined) => {
      if (!message.stream_id) return;
      if (hubId && useHubStore.getState().activeHubId !== hubId) {
        await useHubStore.getState().setActiveHub(hubId);
      }
      pendingJumpMessageIdRef.current = message.id;
      await useStreamStore.getState().setActiveStream(message.stream_id);
      await useMessageStore.getState().ensureMessageLoaded(message.stream_id, message.id);
      setActivePanel(null);
      if (!focusMessage(message.id)) {
        requestAnimationFrame(() => {
          if (pendingJumpMessageIdRef.current === message.id && focusMessage(message.id)) {
            pendingJumpMessageIdRef.current = null;
          }
        });
      } else {
        pendingJumpMessageIdRef.current = null;
      }
    },
    [activeHubId, focusMessage],
  );

  const openNotificationItem = useCallback(
    async (notification: Notification) => {
      if (!notification.read) {
        void markNotifRead(notification.id);
      }

      if (notification.type === 'dm' && notification.actor_id) {
        pendingJumpMessageIdRef.current = notification.reference_id ?? null;
        await useDMStore.getState().openDM(notification.actor_id);
        if (notification.reference_id) {
          const conversationId = useDMStore.getState().activeConversationId;
          if (conversationId) {
            await useDMStore.getState().ensureMessageLoaded(conversationId, notification.reference_id);
          }
        }
        setActivePanel(null);
        return;
      }

      if (notification.reference_id && notification.stream_id) {
        await openStreamMessage(
          { id: notification.reference_id, stream_id: notification.stream_id },
          notification.hub_id ?? activeHubId ?? undefined,
        );
        return;
      }

      if (notification.hub_id && useHubStore.getState().activeHubId !== notification.hub_id) {
        await useHubStore.getState().setActiveHub(notification.hub_id);
      }
      if (notification.stream_id) {
        await useStreamStore.getState().setActiveStream(notification.stream_id);
      }
      setActivePanel(null);
    },
    [activeHubId, markNotifRead, openStreamMessage],
  );

  useEffect(() => {
    if (activePanel !== 'pins') return;
    void refreshPinnedMessages();
  }, [activePanel, refreshPinnedMessages, pinMutationVersion]);

  useEffect(() => {
    if (activePanel !== 'notifications') return;
    void refreshStreamNotificationSettings();
  }, [activePanel, refreshStreamNotificationSettings]);

  useEffect(() => {
    if (activePanel !== 'inbox') return;
    void loadNotifications();
  }, [activePanel, loadNotifications]);

  useEffect(() => {
    if (!pendingJumpMessageIdRef.current) return;
    if (focusMessage(pendingJumpMessageIdRef.current)) {
      pendingJumpMessageIdRef.current = null;
    }
  }, [displayMessages, activeStreamId, activeConversationId, focusMessage]);

  useEffect(() => {
    if (!activePanel) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (headerRef.current?.contains(target) || floatingPanelRef.current?.contains(target)) {
        return;
      }
      setActivePanel(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePanel(null);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activePanel]);

  useEffect(() => {
    setActivePanel(null);
  }, [activeHubId, activeStreamId, activeConversationId]);

  const canShowChannelTools = !showWelcome && !isDMMode && Boolean(activeHubId);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-riftapp-content min-w-0 relative">
      {/* Header */}
      {!showWelcome && (
        <div
          ref={headerRef}
          className="flex h-12 items-center gap-3 border-b border-riftapp-border/50 bg-riftapp-content px-4 flex-shrink-0"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {isDMMode ? (
              <>
                <UserAvatar user={activeConversation?.recipient} sizeClass="w-7 h-7" textClass="text-[11px]" />
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold text-[#f2f3f5]">
                    {activeConversation?.recipient?.display_name || 'Direct Message'}
                  </h3>
                </div>
              </>
            ) : (
              <>
                <span className="text-lg font-medium text-[#949ba4]">#</span>
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold text-[#f2f3f5]">{activeStream?.name}</h3>
                </div>
              </>
            )}
          </div>

          {canShowChannelTools ? (
            <>
              <div className="hidden h-5 w-px bg-white/10 lg:block" />
              <div className="hidden items-center gap-2 lg:flex">
                <HeaderIconButton
                  label="Notification settings"
                  active={activePanel === 'notifications'}
                  onClick={() => togglePanel('notifications')}
                >
                  <IconBell className="h-4 w-4" />
                </HeaderIconButton>

                <HeaderIconButton
                  label="Pinned messages"
                  active={activePanel === 'pins'}
                  onClick={() => togglePanel('pins')}
                >
                  <IconPin className="h-4 w-4" />
                </HeaderIconButton>
              </div>
            </>
          ) : null}

          {!showWelcome ? (
            <div className="flex items-center gap-2">
              {canShowChannelTools ? (
                <HeaderIconButton
                  label={showMemberList ? 'Hide user list' : 'Show user list'}
                  active={showMemberList}
                  onClick={onToggleMemberList}
                >
                  <IconUsers className="h-4 w-4" />
                </HeaderIconButton>
              ) : null}

              <UpdateActionButton />
            </div>
          ) : null}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-hidden relative">
        {activePanel ? (
          <div ref={floatingPanelRef} className="absolute right-4 top-3 z-30">
            {activePanel === 'notifications' && canShowChannelTools ? (
              <FloatingPanel
                title="Notification Settings"
                subtitle={streamNotifSettings ? `${notifLevelSubtitle(streamNotifSettings.notification_level)} for #${activeStream?.name ?? 'channel'}` : `Controls for #${activeStream?.name ?? 'channel'}`}
                onClose={closePanel}
                actions={
                  <button
                    type="button"
                    onClick={() => void refreshStreamNotificationSettings()}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#949ba4] transition-colors hover:bg-[#232428] hover:text-[#f2f3f5]"
                    aria-label="Refresh notification settings"
                  >
                    <IconRefresh className="h-4 w-4" />
                  </button>
                }
              >
                {notifSettingsLoading && !streamNotifSettings ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="h-14 animate-pulse rounded-xl bg-[#17181c]" />
                    ))}
                  </div>
                ) : streamNotifSettings ? (
                  <div className="space-y-4">
                    <div>
                      <PanelSectionLabel>Deliveries</PanelSectionLabel>
                      <div className="space-y-2">
                        {(['all', 'mentions_only', 'nothing'] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => void patchStreamNotificationSettings({ notification_level: level })}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                              streamNotifSettings.notification_level === level
                                ? 'border-[#5865f2] bg-[#1e2238]'
                                : 'border-white/6 bg-[#17181c] hover:bg-[#1d1f24]'
                            }`}
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${streamNotifSettings.notification_level === level ? 'border-[#5865f2]' : 'border-[#4e5058]'}`}>
                              {streamNotifSettings.notification_level === level ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                            </span>
                            <span className="text-sm text-[#dbdee1]">
                              {level === 'all' ? 'All Messages' : level === 'mentions_only' ? 'Only @mentions' : 'Nothing'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <PanelSectionLabel>Suppressions</PanelSectionLabel>
                      <div className="space-y-2">
                        {STREAM_NOTIFICATION_TOGGLES.map(([key, label]) => (
                          <NotificationToggleRow
                            key={key}
                            label={label}
                            checked={streamNotifSettings[key]}
                            onToggle={() => void patchStreamNotificationSettings({ [key]: !streamNotifSettings[key] })}
                          />
                        ))}
                        <NotificationToggleRow
                          label={streamNotifSettings.channel_muted ? 'Channel muted' : 'Mute channel'}
                          checked={streamNotifSettings.channel_muted}
                          onToggle={() => void patchStreamNotificationSettings({ channel_muted: !streamNotifSettings.channel_muted })}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyPanelState
                    title="Notification settings unavailable"
                    description="This channel did not return notification settings. Try refreshing the panel."
                    icon={<IconBell className="h-5 w-5" />}
                  />
                )}
              </FloatingPanel>
            ) : null}

            {activePanel === 'pins' && canShowChannelTools ? (
              <FloatingPanel
                title="Pinned Messages"
                subtitle={activeStream ? `#${activeStream.name}` : 'Current channel'}
                onClose={closePanel}
                actions={
                  <button
                    type="button"
                    onClick={() => void refreshPinnedMessages()}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#949ba4] transition-colors hover:bg-[#232428] hover:text-[#f2f3f5]"
                    aria-label="Refresh pinned messages"
                  >
                    <IconRefresh className="h-4 w-4" />
                  </button>
                }
              >
                {pinnedLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="h-24 animate-pulse rounded-xl bg-[#17181c]" />
                    ))}
                  </div>
                ) : pinnedError ? (
                  <EmptyPanelState
                    title="Pinned messages failed to load"
                    description={pinnedError}
                    icon={<IconPin className="h-5 w-5" />}
                  />
                ) : pinnedMessages.length > 0 ? (
                  <div className="space-y-2">
                    {pinnedMessages.map((message) => (
                      <MessagePreviewCard
                        key={message.id}
                        message={message}
                        onOpen={() => void openStreamMessage(message)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyPanelState
                    title="No pinned messages"
                    description="Pin a message from its context menu and it will show up here."
                    icon={<IconPin className="h-5 w-5" />}
                  />
                )}
              </FloatingPanel>
            ) : null}

            {activePanel === 'search' && canShowChannelTools ? (
              <FloatingPanel
                title="Search Messages"
                subtitle={activeSearchFilterCount > 0 ? `${activeSearchFilterCount} filters active in ${activeHub?.name ?? 'this hub'}` : `Search across ${activeHub?.name ?? 'this hub'}`}
                widthClass="w-[430px]"
                onClose={closePanel}
                actions={
                  <button
                    type="button"
                    onClick={() => void runSearch()}
                    className="inline-flex items-center gap-1 rounded-md bg-[#5865f2] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#4752c4]"
                  >
                    <IconSearch className="h-3.5 w-3.5" />
                    Search
                  </button>
                }
              >
                <div className="space-y-4">
                  <div>
                    <PanelSectionLabel>Quick Filters</PanelSectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {activeStream ? (
                        <button
                          type="button"
                          onClick={() => updateSearchFilter('stream_id', searchFilters.stream_id === activeStream.id ? undefined : activeStream.id)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${searchFilters.stream_id === activeStream.id ? 'bg-[#5865f2] text-white' : 'bg-[#1b1d22] text-[#b5bac1] hover:bg-[#232428] hover:text-[#f2f3f5]'}`}
                        >
                          #{activeStream.name}
                        </button>
                      ) : null}
                      {user ? (
                        <button
                          type="button"
                          onClick={() => updateSearchFilter('author_id', searchFilters.author_id === user.id ? undefined : user.id)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${searchFilters.author_id === user.id ? 'bg-[#5865f2] text-white' : 'bg-[#1b1d22] text-[#b5bac1] hover:bg-[#232428] hover:text-[#f2f3f5]'}`}
                        >
                          From me
                        </button>
                      ) : null}
                      {user?.username ? (
                        <button
                          type="button"
                          onClick={() => updateSearchFilter('mentions', searchFilters.mentions === user.username ? undefined : user.username)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${searchFilters.mentions === user.username ? 'bg-[#5865f2] text-white' : 'bg-[#1b1d22] text-[#b5bac1] hover:bg-[#232428] hover:text-[#f2f3f5]'}`}
                        >
                          Mentions @{user.username}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => updateSearchFilter('link', searchFilters.link ? undefined : true)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${searchFilters.link ? 'bg-[#5865f2] text-white' : 'bg-[#1b1d22] text-[#b5bac1] hover:bg-[#232428] hover:text-[#f2f3f5]'}`}
                      >
                        Has link
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSearchFilter('pinned', searchFilters.pinned ? undefined : true)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${searchFilters.pinned ? 'bg-[#5865f2] text-white' : 'bg-[#1b1d22] text-[#b5bac1] hover:bg-[#232428] hover:text-[#f2f3f5]'}`}
                      >
                        Pinned
                      </button>
                    </div>
                  </div>

                  <div>
                    <PanelSectionLabel>Filters</PanelSectionLabel>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <SearchField label="Channel">
                        <select
                          value={searchFilters.stream_id ?? ''}
                          onChange={(event) => updateSearchFilter('stream_id', event.target.value || undefined)}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        >
                          <option value="">All channels</option>
                          {textStreamsInHub.map((stream) => (
                            <option key={stream.id} value={stream.id}>
                              #{stream.name}
                            </option>
                          ))}
                        </select>
                      </SearchField>

                      <SearchField label="Author">
                        <select
                          value={searchFilters.author_id ?? ''}
                          onChange={(event) => updateSearchFilter('author_id', event.target.value || undefined)}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        >
                          <option value="">Anyone</option>
                          {memberOptions.map((member) => (
                            <option key={member.id} value={member.id}>
                              {getUserLabel(member)}
                            </option>
                          ))}
                        </select>
                      </SearchField>

                      <SearchField label="Author Type">
                        <select
                          value={searchFilters.author_type ?? ''}
                          onChange={(event) => updateSearchFilter('author_type', (event.target.value || undefined) as MessageSearchFilters['author_type'])}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        >
                          <option value="">Any</option>
                          <option value="user">User</option>
                          <option value="bot">Bot</option>
                          <option value="webhook">Webhook</option>
                        </select>
                      </SearchField>

                      <SearchField label="Mentions Username">
                        <>
                          <input
                            type="text"
                            list="search-mention-usernames"
                            value={searchFilters.mentions ?? ''}
                            onChange={(event) => updateSearchFilter('mentions', event.target.value || undefined)}
                            placeholder="username"
                            className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none placeholder:text-[#949ba4] transition-colors focus:border-white/15"
                          />
                          <datalist id="search-mention-usernames">
                            {memberOptions.map((member) => (
                              <option key={member.id} value={member.username} />
                            ))}
                          </datalist>
                        </>
                      </SearchField>

                      <SearchField label="Has">
                        <select
                          value={searchFilters.has ?? ''}
                          onChange={(event) => updateSearchFilter('has', (event.target.value || undefined) as MessageSearchFilters['has'])}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        >
                          <option value="">Anything</option>
                          <option value="file">File</option>
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="audio">Audio</option>
                          <option value="link">Link</option>
                        </select>
                      </SearchField>

                      <SearchField label="Before">
                        <input
                          type="date"
                          value={searchFilters.before ?? ''}
                          onChange={(event) => updateSearchFilter('before', event.target.value || undefined)}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        />
                      </SearchField>

                      <SearchField label="After">
                        <input
                          type="date"
                          value={searchFilters.after ?? ''}
                          onChange={(event) => updateSearchFilter('after', event.target.value || undefined)}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        />
                      </SearchField>

                      <SearchField label="On">
                        <input
                          type="date"
                          value={searchFilters.on ?? ''}
                          onChange={(event) => {
                            const value = event.target.value || undefined;
                            setSearchFilters((current) => ({
                              ...current,
                              on: value,
                              during: value ? undefined : current.during,
                            }));
                          }}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        />
                      </SearchField>

                      <SearchField label="During">
                        <input
                          type="date"
                          value={searchFilters.during ?? ''}
                          onChange={(event) => {
                            const value = event.target.value || undefined;
                            setSearchFilters((current) => ({
                              ...current,
                              during: value,
                              on: value ? undefined : current.on,
                            }));
                          }}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        />
                      </SearchField>

                      <SearchField label="Filename">
                        <input
                          type="text"
                          value={searchFilters.filename ?? ''}
                          onChange={(event) => updateSearchFilter('filename', event.target.value || undefined)}
                          placeholder="clip, export, notes"
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none placeholder:text-[#949ba4] transition-colors focus:border-white/15"
                        />
                      </SearchField>

                      <SearchField label="Extension">
                        <input
                          type="text"
                          value={searchFilters.ext ?? ''}
                          onChange={(event) => updateSearchFilter('ext', event.target.value || undefined)}
                          placeholder="png, mp4, pdf"
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none placeholder:text-[#949ba4] transition-colors focus:border-white/15"
                        />
                      </SearchField>

                      <SearchField label="Limit">
                        <select
                          value={searchFilters.limit ?? 25}
                          onChange={(event) => updateSearchFilter('limit', Number(event.target.value))}
                          className="w-full rounded-lg border border-white/8 bg-[#17181c] px-3 py-2 text-sm text-[#f2f3f5] outline-none transition-colors focus:border-white/15"
                        >
                          <option value={25}>25 results</option>
                          <option value={50}>50 results</option>
                          <option value={100}>100 results</option>
                        </select>
                      </SearchField>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-[#dbdee1]">
                        <input
                          type="checkbox"
                          checked={Boolean(searchFilters.pinned)}
                          onChange={(event) => updateSearchFilter('pinned', event.target.checked || undefined)}
                          className="h-4 w-4 rounded border-white/20 bg-[#17181c]"
                        />
                        Pinned only
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-[#dbdee1]">
                        <input
                          type="checkbox"
                          checked={Boolean(searchFilters.link)}
                          onChange={(event) => updateSearchFilter('link', event.target.checked || undefined)}
                          className="h-4 w-4 rounded border-white/20 bg-[#17181c]"
                        />
                        Contains link
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-[#17181c] px-3 py-2.5">
                    <span className="text-xs text-[#949ba4]">Press Enter in the top search bar or run search from here.</span>
                    <button
                      type="button"
                      onClick={resetSearch}
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-[#b5bac1] transition-colors hover:bg-[#232428] hover:text-[#f2f3f5]"
                    >
                      Reset
                    </button>
                  </div>

                  <div>
                    <PanelSectionLabel>Results</PanelSectionLabel>
                    {searchLoading ? (
                      <div className="space-y-2">
                        {[0, 1, 2].map((item) => (
                          <div key={item} className="h-24 animate-pulse rounded-xl bg-[#17181c]" />
                        ))}
                      </div>
                    ) : searchError ? (
                      <EmptyPanelState
                        title="Search failed"
                        description={searchError}
                        icon={<IconSearch className="h-5 w-5" />}
                      />
                    ) : searchResults.length > 0 ? (
                      <div className="space-y-2">
                        {searchResults.map((message) => (
                          <MessagePreviewCard
                            key={message.id}
                            message={message}
                            streamName={message.stream_id ? streamMap.get(message.stream_id)?.name : undefined}
                            onOpen={() => void openStreamMessage(message)}
                          />
                        ))}
                      </div>
                    ) : searchPerformed ? (
                      <EmptyPanelState
                        title="No messages matched"
                        description="Adjust the filters or broaden the query and try again."
                        icon={<IconSearch className="h-5 w-5" />}
                      />
                    ) : (
                      <EmptyPanelState
                        title="Search the hub"
                        description="Use the text query, channel selector, author filter, file filters, and date filters to search this hub."
                        icon={<IconSearch className="h-5 w-5" />}
                      />
                    )}
                  </div>
                </div>
              </FloatingPanel>
            ) : null}

            {activePanel === 'inbox' ? (
              <FloatingPanel
                title="Inbox"
                subtitle="Unread items and mentions"
                onClose={closePanel}
                actions={
                  <button
                    type="button"
                    onClick={() => void markAllNotifsRead()}
                    className="rounded-md px-2.5 py-1 text-xs font-semibold text-[#b5bac1] transition-colors hover:bg-[#232428] hover:text-[#f2f3f5]"
                  >
                    Mark all read
                  </button>
                }
              >
                <div className="space-y-3">
                  <div className="inline-flex rounded-lg bg-[#17181c] p-1">
                    {([
                      ['mentions', 'Mentions'],
                      ['unread', 'Unread'],
                    ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setInboxTab(tab)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${inboxTab === tab ? 'bg-[#5865f2] text-white' : 'text-[#b5bac1] hover:text-[#f2f3f5]'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {inboxItems.length > 0 ? (
                    <div className="space-y-2">
                      {inboxItems.map((notification) => (
                        <NotificationPreviewCard
                          key={notification.id}
                          notification={notification}
                          streamName={notification.stream_id ? streamMap.get(notification.stream_id)?.name : undefined}
                          onOpen={() => void openNotificationItem(notification)}
                          onMarkRead={() => void markNotifRead(notification.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyPanelState
                      title={inboxTab === 'mentions' ? 'No mentions waiting' : 'Nothing unread'}
                      description={
                        inboxTab === 'mentions'
                          ? 'Mentions will show up here across your hubs and channels.'
                          : 'Unread notifications and DMs will show up here.'
                      }
                      icon={<IconInbox className="h-5 w-5" />}
                    />
                  )}
                </div>
              </FloatingPanel>
            ) : null}
          </div>
        ) : null}

        {showWelcome && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-riftapp-content">
            <div className="text-center animate-fade-in max-w-sm px-6">
              <div className="w-16 h-16 rounded-3xl bg-riftapp-content-elevated flex items-center justify-center mx-auto mb-5">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-text-dim">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-riftapp-text mb-1 tracking-tight">Welcome to RiftApp</h2>
              <p className="text-riftapp-text-dim text-sm mb-6">Here's how to get started:</p>
              <ol className="text-left space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-riftapp-accent/20 text-riftapp-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <span className="text-riftapp-text-muted"><span className="text-riftapp-text font-medium">Create a Hub</span> — click <span className="font-bold text-riftapp-success">+</span> in the left rail, then choose <span className="text-riftapp-text font-medium">Create a Server</span>.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-riftapp-accent/20 text-riftapp-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <span className="text-riftapp-text-muted"><span className="text-riftapp-text font-medium">Invite people</span> — click the person+ icon in the hub header to generate an invite code.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-riftapp-accent/20 text-riftapp-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <span className="text-riftapp-text-muted"><span className="text-riftapp-text font-medium">Join an existing hub</span> — click <span className="font-bold text-riftapp-success">+</span> in the left rail, then choose <span className="text-riftapp-text font-medium">Join a Server</span> and paste your invite.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-riftapp-accent/20 text-riftapp-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                  <span className="text-riftapp-text-muted"><span className="text-riftapp-text font-medium">Send a DM</span> — click the chat bubble icon, then press <span className="font-bold text-riftapp-accent">+</span> to message someone.</span>
                </li>
              </ol>
            </div>
          </div>
        )}
        {!showWelcome && showNewMsgBanner && (
          <button
            onClick={scrollToBottom}
            className="absolute top-0 inset-x-0 z-20 flex items-center justify-center gap-1.5 py-1 bg-riftapp-accent text-white text-xs font-semibold cursor-pointer hover:brightness-110 transition shadow-md"
          >
            New messages
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        )}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="h-full overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-4 space-y-4 animate-fade-in">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-3">
                {/* Avatar skeleton */}
                <div className="w-9 h-9 rounded-full bg-riftapp-content-elevated/60 flex-shrink-0 animate-pulse" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  {/* Name + timestamp */}
                  <div className="flex items-center gap-2">
                    <div className="h-3 rounded-full bg-riftapp-content-elevated/80 animate-pulse" style={{ width: `${60 + (i % 3) * 20}px` }} />
                    <div className="h-2.5 rounded-full bg-riftapp-content-elevated/50 animate-pulse w-10" />
                  </div>
                  {/* Message lines */}
                  <div className="h-3 rounded-full bg-riftapp-content-elevated/60 animate-pulse" style={{ width: `${50 + ((i * 37) % 40)}%` }} />
                  {i % 3 === 0 && (
                    <div className="h-3 rounded-full bg-riftapp-content-elevated/40 animate-pulse" style={{ width: `${30 + ((i * 17) % 30)}%` }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="flex items-center justify-center h-full animate-fade-in">
            <div className="text-center px-8">
              <div className="w-16 h-16 rounded-full bg-riftapp-content-elevated flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl font-bold text-riftapp-text-dim">{isDMMode ? '@' : '#'}</span>
              </div>
              {isDMMode ? (
                <>
                  <h3 className="text-xl font-bold mb-1">{activeConversation?.recipient?.display_name}</h3>
                  <p className="text-riftapp-text-dim text-sm max-w-sm">
                    This is the beginning of your conversation with <span className="font-semibold text-riftapp-text">{activeConversation?.recipient?.display_name}</span>.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold mb-1">Welcome to #{activeStream?.name}</h3>
                  <p className="text-riftapp-text-dim text-sm max-w-sm">
                    This is the very beginning of the <span className="font-semibold text-riftapp-text">#{activeStream?.name}</span> stream. Send a message to get things started!
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            {timelineItems.map((item, index) => {
              const prevItem = timelineItems[index - 1];
              const itemDate = new Date(item.timestamp).toDateString();
              const prevDate = prevItem ? new Date(prevItem.timestamp).toDateString() : null;
              const showDateSeparator = !prevItem || itemDate !== prevDate;
              const showUnreadDivider =
                item.kind === 'message' &&
                firstUnreadIndex >= 0 &&
                displayMessages[firstUnreadIndex]?.id === item.message.id;

              return (
                <div key={item.id}>
                  {showDateSeparator && (
                    <div className="flex items-center gap-4 my-4 first:mt-0 px-2">
                      <div className="flex-1 h-px bg-riftapp-border/40" />
                      <span className="text-[11px] font-semibold text-riftapp-text-dim select-none flex-shrink-0">
                        {formatDateSeparator(item.timestamp)}
                      </span>
                      <div className="flex-1 h-px bg-riftapp-border/40" />
                    </div>
                  )}
                  {showUnreadDivider && (
                    <div ref={unreadRef} className="flex items-center gap-2 my-2 px-2">
                      <div className="flex-1 h-px bg-riftapp-danger/60" />
                      <span className="text-[11px] font-semibold text-riftapp-danger uppercase tracking-wide flex-shrink-0">
                        New Messages
                      </span>
                      <div className="flex-1 h-px bg-riftapp-danger/60" />
                    </div>
                  )}
                  {item.kind === 'message' ? (() => {
                    const prevMessage = prevItem?.kind === 'message' ? prevItem.message : undefined;
                    const showHeader =
                      !prevMessage ||
                      prevItem?.kind !== 'message' ||
                      prevMessage.author_id !== item.message.author_id ||
                      new Date(item.message.created_at).getTime() - new Date(prevMessage.created_at).getTime() > 300000 ||
                      showDateSeparator;

                    return (
                      <MessageItem
                        message={item.message}
                        showHeader={showHeader}
                        isOwn={item.message.author_id === user?.id}
                        isDM={isDMMode}
                        hubId={activeHubId}
                      />
                    );
                  })() : (
                    <PinSystemMessage
                      timestamp={item.event.pinnedAt}
                      user={item.event.pinnedById ? (hubMembers[item.event.pinnedById] ?? item.event.pinnedBy) : item.event.pinnedBy}
                      username={
                        (item.event.pinnedById
                          ? hubMembers[item.event.pinnedById]?.display_name || hubMembers[item.event.pinnedById]?.username
                          : undefined) ||
                        item.event.pinnedBy?.display_name ||
                        item.event.pinnedBy?.username ||
                        'Someone'
                      }
                      messageAvailable={!item.event.targetDeleted}
                      onOpenMessage={() => void openPinnedMessageFromTimeline(item.event.originalMessageId)}
                      onOpenPinnedMessages={openPinnedMessagesPanel}
                    />
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
        </div>
      </div>

      {/* Typing indicator + Input */}
      {!showWelcome && activeStreamId && <TypingIndicator streamId={activeStreamId} />}
      {!showWelcome && (
        <MessageInput
          streamName={isDMMode ? (activeConversation?.recipient?.display_name || '') : (activeStream?.name || '')}
          onTyping={isDMMode ? undefined : onTyping}
          onTypingStop={isDMMode ? undefined : onTypingStop}
          isDMMode={isDMMode}
          onSendDM={isDMMode ? sendDMMessage : undefined}
          replyScopeKey={activeStreamId || activeConversationId || ''}
        />
      )}
    </div>
  );
}
