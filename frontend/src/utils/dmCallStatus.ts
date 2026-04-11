import type { Conversation, DMCallRing, DMCallRingEnd } from '../types';
import { getUserLabel, isGroupConversation } from './conversations';

export interface ConversationCallStatus {
  label: string;
  tone: 'warning' | 'success' | 'danger' | 'muted';
  indicator: 'ringing' | 'active' | 'ended';
}

type ConversationCallStatusInput = {
  conversation?: Conversation | null;
  currentUserId?: string | null;
  ring?: DMCallRing | null;
  voiceMemberIds?: string[];
  outcome?: DMCallRingEnd | null;
  now?: number;
};

const OUTCOME_TTL_MS = 10 * 60 * 1000;

function uniqueUserIds(userIds?: string[] | null) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }
  return [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
}

function participantLabel(conversation: Conversation | null | undefined, userId: string) {
  const member = conversation?.members?.find((entry) => entry.id === userId);
  return member ? getUserLabel(member) : null;
}

function describeParticipants(conversation: Conversation | null | undefined, userIds: string[], singularNoun = 'member') {
  if (userIds.length === 0) {
    return singularNoun;
  }
  if (userIds.length === 1) {
    return participantLabel(conversation, userIds[0]) ?? `1 ${singularNoun}`;
  }
  return `${userIds.length} ${singularNoun}s`;
}

function isFreshOutcome(outcome?: DMCallRingEnd | null, now = Date.now()) {
  if (!outcome?.ended_at) {
    return false;
  }
  const endedAt = Date.parse(outcome.ended_at);
  return Number.isFinite(endedAt) && now - endedAt <= OUTCOME_TTL_MS;
}

export function getConversationCallStatus({
  conversation,
  currentUserId,
  ring,
  voiceMemberIds,
  outcome,
  now = Date.now(),
}: ConversationCallStatusInput): ConversationCallStatus | null {
  const isGroup = isGroupConversation(conversation, currentUserId);
  const activeVoiceMembers = uniqueUserIds(voiceMemberIds);

  if (ring) {
    const isInitiator = Boolean(currentUserId && ring.initiator_id === currentUserId);
    const targetUserIds = uniqueUserIds(ring.target_user_ids);
    const declinedUserIds = uniqueUserIds(ring.declined_user_ids);
    const activeVoiceMemberSet = new Set(activeVoiceMembers);
    const declinedUserSet = new Set(declinedUserIds);
    const joinedTargetUserIds = targetUserIds.filter((userId) => activeVoiceMemberSet.has(userId));
    const pendingTargetUserIds = targetUserIds.filter((userId) => !activeVoiceMemberSet.has(userId) && !declinedUserSet.has(userId));

    if (isInitiator) {
      if (!isGroup) {
        return {
          label: `Ringing ${ring.mode === 'video' ? 'Video' : 'Voice'} Call`,
          tone: 'warning',
          indicator: 'ringing',
        };
      }

      const parts: string[] = [];
      if (joinedTargetUserIds.length > 0) {
        parts.push(`${describeParticipants(conversation, joinedTargetUserIds)} joined`);
      }
      if (pendingTargetUserIds.length > 0) {
        parts.push(`Ringing ${describeParticipants(conversation, pendingTargetUserIds)}`);
      }
      if (declinedUserIds.length > 0) {
        parts.push(`${describeParticipants(conversation, declinedUserIds)} declined`);
      }

      return {
        label: parts.join(' • ') || `Ringing ${ring.mode === 'video' ? 'Video' : 'Voice'} Call`,
        tone: 'warning',
        indicator: 'ringing',
      };
    }

    if (currentUserId && declinedUserSet.has(currentUserId)) {
      if (!isGroup || pendingTargetUserIds.length === 0) {
        return {
          label: `Declined ${ring.mode === 'video' ? 'Video' : 'Voice'} Call`,
          tone: 'muted',
          indicator: 'ended',
        };
      }
      return {
        label: `You declined • ${pendingTargetUserIds.length} still ringing`,
        tone: 'muted',
        indicator: 'ended',
      };
    }

    if (!isGroup) {
      return {
        label: `Incoming ${ring.mode === 'video' ? 'Video' : 'Voice'} Call`,
        tone: 'warning',
        indicator: 'ringing',
      };
    }

    const parts = [`Incoming ${ring.mode === 'video' ? 'Video' : 'Voice'} Call`];
    const otherJoinedUserIds = joinedTargetUserIds.filter((userId) => userId !== currentUserId);
    const otherDeclinedUserIds = declinedUserIds.filter((userId) => userId !== currentUserId);
    if (otherJoinedUserIds.length > 0) {
      parts.push(`${describeParticipants(conversation, otherJoinedUserIds)} in call`);
    }
    if (otherDeclinedUserIds.length > 0) {
      parts.push(`${describeParticipants(conversation, otherDeclinedUserIds)} declined`);
    }
    return {
      label: parts.join(' • '),
      tone: 'warning',
      indicator: 'ringing',
    };
  }

  if (isFreshOutcome(outcome, now) && outcome?.reason === 'timeout') {
    const modeLabel = outcome.mode === 'video' ? 'Video' : 'Voice';
    const missedUserIds = uniqueUserIds(outcome.missed_user_ids);
    const isInitiator = Boolean(currentUserId && outcome.initiator_id === currentUserId);
    const isAloneInitiator = Boolean(
      isInitiator
      && currentUserId
      && activeVoiceMembers.length === 1
      && activeVoiceMembers[0] === currentUserId,
    );

    if (isAloneInitiator && !isGroup) {
      return {
        label: 'No answer',
        tone: 'danger',
        indicator: 'ended',
      };
    }

    if (currentUserId && missedUserIds.includes(currentUserId)) {
      return {
        label: `Missed ${modeLabel} Call`,
        tone: 'danger',
        indicator: 'ended',
      };
    }

    if (isInitiator && missedUserIds.length > 0) {
      return {
        label: missedUserIds.length === 1
          ? `${describeParticipants(conversation, missedUserIds, 'member')} missed your call`
          : `${missedUserIds.length} missed your call`,
        tone: 'danger',
        indicator: 'ended',
      };
    }

    return {
      label: !isGroup ? 'No answer' : `Missed ${modeLabel} Call`,
      tone: 'danger',
      indicator: 'ended',
    };
  }

  if (activeVoiceMembers.length > 0) {
    return {
      label: activeVoiceMembers.length === 1 ? 'In Call' : `${activeVoiceMembers.length} In Call`,
      tone: 'success',
      indicator: 'active',
    };
  }

  if (!isFreshOutcome(outcome, now)) {
    return null;
  }

  const modeLabel = outcome?.mode === 'video' ? 'Video' : 'Voice';
  const declinedUserIds = uniqueUserIds(outcome?.declined_user_ids);
  const isInitiator = Boolean(currentUserId && outcome?.initiator_id === currentUserId);

  switch (outcome?.reason) {
    case 'answered': {
      const answeredByUserId = outcome?.answered_by_user_id;
      if (isInitiator && answeredByUserId) {
        return {
          label: `${participantLabel(conversation, answeredByUserId) ?? modeLabel} answered`,
          tone: 'success',
          indicator: 'active',
        };
      }
      if (currentUserId && answeredByUserId === currentUserId) {
        return {
          label: `Joining ${modeLabel} Call`,
          tone: 'success',
          indicator: 'active',
        };
      }
      return {
        label: `${modeLabel} Call answered`,
        tone: 'success',
        indicator: 'active',
      };
    }
    case 'declined':
      if (isInitiator && declinedUserIds.length > 0) {
        return {
          label: declinedUserIds.length === 1
            ? `${describeParticipants(conversation, declinedUserIds, 'member')} declined`
            : `${declinedUserIds.length} declined`,
          tone: 'muted',
          indicator: 'ended',
        };
      }
      if (currentUserId && declinedUserIds.includes(currentUserId)) {
        return {
          label: `Declined ${modeLabel} Call`,
          tone: 'muted',
          indicator: 'ended',
        };
      }
      return {
        label: 'Call declined',
        tone: 'muted',
        indicator: 'ended',
      };
    case 'cancelled':
      if (isInitiator) {
        return null;
      }
      return {
        label: 'Call cancelled',
        tone: 'muted',
        indicator: 'ended',
      };
    default:
      return null;
  }
}