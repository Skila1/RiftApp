import { useState, useEffect, useRef } from 'react';
import { useStreamStore } from '../../stores/streamStore';
import ModalOverlay from '../shared/ModalOverlay';
import ModalCloseButton from '../shared/ModalCloseButton';

interface Props {
  hubId: string;
  categoryId?: string;
  /** When opening from context menu, pre-select text (0) or voice (1). */
  initialType?: number;
  onClose: () => void;
}

const CHANNEL_TYPES = [
  {
    value: 0,
    label: 'Text',
    desc: 'Send messages, images, GIFs, emoji, opinions, and puns',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 18 8 6M16 18 20 6M3 12h18M3 16h18" />
      </svg>
    ),
  },
  {
    value: 1,
    label: 'Voice',
    desc: 'Hang out together with voice, video, and screen share',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    ),
  },
];

export default function CreateChannelModal({ hubId, categoryId, initialType, onClose }: Props) {
  const [type, setType] = useState(initialType ?? 0);
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const createStream = useStreamStore((s) => s.createStream);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (initialType === 0 || initialType === 1) setType(initialType);
  }, [initialType]);

  const handleCreate = async () => {
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      await createStream(hubId, trimmed, type, categoryId, isPrivate);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalOverlay isOpen onClose={onClose} zIndex={300}>
      <div className="bg-riftapp-panel rounded-xl shadow-modal w-full max-w-[460px] overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold">Create Channel</h2>
            <ModalCloseButton onClick={onClose} />
          </div>

          {/* Channel Type */}
          <label className="text-xs font-bold uppercase tracking-wide text-riftapp-text-dim mt-3 block mb-2">Channel Type</label>
          <div className="space-y-1.5">
            {CHANNEL_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => setType(ct.value)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  type === ct.value
                    ? 'bg-riftapp-chrome-hover ring-1 ring-riftapp-accent/50'
                    : 'bg-riftapp-content-elevated hover:bg-riftapp-chrome-hover'
                }`}
              >
                <div className={`flex-shrink-0 ${type === ct.value ? 'text-riftapp-text' : 'text-riftapp-text-dim'}`}>
                  {ct.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${type === ct.value ? 'text-riftapp-text' : ''}`}>{ct.label}</p>
                  <p className="text-xs text-riftapp-text-dim leading-snug">{ct.desc}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  type === ct.value ? 'border-riftapp-accent' : 'border-riftapp-text-dim/40'
                }`}>
                  {type === ct.value && <div className="w-2.5 h-2.5 rounded-full bg-riftapp-accent" />}
                </div>
              </button>
            ))}
          </div>

          {/* Channel Name */}
          <label className="text-xs font-bold uppercase tracking-wide text-riftapp-text-dim mt-5 block mb-2">Channel Name</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-riftapp-text-dim">
              {type === 0 ? (
                <span className="text-lg font-bold">#</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="new-channel"
              maxLength={100}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-riftapp-bg border border-riftapp-border text-sm outline-none focus:border-riftapp-accent transition-colors"
            />
          </div>

          {/* Private toggle */}
          <div className="flex items-center justify-between mt-5">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-riftapp-text-dim">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <div>
                <p className="text-sm font-semibold">Private Channel</p>
                <p className="text-xs text-riftapp-text-dim">Only selected members and roles will be able to view this channel.</p>
              </div>
            </div>
            <button
              onClick={() => setIsPrivate(!isPrivate)}
              className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${
                isPrivate ? 'bg-riftapp-accent' : 'bg-riftapp-text-dim/30'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                isPrivate ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-riftapp-content-elevated px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-riftapp-text-dim hover:text-riftapp-text transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-5 py-2 rounded-md bg-riftapp-accent text-white text-sm font-semibold hover:bg-riftapp-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creating…' : 'Create Channel'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
