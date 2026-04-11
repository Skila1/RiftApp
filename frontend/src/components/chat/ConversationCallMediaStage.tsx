import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Track } from 'livekit-client';

import type { User } from '../../types';
import type { VoiceParticipant } from '../../stores/voiceStore';
import { getUserLabel } from '../../utils/conversations';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import {
  CameraIcon as VoiceCameraIcon,
  MicIcon as VoiceMicIcon,
  ScreenShareIcon,
} from '../voice/VoiceIcons';

export type ConversationCallStageMember = {
  id: string;
  user?: User;
  liveParticipant?: VoiceParticipant;
  isInVoice: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isSpeaking: boolean;
  isCurrentUser: boolean;
};

function useAttachedVideoTrack(track: Track | undefined, enabled = true) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!enabled || !track || track.kind !== Track.Kind.Video || !element) {
      return;
    }

    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track, enabled]);

  return videoRef;
}

function gridStyleForCount(count: number): CSSProperties {
  if (count <= 0) {
    return {};
  }

  let columns = 1;
  if (count === 2) {
    columns = 2;
  } else if (count <= 4) {
    columns = 2;
  } else {
    columns = 3;
  }

  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  };
}

function getAvatarColor(identity: string): string {
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = identity.charCodeAt(index) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 30%, 18%)`;
}

function getMemberLabel(member: ConversationCallStageMember) {
  if (member.isCurrentUser) {
    return 'You';
  }
  return member.user ? getUserLabel(member.user) : member.id;
}

function ParticipantOverlay({
  member,
  label,
  showScreenShare,
}: {
  member: ConversationCallStageMember;
  label: string;
  showScreenShare?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3">
      <div className="flex min-w-0 items-center gap-2 rounded-lg bg-black/55 px-2.5 py-1.5 backdrop-blur-sm">
        {member.isSpeaking ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#23a55a]" /> : null}
        {member.isMuted ? <VoiceMicIcon muted size={13} className="shrink-0 text-[#ff7b7b]" /> : null}
        {member.isCameraOn ? <VoiceCameraIcon enabled size={13} className="shrink-0 text-[#d2d5db]" /> : null}
        {showScreenShare ? <ScreenShareIcon active size={13} className="shrink-0 text-[#d2d5db]" /> : null}
        <span className="truncate text-sm font-medium text-white">{label}</span>
      </div>
    </div>
  );
}

function ParticipantTile({ member }: { member: ConversationCallStageMember }) {
  const label = getMemberLabel(member);
  const avatarUrl = member.user?.avatar_url;
  const liveParticipant = member.liveParticipant;
  const hasCameraVideo = Boolean(
    liveParticipant?.videoTrack
    && liveParticipant.videoTrack.kind === Track.Kind.Video
    && liveParticipant.isCameraOn,
  );
  const videoRef = useAttachedVideoTrack(liveParticipant?.videoTrack, hasCameraVideo);

  return (
    <div
      className={`relative min-h-[170px] overflow-hidden rounded-2xl border bg-black/30 ${
        member.isSpeaking
          ? 'border-[#23a55a]/50 shadow-[0_0_0_1px_rgba(35,165,90,0.25)]'
          : 'border-white/10'
      }`}
      style={!hasCameraVideo ? { backgroundColor: getAvatarColor(member.id) } : undefined}
    >
      {hasCameraVideo ? (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="flex h-[min(28vw,112px)] w-[min(28vw,112px)] max-h-[112px] max-w-[112px] items-center justify-center overflow-hidden rounded-full ring-4 ring-black/25">
            {avatarUrl ? (
              <img src={publicAssetUrl(avatarUrl)} alt={label} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-semibold text-white">{label.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
        </div>
      )}
      <ParticipantOverlay member={member} label={label} />
    </div>
  );
}

function ScreenShareTile({ member }: { member: ConversationCallStageMember }) {
  const label = getMemberLabel(member);
  const liveParticipant = member.liveParticipant;
  const videoRef = useAttachedVideoTrack(liveParticipant?.screenTrack, Boolean(liveParticipant?.isScreenSharing));

  return (
    <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-black">
      <div className="absolute right-3 top-3 z-10 rounded-md bg-[#ed4245] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
        Live
      </div>
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
      <ParticipantOverlay member={member} label={`${label}'s screen`} showScreenShare />
    </div>
  );
}

function PendingMemberPill({ member }: { member: ConversationCallStageMember }) {
  const label = getMemberLabel(member);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-[#d2d5db]">
      <span className="h-2 w-2 rounded-full bg-[#f0b232]" />
      <span className="max-w-[140px] truncate font-medium">{label}</span>
      <span className="text-[#8e9297]">Ringing</span>
    </div>
  );
}

export default function ConversationCallMediaStage({
  participants,
}: {
  participants: ConversationCallStageMember[];
}) {
  const activeParticipants = useMemo(
    () => participants.filter((member) => member.isInVoice),
    [participants],
  );
  const pendingParticipants = useMemo(
    () => participants.filter((member) => !member.isInVoice),
    [participants],
  );
  const screenShareParticipants = useMemo(
    () => activeParticipants.filter(
      (member) => Boolean(member.liveParticipant?.isScreenSharing && member.liveParticipant?.screenTrack),
    ),
    [activeParticipants],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {screenShareParticipants.length > 0 ? (
        <div className="grid gap-3" style={gridStyleForCount(screenShareParticipants.length)}>
          {screenShareParticipants.map((member) => (
            <ScreenShareTile key={`${member.id}-screen`} member={member} />
          ))}
        </div>
      ) : null}

      {activeParticipants.length > 0 ? (
        <div className="grid gap-3" style={gridStyleForCount(activeParticipants.length)}>
          {activeParticipants.map((member) => (
            <ParticipantTile key={member.id} member={member} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[170px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/25 px-4 text-sm text-[#8e9297]">
          Waiting for someone to join.
        </div>
      )}

      {pendingParticipants.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pendingParticipants.map((member) => (
            <PendingMemberPill key={`${member.id}-pending`} member={member} />
          ))}
        </div>
      ) : null}
    </div>
  );
}