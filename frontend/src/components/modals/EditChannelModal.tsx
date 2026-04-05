import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStreamStore } from '../../stores/streamStore';
import type { Stream } from '../../types';

interface Props {
  stream: Stream;
  onClose: () => void;
}

export default function EditChannelModal({ stream, onClose }: Props) {
  const [name, setName] = useState(stream.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patchStream = useStreamStore((s) => s.patchStream);
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSave = async () => {
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!trimmed || saving || trimmed === stream.name) {
      if (trimmed === stream.name) onClose();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await patchStream(stream.id, trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update channel');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60"
    >
      <div className="bg-riftapp-panel rounded-xl shadow-modal w-full max-w-[440px] overflow-hidden animate-scale-in border border-riftapp-border/50">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold">
              {stream.type === 1 ? 'Voice Channel Settings' : 'Text Channel Settings'}
            </h2>
            <button type="button" onClick={onClose} className="text-riftapp-text-dim hover:text-riftapp-text transition-colors p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-riftapp-text-dim mb-4">Change how this channel appears in the sidebar.</p>
          <label className="text-xs font-bold uppercase tracking-wide text-riftapp-text-dim block mb-2">Channel Name</label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave();
            }}
            className="w-full bg-riftapp-bg border border-riftapp-border/60 rounded-lg px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-riftapp-accent/40"
            autoComplete="off"
          />
          {error && <p className="text-sm text-riftapp-danger mt-3">{error}</p>}
        </div>
        <div className="px-6 py-4 bg-riftapp-bg/40 flex justify-end gap-2 border-t border-riftapp-border/40">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-riftapp-surface-hover transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-riftapp-accent text-white hover:bg-riftapp-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
