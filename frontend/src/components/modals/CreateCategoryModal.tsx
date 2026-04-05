import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStreamStore } from '../../stores/streamStore';

interface Props {
  hubId: string;
  onClose: () => void;
}

export default function CreateCategoryModal({ hubId, onClose }: Props) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const createCategory = useStreamStore((s) => s.createCategory);
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
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await createCategory(hubId, name.trim());
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return createPortal(
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60"
    >
      <div className="bg-riftapp-panel rounded-xl shadow-modal w-full max-w-[440px] overflow-hidden animate-scale-in">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Create Category</h2>
            <button onClick={onClose} className="text-riftapp-text-dim hover:text-riftapp-text transition-colors p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <label className="text-xs font-bold uppercase tracking-wide text-riftapp-text-dim block mb-2">Category Name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="New Category"
            maxLength={100}
            className="w-full px-3 py-2.5 rounded-lg bg-riftapp-bg border border-riftapp-border text-sm outline-none focus:border-riftapp-accent transition-colors"
          />
        </div>

        <div className="bg-riftapp-surface px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-riftapp-text-dim hover:text-riftapp-text transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-5 py-2 rounded-md bg-riftapp-accent text-white text-sm font-semibold hover:bg-riftapp-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creating…' : 'Create Category'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
