import { useAppStore } from '../../stores/app';

const statusColors: Record<number, string> = {
  0: 'bg-gray-500',       // offline
  1: 'bg-emerald-500',    // online
  2: 'bg-yellow-500',     // idle
  3: 'bg-rose-500',       // dnd
};

const statusLabels: Record<number, string> = {
  0: 'Offline',
  1: 'Online',
  2: 'Idle',
  3: 'Do Not Disturb',
};

export function statusColor(status: number) {
  return statusColors[status] ?? statusColors[0];
}

export function statusLabel(status: number) {
  return statusLabels[status] ?? statusLabels[0];
}

/** Small colored dot that reads live presence from the store. */
export default function StatusDot({
  userId,
  fallbackStatus,
  size = 'md',
  className = '',
}: {
  userId: string;
  fallbackStatus?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const liveStatus = useAppStore((s) => s.presence[userId]);
  const status = liveStatus ?? fallbackStatus ?? 0;

  const sizeClass = size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5';

  return (
    <div
      className={`${sizeClass} rounded-full flex-shrink-0 ${statusColor(status)} ${className}`}
      title={statusLabel(status)}
    />
  );
}
