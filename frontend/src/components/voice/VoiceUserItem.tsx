import { useCallback, useState } from 'react';
import type { User } from '../../types';
import type { VoiceParticipant } from '../../stores/voiceStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import VoiceParticipantContextMenu from './VoiceParticipantContextMenu';

interface Props {
  participant: VoiceParticipant;
  member?: User;
  streamId: string;
  hubId: string | null;
  hideName?: boolean;
  canModerate: boolean;
  onVoiceDragStart?: (userId: string, sourceStreamId: string) => void;
  onVoiceDragEnd?: () => void;
  isDragging?: boolean;
}

export default function VoiceUserItem({
  participant,
  member,
  streamId,
  hubId,
  hideName = false,
  canModerate,
  onVoiceDragStart,
  onVoiceDragEnd,
  isDragging = false,
}: Props) {
  const openProfile = useProfilePopoverStore((state) => state.open);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const name = member?.display_name || member?.username || participant.identity;
  const avatarUrl = member?.avatar_url;
  const draggable = canModerate && Boolean(member?.id);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!member) return;
    openProfile(member, event.currentTarget.getBoundingClientRect());
  }, [member, openProfile]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const handleDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    if (!draggable) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', participant.identity);
    onVoiceDragStart?.(participant.identity, streamId);
    setMenu(null);
  }, [draggable, participant.identity, onVoiceDragStart, streamId]);

  const handleDragEnd = useCallback(() => {
    onVoiceDragEnd?.();
  }, [onVoiceDragEnd]);

  return (
    <>
      <button
        type="button"
        draggable={draggable}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-riftapp-surface-hover/50 transition-colors group text-left ${
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        } ${isDragging ? 'opacity-40' : ''}`}
        title={draggable ? 'Drag to move user' : name}
      >
        <div className={`w-6 h-6 rounded-full flex-shrink-0 overflow-hidden ${participant.isSpeaking ? 'ring-2 ring-riftapp-success ring-offset-1 ring-offset-riftapp-surface' : ''}`}>
          {avatarUrl ? (
            <img src={publicAssetUrl(avatarUrl)} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-[9px] font-semibold ${
              participant.isSpeaking ? 'bg-riftapp-success text-white' : 'bg-riftapp-panel text-riftapp-text-muted'
            }`}>
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <span className={`text-[13px] truncate flex-1 ${participant.isSpeaking ? 'text-riftapp-success font-medium' : 'text-riftapp-text-muted'}`}>
          {hideName ? 'User' : name}
        </span>
        {participant.isScreenSharing && (
          <span className="flex-shrink-0 rounded bg-[#ed4245] px-1 py-[1px] text-[10px] font-extrabold leading-tight text-white uppercase tracking-wide">
            Live
          </span>
        )}
        {participant.isMuted && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riftapp-danger/70 flex-shrink-0">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
          </svg>
        )}
      </button>

      {menu && (
        <VoiceParticipantContextMenu
          participant={participant}
          member={member}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          hubId={hubId}
          canModerate={canModerate}
        />
      )}
    </>
  );
}