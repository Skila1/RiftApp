import type { Message } from '../../types';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { formatShortTime } from '../../utils/dateTime';
import { getUserLabel } from '../../utils/conversations';
import {
  getConversationCallSystemMessagePreview,
  getConversationCallSystemMessageSuffix,
  isConversationVideoCallSystemType,
  shouldShowConversationCallSystemMessageAuthor,
} from '../../utils/messageSystem';

function CallIcon({ video = false }: { video?: boolean }) {
  if (video) {
    return (
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
        <rect x="3" y="6" width="13" height="12" rx="2" ry="2" />
        <path d="m16 10 5-3v10l-5-3" />
      </svg>
    );
  }

  return (
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
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.35 1.78.68 2.61a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6.27 6.27l1.29-1.29a2 2 0 0 1 2.11-.45c.83.33 1.71.56 2.61.68A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

export default function ConversationCallSystemMessage({
  message,
}: {
  message: Message;
}) {
  const openProfile = useProfilePopoverStore((state) => state.open);
  const author = message.author;
  const authorLabel = getUserLabel(author);
  const preview = getConversationCallSystemMessagePreview(message.system_type, message.content);
  const suffix = getConversationCallSystemMessageSuffix(message.system_type, message.content);
  const showAuthor = shouldShowConversationCallSystemMessageAuthor(message.system_type) && Boolean(author);

  if (!preview) {
    return null;
  }

  return (
    <div className="-mx-4 px-4 py-0.5">
      <div className="flex min-w-0 items-center gap-2 pl-[52px] text-[12px] leading-4 text-riftapp-text-dim/70">
        <span className="shrink-0 text-riftapp-text-dim/55">
          <CallIcon video={isConversationVideoCallSystemType(message.system_type)} />
        </span>
        <div className="min-w-0 overflow-hidden whitespace-nowrap">
          {showAuthor && suffix ? (
            <>
              <button
                type="button"
                onClick={(event) => openProfile(author as NonNullable<typeof author>, (event.currentTarget as HTMLElement).getBoundingClientRect())}
                className="inline-block max-w-[180px] truncate align-baseline font-medium text-riftapp-text-dim/90 transition-colors hover:text-riftapp-text hover:underline"
              >
                {authorLabel}
              </button>
              <span className="text-riftapp-text-dim/70"> {suffix}</span>
            </>
          ) : (
            <span className="inline-block max-w-[320px] truncate align-baseline font-medium text-riftapp-text-dim/90">
              {preview}
            </span>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-riftapp-text-dim/50">{formatShortTime(message.created_at)}</span>
      </div>
    </div>
  );
}