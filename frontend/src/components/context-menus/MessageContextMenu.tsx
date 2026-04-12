import { useState, type ReactNode } from 'react';
import { MenuOverlay } from './MenuOverlay';
import type { Message } from '../../types';
import { useMessageStore } from '../../stores/messageStore';
import { useDMStore } from '../../stores/dmStore';
import { useReplyDraftStore } from '../../stores/replyDraftStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import ReportModal from '../modals/ReportModal';

const QUICK_ROW = ['😂', '✨', '🔥', '👍'];
const REACTION_PICK = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✨', '👀', '🎉'];

function IconPencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconReply() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M9 14L4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10.5a5.5 5.5 0 015.5 5.5v0a5.5 5.5 0 01-5.5 5.5H11" strokeLinecap="round" />
    </svg>
  );
}

function IconForward() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M15 14l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9H9.5A5.5 5.5 0 004 14.5v0A5.5 5.5 0 009.5 20H13" strokeLinecap="round" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M14 4v5l3 3v1H7v-1l3-3V4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 13v8" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IconUnread() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 3L9 15" strokeLinecap="round" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07l-1.41 1.41" strokeLinecap="round" />
      <path d="M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 007.07 7.07l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

function IconSpeak() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <polyline points="3 6 5 6 21 6" strokeLinecap="round" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" />
    </svg>
  );
}

function IconExternalLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="15 3 21 3 21 9" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" />
      <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current">
      <path d="M4 21V5" strokeLinecap="round" />
      <path d="M4 5h11l-1.5 3L15 11H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-current opacity-80">
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ContextMenuMedia = {
  url: string;
  kind: 'image' | 'video';
};

interface Props {
  message: Message;
  x: number;
  y: number;
  isDM: boolean;
  hubId: string | null;
  isOwn: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onForward: () => void;
  onDelete?: () => void;
  media?: ContextMenuMedia;
}

export default function MessageContextMenu({
  message,
  x,
  y,
  isDM,
  hubId,
  isOwn,
  canEdit,
  canDelete,
  canPin,
  onClose,
  onEdit,
  onForward,
  onDelete,
  media,
}: Props) {
  const toggleReaction = useMessageStore((s) => s.toggleReaction);
  const pinMessage = useMessageStore((s) => s.pinMessage);
  const unpinMessage = useMessageStore((s) => s.unpinMessage);
  const pinDMMessage = useDMStore((s) => s.pinMessage);
  const unpinDMMessage = useDMStore((s) => s.unpinMessage);
  const setReplyTo = useReplyDraftStore((s) => s.setReplyTo);
  const developerMode = useAppSettingsStore((s) => s.developerMode);

  const [reactionOpen, setReactionOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const plainText = message.content ?? '';
  const trimmedText = plainText.trim();
  const hasText = trimmedText.length > 0;
  const isPinned = Boolean(message.pinned || message.pinned_at);
  const imageFilename = (() => {
    if (media?.kind !== 'image') return 'image';
    try {
      const path = new URL(media.url, window.location.origin).pathname;
      const name = path.split('/').pop();
      return name && name.trim() ? name : 'image';
    } catch {
      return 'image';
    }
  })();

  const copyText = () => {
    void navigator.clipboard.writeText(plainText);
    onClose();
  };

  const copyId = () => {
    void navigator.clipboard.writeText(message.id);
    onClose();
  };

  const copyLink = () => {
    let url: string;
    if (isDM && message.conversation_id) {
      url = `${window.location.origin}/app/dms/${message.conversation_id}`;
    } else if (hubId && message.stream_id) {
      url = `${window.location.origin}/app/hubs/${hubId}/${message.stream_id}`;
    } else {
      void navigator.clipboard.writeText(message.id);
      onClose();
      return;
    }
    void navigator.clipboard.writeText(url);
    onClose();
  };

  const speak = () => {
    if (trimmedText && typeof speechSynthesis !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(trimmedText);
      speechSynthesis.speak(utterance);
    }
    onClose();
  };

  const copyImage = async () => {
    if (media?.kind !== 'image') return;

    try {
      const response = await fetch(media.url);
      const blob = await response.blob();
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || 'image/png']: blob }),
        ]);
      } else {
        await navigator.clipboard.writeText(media.url);
      }
    } catch {
      await navigator.clipboard.writeText(media.url);
    }

    onClose();
  };

  const saveImage = () => {
    if (media?.kind !== 'image') return;

    const link = document.createElement('a');
    link.href = media.url;
    link.download = imageFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    onClose();
  };

  const copyMediaLink = () => {
    if (!media) return;
    void navigator.clipboard.writeText(media.url);
    onClose();
  };

  const openMediaLink = () => {
    if (!media) return;
    window.open(media.url, '_blank', 'noopener');
    onClose();
  };

  const closeOnly = () => {
    onClose();
  };

  const handleDelete = () => {
    if (!canDelete) return;
    onClose();
    onDelete?.();
  };

  const handleTogglePin = () => {
    if (!canPin) return;
    if (isPinned) {
      if (isDM) {
        void unpinDMMessage(message.id);
      } else {
        void unpinMessage(message.id);
      }
    } else {
      if (isDM) {
        void pinDMMessage(message.id);
      } else {
        void pinMessage(message.id);
      }
    }
    onClose();
  };

  const handleForward = () => {
    onClose();
    onForward();
  };

  const addReaction = (emoji: string, emojiId?: string) => {
    if (!isDM) void toggleReaction(message.id, emoji, emojiId);
    onClose();
  };

  const row = (
    label: string,
    right: ReactNode,
    onClick?: () => void,
    opts?: { danger?: boolean; disabled?: boolean },
  ) => (
    <button
      type="button"
      disabled={opts?.disabled}
      onClick={onClick}
      className={`mx-1.5 flex w-[calc(100%-12px)] items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-40 disabled:pointer-events-none ${
        opts?.danger
          ? 'text-riftapp-danger hover:bg-riftapp-danger hover:text-white'
          : 'text-riftapp-text-muted hover:bg-riftapp-accent hover:text-white'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-1">{right}</span>
    </button>
  );

  const divider = <div className="rift-context-menu-divider" />;

  return (
    <MenuOverlay x={x} y={y} onClose={onClose}>
      <div className="rift-context-menu-shell">
        {!isDM && (
          <div className="mx-1.5 mb-1.5 flex items-center justify-center gap-1.5 px-2 py-1">
            {QUICK_ROW.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addReaction(emoji)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-riftapp-border/50 bg-riftapp-menu-hover text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-riftapp-accent hover:bg-riftapp-accent hover:text-white"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="relative" onMouseEnter={() => setReactionOpen(true)} onMouseLeave={() => setReactionOpen(false)}>
          <div
            className={`mx-1.5 flex w-[calc(100%-12px)] items-center justify-between gap-3 rounded-md px-3 py-1.5 text-sm font-medium ${
              reactionOpen ? 'bg-riftapp-accent text-white' : 'text-riftapp-text-muted hover:bg-riftapp-accent hover:text-white'
            } ${isDM ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <span>Add Reaction</span>
            <IconChevronRight />
          </div>
          {reactionOpen && !isDM && (
            <div className="absolute left-full top-0 z-20 pl-1" onMouseEnter={() => setReactionOpen(true)} onMouseLeave={() => setReactionOpen(false)}>
              <div className="rift-context-submenu-shell grid min-w-[208px] grid-cols-5 gap-1.5 p-2">
                {REACTION_PICK.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addReaction(emoji)}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-lg transition-colors hover:bg-riftapp-accent hover:text-white"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {divider}

        {isOwn && canEdit
          ? row('Edit Message', <IconPencil />, () => {
              onClose();
              onEdit();
            })
          : null}
        {row(
          'Reply',
          <IconReply />,
          () => {
            setReplyTo(message);
            onClose();
            setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-riftapp-message-input]')?.focus(), 0);
          },
        )}
        {row('Forward', <IconForward />, handleForward)}
        {row('Mark Unread', <IconUnread />, closeOnly)}
        {!isDM && canPin ? row(isPinned ? 'Unpin Message' : 'Pin Message', <IconPin />, handleTogglePin) : null}

        {divider}

        {media?.kind === 'image' ? (
          <>
            {row('Open Link', <IconExternalLink />, openMediaLink)}
            {row('Copy Link', <IconLink />, copyMediaLink)}
            {row('Save Image As...', <IconDownload />, saveImage)}
            {row('Copy Image', <IconImage />, () => {
              void copyImage();
            })}
            {divider}
          </>
        ) : null}

        {hasText ? row('Copy Text', <IconCopy />, copyText) : null}
        {row('Copy Message Link', <IconLink />, copyLink)}
        {hasText ? row('Speak Message', <IconSpeak />, speak) : null}

        {canDelete || developerMode || !isOwn ? divider : null}

        {canDelete
          ? row(
              'Delete Message',
              <IconTrash />,
              () => handleDelete(),
              { danger: true },
            )
          : null}

        {!isOwn ? row('Report Message', <IconFlag />, () => {
          onClose();
          setShowReport(true);
        }, { danger: true }) : null}

        {developerMode
          ? row(
              'Copy Message ID',
              <span className="rounded border border-[#3f4147] bg-[#1e1f22] px-1 py-0.5 font-mono text-[10px] font-semibold text-[#b5bac1]">ID</span>,
              copyId,
            )
          : null}
      </div>
      {showReport && (
        <ReportModal
          onClose={() => setShowReport(false)}
          reportedUserId={message.author?.id ?? message.author_id}
          messageId={message.id}
          hubId={hubId ?? undefined}
          messageContent={message.content}
        />
      )}
    </MenuOverlay>
  );
}
