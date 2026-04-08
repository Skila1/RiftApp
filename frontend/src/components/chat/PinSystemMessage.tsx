import type { User } from '../../types';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';

function formatSystemEventTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PinSystemMessage({
  timestamp,
  user,
  username,
  messageAvailable,
  onOpenMessage,
  onOpenPinnedMessages,
}: {
  timestamp: string;
  user?: User;
  username: string;
  messageAvailable: boolean;
  onOpenMessage: () => void;
  onOpenPinnedMessages: () => void;
}) {
  const openProfile = useProfilePopoverStore((state) => state.open);

  return (
    <div className="group my-2 flex items-center justify-center px-2 text-center">
      <div className="inline-flex max-w-[780px] items-center gap-2 text-[12px] leading-5 text-riftapp-text-dim/80 opacity-80 transition-opacity duration-150 group-hover:opacity-100">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-riftapp-text-dim/70"
          aria-hidden
        >
          <path d="m14 9 7 7" />
          <path d="m4 20 6-6" />
          <path d="m8 16 8-8" />
          <path d="m13 4 7 7" />
          <path d="m10 7 7 7" />
        </svg>
        <div className="min-w-0 flex-1 whitespace-normal break-words">
          {user ? (
            <button
              type="button"
              onClick={(event) => openProfile(user, (event.currentTarget as HTMLElement).getBoundingClientRect())}
              className="font-semibold text-riftapp-text hover:underline"
            >
              {username}
            </button>
          ) : (
            <span className="font-semibold text-riftapp-text">{username}</span>
          )}
          <span> pinned </span>
          {messageAvailable ? (
            <button
              type="button"
              onClick={onOpenMessage}
              className="text-riftapp-text hover:underline"
            >
              a message
            </button>
          ) : (
            <span className="text-riftapp-text">
              a message <span className="text-riftapp-text-dim/80">(no longer available)</span>
            </span>
          )}
          <span> to this channel. See all </span>
          <button
            type="button"
            onClick={onOpenPinnedMessages}
            className="font-semibold text-riftapp-text hover:underline"
          >
            pinned messages
          </button>
        </div>
        <span className="shrink-0 text-[11px] text-riftapp-text-dim/65">{formatSystemEventTime(timestamp)}</span>
      </div>
    </div>
  );
}