import type { Message } from '../types';

export const MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED = 'conversation_call_started';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED = 'conversation_video_call_started';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED = 'conversation_call_missed';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED = 'conversation_video_call_missed';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_DECLINED = 'conversation_call_declined';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_DECLINED = 'conversation_video_call_declined';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED = 'conversation_call_ended';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED = 'conversation_video_call_ended';

function normalizeConversationCallSystemContent(content?: string | null) {
  const trimmed = content?.trim();
  return trimmed ? trimmed : null;
}

function buildEndedCallSuffix(systemType: Message['system_type'] | null | undefined, content?: string | null) {
  const trimmedContent = normalizeConversationCallSystemContent(content);
  const baseSuffix = systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED
    ? 'ended the video call.'
    : 'ended the call.';

  if (!trimmedContent) {
    return baseSuffix;
  }

  const expectedPrefix = systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED
    ? 'video call ended'
    : 'call ended';
  const normalizedContent = trimmedContent.replace(/[.]+$/, '');
  if (!normalizedContent.toLowerCase().startsWith(expectedPrefix)) {
    return baseSuffix;
  }

  const remainder = normalizedContent.slice(expectedPrefix.length).trim();
  if (!remainder) {
    return baseSuffix;
  }

  return `${baseSuffix.slice(0, -1)} ${remainder}.`;
}

export function isConversationCallSystemType(systemType?: Message['system_type'] | null) {
  return systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_DECLINED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_DECLINED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED;
}

export function isConversationCallSystemMessage(message?: Pick<Message, 'system_type'> | null) {
  return isConversationCallSystemType(message?.system_type);
}

export function isConversationVideoCallSystemType(systemType?: Message['system_type'] | null) {
  return systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_DECLINED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED;
}

export function shouldShowConversationCallSystemMessageAuthor(systemType?: Message['system_type'] | null) {
  return systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED;
}

export function getConversationCallSystemMessagePreview(systemType?: Message['system_type'] | null, content?: string | null) {
  const trimmedContent = normalizeConversationCallSystemContent(content);
  if (trimmedContent) {
    return trimmedContent;
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED) {
    return 'Started a video call';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED) {
    return 'Started a call';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED) {
    return 'Missed a video call';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED) {
    return 'Missed a call';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_DECLINED) {
    return 'Video call declined';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_DECLINED) {
    return 'Call declined';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED) {
    return 'Video call ended';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED) {
    return 'Call ended';
  }
  return null;
}

export function getConversationCallSystemMessageSuffix(systemType?: Message['system_type'] | null, content?: string | null) {
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED) {
    return 'started a video call.';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED) {
    return 'started a call.';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED) {
    return 'missed a video call.';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED) {
    return 'missed a call.';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_DECLINED) {
    return 'declined the video call.';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_DECLINED) {
    return 'declined the call.';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED) {
    return buildEndedCallSuffix(systemType, content);
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED) {
    return buildEndedCallSuffix(systemType, content);
  }
  return null;
}