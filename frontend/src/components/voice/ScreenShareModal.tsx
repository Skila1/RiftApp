import { useEffect, useRef } from 'react';
import { useVoiceStore } from '../../stores/voiceStore';
import ModalOverlay from '../shared/ModalOverlay';
import ModalCloseButton from '../shared/ModalCloseButton';

/**
 * Active screen-share panel.
 * Shows a live preview of what the user is sharing with a "Stop Sharing" control.
 * Appears when the user is actively sharing their screen.
 */
export default function ScreenShareModal() {
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const surfaceLabel = useVoiceStore((s) => s.screenShareSurfaceLabel);
  const toggleScreenShare = useVoiceStore((s) => s.toggleScreenShare);
  const participants = useVoiceStore((s) => s.participants);
  const isOpen = useVoiceStore((s) => s.screenShareModalOpen);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach local screen-share track to the preview <video>
  useEffect(() => {
    if (!isOpen || !isScreenSharing) return;

    const me = participants.find((p) => p.isScreenSharing && p.screenTrack);
    const track = me?.screenTrack;

    if (track && videoRef.current) {
      track.attach(videoRef.current);
      return () => {
        track.detach(videoRef.current!);
      };
    }
  }, [isOpen, isScreenSharing, participants]);

  const handleStop = () => {
    void toggleScreenShare();
    useVoiceStore.setState({ screenShareModalOpen: false });
  };

  const handleClose = () => {
    useVoiceStore.setState({ screenShareModalOpen: false });
  };

  if (!isOpen || !isScreenSharing) return null;

  return (
    <ModalOverlay isOpen onClose={handleClose} zIndex={300}>
      <div className="w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-riftapp-border/60 bg-riftapp-panel shadow-modal">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-[#ed4245] px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
              Live
            </span>
            <h2 className="text-[16px] font-bold text-white">
              Sharing {surfaceLabel ?? 'Screen'}
            </h2>
          </div>
          <ModalCloseButton onClick={handleClose} size="sm" />
        </div>

        {/* Live preview */}
        <div className="px-5 pb-3">
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 left-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ed4245] animate-pulse" />
              <span className="text-[11px] font-semibold text-white/80">Live</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-riftapp-border/60 bg-riftapp-content-elevated px-5 py-4">
          <p className="text-[13px] text-riftapp-text-muted">
            You are sharing your {(surfaceLabel ?? 'screen').toLowerCase()}.
          </p>
          <button
            type="button"
            onClick={handleStop}
            className="px-4 py-2 rounded-[4px] bg-[#ed4245] hover:bg-[#a12828] text-white text-[13px] font-medium active:scale-95 transition-all"
          >
            Stop Sharing
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}