import type { Message } from '../types';

export const MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED = 'conversation_call_started';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED = 'conversation_video_call_started';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED = 'conversation_call_missed';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED = 'conversation_video_call_missed';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED = 'conversation_call_ended';
export const MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED = 'conversation_video_call_ended';

export function isConversationCallSystemType(systemType?: Message['system_type'] | null) {
  return systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED;
}

export function isConversationCallSystemMessage(message?: Pick<Message, 'system_type'> | null) {
  return isConversationCallSystemType(message?.system_type);
}

export function isConversationVideoCallSystemType(systemType?: Message['system_type'] | null) {
  return systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED;
}

export function shouldShowConversationCallSystemMessageAuthor(systemType?: Message['system_type'] | null) {
  return systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED
    || systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED;
}

export function getConversationCallSystemMessagePreview(systemType?: Message['system_type'] | null) {
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
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED) {
    return 'Video call ended';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED) {
    return 'Call ended';
  }
  return null;
}

export function getConversationCallSystemMessageSuffix(systemType?: Message['system_type'] | null) {
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
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED) {
    return 'ended the video call.';
  }
  if (systemType === MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED) {
    return 'ended the call.';
  }
  return null;
}