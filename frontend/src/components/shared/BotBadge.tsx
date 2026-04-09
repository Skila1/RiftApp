export default function BotBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-1 py-[1px] rounded text-[10px] font-bold uppercase leading-none tracking-wide bg-indigo-500/90 text-white select-none ${className}`}
    >
      APP
    </span>
  );
}
