import { describe, expect, it } from 'vitest';

import {
  getConversationCallSystemMessagePreview,
  getConversationCallSystemMessageSuffix,
  isConversationCallSystemMessage,
  isConversationVideoCallSystemType,
  MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED,
  MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED,
  MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED,
  MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED,
  MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED,
  MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED,
  shouldShowConversationCallSystemMessageAuthor,
} from '../messageSystem';

describe('messageSystem', () => {
  it('recognizes conversation call system messages', () => {
    expect(isConversationCallSystemMessage({ system_type: MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED })).toBe(true);
    expect(isConversationCallSystemMessage({ system_type: MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED })).toBe(true);
    expect(isConversationCallSystemMessage({ system_type: MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED })).toBe(true);
    expect(isConversationCallSystemMessage({ system_type: MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED })).toBe(true);
    expect(isConversationCallSystemMessage({ system_type: undefined })).toBe(false);
  });

  it('formats conversation call previews and suffixes', () => {
    expect(getConversationCallSystemMessagePreview(MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED)).toBe('Started a call');
    expect(getConversationCallSystemMessagePreview(MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED)).toBe('Started a video call');
    expect(getConversationCallSystemMessagePreview(MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED)).toBe('Missed a call');
    expect(getConversationCallSystemMessagePreview(MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED)).toBe('Video call ended');
    expect(getConversationCallSystemMessageSuffix(MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED)).toBe('started a call.');
    expect(getConversationCallSystemMessageSuffix(MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED)).toBe('started a video call.');
    expect(getConversationCallSystemMessageSuffix(MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_ENDED)).toBe('ended the call.');
    expect(getConversationCallSystemMessageSuffix(MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED)).toBe('missed a video call.');
  });

  it('distinguishes video rows and author display rules', () => {
    expect(isConversationVideoCallSystemType(MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_STARTED)).toBe(true);
    expect(isConversationVideoCallSystemType(MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_MISSED)).toBe(true);
    expect(isConversationVideoCallSystemType(MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED)).toBe(false);

    expect(shouldShowConversationCallSystemMessageAuthor(MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_STARTED)).toBe(true);
    expect(shouldShowConversationCallSystemMessageAuthor(MESSAGE_SYSTEM_TYPE_CONVERSATION_VIDEO_CALL_ENDED)).toBe(true);
    expect(shouldShowConversationCallSystemMessageAuthor(MESSAGE_SYSTEM_TYPE_CONVERSATION_CALL_MISSED)).toBe(false);
  });
});