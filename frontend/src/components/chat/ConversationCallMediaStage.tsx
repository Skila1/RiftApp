import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Track } from 'livekit-client';

import type { User } from '../../types';
import type { VoiceParticipant } from '../../stores/voiceStore';
import type { ConversationCallStatus } from '../../utils/dmCallStatus';
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
  isRinging: boolean;
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

function statusToneClasses(tone: ConversationCallStatus['tone'] | undefined) {
  switch (tone) {
    case 'warning':
      return 'border-[#f0b232]/30 bg-[#f0b232]/12 text-[#ffd27a]';
    case 'danger':
      return 'border-[#f87171]/30 bg-[#f87171]/12 text-[#fca5a5]';
    case 'success':
      return 'border-[#23a55a]/30 bg-[#23a55a]/12 text-[#77e0a2]';
    default:
      return 'border-white/10 bg-white/[0.05] text-[#d2d5db]';
  }
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
      className={`relative min-h-[170px] overflow-hidden rounded-2xl border bg-black/30 transition-all duration-300 ${
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
    <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-black transition-all duration-300">
      <div className="absolute right-3 top-3 z-10 rounded-md bg-[#ed4245] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
        Live
      </div>
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
      <ParticipantOverlay member={member} label={`${label}'s screen`} showScreenShare />
    </div>
  );
}

function RingingAvatar({ member }: { member: ConversationCallStageMember }) {
  const label = getMemberLabel(member);
  const avatarUrl = member.user?.avatar_url;

  return (
    <div className="flex flex-col items-center gap-3 text-center transition-all duration-300">
      <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
        {member.isRinging ? (
          <>
            <span className="rift-dm-call-pulse absolute inset-0 rounded-full border border-white/80" />
            <span className="rift-dm-call-pulse-delay absolute inset-[-10px] rounded-full border border-white/45" />
          </>
        ) : null}
        <div
          className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full ${
            member.isRinging
              ? 'border border-white/90 shadow-[0_0_0_4px_rgba(255,255,255,0.06)]'
              : 'ring-4 ring-black/25'
          }`}
          style={{ backgroundColor: getAvatarColor(member.id) }}
        >
          {avatarUrl ? (
            <img src={publicAssetUrl(avatarUrl)} alt={label} className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl font-semibold text-white">{label.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <p className="max-w-[180px] truncate text-base font-semibold text-white">{label}</p>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#8e9297]">
          {member.isRinging ? 'Ringing' : member.isInVoice ? 'In call' : 'Waiting'}
        </p>
      </div>
    </div>
  );
}

function PendingMemberPill({ member }: { member: ConversationCallStageMember }) {
  const label = getMemberLabel(member);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-[#d2d5db] transition-all duration-300">
      <span className="h-2 w-2 rounded-full bg-[#f0b232]" />
      <span className="max-w-[140px] truncate font-medium">{label}</span>
      <span className="text-[#8e9297]">Ringing</span>
    </div>
  );
}

function RingingStage({
  participants,
}: {
  participants: ConversationCallStageMember[];
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-6 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(0,0,0,0)_55%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] px-6 py-8 transition-all duration-300">
      <div className="flex flex-wrap items-center justify-center gap-8">
        {participants.map((member) => (
          <RingingAvatar key={member.id} member={member} />
        ))}
      </div>
    </div>
  );
}

function StageStatusBanner({ status }: { status: ConversationCallStatus }) {
  return (
    <div className={`inline-flex items-center self-start rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusToneClasses(status.tone)}`}>
      {status.label}
    </div>
  );
}

export default function ConversationCallMediaStage({
  participants,
  status,
}: {
  participants: ConversationCallStageMember[];
  status?: ConversationCallStatus | null;
}) {
  const activeParticipants = useMemo(
    () => participants.filter((member) => member.isInVoice),
    [participants],
  );
  const pendingParticipants = useMemo(
    () => participants.filter((member) => !member.isInVoice && !member.isRinging),
    [participants],
  );
  const ringingParticipants = useMemo(
    () => participants.filter((member) => member.isRinging),
    [participants],
  );
  const screenShareParticipants = useMemo(
    () => activeParticipants.filter(
      (member) => Boolean(member.liveParticipant?.isScreenSharing && member.liveParticipant?.screenTrack),
    ),
    [activeParticipants],
  );
  const activeRemoteParticipants = useMemo(
    () => activeParticipants.filter((member) => !member.isCurrentUser),
    [activeParticipants],
  );
  const showRingingStage = ringingParticipants.length > 0 && activeRemoteParticipants.length === 0;
  const showEndedBanner = Boolean(status && status.indicator === 'ended' && activeParticipants.length <= 1 && !showRingingStage);

  if (showRingingStage) {
    const ringingStageParticipants = participants.filter((member) => member.isCurrentUser || member.isRinging || member.isInVoice);
    return <RingingStage participants={ringingStageParticipants} />;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 transition-all duration-300">
      {showEndedBanner && status ? <StageStatusBanner status={status} /> : null}
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

      {ringingParticipants.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {ringingParticipants.map((member) => (
            <PendingMemberPill key={`${member.id}-ringing`} member={member} />
          ))}
        </div>
      ) : null}

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