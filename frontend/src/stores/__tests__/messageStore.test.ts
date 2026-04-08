import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../api/client', () => ({
  api: {
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    addReaction: vi.fn(),
  },
}));

vi.mock('../streamStore', () => ({
  useStreamStore: {
    getState: vi.fn(() => ({
      activeStreamId: 'stream-1',
      incrementUnread: vi.fn(),
    })),
  },
}));

import { useMessageStore } from '../messageStore';

describe('messageStore', () => {
  beforeEach(() => {
    useMessageStore.setState({ messages: [], messagesLoading: false, pinSystemEventsByStream: {} });
    vi.clearAllMocks();
  });

  it('starts with empty messages', () => {
    expect(useMessageStore.getState().messages).toEqual([]);
    expect(useMessageStore.getState().messagesLoading).toBe(false);
  });

  it('addMessage appends to messages for active stream', () => {
    const msg = { id: 'm1', stream_id: 'stream-1', content: 'Hello', author_id: 'u1', created_at: '' } as any;
    useMessageStore.getState().addMessage(msg);
    expect(useMessageStore.getState().messages).toHaveLength(1);
    expect(useMessageStore.getState().messages[0].id).toBe('m1');
  });

  it('addMessage does not duplicate', () => {
    const msg = { id: 'm1', stream_id: 'stream-1', content: 'Hello', author_id: 'u1', created_at: '' } as any;
    useMessageStore.getState().addMessage(msg);
    useMessageStore.getState().addMessage(msg);
    expect(useMessageStore.getState().messages).toHaveLength(1);
  });

  it('updateMessage replaces message', () => {
    const msg = { id: 'm1', content: 'Hello', stream_id: 'stream-1', author_id: 'u1', created_at: '' } as any;
    useMessageStore.setState({ messages: [msg] });

    const updated = { ...msg, content: 'Updated' };
    useMessageStore.getState().updateMessage(updated);
    expect(useMessageStore.getState().messages[0].content).toBe('Updated');
  });

  it('removeMessage removes by id', () => {
    const msg = { id: 'm1', content: 'Hello', stream_id: 'stream-1', author_id: 'u1', created_at: '' } as any;
    useMessageStore.setState({ messages: [msg] });

    useMessageStore.getState().removeMessage('m1');
    expect(useMessageStore.getState().messages).toHaveLength(0);
  });

  it('updateMessage stores a pin system event when a message becomes pinned', () => {
    const msg = {
      id: 'm1',
      content: 'Hello',
      stream_id: 'stream-1',
      author_id: 'u1',
      created_at: '2026-04-06T14:43:00.000Z',
      pinned_at: '2026-04-08T16:06:00.000Z',
      pinned_by_id: 'u2',
      pinned_by: { id: 'u2', username: 'lovely', display_name: 'lovely', status: 1, created_at: '', updated_at: '' },
    } as any;

    useMessageStore.setState({ messages: [msg] });
    useMessageStore.getState().updateMessage(msg);

    expect(useMessageStore.getState().pinSystemEventsByStream['stream-1']).toMatchObject([
      {
        originalMessageId: 'm1',
        pinnedAt: '2026-04-08T16:06:00.000Z',
        pinnedById: 'u2',
        targetDeleted: false,
      },
    ]);
  });

  it('keeps the pin system event and marks it unavailable when the source message is deleted', () => {
    useMessageStore.setState({
      messages: [],
      pinSystemEventsByStream: {
        'stream-1': [
          {
            id: 'pin:m1:2026-04-08T16:06:00.000Z',
            streamId: 'stream-1',
            originalMessageId: 'm1',
            pinnedAt: '2026-04-08T16:06:00.000Z',
            pinnedById: 'u2',
            targetDeleted: false,
          },
        ],
      },
    });

    useMessageStore.getState().removeMessage('m1');

    expect(useMessageStore.getState().pinSystemEventsByStream['stream-1'][0].targetDeleted).toBe(true);
  });

  it('clearMessages resets state', () => {
    useMessageStore.setState({ messages: [{ id: '1' } as any], messagesLoading: true });
    useMessageStore.getState().clearMessages();
    expect(useMessageStore.getState().messages).toEqual([]);
    expect(useMessageStore.getState().messagesLoading).toBe(false);
  });

  it('applyReactionAdd adds new reaction', () => {
    const msg = { id: 'm1', content: 'test', reactions: [] } as any;
    useMessageStore.setState({ messages: [msg] });

    useMessageStore.getState().applyReactionAdd('m1', 'user1', '👍');
    const reactions = useMessageStore.getState().messages[0].reactions!;
    expect(reactions).toHaveLength(1);
    expect(reactions[0].emoji).toBe('👍');
    expect(reactions[0].count).toBe(1);
    expect(reactions[0].users).toContain('user1');
  });

  it('applyReactionAdd increments existing reaction', () => {
    const msg = {
      id: 'm1',
      content: 'test',
      reactions: [{ emoji: '👍', count: 1, users: ['user1'] }],
    } as any;
    useMessageStore.setState({ messages: [msg] });

    useMessageStore.getState().applyReactionAdd('m1', 'user2', '👍');
    const reactions = useMessageStore.getState().messages[0].reactions!;
    expect(reactions[0].count).toBe(2);
    expect(reactions[0].users).toContain('user2');
  });

  it('applyReactionRemove removes user from reaction', () => {
    const msg = {
      id: 'm1',
      content: 'test',
      reactions: [{ emoji: '👍', count: 2, users: ['user1', 'user2'] }],
    } as any;
    useMessageStore.setState({ messages: [msg] });

    useMessageStore.getState().applyReactionRemove('m1', 'user1', '👍');
    const reactions = useMessageStore.getState().messages[0].reactions!;
    expect(reactions[0].count).toBe(1);
    expect(reactions[0].users).not.toContain('user1');
  });

  it('applyReactionRemove removes reaction when empty', () => {
    const msg = {
      id: 'm1',
      content: 'test',
      reactions: [{ emoji: '👍', count: 1, users: ['user1'] }],
    } as any;
    useMessageStore.setState({ messages: [msg] });

    useMessageStore.getState().applyReactionRemove('m1', 'user1', '👍');
    const reactions = useMessageStore.getState().messages[0].reactions!;
    expect(reactions).toHaveLength(0);
  });

  it('applyReactionAdd is no-op for DM', () => {
    const msg = { id: 'm1', content: 'test', reactions: [] } as any;
    useMessageStore.setState({ messages: [msg] });

    useMessageStore.getState().applyReactionAdd('m1', 'user1', '👍', true);
    expect(useMessageStore.getState().messages[0].reactions).toHaveLength(0);
  });
});
