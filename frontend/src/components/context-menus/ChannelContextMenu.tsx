import { useEffect, useState } from 'react';
import { MenuOverlay, menuDivider } from './MenuOverlay';
import { api } from '../../api/client';
import type { Stream, StreamNotificationSettings } from '../../types';
import { useStreamStore } from '../../stores/streamStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import ConfirmModal from '../modals/ConfirmModal';

const DEFAULT_STREAM_NOTIFICATION: StreamNotificationSettings = {
  notification_level: 'mentions_only',
  suppress_everyone: false,
  suppress_role_mentions: false,
  suppress_highlights: false,
  mute_events: false,
  mobile_push: true,
  hide_muted_channels: false,
  channel_muted: false,
};

function notifLevelSubtitle(level: string): string {
  switch (level) {
    case 'all':
      return 'All Messages';
    case 'nothing':
      return 'Nothing';
    default:
      return 'Only @mentions';
  }
}

export interface ChannelMenuTarget {
  stream: Stream;
  x: number;
  y: number;
}

interface Props {
  hubId: string;
  target: ChannelMenuTarget;
  unreadCount: number;
  canManageChannels: boolean;
  firstTextStreamId: string | undefined;
  onClose: () => void;
  onInviteServer: () => void;
  onCreateTextChannel: (categoryId?: string | null) => void;
  onCreateVoiceChannel: (categoryId?: string | null) => void;
  onEditChannel: (stream: Stream) => void;
}

export default function ChannelContextMenu({
  hubId,
  target,
  unreadCount,
  canManageChannels,
  firstTextStreamId,
  onClose,
  onInviteServer,
  onCreateTextChannel,
  onCreateVoiceChannel,
  onEditChannel,
}: Props) {
  const { stream, x, y } = target;
  const isText = stream.type === 0;
  const markStreamRead = useStreamStore((s) => s.markStreamRead);
  const deleteStream = useStreamStore((s) => s.deleteStream);
  const setActiveStream = useStreamStore((s) => s.setActiveStream);
  const closeVoiceView = useVoiceChannelUiStore((s) => s.closeVoiceView);

  const hideNames = useVoiceChannelUiStore((s) => s.hideNamesByStream[stream.id] ?? false);
  const toggleHideNames = useVoiceChannelUiStore((s) => s.toggleHideNames);
  const developerMode = useAppSettingsStore((s) => s.developerMode);

  const [streamNotifSettings, setStreamNotifSettings] = useState<StreamNotificationSettings | null>(null);
  const [muteSubOpen, setMuteSubOpen] = useState(false);
  const [notifSubOpen, setNotifSubOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getStreamNotificationSettings(stream.id);
        if (!cancelled) setStreamNotifSettings(s);
      } catch {
        if (!cancelled) setStreamNotifSettings(DEFAULT_STREAM_NOTIFICATION);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stream.id]);

  const copyChannelId = () => {
    void navigator.clipboard.writeText(stream.id);
    onClose();
  };

  const copyLink = () => {
    const url = `${window.location.origin}/app/hubs/${hubId}/${stream.id}`;
    void navigator.clipboard.writeText(url);
    onClose();
  };

  const patchNotif = async (next: StreamNotificationSettings) => {
    setStreamNotifSettings(next);
    try {
      const saved = await api.patchStreamNotificationSettings(stream.id, next);
      setStreamNotifSettings(saved);
    } catch {
      try {
        setStreamNotifSettings(await api.getStreamNotificationSettings(stream.id));
      } catch {
        /* ignore */
      }
    }
  };

  const setChannelMuted = async (muted: boolean) => {
    if (!streamNotifSettings) return;
    await patchNotif({ ...streamNotifSettings, channel_muted: muted });
    onClose();
  };

  const handleDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteStream(stream.id);
      setDeleteOpen(false);
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete channel');
    } finally {
      setDeleteBusy(false);
    }
  };

  const markReadDisabled = !isText || unreadCount <= 0;

  return (
    <>
      <MenuOverlay x={x} y={y} onClose={onClose}>
        <div className="rift-context-menu-shell min-w-[220px] max-h-[min(90vh,520px)] overflow-y-auto text-[13px] text-[#dbdee1]">
        <button
          type="button"
          disabled={markReadDisabled}
          onClick={async () => {
            onClose();
            await markStreamRead(stream.id);
          }}
          className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)] disabled:opacity-40 disabled:pointer-events-none"
        >
          <span className="w-4 shrink-0" aria-hidden />
          Mark As Read
        </button>

        {menuDivider()}

        <button
          type="button"
          onClick={() => {
            onClose();
            onInviteServer();
          }}
          className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
        >
          <span className="w-4 shrink-0" aria-hidden />
          {isText ? 'Invite to Channel' : 'Invite to Voice'}
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
        >
          <span className="w-4 shrink-0" aria-hidden />
          Copy Link
        </button>

        {!isText && (
          <>
            {menuDivider()}
            <button
              type="button"
              disabled={!firstTextStreamId}
              onClick={() => {
                if (!firstTextStreamId) return;
                onClose();
                void setActiveStream(firstTextStreamId);
                closeVoiceView();
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)] disabled:opacity-40"
            >
              <span className="w-4 shrink-0" aria-hidden />
              Open Chat
            </button>
            <button
              type="button"
              disabled
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded text-left w-[calc(100%-8px)] opacity-40 cursor-not-allowed"
            >
              <span className="w-4 shrink-0" aria-hidden />
              Set Channel Status
            </button>
            <button
              type="button"
              onClick={() => toggleHideNames(stream.id)}
              className="flex items-center justify-between gap-2 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <span>Hide Names</span>
              <span
                className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                  hideNames ? 'bg-[#5865f2] border-[#5865f2]' : 'border-[#4e5058]'
                }`}
              >
                {hideNames && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
            </button>
          </>
        )}

        {menuDivider()}

        <div className="relative mx-1" onMouseEnter={() => setMuteSubOpen(true)} onMouseLeave={() => setMuteSubOpen(false)}>
          <div
            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-default ${
              muteSubOpen ? 'bg-[#232428]' : 'hover:bg-[#232428]'
            }`}
          >
            <span>Mute Channel</span>
            <span className="text-riftapp-text-dim">›</span>
          </div>
          {muteSubOpen && streamNotifSettings && (
            <div className="absolute left-full top-0 pl-1 z-10" onMouseEnter={() => setMuteSubOpen(true)} onMouseLeave={() => setMuteSubOpen(false)}>
              <div className="rift-context-submenu-shell min-w-[200px]">
                {(['For 15 Minutes', 'For 1 Hour', 'For 8 Hours', 'Until I Turn It Back On'] as const).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void setChannelMuted(true)}
                    className="block text-left px-2.5 py-1.5 hover:bg-[#232428] rounded-sm mx-1 w-[calc(100%-8px)]"
                  >
                    {label}
                  </button>
                ))}
                <div className="mx-2 my-1 h-px bg-white/[0.06]" />
                <button
                  type="button"
                  onClick={() => void setChannelMuted(false)}
                  className="block text-left px-2.5 py-1.5 hover:bg-[#232428] rounded-sm mx-1 w-[calc(100%-8px)]"
                >
                  Unmute
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative mx-1" onMouseEnter={() => setNotifSubOpen(true)} onMouseLeave={() => setNotifSubOpen(false)}>
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-default ${notifSubOpen ? 'bg-[#232428]' : 'hover:bg-[#232428]'}`}
          >
            <span className="w-4 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span>Notification Settings</span>
                <span className="text-riftapp-text-dim">›</span>
              </div>
              <p className="text-[11px] text-[#949ba4] leading-tight mt-0.5">
                {streamNotifSettings ? notifLevelSubtitle(streamNotifSettings.notification_level) : '…'}
              </p>
            </div>
          </div>
          {notifSubOpen && streamNotifSettings && (
            <div className="absolute left-full top-0 pl-1 z-10" onMouseEnter={() => setNotifSubOpen(true)} onMouseLeave={() => setNotifSubOpen(false)}>
              <div className="rift-context-submenu-shell min-w-[260px] max-h-[min(70vh,420px)] overflow-y-auto">
                {(['all', 'mentions_only', 'nothing'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() =>
                      void patchNotif({
                        ...streamNotifSettings,
                        notification_level: level,
                      })
                    }
                    className="flex items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-[#232428] rounded-sm mx-1 w-[calc(100%-8px)]"
                  >
                    <span
                      className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        streamNotifSettings.notification_level === level ? 'border-[#5865f2]' : 'border-[#4e5058]'
                      }`}
                    >
                      {streamNotifSettings.notification_level === level && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                    {level === 'all' && 'All Messages'}
                    {level === 'mentions_only' && 'Only @mentions'}
                    {level === 'nothing' && 'Nothing'}
                  </button>
                ))}
                <div className="mx-2 my-1 h-px bg-white/[0.06]" />
                {(
                  [
                    ['suppress_everyone', 'Suppress @everyone and @here'],
                    ['suppress_role_mentions', 'Suppress All Role @mentions'],
                    ['suppress_highlights', 'Suppress Highlights'],
                    ['mute_events', 'Mute New Events'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void patchNotif({ ...streamNotifSettings, [key]: !streamNotifSettings[key] })}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-[#232428] rounded-sm mx-1 w-[calc(100%-8px)]"
                  >
                    <span>{label}</span>
                    <span
                      className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                        streamNotifSettings[key] ? 'bg-[#5865f2] border-[#5865f2]' : 'border-[#4e5058]'
                      }`}
                    >
                      {streamNotifSettings[key] && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  </button>
                ))}
                <div className="mx-2 my-1 h-px bg-white/[0.06]" />
                <button
                  type="button"
                  onClick={() => void patchNotif({ ...streamNotifSettings, mobile_push: !streamNotifSettings.mobile_push })}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-[#232428] rounded-sm mx-1 w-[calc(100%-8px)]"
                >
                  <span>Mobile Push Notifications</span>
                  <span
                    className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                      streamNotifSettings.mobile_push ? 'bg-[#5865f2] border-[#5865f2]' : 'border-[#4e5058]'
                    }`}
                  >
                    {streamNotifSettings.mobile_push && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {canManageChannels && (
          <>
            {menuDivider()}
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditChannel(stream);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <span className="w-4 shrink-0" aria-hidden />
              {isText ? 'Edit Channel' : 'Edit Channel'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)] text-[#f23f42]"
            >
              <span className="w-4 shrink-0" aria-hidden />
              Delete Channel
            </button>
            {menuDivider()}
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateTextChannel(stream.category_id);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <span className="w-4 shrink-0" aria-hidden />
              Create Text Channel
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateVoiceChannel(stream.category_id);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <span className="w-4 shrink-0" aria-hidden />
              Create Voice Channel
            </button>
          </>
        )}

        {menuDivider()}

        {developerMode && (
        <button
          type="button"
          onClick={copyChannelId}
          className="flex items-center justify-between gap-2 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
        >
          <span>Copy Channel ID</span>
          <span className="text-[10px] font-mono font-semibold px-1 py-0.5 rounded bg-[#1e1f22] border border-[#3f4147] text-[#b5bac1]">ID</span>
        </button>
        )}
        </div>
      </MenuOverlay>

      <ConfirmModal
        isOpen={deleteOpen}
        title="Delete Channel"
        description={`Delete #${stream.name}? This cannot be undone.`}
        confirmText="Delete Channel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteError(null);
          onClose();
        }}
        loading={deleteBusy}
      >
        {deleteError && <p className="text-sm text-[#f23f42]">{deleteError}</p>}
      </ConfirmModal>
    </>
  );
}
