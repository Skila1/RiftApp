import { useState, useEffect, useRef } from 'react';
import { useStreamStore } from '../../stores/streamStore';
import ModalOverlay from '../shared/ModalOverlay';
import type { Category } from '../../types';
import ModalCloseButton from '../shared/ModalCloseButton';

interface Props {
  hubId: string;
  category: Category;
  onClose: () => void;
}

export default function EditCategoryModal({ hubId, category, onClose }: Props) {
  const [name, setName] = useState(category.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patchCategory = useStreamStore((s) => s.patchCategory);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving || trimmed === category.name) {
      if (trimmed === category.name) onClose();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await patchCategory(hubId, category.id, trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay isOpen onClose={onClose} zIndex={300}>
      <div className="bg-riftapp-panel rounded-xl shadow-modal w-full max-w-[440px] overflow-hidden border border-riftapp-border/50">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold">Edit Category</h2>
            <ModalCloseButton onClick={onClose} />
          </div>
          <p className="text-sm text-riftapp-text-dim mb-4">Change how this category appears in the sidebar.</p>
          <label className="text-xs font-bold uppercase tracking-wide text-riftapp-text-dim block mb-2">Category Name</label>
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
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-riftapp-content-elevated transition-colors">
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
    </ModalOverlay>
  );
}
