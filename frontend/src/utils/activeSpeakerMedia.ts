export type ActiveSpeakerTrackType = 'camera' | 'screenshare';

interface ActiveSpeakerCandidate<TTrack = unknown> {
  identity: string;
  isSpeaking: boolean;
  isCameraOn?: boolean;
  isScreenSharing?: boolean;
  videoTrack?: TTrack | null;
  screenTrack?: TTrack | null;
}

interface ActiveSpeakerSelection<TTrack = unknown> {
  userId: string;
  trackType: ActiveSpeakerTrackType | null;
  track: TTrack | null;
  priority: number;
}

interface CurrentActiveSpeakerTarget {
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
  const allSelections = participants
    .map((participant) => ({
      participant,
      selection: getActiveSpeakerMediaSelection(participant),
    }));

  const mediaSelections = allSelections
    .filter(({ selection }) => selection.trackType !== null && selection.track != null);

  const selections = mediaSelections.length > 0
    ? (() => {
        const speakingMediaSelections = mediaSelections.filter(({ participant }) => participant.isSpeaking);
        return speakingMediaSelections.length > 0 ? speakingMediaSelections : mediaSelections;
      })()
    : [];

  if (selections.length === 0) {
    return null;
  }

  const best = selections.reduce((winner, entry) => (
    entry.selection.priority > winner.selection.priority ? entry : winner
  )).selection;

  if (!current) {
    return best;
  }

  const currentInPool = selections.find(({ participant }) => participant.identity === current.userId);
  if (!currentInPool) {
    return best;
  }

  const currentSelection = currentInPool.selection;

  if (currentSelection.priority >= best.priority) {
    return currentSelection;
  }

  return best;
}