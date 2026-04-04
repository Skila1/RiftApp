interface VoicePanelProps {
  connected: boolean;
  connecting: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  streamName: string;
  hubName: string;
  onLeave: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
}

export default function VoicePanel({
  connected,
  connecting,
  isCameraOn,
  isScreenSharing,
  streamName,
  hubName,
  onLeave,
  onToggleCamera,
  onToggleScreenShare,
}: VoicePanelProps) {
  if (!connected && !connecting) return null;

  return (
    <div className="border-t border-riptide-border/40 bg-riptide-panel/50 px-3 pt-3 pb-2.5 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connecting ? 'bg-riptide-warning animate-pulse-soft' : 'bg-riptide-success'}`} />
          <span className={`text-[13px] font-semibold ${connecting ? 'text-riptide-warning' : 'text-riptide-success'}`}>
            {connecting ? 'Connecting…' : 'Voice Connected'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Signal strength icon */}
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-riptide-text-dim" title="Connection quality">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-riptide-success">
              <rect x="2" y="16" width="3" height="6" rx="1" />
              <rect x="7" y="12" width="3" height="10" rx="1" />
              <rect x="12" y="8" width="3" height="14" rx="1" />
              <rect x="17" y="4" width="3" height="18" rx="1" />
            </svg>
          </div>
          {/* Disconnect button */}
          <button
            onClick={onLeave}
            title="Disconnect"
            className="w-7 h-7 rounded-md flex items-center justify-center text-riptide-text-dim hover:text-riptide-danger hover:bg-riptide-danger/10 transition-all duration-150 active:scale-90"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.42 8.63 7.51 7 12 7s8.58 1.63 11.71 4.72c.18.18.29.44.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.997.997 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Channel / Hub name */}
      <p className="text-[11px] text-riptide-text-dim truncate mb-3 ml-3.5">
        {streamName} / {hubName}
      </p>

      {/* Big control buttons */}
      {connected && (
        <div className="flex gap-2 justify-center">
          {/* Camera */}
          <button
            onClick={onToggleCamera}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            className={`w-[68px] h-[42px] rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95 ${
              isCameraOn
                ? 'bg-riptide-text text-riptide-bg'
                : 'bg-riptide-surface hover:bg-riptide-surface-hover text-riptide-text-muted hover:text-riptide-text'
            }`}
          >
            {isCameraOn ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>

          {/* Screen Share */}
          <button
            onClick={onToggleScreenShare}
            title={isScreenSharing ? 'Stop sharing' : 'Share your screen'}
            className={`w-[68px] h-[42px] rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95 ${
              isScreenSharing
                ? 'bg-riptide-text text-riptide-bg'
                : 'bg-riptide-surface hover:bg-riptide-surface-hover text-riptide-text-muted hover:text-riptide-text'
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
              {isScreenSharing && <path d="M9 10l2 2 4-4" />}
            </svg>
          </button>

          {/* Soundboard (placeholder) */}
          <button
            title="Soundboard"
            className="w-[68px] h-[42px] rounded-xl flex items-center justify-center bg-riptide-surface hover:bg-riptide-surface-hover text-riptide-text-muted hover:text-riptide-text transition-all duration-150 active:scale-95"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
