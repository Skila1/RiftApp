import { describe, expect, it } from 'vitest';

import type { Conversation, DMCallRingEnd } from '../../types';
import { getConversationCallStatus } from '../dmCallStatus';

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    created_at: '2026-04-08T12:00:00.000Z',
    updated_at: '2026-04-08T12:00:00.000Z',
    is_group: true,
    members: [
      { id: 'user-1', username: 'alpha', display_name: 'Alpha', status: 1, created_at: '', updated_at: '' },
      { id: 'user-2', username: 'bravo', display_name: 'Bravo', status: 1, created_at: '', updated_at: '' },
      { id: 'user-3', username: 'charlie', display_name: 'Charlie', status: 1, created_at: '', updated_at: '' },
      { id: 'user-4', username: 'delta', display_name: 'Delta', status: 1, created_at: '', updated_at: '' },
    ],
    ...overrides,
  };
}

function createOutcome(overrides: Partial<DMCallRingEnd> = {}): DMCallRingEnd {
  return {
    conversation_id: 'conv-1',
    reason: 'timeout',
    initiator_id: 'user-1',
    mode: 'audio',
    started_at: '2026-04-08T12:00:00.000Z',
    ended_at: '2026-04-08T12:05:00.000Z',
    ...overrides,
  };
}

describe('dmCallStatus', () => {
  it('describes richer group ringing state for the initiator', () => {
    const status = getConversationCallStatus({
      conversation: createConversation(),
      currentUserId: 'user-1',
      ring: {
        conversation_id: 'conv-1',
        initiator_id: 'user-1',
        mode: 'video',
        started_at: '2026-04-08T12:00:00.000Z',
        target_user_ids: ['user-2', 'user-3', 'user-4'],
        declined_user_ids: ['user-4'],
      },
      voiceMemberIds: ['user-1', 'user-2'],
    });

    expect(status).toEqual({
      label: 'Bravo joined • Ringing Charlie • Delta declined',
      tone: 'warning',
      indicator: 'ringing',
    });
  });

  it('shows a missed call state for the recipient who did not answer', () => {
    const status = getConversationCallStatus({
      conversation: createConversation({ is_group: false }),
      currentUserId: 'user-2',
      outcome: createOutcome({
        reason: 'timeout',
        mode: 'video',
        missed_user_ids: ['user-2'],
      }),
      now: Date.parse('2026-04-08T12:06:00.000Z'),
    });

    expect(status).toEqual({
      label: 'Missed Video Call',
      tone: 'danger',
      indicator: 'ended',
    });
  });

  it('shows an active state when voice members are already in the conversation call', () => {
    const status = getConversationCallStatus({
      conversation: createConversation(),
      currentUserId: 'user-1',
      voiceMemberIds: ['user-1', 'user-2'],
    });

    expect(status).toEqual({
      label: '2 In Call',
      tone: 'success',
      indicator: 'active',
    });
  });

  it('shows a declined state for the initiator when the group declines', () => {
    const status = getConversationCallStatus({
      conversation: createConversation(),
      currentUserId: 'user-1',
      outcome: createOutcome({
        reason: 'declined',
        declined_user_ids: ['user-2', 'user-3'],
      }),
      now: Date.parse('2026-04-08T12:06:00.000Z'),
    });

    expect(status).toEqual({
      label: '2 declined',
      tone: 'muted',
      indicator: 'ended',
    });
  });

  it('shows an active answered state before voice membership hydrates', () => {
    const status = getConversationCallStatus({
      conversation: createConversation(),
      currentUserId: 'user-1',
      outcome: createOutcome({
        reason: 'answered',
        mode: 'video',
        answered_by_user_id: 'user-2',
      }),
      now: Date.parse('2026-04-08T12:06:00.000Z'),
    });

    expect(status).toEqual({
      label: 'Bravo answered',
      tone: 'success',
      indicator: 'active',
    });
  });
});