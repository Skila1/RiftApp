import { useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { getConversationIconUrl, getConversationTitle, getUserLabel } from '../../utils/conversations';

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

export default function IncomingDMCallPrompt() {
  const user = useAuthStore((state) => state.user);
  const conversations = useDMStore((state) => state.conversations);
  const setActiveConversation = useDMStore((state) => state.setActiveConversation);
  const conversationCallRings = useVoiceStore((state) => state.conversationCallRings);
  const dismissedConversationCallRings = useVoiceStore((state) => state.dismissedConversationCallRings);
  const dismissConversationCallRing = useVoiceStore((state) => state.dismissConversationCallRing);
  const joinConversation = useVoiceStore((state) => state.joinConversation);
  const toggleCamera = useVoiceStore((state) => state.toggleCamera);
  const voiceConnected = useVoiceStore((state) => state.connected);
  const voiceConnecting = useVoiceStore((state) => state.connecting);
  const voiceTargetKind = useVoiceStore((state) => state.targetKind);
  const voiceConversationId = useVoiceStore((state) => state.conversationId);
  const openVoiceView = useVoiceChannelUiStore((state) => state.openVoiceView);

  const [answeringMode, setAnsweringMode] = useState<'audio' | 'video' | null>(null);

  const activeRing = useMemo(() => {
    const currentUserId = user?.id;
    return Object.values(conversationCallRings)
      .filter((ring) => ring.initiator_id !== currentUserId)
      .filter((ring) => dismissedConversationCallRings[ring.conversation_id] !== ring.started_at)
      .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at))[0] ?? null;
  }, [conversationCallRings, dismissedConversationCallRings, user?.id]);

  const conversation = useMemo(
    () => conversations.find((entry) => entry.id === activeRing?.conversation_id) ?? null,
    [activeRing?.conversation_id, conversations],
  );

  if (!activeRing) {
    return null;
  }

  if (voiceTargetKind === 'conversation' && voiceConversationId === activeRing.conversation_id && (voiceConnected || voiceConnecting)) {
    return null;
  }

  const currentUserId = user?.id ?? null;
  const conversationTitle = getConversationTitle(conversation, currentUserId);
  const conversationIconUrl = getConversationIconUrl(conversation);
  const initiator = conversation?.members?.find((member) => member.id === activeRing.initiator_id) ?? null;

  const handleAnswer = async (mode: 'audio' | 'video') => {
    setAnsweringMode(mode);
    try {
      await setActiveConversation(activeRing.conversation_id);
      openVoiceView(activeRing.conversation_id, 'conversation');
      await joinConversation(activeRing.conversation_id);
      if (mode === 'video' && !useVoiceStore.getState().isCameraOn) {
        await toggleCamera();
      }
    } finally {
      setAnsweringMode(null);
    }
  };

  const handleDismiss = () => {
    dismissConversationCallRing(activeRing.conversation_id);
  };

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[120] flex w-[min(360px,calc(100vw-2rem))] justify-end">
      <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-[#f0b232]/25 bg-[#111214]/95 shadow-[0_22px_64px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-start gap-3 border-b border-white/6 px-4 py-4">
          {conversationIconUrl ? (
            <img src={publicAssetUrl(conversationIconUrl)} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0b232]/16 text-sm font-semibold text-[#ffd27a]">
              {conversationTitle.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center rounded-full bg-[#f0b232]/14 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffd27a]">
              Incoming {activeRing.mode === 'video' ? 'Video' : 'Voice'} Call
            </div>
            <h3 className="mt-2 truncate text-[15px] font-semibold text-[#f2f3f5]">{conversationTitle}</h3>
            <p className="mt-1 text-sm text-[#b5bac1]">
              {initiator ? `${getUserLabel(initiator)} is calling you.` : 'Someone is calling you.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-medium text-[#d2d5db] transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => { void handleAnswer('audio'); }}
            disabled={answeringMode !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-[#248046] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2d9d58] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PhoneIcon />
            {answeringMode === 'audio' ? 'Joining...' : 'Join'}
          </button>
          <button
            type="button"
            onClick={() => { void handleAnswer('video'); }}
            disabled={answeringMode !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5865f2] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6d79f6] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <VideoIcon />
            {answeringMode === 'video' ? 'Joining...' : 'Join With Video'}
          </button>
        </div>
      </div>
    </div>
  );
}