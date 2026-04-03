import { usePresenceStore } from '../../stores/presenceStore';

interface TypingIndicatorProps {
  streamId: string;
}

export default function TypingIndicator({ streamId }: TypingIndicatorProps) {
  const typers = usePresenceStore((s) => s.typers[streamId]);
  const hubMembers = usePresenceStore((s) => s.hubMembers);

  if (!typers || typers.size === 0) return null;

  const names = Array.from(typers).map(
    (id) => hubMembers[id]?.display_name || hubMembers[id]?.username || 'Someone'
  );
  let text: string;
  if (names.length === 1) {
    text = `${names[0]} is typing`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing`;
  }

  return (
    <div className="h-6 px-4 flex items-center gap-1.5 text-xs text-riptide-text-muted flex-shrink-0 animate-fade-in">
      <span className="flex gap-[3px] items-center">
        <span className="w-1.5 h-1.5 rounded-full bg-riptide-accent animate-typing-dot" />
        <span className="w-1.5 h-1.5 rounded-full bg-riptide-accent animate-typing-dot [animation-delay:0.2s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-riptide-accent animate-typing-dot [animation-delay:0.4s]" />
      </span>
      <span>{text}</span>
    </div>
  );
}
