import type { Message } from '../types';

type ReplyPreviewTone = 'default' | 'attachment' | 'missing';

export interface ReplyPreviewMeta {
  text: string;
  tone: ReplyPreviewTone;
}

const INLINE_MEDIA_ONLY_RE = /^(?:(?:\/api)?\/s3\/\S+|https?:\/\/\S+(?:tenor\.(?:com|googleapis\.com)\/\S*|\.(?:gif|png|jpe?g|webp|mp4)(?:\?.*)?))$/i;

function isInlineMediaOnly(content: string) {
  const trimmed = content.trim();
  if (!trimmed || trimmed.includes('\n') || /\s/.test(trimmed)) {
    return false;
  }

  return INLINE_MEDIA_ONLY_RE.test(trimmed);
}

export function getReplyAuthorLabel(message?: Message) {
  return message?.author?.display_name || message?.author?.username || 'unknown';
}

export function getReplyPreviewMeta(message?: Message): ReplyPreviewMeta {
  if (!message) {
    return {
      text: 'message unavailable',
      tone: 'missing',
    };
  }

  const content = message.content.trim();
  if (content && !isInlineMediaOnly(content)) {
    return {
      text: content.split('\n')[0],
      tone: 'default',
    };
  }

  if (message.attachments?.length || isInlineMediaOnly(content)) {
    return {
      text: 'sent an attachment',
      tone: 'attachment',
    };
  }

  return {
    text: 'message unavailable',
    tone: 'missing',
  };
}