import { describe, expect, it } from 'vitest';

import { getReplyAuthorLabel, getReplyPreviewMeta } from '../replyPreview';
import type { Message } from '../../types';

function replyMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'reply-1',
    author_id: 'user-1',
    content: '',
    created_at: '2026-04-08T12:00:00.000Z',
    pinned: false,
    ...overrides,
  };
}

describe('replyPreview', () => {
  it('uses the first content line for regular replies', () => {
    expect(
      getReplyPreviewMeta(
        replyMessage({ content: 'first line\nsecond line' }),
      ),
    ).toEqual({ text: 'first line', tone: 'default' });
  });

  it('uses inline attachment wording for media-only replies', () => {
    expect(
      getReplyPreviewMeta(
        replyMessage({
          attachments: [{
            id: 'attachment-1',
            message_id: 'reply-1',
            filename: 'image.png',
            url: '/uploads/image.png',
            content_type: 'image/png',
            size_bytes: 12,
          }],
        }),
      ),
    ).toEqual({ text: 'sent an attachment', tone: 'attachment' });
  });

  it('uses inline missing wording when the source message is unavailable', () => {
    expect(getReplyPreviewMeta(undefined)).toEqual({ text: 'message unavailable', tone: 'missing' });
  });

  it('falls back to unknown when the reply author is missing', () => {
    expect(getReplyAuthorLabel(undefined)).toBe('unknown');
  });
});