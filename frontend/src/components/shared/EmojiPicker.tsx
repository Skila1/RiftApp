import { useState, useEffect, useRef, useMemo } from 'react';
import { useEmojiStore } from '../../stores/emojiStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import type { HubEmoji } from '../../types';

const UNICODE_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: 'Frequently Used', emojis: ['👍', '❤️', '😂', '🎉', '🔥', '👀', '😮', '🙏', '😢', '✨', '💀', '🤣', '💯', '🥺', '😭', '🤔'] },
  { label: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕'] },
  { label: 'Gestures', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏'] },
  { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'] },
  { label: 'Objects', emojis: ['⭐', '🌟', '💫', '✨', '🎵', '🎶', '🎹', '🎸', '🎺', '🥁', '🎮', '🕹️', '🎯', '🎲', '🧩', '🏆', '🥇', '🥈', '🥉', '🎗️', '🎫', '🎟️'] },
  { label: 'Symbols', emojis: ['💯', '🔥', '💥', '💢', '💨', '💦', '💤', '🕳️', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '🔔', '🔕', '❌', '⭕', '❗', '❓', '‼️', '⁉️', '✅', '☑️'] },
];

export interface EmojiSelection {
  /** Unicode emoji character, or `:name:` for custom. */
  emoji: string;
  /** Set only for custom hub emojis. */
  emojiId?: string;
  /** URL for custom emoji image. */
  fileUrl?: string;
}

interface EmojiPickerProps {
  /** Current hub ID (null for DMs — hides custom tab). */
  hubId?: string | null;
  /** Called when an emoji is selected. */
  onSelect: (selection: EmojiSelection) => void;
  /** Called when the picker should close. */
  onClose: () => void;
}

export default function EmojiPicker({ hubId, onSelect, onClose }: EmojiPickerProps) {
  const loadHubEmojis = useEmojiStore((s) => s.loadHubEmojis);
  const hubEmojis = useEmojiStore((s) => (hubId ? s.hubEmojis[hubId] : undefined));
  const [activeTab, setActiveTab] = useState<'unicode' | 'custom'>('unicode');
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hubId) void loadHubEmojis(hubId);
  }, [hubId, loadHubEmojis]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const filteredCustom = useMemo(() => {
    if (!hubEmojis) return [];
    if (!search) return hubEmojis;
    const q = search.toLowerCase();
    return hubEmojis.filter((e) => e.name.toLowerCase().includes(q));
  }, [hubEmojis, search]);

  const hasCustom = hubId && hubEmojis && hubEmojis.length > 0;

  const handleSelectUnicode = (emoji: string) => {
    onSelect({ emoji });
  };

  const handleSelectCustom = (e: HubEmoji) => {
    onSelect({ emoji: `:${e.name}:`, emojiId: e.id, fileUrl: e.file_url });
  };

  return (
    <div
      ref={ref}
      className="bg-riftapp-panel border border-riftapp-border/60 rounded-xl shadow-elevation-high w-[340px] max-h-[360px] flex flex-col animate-scale-in z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji…"
          className="w-full px-3 py-1.5 bg-riftapp-bg border border-riftapp-border/60 rounded-lg text-sm text-riftapp-text placeholder:text-riftapp-text-dim/50 focus:outline-none focus:ring-1 focus:ring-riftapp-accent/40"
          autoFocus
        />
      </div>

      {/* Tabs */}
      {hasCustom && (
        <div className="flex border-b border-riftapp-border/40 px-3 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('unicode')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === 'unicode'
                ? 'bg-riftapp-content-elevated text-riftapp-text border-b-2 border-riftapp-accent'
                : 'text-riftapp-text-dim hover:text-riftapp-text hover:bg-riftapp-content-elevated'
            }`}
          >
            Unicode
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === 'custom'
                ? 'bg-riftapp-content-elevated text-riftapp-text border-b-2 border-riftapp-accent'
                : 'text-riftapp-text-dim hover:text-riftapp-text hover:bg-riftapp-content-elevated'
            }`}
          >
            Server
          </button>
        </div>
      )}

      {/* Emoji grid */}
      <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
        {activeTab === 'unicode' && (
          <UnicodeGrid search={search} onSelect={handleSelectUnicode} />
        )}
        {activeTab === 'custom' && (
          <CustomGrid emojis={filteredCustom} onSelect={handleSelectCustom} />
        )}
      </div>
    </div>
  );
}

function UnicodeGrid({ search, onSelect }: { search: string; onSelect: (emoji: string) => void }) {
  const q = search.toLowerCase();
  return (
    <>
      {UNICODE_CATEGORIES.map((cat) => {
        const emojis = q ? cat.emojis.filter(() => true) : cat.emojis;
        if (q && emojis.length === 0) return null;
        // Simple search: when searching, show all emojis from all categories that aren't filtered
        // Since unicode emojis don't have text names to search, we show all when searching
        // In a full implementation you'd have emoji name data
        if (q) return null;
        return (
          <div key={cat.label} className="mb-2">
            <div className="text-[11px] font-semibold text-riftapp-text-dim uppercase tracking-wide mb-1 px-0.5">{cat.label}</div>
            <div className="grid grid-cols-8 gap-0.5">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-riftapp-content-elevated active:bg-riftapp-content-elevated transition-colors duration-100"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {q && (
        <div className="grid grid-cols-8 gap-0.5">
          {UNICODE_CATEGORIES.flatMap((c) => c.emojis).map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSelect(emoji)}
              className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-riftapp-content-elevated active:bg-riftapp-content-elevated transition-colors duration-100"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function CustomGrid({ emojis, onSelect }: { emojis: HubEmoji[]; onSelect: (e: HubEmoji) => void }) {
  if (emojis.length === 0) {
    return <div className="text-sm text-riftapp-text-dim text-center py-6">No custom emojis</div>;
  }
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onSelect(e)}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-riftapp-content-elevated active:bg-riftapp-content-elevated transition-colors duration-100 group/emoji"
          title={`:${e.name}:`}
        >
          <img
            src={publicAssetUrl(e.file_url)}
            alt={e.name}
            className="w-6 h-6 object-contain group-hover/emoji:scale-110 transition-transform duration-100"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}
