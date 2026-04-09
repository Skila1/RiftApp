import { describe, expect, it } from 'vitest';

import { resolveVoiceParticipantSpeakingState } from '../voiceSpeakingState';

describe('voiceSpeakingState', () => {
  it('uses LiveKit speaking state when no explicit signal exists', () => {
    expect(resolveVoiceParticipantSpeakingState({
      transientSpeaking: false,
      hasExplicitSpeakingSignal: false,
      explicitSpeakingSignal: false,
      liveKitSpeaking: true,
      isLocalParticipant: false,
    })).toBe(true);
  });

  it('keeps transient speaking pulses active', () => {
    expect(resolveVoiceParticipantSpeakingState({
      transientSpeaking: true,
      hasExplicitSpeakingSignal: true,
      explicitSpeakingSignal: false,
      liveKitSpeaking: false,
      isLocalParticipant: false,
    })).toBe(true);
  });

  it('treats an explicit true signal as authoritative', () => {
    expect(resolveVoiceParticipantSpeakingState({
      transientSpeaking: false,
      hasExplicitSpeakingSignal: true,
      explicitSpeakingSignal: true,
      liveKitSpeaking: false,
      isLocalParticipant: false,
    })).toBe(true);
  });

  it('lets an explicit false suppress delayed local LiveKit speaking state', () => {
    expect(resolveVoiceParticipantSpeakingState({
      transientSpeaking: false,
      hasExplicitSpeakingSignal: true,
      explicitSpeakingSignal: false,
      liveKitSpeaking: true,
      isLocalParticipant: true,
    })).toBe(false);
  });

  it('allows remote LiveKit speaking state to recover if a false signal lags behind', () => {
    expect(resolveVoiceParticipantSpeakingState({
      transientSpeaking: false,
      hasExplicitSpeakingSignal: true,
      explicitSpeakingSignal: false,
      liveKitSpeaking: true,
      isLocalParticipant: false,
    })).toBe(true);
  });
});