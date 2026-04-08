import { describe, expect, it } from 'vitest';

import type { PinSystemEvent } from '../../stores/messageStore';
import type { Message } from '../../types';
import { buildChatTimeline } from '../chatTimeline';

function message({ id, created_at, ...overrides }: Partial<Message> & Pick<Message, 'id' | 'created_at'>): Message {
  return {
    id,
    author_id: 'author-1',
    author_type: 'user',
    content: 'hello',
    created_at,
    pinned: false,
    ...overrides,
  };
}

function pinEvent({
  id,
  pinnedAt,
  streamId,
  originalMessageId,
  ...overrides
}: Partial<PinSystemEvent> & Pick<PinSystemEvent, 'id' | 'pinnedAt' | 'streamId' | 'originalMessageId'>): PinSystemEvent {
  return {
    id,
    streamId,
    originalMessageId,
    pinnedAt,
    pinnedById: null,
    pinnedBy: undefined,
    targetDeleted: false,
    ...overrides,
  };
}

describe('chatTimeline', () => {
  it('sorts pin events by pinned time within the message flow', () => {
    const items = buildChatTimeline(
      [
        message({ id: 'message-1', created_at: '2026-04-06T14:43:00.000Z' }),
        message({ id: 'message-2', created_at: '2026-04-08T16:10:00.000Z' }),
      ],
      [
        pinEvent({
          id: 'pin:message-1:2026-04-08T16:06:00.000Z',
          streamId: 'stream-1',
          originalMessageId: 'message-1',
          pinnedAt: '2026-04-08T16:06:00.000Z',
        }),
      ],
    );

    expect(items.map((item) => item.id)).toEqual([
      'message-1',
      'pin:message-1:2026-04-08T16:06:00.000Z',
      'message-2',
    ]);
  });

  it('keeps messages ahead of pin events when timestamps match', () => {
    const items = buildChatTimeline(
      [message({ id: 'message-1', created_at: '2026-04-08T16:06:00.000Z' })],
      [
        pinEvent({
          id: 'pin:message-2:2026-04-08T16:06:00.000Z',
          streamId: 'stream-1',
          originalMessageId: 'message-2',
          pinnedAt: '2026-04-08T16:06:00.000Z',
        }),
      ],
    );

    expect(items.map((item) => item.kind)).toEqual(['message', 'pin']);
  });
});