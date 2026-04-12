import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { MenuOverlay, menuDivider } from '../context-menus/MenuOverlay';
import type { RelationshipType, User } from '../../types';
import type { VoiceParticipant } from '../../stores/voiceStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import { useFriendStore } from '../../stores/friendStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';

function MenuRow({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md text-[14px] transition-colors flex items-center justify-between gap-3 ${
        disabled
          ? 'text-[#5c5e66] cursor-not-allowed opacity-60'
          : danger
            ? 'text-[#f23f42] hover:bg-riftapp-danger hover:text-white'
        : 'text-riftapp-text hover:bg-riftapp-accent hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-[11px] font-normal text-riftapp-text-dim">{children}</span>;
}

function CheckboxMark({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
        checked ? 'bg-[#5865f2] border-[#5865f2]' : 'border-riftapp-border-light bg-riftapp-menu-hover'
      }`}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

interface Props {
  participant: VoiceParticipant;
  member: User | undefined;
  x: number;
  y: number;
  onClose: () => void;
  showNonVideoParticipants?: boolean;
  onToggleShowNonVideo?: () => void;
  onRequestFocus?: () => void;
  onRequestFullscreen?: () => void;
  /** Stream tile hidden via Stop Watching — offer to show again */
  streamHiddenLocally?: boolean;
  onResumeStream?: () => void;
  hubId?: string | null;
  canModerate?: boolean;
}

export default function VoiceParticipantContextMenu({
  participant,
  member,
  x,
  y,
  onClose,
  showNonVideoParticipants,
  onToggleShowNonVideo,
  onRequestFocus,
  onRequestFullscreen,
  streamHiddenLocally,
  onResumeStream,
  hubId,
  canModerate = false,
}: Props) {
  const navigate = useNavigate();
  const myId = useAuthStore((s) => s.user?.id);
  const developerMode = useAppSettingsStore((s) => s.developerMode);
  const isLocal = myId != null && participant.identity === myId;

  const setParticipantVolume = useVoiceStore((s) => s.setParticipantVolume);
  const participantVolumes = useVoiceStore((s) => s.participantVolumes);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleCamera = useVoiceStore((s) => s.toggleCamera);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const openProfile = useProfilePopoverStore((s) => s.openModal);
  const openDM = useDMStore((s) => s.openDM);
  const closeVoiceView = useVoiceChannelUiStore((s) => s.closeVoiceView);
  const [relationship, setRelationship] = useState<RelationshipType>('none');
  const [relLoading, setRelLoading] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);

  const [sliderVal, setSliderVal] = useState(100);

  useEffect(() => {
    setSliderVal(Math.round((participantVolumes[participant.identity] ?? 1) * 100));
  }, [participant.identity, participantVolumes]);

  useEffect(() => {
    if (!member?.id || isLocal) {
      setRelationship('none');
      return;
    }
    api.getRelationship(member.id).then((response) => setRelationship(response.relationship)).catch(() => {});
  }, [member?.id, isLocal]);

  const handleProfile = useCallback(() => {
    if (member) openProfile(member);
    onClose();
  }, [member, openProfile, onClose]);

  const handleMessage = useCallback(async () => {
    if (!member?.id) return;
    onClose();
    closeVoiceView();
    await openDM(member.id);
    const convId = useDMStore.getState().activeConversationId;
    if (convId) navigate(`/app/dms/${convId}`);
  }, [closeVoiceView, member?.id, navigate, onClose, openDM]);

  const handleMention = useCallback(() => {
    const uname = member?.username;
    if (uname) {
      document.dispatchEvent(new CustomEvent('insert-mention', { detail: uname }));
    }
    onClose();
  }, [member?.username, onClose]);

  const handleCopyId = useCallback(() => {
    void navigator.clipboard.writeText(participant.identity);
    onClose();
  }, [participant.identity, onClose]);

  const handleAddFriend = useCallback(async () => {
    if (!member?.id) return;
    setRelLoading(true);
    try {
      await useFriendStore.getState().sendRequest(member.id);
      setRelationship('pending_outgoing');
      onClose();
    } catch {
      setRelLoading(false);
    }
    setRelLoading(false);
  }, [member?.id, onClose]);

  const handleAcceptFriend = useCallback(async () => {
    if (!member?.id) return;
    setRelLoading(true);
    try {
      await useFriendStore.getState().acceptRequest(member.id);
      setRelationship('friends');
      onClose();
    } catch {
      setRelLoading(false);
    }
    setRelLoading(false);
  }, [member?.id, onClose]);

  const handleRemoveFriend = useCallback(async () => {
    if (!member?.id) return;
    setRelLoading(true);
    try {
      await useFriendStore.getState().removeFriend(member.id);
      setRelationship('none');
      onClose();
    } catch {
      setRelLoading(false);
    }
    setRelLoading(false);
  }, [member?.id, onClose]);

  const handleBlock = useCallback(async () => {
    if (!member?.id) return;
    setRelLoading(true);
    try {
      await useFriendStore.getState().blockUser(member.id);
      setRelationship('blocked');
      onClose();
    } catch {
      setRelLoading(false);
    }
    setRelLoading(false);
  }, [member?.id, onClose]);

  const handleUnblock = useCallback(async () => {
    if (!member?.id) return;
    setRelLoading(true);
    try {
      await useFriendStore.getState().unblockUser(member.id);
      setRelationship('none');
      onClose();
    } catch {
      setRelLoading(false);
    }
    setRelLoading(false);
  }, [member?.id, onClose]);

  const handleDisconnect = useCallback(async () => {
    if (!hubId || !member?.id || isLocal || !canModerate) return;
    setModerationBusy(true);
    try {
      await api.disconnectVoiceUser(hubId, member.id);
      onClose();
    } catch {
      setModerationBusy(false);
    }
    setModerationBusy(false);
  }, [hubId, member?.id, isLocal, canModerate, onClose]);

  const muteChecked = isLocal ? isMuted : participant.isMuted;
  const videoDisabledChecked = isLocal ? !isCameraOn : !participant.isCameraOn;

  const volumeSection = !isLocal ? (
    <div className="px-3 py-2">
      <div className="mb-2 text-[12px] font-semibold text-riftapp-text">User Volume</div>
      <input
        type="range"
        min={0}
        max={100}
        value={sliderVal}
        onChange={(e) => {
          const n = Number(e.target.value);
          setSliderVal(n);
          setParticipantVolume(participant.identity, n / 100);
        }}
        className="w-full h-1 rounded-full appearance-none cursor-pointer bg-[#4e5058] accent-[#5865f2]"
        style={{
          background: `linear-gradient(to right, #5865f2 0%, #5865f2 ${sliderVal}%, #4e5058 ${sliderVal}%, #4e5058 100%)`,
        }}
      />
    </div>
  ) : null;

  return (
    <MenuOverlay x={x} y={y} onClose={onClose}>
      <div
        className="rift-context-menu-shell max-h-[min(85vh,560px)] overflow-y-auto"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="px-1">
          <MenuRow onClick={handleProfile} disabled={!member}>
            <span>Profile</span>
          </MenuRow>
          {!isLocal && (
            <MenuRow onClick={() => { void handleMessage(); }} disabled={!member?.id}>
              <span>Message</span>
            </MenuRow>
          )}
          {!isLocal && (
            <MenuRow onClick={handleMention} disabled={!member?.username}>
              <span>Mention</span>
            </MenuRow>
          )}
          {streamHiddenLocally && participant.isScreenSharing && participant.screenTrack && (
            <MenuRow
              onClick={() => {
                onResumeStream?.();
                onClose();
              }}
            >
              <span>Resume watching stream</span>
            </MenuRow>
          )}
          {onRequestFocus && (
            <MenuRow onClick={() => { onRequestFocus(); onClose(); }}>
              <span>Focus Tile</span>
            </MenuRow>
          )}
          {onRequestFullscreen && (
            <MenuRow onClick={() => { onRequestFullscreen(); onClose(); }}>
              <span>Fullscreen</span>
            </MenuRow>
          )}
        </div>

        {!isLocal && member && (
          <>
            {menuDivider()}
            <div className="px-1">
              {relationship === 'none' && (
                <MenuRow onClick={() => { void handleAddFriend(); }} disabled={relLoading}>
                  <span>{relLoading ? 'Sending Friend Request...' : 'Add Friend'}</span>
                </MenuRow>
              )}
              {relationship === 'pending_incoming' && (
                <MenuRow onClick={() => { void handleAcceptFriend(); }} disabled={relLoading}>
                  <span>{relLoading ? 'Accepting...' : 'Accept Friend Request'}</span>
                </MenuRow>
              )}
              {relationship === 'pending_outgoing' && (
                <MenuRow disabled>
                  <span>Friend Request Pending</span>
                </MenuRow>
              )}
              {relationship === 'friends' && (
                <MenuRow onClick={() => { void handleRemoveFriend(); }} disabled={relLoading} danger>
                  <span>{relLoading ? 'Removing...' : 'Remove Friend'}</span>
                </MenuRow>
              )}
              {relationship === 'blocked' ? (
                <MenuRow onClick={() => { void handleUnblock(); }} disabled={relLoading}>
                  <span>{relLoading ? 'Unblocking...' : 'Unblock'}</span>
                </MenuRow>
              ) : (
                <MenuRow onClick={() => { void handleBlock(); }} disabled={relLoading} danger>
                  <span>{relLoading ? 'Blocking...' : 'Block'}</span>
                </MenuRow>
              )}
            </div>
          </>
        )}

        {volumeSection}

        {volumeSection || isLocal ? menuDivider() : null}

        <div className="px-1">
          {isLocal && (
            <>
              <MenuRow onClick={() => { void toggleMute(); }}>
                <span>Mute</span>
                <CheckboxMark checked={muteChecked} />
              </MenuRow>
              <MenuRow onClick={() => { void toggleCamera(); }}>
                <span>Disable Video</span>
                <CheckboxMark checked={videoDisabledChecked} />
              </MenuRow>
            </>
          )}
          {onToggleShowNonVideo && typeof showNonVideoParticipants === 'boolean' && (
            <MenuRow onClick={onToggleShowNonVideo}>
              <span>Show Non-Video Participants</span>
              <CheckboxMark checked={showNonVideoParticipants} />
            </MenuRow>
          )}
        </div>

        {canModerate && !isLocal && member?.id && hubId && (
          <>
            {menuDivider()}
            <div className="px-1">
              <div className="px-3 py-2 text-[11px] text-[#949ba4] leading-snug">
                Drag this user onto another voice channel in the sidebar to move them.
              </div>
              <MenuRow onClick={() => { void handleDisconnect(); }} disabled={moderationBusy} danger>
                <div>
                  Disconnect From Voice
                  <SubLabel>Moderator action</SubLabel>
                </div>
              </MenuRow>
            </div>
          </>
        )}

        {developerMode && (
          <>
            {menuDivider()}
            <div className="px-1">
              <MenuRow onClick={handleCopyId}>
                <span>Copy User ID</span>
              </MenuRow>
            </div>
          </>
        )}
      </div>
    </MenuOverlay>
  );
}
