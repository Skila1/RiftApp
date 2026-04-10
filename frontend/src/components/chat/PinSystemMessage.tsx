import type { User } from '../../types';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { formatShortTime } from '../../utils/dateTime';

function formatSystemEventTime(timestamp: string) {
  return formatShortTime(timestamp);
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
    <div className="-mx-4 px-4 py-0.5">
      <div className="flex min-w-0 items-center gap-2 pl-[52px] text-[12px] leading-4 text-riftapp-text-dim/70">
        {messageAvailable ? (
          <button
            type="button"
            onClick={onOpenMessage}
            aria-label="Open pinned message"
            title="Open pinned message"
            className="shrink-0 text-riftapp-text-dim/55 transition-colors hover:text-riftapp-text-dim/85"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m14 9 7 7" />
              <path d="m4 20 6-6" />
              <path d="m8 16 8-8" />
              <path d="m13 4 7 7" />
              <path d="m10 7 7 7" />
            </svg>
          </button>
        ) : (
          <span className="shrink-0 text-riftapp-text-dim/40" title="Pinned message unavailable">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m14 9 7 7" />
              <path d="m4 20 6-6" />
              <path d="m8 16 8-8" />
              <path d="m13 4 7 7" />
              <path d="m10 7 7 7" />
            </svg>
          </span>
        )}
        <div className="min-w-0 overflow-hidden whitespace-nowrap">
          {user ? (
            <button
              type="button"
              onClick={(event) => openProfile(user, (event.currentTarget as HTMLElement).getBoundingClientRect())}
              className="inline-block max-w-[180px] truncate align-baseline font-medium text-riftapp-text-dim/90 transition-colors hover:text-riftapp-text hover:underline"
            >
              {username}
            </button>
          ) : (
            <span className="inline-block max-w-[180px] truncate align-baseline font-medium text-riftapp-text-dim/90">
              {username}
            </span>
          )}
          <span className="text-riftapp-text-dim/70"> pinned a message to this channel. See all </span>
          <button
            type="button"
            onClick={onOpenPinnedMessages}
            className="inline text-riftapp-text-dim/85 transition-colors hover:text-riftapp-text hover:underline"
          >
            pinned messages
          </button>
        </div>
        <span className="shrink-0 text-[11px] text-riftapp-text-dim/50">{formatSystemEventTime(timestamp)}</span>
      </div>
    </div>
  );
}