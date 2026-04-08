import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { HubSound } from '../../types';
import ModalCloseButton from '../shared/ModalCloseButton';

interface SoundboardPanelProps {
  hubId: string;
  onClose: () => void;
}

export default function SoundboardPanel({ hubId, onClose }: SoundboardPanelProps) {
  const [sounds, setSounds] = useState<HubSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getHubSounds(hubId).then((s) => {
      if (!cancelled) { setSounds(s); setLoading(false); }
    }).catch(() => {
      if (!cancelled) { setSounds([]); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [hubId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handlePlay = useCallback(async (sound: HubSound) => {
    if (playingId) return; // debounce
    setPlayingId(sound.id);
    setError(null);
    try {
      await api.playSoundboard(hubId, sound.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to play sound');
    } finally {
      setTimeout(() => setPlayingId(null), 800);
    }
  }, [hubId, playingId]);

  return (
    <div
      className="bg-riftapp-panel border border-riftapp-border/60 rounded-xl shadow-elevation-high w-full max-w-full max-h-[320px] flex flex-col animate-scale-in"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-riftapp-border/40">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-riftapp-text-dim">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span className="text-[13px] font-semibold text-riftapp-text">Soundboard</span>
        </div>
        <ModalCloseButton onClick={onClose} size="sm" />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg bg-riftapp-danger/10 border border-riftapp-danger/30 text-[12px] text-riftapp-danger">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && sounds.length === 0 && (
          <div className="text-sm text-riftapp-text-dim text-center py-8">
            No sounds uploaded yet
          </div>
        )}
        {!loading && sounds.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {sounds.map((sound) => {
              const isPlaying = playingId === sound.id;
              return (
                <button
                  key={sound.id}
                  type="button"
                  onClick={() => handlePlay(sound)}
                  disabled={!!playingId}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 active:scale-95 ${
                    isPlaying
                      ? 'bg-riftapp-accent/20 border border-riftapp-accent/40 text-riftapp-accent'
                      : 'bg-riftapp-content-elevated hover:bg-riftapp-chrome-hover border border-transparent text-riftapp-text-muted hover:text-riftapp-text'
                  } ${playingId && !isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 animate-pulse">
                      <rect x="4" y="4" width="6" height="16" rx="1" />
                      <rect x="14" y="4" width="6" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                  <span className="text-[12px] font-medium truncate">{sound.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
