import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import { isConversationMuted, useConversationMuteStore } from '../../stores/conversationMuteStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { getConversationIconUrl, getConversationTitle, getUserLabel } from '../../utils/conversations';
import { startIncomingCallSound, stopIncomingCallSound } from '../../utils/audio/appSounds';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.35 1.78.68 2.61a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6.27 6.27l1.29-1.29a2 2 0 0 1 2.11-.45c.83.33 1.71.56 2.61.68A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="3" y="6" width="13" height="12" rx="2" ry="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  );
}

function IncomingCallActionButton({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: 'danger' | 'success' | 'accent';
  children: React.ReactNode;
}) {
  const toneClasses = tone === 'danger'
    ? 'bg-[#da373c] text-white hover:bg-[#ed4245]'
    : tone === 'success'
      ? 'bg-[#248046] text-white hover:bg-[#2d9d58]'
      : 'bg-[#5865f2] text-white hover:bg-[#6d79f6]';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl font-semibold shadow-[0_10px_22px_rgba(0,0,0,0.24)] transition-all duration-150 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 ${toneClasses}`}
    >
      {children}
    </button>
  );
}

function LoadingDot() {
  return <span className="h-4 w-4 rounded-full border-2 border-current/25 border-t-current animate-spin" />;
}

export default function IncomingDMCallPrompt() {
  const user = useAuthStore((state) => state.user);
  const conversations = useDMStore((state) => state.conversations);
  const setActiveConversation = useDMStore((state) => state.setActiveConversation);
  const mutedUntilByConversationId = useConversationMuteStore((state) => state.mutedUntilByConversationId);
  const conversationCallRings = useVoiceStore((state) => state.conversationCallRings);
  const conversationVoiceMembers = useVoiceStore((state) => state.conversationVoiceMembers);
  const dismissedConversationCallRings = useVoiceStore((state) => state.dismissedConversationCallRings);
  const declineConversationCallRing = useVoiceStore((state) => state.declineConversationCallRing);
  const joinConversation = useVoiceStore((state) => state.joinConversation);
  const toggleCamera = useVoiceStore((state) => state.toggleCamera);
  const voiceConnected = useVoiceStore((state) => state.connected);
  const voiceConnecting = useVoiceStore((state) => state.connecting);
  const voiceTargetKind = useVoiceStore((state) => state.targetKind);
  const voiceConversationId = useVoiceStore((state) => state.conversationId);
  const setActiveVoiceChannel = useVoiceChannelUiStore((state) => state.setActiveChannel);

  const [pendingAction, setPendingAction] = useState<'audio' | 'video' | 'decline' | null>(null);

  const activeRing = useMemo(() => {
    const currentUserId = user?.id;
    return Object.values(conversationCallRings)
      .filter((ring) => ring.initiator_id !== currentUserId)
      .filter((ring) => !currentUserId || !(ring.declined_user_ids ?? []).includes(currentUserId))
      .filter((ring) => dismissedConversationCallRings[ring.conversation_id] !== ring.started_at)
      .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at))[0] ?? null;
  }, [conversationCallRings, dismissedConversationCallRings, user?.id]);

  const conversation = useMemo(
    () => conversations.find((entry) => entry.id === activeRing?.conversation_id) ?? null,
    [activeRing?.conversation_id, conversations],
  );
  const isConversationRingMuted = activeRing
    ? isConversationMuted(mutedUntilByConversationId[activeRing.conversation_id])
    : false;

  const isPromptVisible = Boolean(
    activeRing
    && !isConversationRingMuted
    && !(voiceTargetKind === 'conversation' && voiceConversationId === activeRing.conversation_id && (voiceConnected || voiceConnecting)),
  );

  useEffect(() => {
    if (isPromptVisible) {
      startIncomingCallSound();
      return () => {
        stopIncomingCallSound();
      };
    }
    stopIncomingCallSound();
    return undefined;
  }, [isConversationRingMuted, isPromptVisible, activeRing?.conversation_id, activeRing?.started_at]);

  if (!activeRing || !isPromptVisible) {
    return null;
  }

  const currentUserId = user?.id ?? null;
  const conversationTitle = getConversationTitle(conversation, currentUserId);
  const conversationIconUrl = getConversationIconUrl(conversation);
  const initiator = conversation?.members?.find((member) => member.id === activeRing.initiator_id) ?? null;
  const voiceMembers = conversationVoiceMembers[activeRing.conversation_id] ?? [];
  const voiceMemberSet = new Set(voiceMembers);
  const declinedUserSet = new Set(activeRing.declined_user_ids ?? []);
  const targetUserIds = (activeRing.target_user_ids ?? []).filter((memberId) => memberId !== currentUserId);
  const joinedUserIds = targetUserIds.filter((memberId) => voiceMemberSet.has(memberId));
  const pendingUserIds = targetUserIds.filter((memberId) => !voiceMemberSet.has(memberId) && !declinedUserSet.has(memberId));
  const declinedUserIds = targetUserIds.filter((memberId) => declinedUserSet.has(memberId));
  const groupDetailItems = [
    joinedUserIds.length > 0 ? `${joinedUserIds.length} in call` : null,
    pendingUserIds.length > 0 ? `${pendingUserIds.length} still ringing` : null,
    declinedUserIds.length > 0 ? `${declinedUserIds.length} declined` : null,
  ].filter((value): value is string => Boolean(value));
  const callerLabel = initiator ? getUserLabel(initiator) : 'Unknown caller';
  const heroAvatarUrl = initiator?.avatar_url ?? conversationIconUrl;
  const heroInitials = conversationTitle.slice(0, 2).toUpperCase();
  const statusText = groupDetailItems[0] ?? (activeRing.mode === 'video' ? 'Incoming video call' : 'Incoming call');

  const handleAnswer = async (mode: 'audio' | 'video') => {
    setPendingAction(mode);
    try {
      await setActiveConversation(activeRing.conversation_id);
      setActiveVoiceChannel(activeRing.conversation_id, 'conversation');
      await joinConversation(activeRing.conversation_id);
      if (mode === 'video' && !useVoiceStore.getState().isCameraOn) {
        await toggleCamera();
      }
    } finally {
      setPendingAction(null);
    }
  };

  const handleDecline = async () => {
    setPendingAction('decline');
    try {
      await declineConversationCallRing(activeRing.conversation_id);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(270px,calc(100vw-1rem))] justify-end sm:bottom-6 sm:right-6 sm:w-[252px]">
      <div className="pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1e1f22]/98 shadow-[0_24px_64px_rgba(0,0,0,0.48)] backdrop-blur-xl animate-scale-in">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(88,101,242,0.75),transparent)]" />
        <div className="px-4 pb-4 pt-4">
          <div className="flex flex-col items-center text-center">
            <div className="relative flex h-[76px] w-[76px] items-center justify-center">
              <span className="absolute inset-[-6px] rounded-full border border-[#5865f2]/35 animate-pulse" />
              {heroAvatarUrl ? (
                <img src={publicAssetUrl(heroAvatarUrl)} alt="" className="relative h-full w-full rounded-full object-cover ring-[3px] ring-black/25" />
              ) : (
                <div className="relative flex h-full w-full items-center justify-center rounded-full bg-[#5865f2]/24 text-xl font-semibold text-[#f2f3f5] ring-[3px] ring-black/25">
                  {heroInitials}
                </div>
              )}
            </div>

            <h3 className="mt-3 max-w-full truncate text-[16px] font-semibold leading-tight text-[#f2f3f5]">
              {conversationTitle}
            </h3>
            <p className="mt-1 max-w-full truncate text-[13px] font-medium text-[#d2d5db]">
              {callerLabel}
            </p>
            <p className="mt-1 text-[12px] text-[#8e9297]">
              {statusText}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <IncomingCallActionButton
              label={pendingAction === 'video' ? 'Joining with video' : 'Join with video'}
              onClick={() => { void handleAnswer('video'); }}
              disabled={pendingAction !== null}
              tone="success"
            >
              {pendingAction === 'video' ? <LoadingDot /> : <VideoIcon />}
            </IncomingCallActionButton>

            <IncomingCallActionButton
              label={pendingAction === 'audio' ? 'Joining call' : 'Join call'}
              onClick={() => { void handleAnswer('audio'); }}
              disabled={pendingAction !== null}
              tone="success"
            >
              {pendingAction === 'audio' ? <LoadingDot /> : <PhoneIcon />}
            </IncomingCallActionButton>

            <IncomingCallActionButton
              label={pendingAction === 'decline' ? 'Declining call' : 'Decline call'}
              onClick={() => { void handleDecline(); }}
              disabled={pendingAction !== null}
              tone="danger"
            >
              {pendingAction === 'decline' ? <LoadingDot /> : <CloseIcon />}
            </IncomingCallActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}