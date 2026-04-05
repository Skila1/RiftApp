import { useEffect, useRef } from 'react';
import { Track } from 'livekit-client';
import { usePresenceStore } from '../../stores/presenceStore';
import { useStreamStore } from '../../stores/streamStore';
import { useVoiceStore, type VoiceParticipant } from '../../stores/voiceStore';
export default function VoiceView() {
  const connected = useVoiceStore((s) => s.connected);
  const connecting = useVoiceStore((s) => s.connecting);
  const participants = useVoiceStore((s) => s.participants);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  const toggleCamera = useVoiceStore((s) => s.toggleCamera);
  const toggleScreenShare = useVoiceStore((s) => s.toggleScreenShare);
  const leave = useVoiceStore((s) => s.leave);

  const viewingVoiceStreamId = useStreamStore((s) => s.viewingVoiceStreamId);
  const setViewingVoice = useStreamStore((s) => s.setViewingVoice);
  const streams = useStreamStore((s) => s.streams);
  const hubMembers = usePresenceStore((s) => s.hubMembers);

  const stream = streams.find((s) => s.id === viewingVoiceStreamId);
  const screenSharer = participants.find((p) => p.isScreenSharing);

  return (
    <div className="flex-1 flex flex-col bg-[#1a1a2e] min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-riftapp-border/60 flex-shrink-0 shadow-[0_1px_0_rgba(0,0,0,0.2)]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-riftapp-text-dim flex-shrink-0">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <h3 className="font-semibold text-[15px] truncate">{stream?.name || 'Voice Channel'}</h3>
          {connected && (
            <span className="text-xs text-riftapp-text-dim ml-2">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!connected && !connecting ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-riftapp-surface/30 flex items-center justify-center mx-auto mb-4">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-text-dim">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </div>
              <p className="text-riftapp-text-dim text-sm">Not connected to this voice channel</p>
            </div>
          </div>
        ) : connecting ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-riftapp-surface/30 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-warning">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </div>
              <p className="text-riftapp-warning text-sm font-medium">Connecting…</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {screenSharer ? (
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 p-2 flex items-center justify-center bg-black/30 min-w-0">
                  <ScreenShareTile participant={screenSharer} hubMembers={hubMembers} />
                </div>
                <div className="w-60 flex-shrink-0 overflow-y-auto p-2 space-y-2 border-l border-white/5">
                  {participants.map((p) => (
                    <ParticipantTile key={p.identity} participant={p} hubMembers={hubMembers} compact />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                <div className={`grid gap-3 w-full max-w-5xl ${getGridCols(participants.length)}`}>
                  {participants.map((p) => (
                    <ParticipantTile key={p.identity} participant={p} hubMembers={hubMembers} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Discord-style control bar */}
      {connected && (
        <div className="flex items-center justify-center gap-3 px-6 py-4 bg-[#111127] border-t border-white/5 flex-shrink-0">
          <ControlBtn
            onClick={toggleScreenShare}
            active={isScreenSharing}
            tooltip={isScreenSharing ? 'Stop Sharing' : 'Share Your Screen'}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
              {isScreenSharing && <path d="M9 10l3-3 3 3M12 7v6" />}
            </svg>
          </ControlBtn>

          <ControlBtn
            onClick={toggleCamera}
            active={isCameraOn}
            crossed={!isCameraOn}
            tooltip={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isCameraOn ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34" />
                <path d="M23 7l-7 5 7 5V7z" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </ControlBtn>

          <ControlBtn
            onClick={toggleMute}
            crossed={isMuted}
            tooltip={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                <path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </ControlBtn>

          <ControlBtn
            onClick={toggleDeafen}
            crossed={isDeafened}
            tooltip={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            {isDeafened ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9a3 3 0 015-2.24M21 12a9 9 0 00-7.48-8.86" />
                <path d="M3 12a9 9 0 008 8.94V18a3 3 0 01-3-3v-1" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 18v-6a9 9 0 0118 0v6" />
                <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
              </svg>
            )}
          </ControlBtn>

          <ControlBtn
            onClick={() => { leave(); setViewingVoice(null); }}
            danger
            tooltip="Disconnect"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.53 8.46 7.5 6.5 12 6.5s8.47 1.96 11.71 5.22c.19.19.29.44.29.71 0 .28-.1.52-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a11.27 11.27 0 00-2.67-1.85.996.996 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </ControlBtn>
        </div>
      )}
    </div>
  );
}

/* ───── Discord-style Control Button ───── */

function ControlBtn({ children, onClick, tooltip, active, danger, crossed }: {
  children: React.ReactNode;
  onClick: () => void;
  tooltip: string;
  active?: boolean;
  danger?: boolean;
  crossed?: boolean;
}) {
  let cls = 'bg-[#2b2d42] hover:bg-[#3a3d56] text-[#b5bac1]';
  if (danger) cls = 'bg-[#ed4245] hover:bg-[#c93b3e] text-white';
  else if (active) cls = 'bg-[#4752c4] hover:bg-[#3c45a5] text-white';
  else if (crossed) cls = 'bg-[#2b2d42] hover:bg-[#3a3d56] text-[#ed4245]';

  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-150 active:scale-95 ${cls}`}
    >
      {children}
    </button>
  );
}

/* ───── Participant Tile ───── */

function ParticipantTile({ participant, hubMembers, compact }: {
  participant: VoiceParticipant;
  hubMembers: Record<string, import('../../types').User>;
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const member = hubMembers[participant.identity];
  const displayName = member?.display_name || member?.username || participant.identity;
  const avatarUrl = member?.avatar_url;

  useEffect(() => {
    const track = participant.videoTrack;
    const el = videoRef.current;
    if (track && el && track.kind === Track.Kind.Video) {
      track.attach(el);
      return () => { track.detach(el); };
    }
  }, [participant.videoTrack]);

  const hasVideo = participant.isCameraOn && participant.videoTrack;

  return (
    <div
      className={`relative rounded-xl overflow-hidden transition-all duration-200 ${
        participant.isSpeaking
          ? 'ring-[3px] ring-riftapp-success shadow-lg shadow-riftapp-success/20'
          : 'ring-1 ring-white/10'
      } aspect-video`}
      style={{ backgroundColor: getAvatarColor(participant.identity) }}
    >
      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className={`rounded-full overflow-hidden ${compact ? 'w-14 h-14' : 'w-20 h-20'}`}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-riftapp-surface/60 flex items-center justify-center">
                <span className={`font-bold text-white ${compact ? 'text-xl' : 'text-2xl'}`}>
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-2 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent">
        <span className={`text-xs font-medium truncate ${participant.isSpeaking ? 'text-riftapp-success' : 'text-white'}`}>
          {displayName}
        </span>
        <div className="flex items-center gap-1">
          {participant.isMuted && (
            <div className="bg-black/50 rounded-full p-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riftapp-danger">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              </svg>
            </div>
          )}
          {participant.isScreenSharing && (
            <div className="bg-black/50 rounded-full p-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riftapp-accent">
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───── Screen Share Tile ───── */

function ScreenShareTile({ participant, hubMembers }: {
  participant: VoiceParticipant;
  hubMembers: Record<string, import('../../types').User>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const member = hubMembers[participant.identity];
  const displayName = member?.display_name || member?.username || participant.identity;

  useEffect(() => {
    const track = participant.screenTrack;
    const el = videoRef.current;
    if (track && el && track.kind === Track.Kind.Video) {
      track.attach(el);
      return () => { track.detach(el); };
    }
  }, [participant.screenTrack]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-full rounded-lg shadow-2xl" />
      <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm rounded-md px-2.5 py-1 flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riftapp-accent">
          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span className="text-xs font-medium text-white">{displayName}'s screen</span>
      </div>
    </div>
  );
}

/* ───── Helpers ───── */

function getGridCols(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-lg mx-auto';
  if (count <= 2) return 'grid-cols-2';
  if (count <= 4) return 'grid-cols-2';
  if (count <= 6) return 'grid-cols-3';
  if (count <= 9) return 'grid-cols-3';
  return 'grid-cols-4';
}

function getAvatarColor(identity: string): string {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) {
    hash = identity.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 30%, 18%)`;
}
