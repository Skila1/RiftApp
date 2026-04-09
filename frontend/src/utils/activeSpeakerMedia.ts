export type ActiveSpeakerTrackType = 'camera' | 'screenshare';

export interface ActiveSpeakerCandidate<TTrack = unknown> {
  identity: string;
  isSpeaking: boolean;
  isCameraOn?: boolean;
  isScreenSharing?: boolean;
  videoTrack?: TTrack | null;
  screenTrack?: TTrack | null;
}

export interface ActiveSpeakerSelection<TTrack = unknown> {
  userId: string;
  trackType: ActiveSpeakerTrackType | null;
  track: TTrack | null;
  priority: number;
}

export interface CurrentActiveSpeakerTarget {
  userId: string;
  trackType: ActiveSpeakerTrackType | null;
}

export function getActiveSpeakerTrackPriority(trackType: ActiveSpeakerTrackType | null) {
  if (trackType === 'screenshare') return 3;
  if (trackType === 'camera') return 2;
  return 1;
}

export function getActiveSpeakerMediaSelection<TTrack>(
  participant: ActiveSpeakerCandidate<TTrack>,
): ActiveSpeakerSelection<TTrack> {
  const hasScreenshare = participant.isScreenSharing !== false && participant.screenTrack != null;
  if (hasScreenshare) {
    return {
      userId: participant.identity,
      trackType: 'screenshare',
      track: participant.screenTrack ?? null,
      priority: 3,
    };
  }

  const hasCamera = participant.isCameraOn !== false && participant.videoTrack != null;
  if (hasCamera) {
    return {
      userId: participant.identity,
      trackType: 'camera',
      track: participant.videoTrack ?? null,
      priority: 2,
    };
  }

  return {
    userId: participant.identity,
    trackType: null,
    track: null,
    priority: 1,
  };
}

export function activeSpeakerTargetKey(
  selection: Pick<CurrentActiveSpeakerTarget, 'userId' | 'trackType'> | null,
) {
  if (!selection) {
    return null;
  }

  return `${selection.userId}:${selection.trackType ?? 'avatar'}`;
}

export function selectPreferredActiveSpeaker<TTrack>(
  participants: ActiveSpeakerCandidate<TTrack>[],
  current: CurrentActiveSpeakerTarget | null,
): ActiveSpeakerSelection<TTrack> | null {
  const speakingParticipants = participants.filter((participant) => participant.isSpeaking);
  if (speakingParticipants.length === 0) {
    return null;
  }

  const selections = speakingParticipants
    .map((participant) => ({
      participant,
      selection: getActiveSpeakerMediaSelection(participant),
    }))
    .filter(({ selection }) => selection.trackType !== null && selection.track != null);

  if (selections.length === 0) {
    return null;
  }

  const best = selections.reduce((winner, entry) => (
    entry.selection.priority > winner.selection.priority ? entry : winner
  )).selection;

  if (!current) {
    return best;
  }

  const currentParticipant = speakingParticipants.find((participant) => participant.identity === current.userId);
  if (!currentParticipant) {
    return best;
  }

  const currentSelection = getActiveSpeakerMediaSelection(currentParticipant);
  if (currentSelection.trackType === null || currentSelection.track == null) {
    return best;
  }

  if (currentSelection.priority >= best.priority) {
    return currentSelection;
  }

  return best;
}