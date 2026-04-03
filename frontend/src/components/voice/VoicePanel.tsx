import type { VoiceParticipant } from '../../hooks/useVoice';
import type { User } from '../../types';

interface VoicePanelProps {
  connected: boolean;
  connecting: boolean;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  pttMode: boolean;
  pttActive: boolean;
  streamName: string;
  hubMembers: Record<string, User>;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onTogglePTT: () => void;
}

export default function VoicePanel({
  connected,
  connecting,
  participants,
  isMuted,
  isDeafened,
  pttMode,
  pttActive,
  streamName,
  hubMembers,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onTogglePTT,
}: VoicePanelProps) {
  if (!connected && !connecting) return null;

  return (
    <div className="border-t border-riptide-border/40 bg-riptide-panel/50 px-3 py-2.5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connecting ? 'bg-riptide-warning animate-pulse-soft' : 'bg-riptide-success'}`} />
          <span className={`text-xs font-medium ${connecting ? 'text-riptide-warning' : 'text-riptide-success'}`}>
            {connecting ? 'Connecting…' : 'Voice Connected'}
          </span>
        </div>
        <span className="text-[11px] text-riptide-text-dim truncate max-w-[100px] flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.51 6.51 0 010 13.42v2.06A8.51 8.51 0 0014 3.23z"/>
          </svg>
          {streamName}
        </span>
      </div>

      {/* PTT indicator */}
      {pttMode && connected && (
        <div className={`text-[10px] font-medium mb-1.5 px-1 py-0.5 rounded text-center transition-colors duration-100 ${
          pttActive ? 'bg-riptide-success/20 text-riptide-success' : 'bg-riptide-surface/50 text-riptide-text-dim'
        }`}>
          {pttActive ? '🎙 Transmitting…' : 'Push Space to talk'}
        </div>
      )}

      {/* Participants */}
      {connected && (
        <div className="space-y-0.5 mb-2 max-h-32 overflow-y-auto">
          {participants.length === 0 ? (
            <p className="text-[11px] text-riptide-text-dim text-center py-2 italic">No one else here yet</p>
          ) : (
            participants.map((p) => {
            const member = hubMembers[p.identity];
            const displayName = member?.display_name || member?.username || p.identity;
            const avatarUrl = member?.avatar_url;
            return (
              <div key={p.identity} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-riptide-surface/30 transition-colors duration-100">
                {/* Avatar with speaking ring */}
                <div className={`w-6 h-6 rounded-full flex-shrink-0 transition-all duration-200 ${
                  p.isSpeaking ? 'ring-2 ring-riptide-success ring-offset-1 ring-offset-riptide-panel' : ''
                }`}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold transition-all duration-200 ${
                        p.isSpeaking
                          ? 'bg-riptide-success text-white'
                          : 'bg-riptide-surface text-riptide-text-muted'
                      }`}
                    >
                      {displayName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className={`text-xs truncate flex-1 ${p.isSpeaking ? 'text-riptide-success font-medium' : 'text-riptide-text'}`}>
                  {displayName}
                </span>
                {/* Mute icon */}
                {p.isMuted && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riptide-danger flex-shrink-0">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                    <path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </div>
            );
          }))}
        </div>
      )}

      {/* Controls */}
      {connected && (
        <div className="flex gap-1.5">
          {/* Mute button */}
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-150 flex items-center justify-center gap-1 active:scale-95 ${
              isMuted
                ? 'bg-riptide-danger/20 text-riptide-danger hover:bg-riptide-danger/30'
                : 'bg-riptide-surface text-riptide-text-muted hover:bg-riptide-panel hover:text-riptide-text'
            }`}
          >
            {isMuted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          {/* Deafen button */}
          <button
            onClick={onToggleDeafen}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
            className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-150 flex items-center justify-center active:scale-95 ${
              isDeafened
                ? 'bg-riptide-danger/20 text-riptide-danger hover:bg-riptide-danger/30'
                : 'bg-riptide-surface text-riptide-text-muted hover:bg-riptide-panel hover:text-riptide-text'
            }`}
          >
            {isDeafened ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9a3 3 0 015-2.24M21 12a9 9 0 00-7.48-8.86" />
                <path d="M3 12a9 9 0 008 8.94V18a3 3 0 01-3-3v-1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 18v-6a9 9 0 0118 0v6" />
                <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
              </svg>
            )}
          </button>
          {/* PTT toggle */}
          <button
            onClick={onTogglePTT}
            title={pttMode ? 'Disable push-to-talk' : 'Enable push-to-talk'}
            className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-150 flex items-center justify-center active:scale-95 ${
              pttMode
                ? 'bg-riptide-accent/20 text-riptide-accent hover:bg-riptide-accent/30'
                : 'bg-riptide-surface text-riptide-text-muted hover:bg-riptide-panel hover:text-riptide-text'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <rect x="6" y="14" width="12" height="3" rx="1" />
            </svg>
          </button>
          {/* Disconnect button */}
          <button
            onClick={onLeave}
            title="Disconnect"
            className="px-2 py-1.5 rounded-md text-xs font-medium bg-riptide-danger/20 text-riptide-danger hover:bg-riptide-danger/30 transition-all duration-150 flex items-center justify-center active:translate-y-px"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
