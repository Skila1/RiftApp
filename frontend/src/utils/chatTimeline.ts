import type { PinSystemEvent } from '../stores/messageStore';
import type { Message } from '../types';

export type ChatTimelineItem =
  | {
      kind: 'message';
      id: string;
      timestamp: string;
      message: Message;
    }
  | {
      kind: 'pin';
      id: string;
      timestamp: string;
      event: PinSystemEvent;
    };

export function buildChatTimeline(messages: Message[], pinEvents: PinSystemEvent[]): ChatTimelineItem[] {
  const items: ChatTimelineItem[] = [
    ...messages.map((message) => ({
      kind: 'message' as const,
      id: message.id,
      timestamp: message.created_at,
      message,
    })),
    ...pinEvents.map((event) => ({
      kind: 'pin' as const,
      id: event.id,
      timestamp: event.pinnedAt,
      event,
    })),
  ];

  items.sort((left, right) => {
    const diff = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
    if (diff !== 0) {
      return diff;
    }

    if (left.kind !== right.kind) {
      return left.kind === 'message' ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });

  return items;
}