import { useState, useEffect, useRef } from 'react';
import { useStreamStore } from '../../stores/streamStore';
import ModalOverlay from '../shared/ModalOverlay';
import ModalCloseButton from '../shared/ModalCloseButton';

interface Props {
  hubId: string;
  onClose: () => void;
}

export default function CreateCategoryModal({ hubId, onClose }: Props) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const createCategory = useStreamStore((s) => s.createCategory);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <ModalOverlay isOpen onClose={onClose} zIndex={300}>
      <div className="w-full max-w-[440px] overflow-hidden rounded-xl border border-[#2f3440] bg-[#1f2228] shadow-modal">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Create Category</h2>
            <ModalCloseButton onClick={onClose} />
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

        <div className="flex justify-end gap-3 bg-[#181b20] px-6 py-4 shadow-[0_-1px_0_rgba(255,255,255,0.04)]">
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
    </ModalOverlay>
  );
}
