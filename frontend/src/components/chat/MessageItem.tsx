import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Message } from '../../types';
import { useMessageStore } from '../../stores/messageStore';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { useUserContextMenuStore } from '../../stores/userContextMenuStore';
import { useHubStore } from '../../stores/hubStore';
import { useEmojiStore } from '../../stores/emojiStore';
import InviteEmbed from '../shared/InviteEmbed';
import EmojiPicker, { type EmojiSelection } from '../shared/EmojiPicker';
import MessageContextMenu from '../context-menus/MessageContextMenu';
import DeleteMessageModal from '../modals/DeleteMessageModal';
import ModalCloseButton from '../shared/ModalCloseButton';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { hasPermission, PermManageMessages } from '../../utils/permissions';
import { getReplyAuthorLabel, getReplyPreviewMeta } from '../../utils/replyPreview';
import { jumpToMessageId } from '../../utils/messageJump';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;

  return `${date.toLocaleDateString()} ${time}`;
}

// Generate a stable pastel accent color from string
function nameColor(name: string): string {
  const colors = [
    'text-[#f47067]', 'text-[#e0823d]', 'text-[#c4a000]',
    'text-[#57ab5a]', 'text-[#39c5cf]', 'text-[#6cb6ff]',
    'text-[#dcbdfb]', 'text-[#f69d50]', 'text-[#fc8dc7]',
    'text-[#b083f0]',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function avatarBg(name: string): string {
  const colors = [
    'bg-[#f47067]', 'bg-[#e0823d]', 'bg-[#c4a000]',
    'bg-[#57ab5a]', 'bg-[#39c5cf]', 'bg-[#6cb6ff]',
    'bg-[#dcbdfb]', 'bg-[#f69d50]', 'bg-[#fc8dc7]',
    'bg-[#b083f0]',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const INVITE_URL_RE = /https?:\/\/[^\s/]+\/invite\/([A-Za-z0-9]+)/g;

/**
 * Detects whether the entire message content is a single GIF or sticker URL.
 * Returns the URL and type if matched, null otherwise.
 */
function detectInlineMedia(content: string): { url: string; type: 'gif' | 'sticker' } | null {
  const trimmed = content.trim();
  if (!trimmed || trimmed.includes('\n') || trimmed.includes(' ')) return null;
  // Sticker: served through the S3 proxy
  if (/^(\/api)?\/s3\//.test(trimmed)) return { url: trimmed.startsWith('/api') ? trimmed : `/api${trimmed}`, type: 'sticker' };
  // GIF: Tenor URLs or any URL ending in .gif
  if (/^https?:\/\/.*tenor\.(com|googleapis\.com)\//i.test(trimmed)) return { url: trimmed, type: 'gif' };
  if (/^https?:\/\/.*\.gif(\?.*)?$/i.test(trimmed)) return { url: trimmed, type: 'gif' };
  return null;
}

function linkifyText(text: string, keyPrefix: number | string = 0): React.ReactNode[] {
  const re = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match;
  let k = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    let url = match[0].replace(/[.,;:!?]+$/, '');
    const trailing = match[0].slice(url.length);
    const href = url.startsWith('www.') ? `https://${url}` : url;
    nodes.push(
      <a
        key={`${keyPrefix}-l${k++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#00a8fc] hover:underline hover:text-[#00bfff]"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
    lastIdx = match.index + match[0].length;
  }
  if (nodes.length === 0) return [text];
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}

function renderContent(content: string, usernames?: Set<string>, onMentionClick?: (username: string, rect: DOMRect) => void, emojiMap?: Map<string, { id: string; file_url: string }>) {
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{renderInline(remaining.slice(lastIndex, match.index), usernames, onMentionClick, emojiMap)}</span>
      );
    }
    parts.push(
      <pre key={key++} className="bg-riftapp-bg border border-riftapp-border/60 rounded-lg p-3 my-2 overflow-x-auto text-[13px] font-mono leading-relaxed">
        <code>{match[2]}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    parts.push(
      <span key={key++}>{renderInline(remaining.slice(lastIndex), usernames, onMentionClick, emojiMap)}</span>
    );
  }

  const inviteCodes: string[] = [];
  const textForParsing = parts.length > 0 ? content : content;
  let inviteMatch;
  const inviteRe = new RegExp(INVITE_URL_RE.source, 'g');
  while ((inviteMatch = inviteRe.exec(textForParsing)) !== null) {
    inviteCodes.push(inviteMatch[1]);
  }

  const result = parts.length > 0 ? parts : [<span key={0}>{renderInline(content, usernames, onMentionClick, emojiMap)}</span>];

  if (inviteCodes.length > 0) {
    result.push(
      ...inviteCodes.map((code) => <InviteEmbed key={`inv-${code}`} code={code} />)
    );
  }

  return result;
}

function renderInline(text: string, usernames?: Set<string>, onMentionClick?: (username: string, rect: DOMRect) => void, emojiMap?: Map<string, { id: string; file_url: string }>): React.ReactNode {
  // Split on inline code first
  return text.split(/(`[^`]+`)/).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bg-riftapp-bg/80 px-1.5 py-0.5 rounded text-[13px] font-mono text-riftapp-accent-hover">
          {part.slice(1, -1)}
        </code>
      );
    }
    // Parse custom :emoji: tokens in non-code text
    const withEmojis = emojiMap && emojiMap.size > 0 ? renderCustomEmojis(part, emojiMap, i) : null;
    const textToParse = withEmojis ?? part;
    // Parse @mentions in non-code text
    if (typeof textToParse === 'string') {
      if (usernames && usernames.size > 0) {
        return renderMentions(textToParse, usernames, i, onMentionClick);
      }
      return <>{linkifyText(textToParse, i)}</>;
    }
    // textToParse is already a React node (from renderCustomEmojis)
    return textToParse;
  });
}

function renderCustomEmojis(text: string, emojiMap: Map<string, { id: string; file_url: string }>, parentKey: number): React.ReactNode | null {
  const emojiRe = /:([a-zA-Z0-9_\-]+):/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let m;
  let k = 0;
  let hasMatch = false;
  while ((m = emojiRe.exec(text)) !== null) {
    const name = m[1];
    const emoji = emojiMap.get(name.toLowerCase());
    if (!emoji) continue;
    hasMatch = true;
    if (m.index > lastIdx) {
      nodes.push(<span key={`${parentKey}-et${k++}`}>{linkifyText(text.slice(lastIdx, m.index), `${parentKey}-el${k}`)}</span>);
    }
    nodes.push(
      <img
        key={`${parentKey}-ce${k++}`}
        src={publicAssetUrl(emoji.file_url)}
        alt={`:${name}:`}
        title={`:${name}:`}
        className="inline-block w-5 h-5 object-contain align-text-bottom mx-0.5"
        loading="lazy"
      />
    );
    lastIdx = m.index + m[0].length;
  }
  if (!hasMatch) return null;
  if (lastIdx < text.length) {
    nodes.push(<span key={`${parentKey}-et${k++}`}>{linkifyText(text.slice(lastIdx), `${parentKey}-el${k}`)}</span>);
  }
  return <>{nodes}</>;
}

function renderMentions(text: string, usernames: Set<string>, parentKey: number, onMentionClick?: (username: string, rect: DOMRect) => void): React.ReactNode {
  // Match @word patterns (username chars: letters, digits, underscores, dots, hyphens)
  const mentionRe = /@([\w.\-]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let m;
  let k = 0;
  while ((m = mentionRe.exec(text)) !== null) {
    const name = m[1];
    if (!usernames.has(name.toLowerCase())) continue;
    if (m.index > lastIdx) {
      nodes.push(...linkifyText(text.slice(lastIdx, m.index), `${parentKey}-t${k}`));
    }
    const capturedName = name;
    nodes.push(
      <span
        key={`${parentKey}-m${k++}`}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if (onMentionClick) {
            onMentionClick(capturedName, (e.currentTarget as HTMLElement).getBoundingClientRect());
          }
        }}
        className="rounded px-1 py-px bg-riftapp-mention-pill-bg text-riftapp-mention-pill-text font-medium cursor-pointer hover:bg-riftapp-mention-pill-hover hover:underline"
      >
        @{name}
      </span>
    );
    lastIdx = m.index + m[0].length;
  }
  if (nodes.length === 0) return <>{linkifyText(text, parentKey)}</>;
  if (lastIdx < text.length) nodes.push(...linkifyText(text.slice(lastIdx), `${parentKey}-te`));
  return <>{nodes}</>;
}

interface MessageItemProps {
  message: Message;
  showHeader: boolean;
  isOwn: boolean;
  /** Direct messages: only the author may delete. Hub streams: author or hub owner/admin. */
  isDM?: boolean;
  /** Active hub (for message link in context menu). */
  hubId?: string | null;
  isPreview?: boolean;
}

const MessageItem = memo(function MessageItem({ message, showHeader, isOwn, isDM = false, hubId = null, isPreview = false }: MessageItemProps) {
  const author = message.author;
  const authorName = author?.display_name || 'Unknown';
  const toggleReaction = useMessageStore((s) => s.toggleReaction);
  const deleteStreamMessage = useMessageStore((s) => s.deleteMessage);
  const deleteDMMessage = useDMStore((s) => s.deleteDMMessage);
  const editStreamMessage = useMessageStore((s) => s.editMessageContent);
  const editDMMessage = useDMStore((s) => s.editDMMessage);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUsername = useAuthStore((s) => s.user?.username);
  const hubMembers = usePresenceStore((s) => s.hubMembers);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const hubPermissions = useHubStore((s) => (activeHubId ? s.hubPermissions[activeHubId] : undefined));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [messageMenu, setMessageMenu] = useState<{ x: number; y: number; mediaUrl?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const canDelete =
    isOwn ||
    (!isDM && !!message.stream_id && hasPermission(hubPermissions, PermManageMessages));

  const canPin =
    !isDM &&
    !!message.stream_id &&
    (isOwn || hasPermission(hubPermissions, PermManageMessages));

  const canEdit = isOwn && Boolean((message.content || '').trim());

  const color = useMemo(() => nameColor(authorName), [authorName]);
  const bg = useMemo(() => avatarBg(authorName), [authorName]);

  // Build a lowercase set of known usernames for mention detection
  const knownUsernames = useMemo(() => {
    const set = new Set<string>();
    for (const uid in hubMembers) {
      const u = hubMembers[uid];
      if (u.username) set.add(u.username.toLowerCase());
    }
    return set;
  }, [hubMembers]);

  const pickerRef = useRef<HTMLDivElement>(null);
  const openProfile = useProfilePopoverStore((s) => s.open);
  const openContextMenu = useUserContextMenuStore((s) => s.open);
  const interactionsDisabled = isPreview;

  const handleMentionClick = useCallback((username: string, rect: DOMRect) => {
    if (interactionsDisabled) return;
    const user = Object.values(hubMembers).find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    if (user) openProfile(user, rect);
  }, [hubMembers, interactionsDisabled, openProfile]);

  const hubEmojis = useEmojiStore((s) => (activeHubId ? s.hubEmojis[activeHubId] : undefined));

  // Build a name→{id, file_url} map for inline :emoji: rendering
  const emojiMap = useMemo(() => {
    const map = new Map<string, { id: string; file_url: string }>();
    if (hubEmojis) {
      for (const e of hubEmojis) {
        map.set(e.name.toLowerCase(), { id: e.id, file_url: e.file_url });
      }
    }
    return map;
  }, [hubEmojis]);

  const renderedContent = useMemo(
    () => message.content ? renderContent(message.content, knownUsernames, handleMentionClick, emojiMap) : null,
    [message.content, knownUsernames, handleMentionClick, emojiMap],
  );
  const replyAuthorLabel = useMemo(() => getReplyAuthorLabel(message.reply_to), [message.reply_to]);
  const replyPreview = useMemo(() => getReplyPreviewMeta(message.reply_to), [message.reply_to]);
  const replyAuthorColor = useMemo(() => nameColor(replyAuthorLabel), [replyAuthorLabel]);

  // Detect whether the current user is mentioned in this message
  const mentionsSelf = useMemo(() => {
    if (!currentUsername || !message.content) return false;
    const re = new RegExp(`@${currentUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.\\-])`, 'i');
    return re.test(message.content);
  }, [message.content, currentUsername]);

  const handleReplyPreviewClick = useCallback(() => {
    const replyId = message.reply_to?.id ?? message.reply_to_message_id;
    if (!replyId) return;
    jumpToMessageId(replyId);
  }, [message.reply_to?.id, message.reply_to_message_id]);

  const handleProfileClick = useCallback((e: React.MouseEvent) => {
    if (interactionsDisabled) return;
    if (author) {
      openProfile(author, (e.currentTarget as HTMLElement).getBoundingClientRect());
    }
  }, [author, interactionsDisabled, openProfile]);

  const handleUserContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (interactionsDisabled) return;
      e.stopPropagation();
      if (author) {
        e.preventDefault();
        openContextMenu(author, e.clientX, e.clientY);
      }
    },
    [author, interactionsDisabled, openContextMenu],
  );

  const handleMessageContextMenu = useCallback((e: React.MouseEvent) => {
    if (interactionsDisabled) return;
    e.preventDefault();
    // Detect if the right-click target is a media element
    const target = e.target as HTMLElement;
    let mediaUrl: string | undefined;
    if (target instanceof HTMLImageElement && target.src) {
      mediaUrl = target.src;
    } else if (target instanceof HTMLVideoElement && target.src) {
      mediaUrl = target.src;
    } else {
      // Check if target is inside a media wrapper (e.g. play overlay on video)
      const video = target.closest('.group\\/video')?.querySelector('video');
      if (video?.src) mediaUrl = video.src;
    }
    setMessageMenu({ x: e.clientX, y: e.clientY, mediaUrl });
  }, [interactionsDisabled]);

  useEffect(() => {
    if (!editing) {
      setEditDraft(message.content);
      setEditError(null);
    }
  }, [message.content, editing]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditing(false);
        setEditDraft(message.content);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, message.content]);

  const saveEdit = useCallback(async () => {
    const t = editDraft.trim();
    if (!t || savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      if (isDM) await editDMMessage(message.id, t);
      else await editStreamMessage(message.id, t);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save edit');
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, editDMMessage, editStreamMessage, isDM, message.id, savingEdit]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [pickerOpen]);

  const handleToggle = (emoji: string, emojiId?: string) => {
    if (interactionsDisabled) return;
    toggleReaction(message.id, emoji, emojiId);
    setPickerOpen(false);
  };

  const handlePickerSelect = (sel: EmojiSelection) => {
    handleToggle(sel.emoji, sel.emojiId);
  };

  const executeDelete = useCallback(async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    try {
      if (isDM) {
        await deleteDMMessage(message.id);
      } else {
        await deleteStreamMessage(message.id);
      }
    } catch {
      // silently fail
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }, [canDelete, deleting, isDM, message.id, deleteDMMessage, deleteStreamMessage]);

  const handleDeleteClick = useCallback((e?: React.MouseEvent) => {
    if (!canDelete || deleting) return;
    if (e?.shiftKey) {
      void executeDelete();
    } else {
      setShowDeleteModal(true);
    }
  }, [canDelete, deleting, executeDelete]);

  const reactions = message.reactions || [];

  // Extract all non-invite URLs from message text for the unified embed system
  const embedUrls = useMemo(() => extractEmbedUrls(message.content || ''), [message.content]);

  // Detect if the entire message is a single GIF or sticker URL
  const inlineMedia = useMemo(() => detectInlineMedia(message.content || ''), [message.content]);

  const contentBlock =
    editing ? (
      <div className="mt-1 space-y-2">
        <textarea
          value={editDraft}
          onChange={(e) => {
            setEditDraft(e.target.value);
            if (editError) setEditError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void saveEdit();
            }
          }}
          className="w-full min-h-[80px] bg-riftapp-bg border border-riftapp-border/60 rounded-lg px-3 py-2 text-[15px] text-riftapp-text outline-none focus:ring-2 focus:ring-riftapp-accent/30 resize-y"
          maxLength={4000}
        />
        {editError && (
          <p className="text-sm text-riftapp-danger">{editError}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={savingEdit || !editDraft.trim()}
            onClick={() => void saveEdit()}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-riftapp-accent text-white hover:bg-riftapp-accent-hover disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            disabled={savingEdit}
            onClick={() => {
              setEditing(false);
              setEditDraft(message.content);
            }}
            className="px-3 py-1.5 rounded-md text-sm text-riftapp-text-dim hover:text-riftapp-text hover:bg-riftapp-content-elevated"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <div className={interactionsDisabled ? 'pointer-events-none' : undefined}>
        {(message.reply_to || message.reply_to_message_id) && (
          <button
            type="button"
            onClick={handleReplyPreviewClick}
            disabled={!message.reply_to?.id && !message.reply_to_message_id}
            className="group/reply mb-1.5 flex max-w-[560px] min-w-0 items-center gap-1.5 pr-2 text-left text-[12px] leading-4 text-riftapp-text-dim/85 transition-colors hover:text-riftapp-text disabled:cursor-default disabled:opacity-80"
          >
            <span className={`max-w-[48%] shrink-0 truncate font-semibold ${replyAuthorColor} underline-offset-2 group-hover/reply:underline`}>
              @{replyAuthorLabel}
            </span>
            <span
              className={`min-w-0 truncate transition-colors ${
                replyPreview.tone === 'default'
                  ? 'text-riftapp-text-dim group-hover/reply:text-riftapp-text-muted'
                  : 'text-riftapp-text-dim/75 group-hover/reply:text-riftapp-text-dim'
              }`}
            >
              {replyPreview.text}
            </span>
          </button>
        )}
        {inlineMedia ? (
          <InlineMediaImage url={inlineMedia.url} type={inlineMedia.type} />
        ) : (
          <>
            <div className="text-[15px] leading-[1.375rem] text-riftapp-text/[0.90]">{renderedContent}</div>
            {embedUrls.length > 0 && <LinkEmbeds urls={embedUrls} />}
          </>
        )}
        <Attachments message={message} />
        {reactions.length > 0 && (
          <ReactionPills reactions={reactions} currentUserId={currentUserId} onToggle={handleToggle} />
        )}
      </div>
    );

  return (
    <div
      id={`message-${message.id}`}
      onContextMenu={interactionsDisabled ? undefined : handleMessageContextMenu}
      className={isPreview
        ? 'relative rounded-xl'
        : `group relative py-0.5 -mx-4 px-4 transition-colors duration-100 ${
            mentionsSelf
              ? 'bg-riftapp-mention-highlight-bg border-l-[3px] border-riftapp-mention-highlight-border hover:bg-riftapp-mention-highlight-hover'
              : 'hover:bg-riftapp-content-elevated/60'
          } ${
            showHeader ? 'mt-[17px]' : ''
          }`}
    >


      {/* Hover action bar */}
      {!isPreview && (
        <div className="absolute -top-3 right-4 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 ease-out z-10">
          <div className="flex items-center bg-riftapp-content-elevated border border-riftapp-border/60 rounded-lg shadow-elevation-low">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="px-2 py-1 text-riftapp-text-dim hover:text-riftapp-text hover:bg-riftapp-content-elevated rounded-lg transition-colors duration-100"
              title="Add Reaction"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={(e) => handleDeleteClick(e)}
                disabled={deleting}
                className="px-2 py-1 text-riftapp-text-dim hover:text-riftapp-danger hover:bg-riftapp-danger/10 rounded-lg transition-colors duration-100 disabled:opacity-50 border-l border-riftapp-border/40"
                title={isOwn ? 'Delete message' : 'Delete message (moderator)'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}
          </div>
          {/* Emoji picker */}
          {pickerOpen && (
            <div ref={pickerRef} className="absolute right-0 top-full mt-1 z-50">
              <EmojiPicker
                hubId={activeHubId}
                onSelect={handlePickerSelect}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          )}
        </div>
      )}

      {showHeader ? (
        <div className="flex gap-3">
          {/* Avatar */}
          <div
            onClick={interactionsDisabled ? undefined : handleProfileClick}
            onContextMenu={interactionsDisabled ? undefined : handleUserContextMenu}
            className={`w-10 h-10 rounded-full flex-shrink-0 mt-0.5 overflow-hidden ${interactionsDisabled ? '' : 'cursor-pointer hover:opacity-80 transition-opacity'}`}
          >
            {author?.avatar_url ? (
              <img src={publicAssetUrl(author.avatar_url)} alt={authorName} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full ${bg} flex items-center justify-center text-xs font-bold text-white`}>
                {authorName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span onClick={interactionsDisabled ? undefined : handleProfileClick} onContextMenu={interactionsDisabled ? undefined : handleUserContextMenu} className={`font-semibold text-[15px] ${interactionsDisabled ? '' : 'cursor-pointer hover:underline'} ${isOwn ? 'text-riftapp-accent-hover' : color}`}>
                {authorName}
              </span>
              <span className="text-[11px] text-riftapp-text-dim/80 select-none">
                {formatTime(message.created_at)}
              </span>
              {message.edited_at && (
                <span className="text-[10px] text-riftapp-text-dim/60 select-none" title={`Edited ${formatTime(message.edited_at)}`}>(edited)</span>
              )}
            </div>
            {contentBlock}
          </div>
        </div>
      ) : (
        <div className="pl-[52px]">{contentBlock}</div>
      )}

      {!isPreview && messageMenu && (
        <MessageContextMenu
          message={message}
          x={messageMenu.x}
          y={messageMenu.y}
          isDM={isDM}
          hubId={hubId}
          isOwn={isOwn}
          canEdit={canEdit}
          canDelete={canDelete}
          canPin={canPin}
          mediaUrl={messageMenu.mediaUrl}
          onClose={() => setMessageMenu(null)}
          onEdit={() => {
            setMessageMenu(null);
            setEditDraft(message.content);
            setEditing(true);
          }}
          onDelete={() => {
            setMessageMenu(null);
            setShowDeleteModal(true);
          }}
        />
      )}

      {showDeleteModal && (
        <DeleteMessageModal
          message={message}
          onConfirm={() => void executeDelete()}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
});

export default MessageItem;

/* ═══════════════════════════════════════════════════════════════════════
   Unified Link Embed System
   ═══════════════════════════════════════════════════════════════════════ */

const PLAIN_URL_RE = /https?:\/\/[^\s<>]+/g;
const YT_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})(?:[&?][^\s]*)?/;
const REDDIT_RE = /(?:https?:\/\/)?(?:www\.|old\.|new\.)?reddit\.com\/r\/[\w]+\/comments\/[\w]+/;
const TWITTER_RE = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/\w+\/status\/\d+/;

type EmbedType = 'youtube' | 'reddit' | 'twitter' | 'generic';

interface ParsedEmbed {
  url: string;
  type: EmbedType;
  /** YouTube video ID, if applicable */
  ytId?: string;
}

function classifyUrl(url: string): ParsedEmbed {
  const ytMatch = url.match(YT_RE);
  if (ytMatch) return { url, type: 'youtube', ytId: ytMatch[1] };
  if (REDDIT_RE.test(url)) return { url, type: 'reddit' };
  if (TWITTER_RE.test(url)) return { url, type: 'twitter' };
  return { url, type: 'generic' };
}

function extractEmbedUrls(text: string): ParsedEmbed[] {
  const matches = text.match(PLAIN_URL_RE);
  if (!matches) return [];
  const seen = new Set<string>();
  const invRe = new RegExp(INVITE_URL_RE.source);
  const results: ParsedEmbed[] = [];
  for (const u of matches) {
    if (seen.has(u) || invRe.test(u)) continue;
    seen.add(u);
    results.push(classifyUrl(u));
  }
  return results;
}

/* Max embeds to render per message to avoid spam */
const MAX_EMBEDS = 5;

function LinkEmbeds({ urls }: { urls: ParsedEmbed[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const visible = urls.slice(0, MAX_EMBEDS);
  const overflow = urls.length - MAX_EMBEDS;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="mt-1 text-xs text-riftapp-text-dim hover:text-riftapp-text-muted transition-colors"
      >
        Show {urls.length} embed{urls.length !== 1 ? 's' : ''}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map((embed) => {
        switch (embed.type) {
          case 'youtube':
            return <YouTubeEmbed key={embed.url} videoId={embed.ytId!} />;
          case 'twitter':
            return <TwitterEmbed key={embed.url} url={embed.url} />;
          case 'reddit':
            return <RedditEmbed key={embed.url} url={embed.url} />;
          default:
            return <GenericLinkPreview key={embed.url} url={embed.url} />;
        }
      })}
      {overflow > 0 && (
        <span className="text-xs text-riftapp-text-dim">+{overflow} more link{overflow !== 1 ? 's' : ''}</span>
      )}
      {urls.length > 0 && (
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-[11px] text-riftapp-text-dim hover:text-riftapp-text-muted transition-colors w-fit"
        >
          Hide embeds
        </button>
      )}
    </div>
  );
}

/* ─── Shared embed card wrapper ──────────────────────────────────────── */
const EMBED_CARD =
  'mt-1.5 max-w-[420px] rounded-xl overflow-hidden border border-riftapp-border/40 bg-riftapp-content-elevated transition-all duration-200 hover:brightness-110 hover:shadow-elevation-md';

/* ─── YouTube Embed ──────────────────────────────────────────────────── */
function YouTubeEmbed({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  if (playing) {
    return (
      <div className={`${EMBED_CARD} bg-black`}>
        <div className="relative w-full" style={{ paddingBottom: '56.25%', maxHeight: '300px' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className={`${EMBED_CARD} bg-riftapp-bg/40 block text-left cursor-pointer group/yt`}
    >
      <div className="relative w-full" style={{ aspectRatio: '16/9', maxHeight: '240px' }}>
        <img src={thumbUrl} alt="YouTube video" loading="lazy" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 group-hover/yt:from-black/60 transition-colors duration-200" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-red-600/90 group-hover/yt:bg-red-600 group-hover/yt:scale-110 flex items-center justify-center shadow-lg transition-all duration-200">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white" className="ml-0.5"><polygon points="6,4 20,12 6,20" /></svg>
          </div>
        </div>
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/50 text-[10px] text-white/80 font-medium">
          <svg width="12" height="9" viewBox="0 0 28 20" fill="currentColor" className="text-red-500">
            <path d="M27.4 3.1a3.5 3.5 0 0 0-2.5-2.5C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9z"/>
            <polygon points="11,14.5 18.5,10 11,5.5" fill="white"/>
          </svg>
          YouTube
        </div>
      </div>
    </button>
  );
}

/* ─── Twitter/X Embed ────────────────────────────────────────────────── */
function TwitterEmbed({ url }: { url: string }) {
  const [meta, setMeta] = useState<{ title?: string; description?: string; image?: string; site_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const body = await res.json();
          if (!cancelled) setMeta(body.data ?? body);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [url]);

  const handle = (() => { try { return new URL(url).pathname.split('/')[1]; } catch { return ''; } })();

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`${EMBED_CARD} flex p-3 gap-3 group/tw`}>
      {/* Left accent stripe */}
      <div className="w-1 rounded-full bg-[#1d9bf0] flex-shrink-0" />
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1d9bf0" className="flex-shrink-0">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          {handle && <span className="text-xs text-riftapp-text-dim">@{handle}</span>}
        </div>

        {/* Content */}
        {loading ? (
          <div className="h-8 bg-riftapp-bg/60 animate-pulse-soft rounded" />
        ) : meta?.description ? (
          <p className="text-sm text-riftapp-text/90 line-clamp-3 leading-snug">{meta.description}</p>
        ) : meta?.title ? (
          <p className="text-sm text-riftapp-text/90 line-clamp-3 leading-snug">{meta.title}</p>
        ) : (
          <p className="text-xs text-riftapp-text-dim">View on X</p>
        )}

        {/* Media thumbnail */}
        {meta?.image && (
          <img src={meta.image} alt="" loading="lazy" className="mt-2 w-full max-h-[200px] object-cover rounded-lg" />
        )}
      </div>
    </a>
  );
}

/* ─── Reddit Embed ───────────────────────────────────────────────────── */
function RedditEmbed({ url }: { url: string }) {
  const [meta, setMeta] = useState<{ title?: string; description?: string; image?: string; site_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const subreddit = (() => {
    try {
      const m = url.match(/\/r\/([\w]+)/);
      return m ? `r/${m[1]}` : '';
    } catch { return ''; }
  })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const body = await res.json();
          if (!cancelled) setMeta(body.data ?? body);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`${EMBED_CARD} flex p-3 gap-3 group/rd`}>
      {/* Left accent stripe */}
      <div className="w-1 rounded-full bg-[#ff4500] flex-shrink-0" />
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#ff4500" className="flex-shrink-0">
            <circle cx="12" cy="12" r="11" fill="#ff4500"/>
            <path d="M16.5 13.5c0 .83-2.01 2.5-4.5 2.5s-4.5-1.67-4.5-2.5" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
            <circle cx="9" cy="11" r="1.2" fill="white"/>
            <circle cx="15" cy="11" r="1.2" fill="white"/>
            <circle cx="18" cy="6" r="1.5" fill="#ff4500" stroke="white" strokeWidth=".8"/>
            <path d="M14.5 3.5L18 6" stroke="white" strokeWidth=".8"/>
          </svg>
          {subreddit && <span className="text-xs text-riftapp-text-dim font-medium">{subreddit}</span>}
        </div>

        {/* Content */}
        {loading ? (
          <div className="h-8 bg-riftapp-bg/60 animate-pulse-soft rounded" />
        ) : (
          <>
            {meta?.title && (
              <p className="text-sm font-medium text-riftapp-text/90 line-clamp-2 leading-snug group-hover/rd:text-riftapp-accent transition-colors">{meta.title}</p>
            )}
            {meta?.description && (
              <p className="text-xs text-riftapp-text-muted line-clamp-2 mt-0.5">{meta.description}</p>
            )}
          </>
        )}

        {/* Thumbnail */}
        {meta?.image && (
          <img src={meta.image} alt="" loading="lazy" className="mt-2 w-full max-h-[200px] object-cover rounded-lg" />
        )}
      </div>
    </a>
  );
}

/* ─── Generic Link Preview ───────────────────────────────────────────── */
function GenericLinkPreview({ url }: { url: string }) {
  const [meta, setMeta] = useState<{ title?: string; description?: string; image?: string; site_name?: string; domain: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    setMeta({ domain });

    (async () => {
      try {
        const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const body = await res.json();
          const d = body.data ?? body;
          if (!cancelled) setMeta({ ...d, domain });
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [url]);

  if (!meta) return null;

  const hasImage = meta.image && !imgFailed;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${EMBED_CARD} flex gap-3 p-3 group/link`}
    >
      {/* Thumbnail */}
      {hasImage && (
        <img
          src={meta.image!}
          alt=""
          loading="lazy"
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
          onError={() => setImgFailed(true)}
        />
      )}
      <div className="min-w-0 flex-1">
        {loading && !meta.title ? (
          <div className="space-y-1.5">
            <div className="h-3.5 w-3/4 bg-riftapp-bg/60 animate-pulse-soft rounded" />
            <div className="h-3 w-1/2 bg-riftapp-bg/60 animate-pulse-soft rounded" />
          </div>
        ) : (
          <>
            {meta.site_name && (
              <p className="text-[11px] text-riftapp-text-dim font-medium mb-0.5">{meta.site_name}</p>
            )}
            {meta.title && (
              <p className="text-sm font-medium text-riftapp-accent group-hover/link:underline line-clamp-2">{meta.title}</p>
            )}
            {meta.description && (
              <p className="text-xs text-riftapp-text-muted line-clamp-2 mt-0.5">{meta.description}</p>
            )}
          </>
        )}
        <p className="text-[11px] text-riftapp-text-dim mt-1">{meta.domain}</p>
      </div>
    </a>
  );
}

/* ─── Discord-style video player ─────────────────────────────────────── */
function fmtTime(s: number): string {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [dragging, setDragging] = useState(false);

  const controlsVisible = showControls || hovered || dragging;

  // Auto-hide controls after inactivity
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [playing]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!started) setStarted(true);
    if (v.paused) {
      v.play();
    } else {
      v.pause();
    }
  }, [started]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (v && !dragging) setCurrentTime(v.currentTime);
  }, [dragging]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * duration;
    setCurrentTime(v.currentTime);
  }, [duration]);

  const handleSeekDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    handleSeek(e);
  }, [dragging, handleSeek]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (v) v.volume = val;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  // Keyboard controls
  useEffect(() => {
    if (!started) return;
    const handler = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el || !el.contains(document.activeElement) && document.activeElement !== el) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [started, togglePlay]);

  // Sync play/pause state
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { setPlaying(true); setShowControls(true); scheduleHide(); };
    const onPause = () => { setPlaying(false); setShowControls(true); clearTimeout(hideTimer.current); };
    const onEnded = () => { setPlaying(false); setShowControls(true); };
    const onMeta = () => setDuration(v.duration);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    v.addEventListener('loadedmetadata', onMeta);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('loadedmetadata', onMeta);
    };
  }, [scheduleHide]);

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="mt-1 max-w-[420px] rounded-xl overflow-hidden border border-riftapp-border/40 bg-black relative select-none group/video"
      tabIndex={0}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={() => { setHovered(true); setShowControls(true); }}
      onMouseLeave={() => { setHovered(false); scheduleHide(); }}
      onMouseMove={() => { setShowControls(true); scheduleHide(); }}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onClick={togglePlay}
        className="w-full max-h-[300px] object-contain cursor-pointer block"
      >
        <track kind="captions" />
      </video>

      {/* ── Dark hover overlay (before playing) ─────────────────────── */}
      {!started && (
        <div
          className="absolute inset-0 bg-black/20 group-hover/video:bg-black/40 transition-colors duration-200 cursor-pointer"
          onClick={togglePlay}
        />
      )}

      {/* ── Centered play button (before playing or paused) ──────────── */}
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10
            w-14 h-14 rounded-full bg-black/60 flex items-center justify-center
            hover:bg-black/75 hover:scale-110 active:scale-95
            transition-all duration-200 cursor-pointer ${started ? 'opacity-0 group-hover/video:opacity-100' : 'opacity-100'}`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white" className="ml-1">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        </button>
      )}

      {/* ── Bottom controls overlay ─────────────────────────────────── */}
      {started && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-10 transition-opacity duration-200 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Gradient fade */}
          <div className="h-16 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 flex flex-col gap-1">
            {/* Progress bar */}
            <div
              className="h-3 flex items-center cursor-pointer group/bar"
              onClick={handleSeek}
              onMouseDown={() => setDragging(true)}
              onMouseMove={handleSeekDrag}
              onMouseUp={() => setDragging(false)}
              onMouseLeave={() => setDragging(false)}
            >
              <div className="w-full h-[3px] group-hover/bar:h-[5px] transition-all duration-100 bg-white/25 rounded-full relative">
                <div
                  className="absolute inset-y-0 left-0 bg-riftapp-accent rounded-full"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover/bar:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress}% - 6px)` }}
                />
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2">
              {/* Play / Pause */}
              <button type="button" onClick={togglePlay} className="text-white/90 hover:text-white transition-colors p-0.5">
                {playing ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="4" width="5" height="16" rx="1" />
                    <rect x="14" y="4" width="5" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6,4 20,12 6,20" />
                  </svg>
                )}
              </button>

              {/* Time */}
              <span className="text-[11px] text-white/70 tabular-nums whitespace-nowrap">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>

              <div className="flex-1" />

              {/* Volume */}
              <div className="flex items-center gap-1 group/vol">
                <button
                  type="button"
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.muted = !v.muted;
                    setVolume(v.muted ? 0 : v.volume || 1);
                  }}
                  className="text-white/70 hover:text-white transition-colors p-0.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                    {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                    {volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                  </svg>
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover/vol:w-16 transition-all duration-150 accent-riftapp-accent h-1 cursor-pointer opacity-0 group-hover/vol:opacity-100"
                />
              </div>

              {/* Fullscreen */}
              <button type="button" onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors p-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Inline GIF / Sticker embed (sent as plain URL) ────────────────── */
function InlineMediaImage({ url, type }: { url: string; type: 'gif' | 'sticker' }) {
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const isSticker = type === 'sticker';

  return (
    <>
      {lightbox && <ImageLightbox src={url} alt={type} onClose={() => setLightbox(false)} />}
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className={`relative block rounded-xl overflow-hidden mt-1 cursor-pointer text-left group/inline-media
          ${isSticker ? '' : 'border border-riftapp-border/40 bg-riftapp-bg/40 hover:brightness-110 hover:scale-[1.02] hover:shadow-elevation-md'}
          transition-all duration-200`}
      >
        {!loaded && !isSticker && (
          <div className="absolute inset-0 bg-riftapp-content-elevated animate-pulse-soft rounded-xl" />
        )}
        <img
          src={url}
          alt={type}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`block object-contain rounded-xl transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}
            ${isSticker ? 'w-32 h-32' : 'max-w-[420px] max-h-[288px] w-auto h-auto'}`}
        />
      </button>
    </>
  );
}

/* ─── Image thumbnail with lazy-load fade-in ─────────────────────────── */
function ImageThumb({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block rounded-xl border border-riftapp-border/40 overflow-hidden bg-riftapp-bg/40
        hover:brightness-110 hover:scale-[1.02] hover:shadow-elevation-md transition-all duration-200 cursor-pointer text-left group/thumb"
    >
      {/* Skeleton placeholder */}
      {!loaded && (
        <div className="absolute inset-0 bg-riftapp-content-elevated animate-pulse-soft rounded-xl" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`block max-w-full w-auto h-auto object-contain rounded-xl
          transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ maxHeight: '288px' }}
      />
    </button>
  );
}

/* ─── Full-size lightbox modal ──────────────────────────────────────── */
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm text-white/70 truncate max-w-[50vw]">{alt}</span>
        <div className="flex items-center gap-2">
          <a
            href={src}
            download={alt}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-150"
            title="Download"
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-150"
            title="Open in new tab"
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <ModalCloseButton onClick={onClose} variant="overlay" />
        </div>
      </div>

      {/* Image */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => {
          e.stopPropagation();
          setZoom((z) => !z);
        }}
        className={`select-none rounded-lg shadow-2xl transition-transform duration-200
          ${zoom
            ? 'max-w-none max-h-none cursor-zoom-out scale-150'
            : 'max-w-[min(96vw,calc(100vw-2rem))] max-h-[min(88dvh,88vh)] w-auto h-auto object-contain cursor-default'
          }`}
        draggable={false}
      />
    </div>,
    document.body,
  );
}

function ReactionPills({
  reactions,
  currentUserId,
  onToggle,
}: {
  reactions: { emoji: string; emoji_id?: string; file_url?: string; count: number; users: string[] }[];
  currentUserId?: string;
  onToggle: (emoji: string, emojiId?: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => {
        const reacted = currentUserId ? r.users.includes(currentUserId) : false;
        const isCustom = !!r.emoji_id && !!r.file_url;
        return (
          <button
            key={r.emoji_id || r.emoji}
            onClick={() => onToggle(r.emoji, r.emoji_id)}
            title={r.emoji}
            className={`inline-flex items-center gap-1.5 h-6 min-w-[42px] px-1.5 rounded-full text-xs font-medium border transition-colors duration-150 cursor-pointer select-none ${
              reacted
                ? 'bg-riftapp-accent/15 border-riftapp-accent/50 text-riftapp-accent'
                : 'bg-riftapp-content-elevated border-riftapp-border/50 text-riftapp-text-dim hover:border-riftapp-border hover:bg-riftapp-content-elevated'
            }`}
          >
            {isCustom ? (
              <img src={publicAssetUrl(r.file_url!)} alt={r.emoji} className="w-4 h-4 object-contain shrink-0" />
            ) : (
              <span className="w-4 h-4 text-[15px] leading-4 text-center shrink-0">{r.emoji}</span>
            )}
            <span>{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Image grid for multi-image messages ───────────────────────────── */
const MAX_GRID_VISIBLE = 4;

function ImageGrid({
  images,
  onOpen,
}: {
  images: { id: string; src: string; alt: string }[];
  onOpen: (idx: number) => void;
}) {
  const count = images.length;
  const visible = images.slice(0, MAX_GRID_VISIBLE);
  const overflow = count - MAX_GRID_VISIBLE;

  // 1 image → single full-width thumb
  if (count === 1) {
    return (
      <div className="max-w-[420px]">
        <ImageThumb src={visible[0].src} alt={visible[0].alt} onClick={() => onOpen(0)} />
      </div>
    );
  }

  // 2–4+ images → adaptive grid  (2 cols, max 2 rows)
  return (
    <div
      className="grid gap-1 max-w-[420px]"
      style={{
        gridTemplateColumns: 'repeat(2, 1fr)',
        maxHeight: '320px',
      }}
    >
      {visible.map((img, idx) => {
        const isLastVisible = idx === MAX_GRID_VISIBLE - 1 && overflow > 0;
        return (
          <button
            key={img.id}
            type="button"
            onClick={() => onOpen(idx)}
            className="relative rounded-xl overflow-hidden border border-riftapp-border/40 bg-riftapp-bg/40
              hover:brightness-110 hover:scale-[1.02] hover:shadow-elevation-md transition-all duration-200 cursor-pointer"
            style={{ aspectRatio: '4/3' }}
          >
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
            {isLastVisible && (
              <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                <span className="text-white text-xl font-semibold">+{overflow}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Attachments (images, videos & files) ──────────────────────────── */
function Attachments({ message }: { message: Message }) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  if (!message.attachments || message.attachments.length === 0) return null;

  const imageAtts = message.attachments.filter((a) => a.content_type.startsWith('image/'));
  const videoAtts = message.attachments.filter((a) => a.content_type.startsWith('video/'));
  const fileAtts = message.attachments.filter((a) => !a.content_type.startsWith('image/') && !a.content_type.startsWith('video/'));

  const imageItems = imageAtts.map((att) => ({
    id: att.id,
    src: publicAssetUrl(att.url),
    alt: att.filename,
  }));

  return (
    <>
      {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
      <div className="mt-1 flex flex-col gap-1.5">
        {/* Images */}
        {imageItems.length > 0 && (
          imageItems.length === 1 ? (
            <div className="max-w-[420px]">
              <ImageThumb
                src={imageItems[0].src}
                alt={imageItems[0].alt}
                onClick={() => setLightbox({ src: imageItems[0].src, alt: imageItems[0].alt })}
              />
            </div>
          ) : (
            <ImageGrid
              images={imageItems}
              onOpen={(idx) => {
                const img = imageItems[idx];
                setLightbox({ src: img.src, alt: img.alt });
              }}
            />
          )
        )}

        {/* Videos */}
        {videoAtts.map((att) => (
          <VideoPlayer key={att.id} src={publicAssetUrl(att.url)} />
        ))}

        {/* Non-image/video files */}
        {fileAtts.map((att) => {
          const fileUrl = publicAssetUrl(att.url);
          return (
            <a
              key={att.id}
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-riftapp-content-elevated border border-riftapp-border/50 rounded-xl px-4 py-3
                hover:bg-riftapp-content-elevated hover:border-riftapp-border transition-all duration-150 max-w-[380px] group/file"
            >
              <div className="w-10 h-10 rounded-lg bg-riftapp-accent/10 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-accent">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-riftapp-accent group-hover/file:underline truncate font-medium">{att.filename}</p>
                <p className="text-[11px] text-riftapp-text-dim">{formatBytes(att.size_bytes)}</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                className="text-riftapp-text-dim opacity-0 group-hover/file:opacity-100 transition-opacity flex-shrink-0">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
          );
        })}
      </div>
    </>
  );
}
