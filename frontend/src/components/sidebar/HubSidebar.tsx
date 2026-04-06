import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHubStore } from '../../stores/hubStore';
import { useDMStore } from '../../stores/dmStore';
import { useStreamStore } from '../../stores/streamStore';
import { useMessageStore } from '../../stores/messageStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { api } from '../../api/client';
import type { Hub, HubNotificationSettings, Notification } from '../../types';
import AddServerModal from '../modals/AddServerModal';
import InviteToServerModal from '../modals/InviteToServerModal';
import ModalOverlay from '../shared/ModalOverlay';
import { useAuthStore } from '../../stores/auth';
import { publicAssetUrl } from '../../utils/publicAssetUrl';

const DEFAULT_HUB_NOTIFICATION: HubNotificationSettings = {
  notification_level: 'mentions_only',
  suppress_everyone: false,
  suppress_role_mentions: false,
  suppress_highlights: false,
  mute_events: false,
  mobile_push: true,
  hide_muted_channels: false,
  server_muted: false,
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

function hubMentionCount(notifications: Notification[], hubId: string) {
  return notifications.filter(
    (n) => !n.read && n.hub_id === hubId && n.type === 'mention'
  ).length;
}

/** Quiet activity: channel unreads (when not viewing that hub) or non-mention notifications (invites, etc.). */
function hubHasQuietUnread(
  hubId: string,
  activeHubId: string | null,
  notifications: Notification[],
  streamUnreads: Record<string, number>,
  streamHubMap: Record<string, string>
) {
  const notifQuiet = notifications.some(
    (n) => !n.read && n.hub_id === hubId && n.type !== 'mention'
  );
  if (activeHubId === hubId) {
    return notifQuiet;
  }
  return (
    notifQuiet ||
    Object.entries(streamUnreads).some(
      ([sid, c]) => (c ?? 0) > 0 && streamHubMap[sid] === hubId
    )
  );
}

function formatMentionBadge(n: number) {
  if (n <= 0) return '';
  return n > 9 ? '9+' : String(n);
}

export default function HubSidebar() {
  const hubs = useHubStore((s) => s.hubs);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const setActiveHub = useHubStore((s) => s.setActiveHub);
  const leaveHub = useHubStore((s) => s.leaveHub);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const loadConversations = useDMStore((s) => s.loadConversations);
  const [showAddServer, setShowAddServer] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dmHovered, setDmHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hub: Hub } | null>(null);
  const [inviteHub, setInviteHub] = useState<Hub | null>(null);
  const [leaveConfirmHub, setLeaveConfirmHub] = useState<Hub | null>(null);
  const [hubNotifSettings, setHubNotifSettings] = useState<HubNotificationSettings | null>(null);
  const [notifSubmenuOpen, setNotifSubmenuOpen] = useState(false);
  const mergeReadStatesForHub = useStreamStore((s) => s.mergeReadStatesForHub);
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);

  const notifications = useNotificationStore((s) => s.notifications);
  const streamUnreads = useStreamStore((s) => s.streamUnreads);
  const streamHubMap = useStreamStore((s) => s.streamHubMap);
  const dmTotalUnread = useDMStore((s) => s.dmTotalUnread);

  const isDMMode = !activeHubId;

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) {
      setHubNotifSettings(null);
      setNotifSubmenuOpen(false);
      return;
    }
    let cancelled = false;
    setHubNotifSettings(null);
    (async () => {
      try {
        const st = await api.getHubNotificationSettings(contextMenu.hub.id);
        if (!cancelled) setHubNotifSettings(st);
      } catch {
        if (!cancelled) setHubNotifSettings({ ...DEFAULT_HUB_NOTIFICATION });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextMenu?.hub.id]);

  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  const handleDMClick = () => {
    // Enter DM mode: clear hub selection, load conversations
    useHubStore.getState().clearActive();
    useStreamStore.getState().clearStreams();
    useMessageStore.getState().clearMessages();
    loadConversations();
  };

  return (
    <div className="w-[72px] flex-shrink-0 bg-riftapp-bg flex flex-col items-center py-3 gap-2 overflow-y-auto">
      {/* DM Button */}
      <div
        className="relative flex items-center justify-center w-full"
        onMouseEnter={() => setDmHovered(true)}
        onMouseLeave={() => setDmHovered(false)}
      >
        <div
          className={`hub-pill ${
            isDMMode
              ? 'h-10 top-1'
              : dmHovered
                ? 'h-5 top-3.5'
                : 'h-0 top-6'
          }`}
        />
        <button
          onClick={handleDMClick}
          className={`hub-icon relative ${isDMMode ? 'hub-icon-active shadow-glow-sm' : 'hub-icon-idle'}`}
          title="Direct Messages"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {dmTotalUnread > 0 && (
            <span
              className="absolute -bottom-1 -right-1 z-20 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white border-2 border-riftapp-bg leading-none"
              aria-label={`${dmTotalUnread} unread direct messages`}
            >
              {formatMentionBadge(dmTotalUnread)}
            </span>
          )}
        </button>
        {dmHovered && (
          <div className="absolute left-[68px] z-50 px-3 py-1.5 rounded-lg bg-riftapp-panel text-sm text-riftapp-text shadow-elevation-high font-medium whitespace-nowrap animate-fade-in pointer-events-none">
            Direct Messages
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-8 h-0.5 rounded-full bg-riftapp-border my-0.5" />

      {/* Hub list */}
      {hubs.map((hub) => {
        const isActive = activeHubId === hub.id;
        const isHovered = hoveredId === hub.id;
        const mentions = hubMentionCount(notifications, hub.id);
        const quietUnread = hubHasQuietUnread(
          hub.id,
          activeHubId,
          notifications,
          streamUnreads,
          streamHubMap
        );

        return (
          <div
            key={hub.id}
            className="relative flex items-center justify-center w-full"
            onMouseEnter={() => setHoveredId(hub.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Active / hover pill indicator */}
            <div
              className={`hub-pill ${
                isActive
                  ? 'h-10 top-1'
                  : isHovered
                    ? 'h-5 top-3.5'
                    : 'h-0 top-6'
              }`}
            />

            {quietUnread && <div className="hub-unread-smidge" aria-hidden />}

            {/* Hub icon with Discord-style morph */}
            <button
              onClick={() => setActiveHub(hub.id)}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, hub }); }}
              title={hub.name}
              className={`hub-icon relative ${isActive ? 'hub-icon-active shadow-glow-sm' : 'hub-icon-idle'}`}
            >
              {hub.icon_url ? (
                <img
                  src={publicAssetUrl(hub.icon_url)}
                  alt=""
                  className="w-full h-full rounded-[inherit] object-cover"
                />
              ) : (
                hub.name.slice(0, 2).toUpperCase()
              )}
              {mentions > 0 && (
                <span
                  className="absolute -bottom-1 -right-1 z-20 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white border-2 border-riftapp-bg leading-none"
                  aria-label={`${mentions} mentions`}
                >
                  {formatMentionBadge(mentions)}
                </span>
              )}
            </button>

            {/* Tooltip */}
            {isHovered && (
              <div className="absolute left-[68px] z-50 px-3 py-1.5 rounded-lg bg-riftapp-panel text-sm text-riftapp-text shadow-elevation-high font-medium whitespace-nowrap animate-fade-in pointer-events-none">
                {hub.name}
              </div>
            )}
          </div>
        );
      })}

      {/* Separator */}
      <div className="w-8 h-0.5 rounded-full bg-riftapp-border my-0.5" />

      {/* Add server button */}
      <div className="relative flex items-center justify-center w-full">
        <button
          onClick={() => setShowAddServer(true)}
          className="hub-icon rounded-3xl bg-riftapp-surface text-riftapp-success hover:rounded-2xl hover:bg-riftapp-success hover:text-white transition-all duration-300"
          title="Add a server"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Hub right-click context menu (Discord-style) */}
      {contextMenu && createPortal(
        <div
          className="fixed inset-0 z-[200]"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="fixed animate-scale-in"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#111214] rounded-md border border-black/40 shadow-modal py-1.5 min-w-[220px] text-[13px] text-riftapp-text select-none">
              <button
                type="button"
                onClick={async () => {
                  const hub = contextMenu.hub;
                  try {
                    await api.markHubRead(hub.id);
                    await mergeReadStatesForHub(hub.id);
                    await loadNotifications();
                  } catch { /* ignore */ }
                  setContextMenu(null);
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-riftapp-text-dim shrink-0">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Mark As Read
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviteHub(contextMenu.hub);
                  setContextMenu(null);
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-riftapp-text-dim shrink-0">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Invite to Server
              </button>

              <div className="mx-2 my-1 h-px bg-white/[0.06]" />

              <button
                type="button"
                disabled={hubNotifSettings == null}
                onClick={async () => {
                  if (!hubNotifSettings) return;
                  const next = { ...hubNotifSettings, server_muted: !hubNotifSettings.server_muted };
                  setHubNotifSettings(next);
                  try {
                    const saved = await api.patchHubNotificationSettings(contextMenu.hub.id, next);
                    setHubNotifSettings(saved);
                  } catch {
                    try {
                      setHubNotifSettings(await api.getHubNotificationSettings(contextMenu.hub.id));
                    } catch {
                      setHubNotifSettings(hubNotifSettings);
                    }
                  }
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)] disabled:opacity-50"
              >
                <span className="w-4 shrink-0" aria-hidden />
                {hubNotifSettings?.server_muted ? 'Unmute Server' : 'Mute Server'}
              </button>

              <div
                className="relative mx-1"
                onMouseEnter={() => setNotifSubmenuOpen(true)}
                onMouseLeave={() => setNotifSubmenuOpen(false)}
              >
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-default ${notifSubmenuOpen ? 'bg-[#232428]' : 'hover:bg-[#232428]'}`}
                >
                  <span className="w-4 shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span>Notification Settings</span>
                      <span className="text-riftapp-text-dim">›</span>
                    </div>
                    <p className="text-[11px] text-riftapp-text-dim leading-tight mt-0.5">
                      {hubNotifSettings ? notifLevelSubtitle(hubNotifSettings.notification_level) : '…'}
                    </p>
                  </div>
                </div>

                {notifSubmenuOpen && hubNotifSettings && (
                  <div
                    className="absolute left-full top-0 pl-1 z-10"
                    onMouseEnter={() => setNotifSubmenuOpen(true)}
                  >
                    <div className="bg-[#111214] rounded-md border border-black/40 shadow-modal py-1.5 min-w-[260px]">
                      {(['all', 'mentions_only', 'nothing'] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={async () => {
                            const base = hubNotifSettings;
                            const next = { ...base, notification_level: level };
                            setHubNotifSettings(next);
                            try {
                              const saved = await api.patchHubNotificationSettings(contextMenu.hub.id, next);
                              setHubNotifSettings(saved);
                            } catch {
                              try {
                                setHubNotifSettings(await api.getHubNotificationSettings(contextMenu.hub.id));
                              } catch { /* ignore */ }
                            }
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-[#232428] rounded-sm mx-1 w-[calc(100%-8px)]"
                        >
                          <span
                            className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              hubNotifSettings.notification_level === level ? 'border-[#5865f2]' : 'border-riftapp-border'
                            }`}
                          >
                            {hubNotifSettings.notification_level === level && (
                              <span className="w-2 h-2 rounded-full bg-white" />
                            )}
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
                          onClick={async () => {
                            const base = hubNotifSettings;
                            const next = { ...base, [key]: !base[key] };
                            setHubNotifSettings(next);
                            try {
                              const saved = await api.patchHubNotificationSettings(contextMenu.hub.id, next);
                              setHubNotifSettings(saved);
                            } catch {
                              try {
                                setHubNotifSettings(await api.getHubNotificationSettings(contextMenu.hub.id));
                              } catch { /* ignore */ }
                            }
                          }}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-[#232428] rounded-sm mx-1 w-[calc(100%-8px)]"
                        >
                          <span>{label}</span>
                          <span
                            className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                              hubNotifSettings[key]
                                ? 'bg-[#5865f2] border-[#5865f2]'
                                : 'border-riftapp-border'
                            }`}
                          >
                            {hubNotifSettings[key] && (
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
                        onClick={async () => {
                          const base = hubNotifSettings;
                          const next = { ...base, mobile_push: !base.mobile_push };
                          setHubNotifSettings(next);
                          try {
                            const saved = await api.patchHubNotificationSettings(contextMenu.hub.id, next);
                            setHubNotifSettings(saved);
                          } catch {
                            try {
                              setHubNotifSettings(await api.getHubNotificationSettings(contextMenu.hub.id));
                            } catch { /* ignore */ }
                          }
                        }}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-[#232428] rounded-sm mx-1 w-[calc(100%-8px)]"
                      >
                        <span>Mobile Push Notifications</span>
                        <span
                          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                            hubNotifSettings.mobile_push
                              ? 'bg-[#5865f2] border-[#5865f2]'
                              : 'border-riftapp-border'
                          }`}
                        >
                          {hubNotifSettings.mobile_push && (
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

              <button
                type="button"
                disabled={hubNotifSettings == null}
                onClick={async () => {
                  if (!hubNotifSettings) return;
                  const next = { ...hubNotifSettings, hide_muted_channels: !hubNotifSettings.hide_muted_channels };
                  setHubNotifSettings(next);
                  try {
                    const saved = await api.patchHubNotificationSettings(contextMenu.hub.id, next);
                    setHubNotifSettings(saved);
                  } catch {
                    try {
                      setHubNotifSettings(await api.getHubNotificationSettings(contextMenu.hub.id));
                    } catch {
                      setHubNotifSettings(hubNotifSettings);
                    }
                  }
                }}
                className="flex items-center justify-between gap-2 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)] disabled:opacity-50"
              >
                <span className="pl-6">Hide Muted Channels</span>
                <span
                  className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                    hubNotifSettings?.hide_muted_channels
                      ? 'bg-[#5865f2] border-[#5865f2]'
                      : 'border-riftapp-border'
                  }`}
                >
                  {hubNotifSettings?.hide_muted_channels && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
              </button>

              <div className="mx-2 my-1 h-px bg-white/[0.06]" />

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(contextMenu.hub.id);
                  setContextMenu(null);
                }}
                className="flex items-center justify-between gap-2 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)] text-riftapp-text-dim hover:text-riftapp-text"
              >
                <span className="flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 opacity-70">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy Server ID
                </span>
                <span className="text-[10px] font-semibold px-1 py-0.5 rounded border border-riftapp-border/50 text-riftapp-text-dim">ID</span>
              </button>

              {/* Leave Server – hidden for the hub owner */}
              {currentUserId && contextMenu.hub.owner_id !== currentUserId && (
                <>
                  <div className="mx-2 my-1 h-px bg-white/[0.06]" />
                  <button
                    type="button"
                    onClick={() => {
                      const hub = contextMenu.hub;
                      setContextMenu(null);
                      setLeaveConfirmHub(hub);
                    }}
                    className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-red-500/20 text-left w-[calc(100%-8px)] text-red-400 hover:text-red-300"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Leave Server
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showAddServer && <AddServerModal onClose={() => setShowAddServer(false)} />}

      {/* Invite to Server modal */}
      {inviteHub && <InviteToServerModal hub={inviteHub} onClose={() => setInviteHub(null)} />}

      {/* Leave Server confirmation modal */}
      {leaveConfirmHub && (
        <ModalOverlay isOpen onClose={() => setLeaveConfirmHub(null)} zIndex={250}>
          <div className="w-full max-w-[400px] rounded-xl bg-[#2b2d31] shadow-modal">
            <div className="px-5 pt-5 pb-2">
              <h3 className="text-lg font-semibold text-white">Leave Server</h3>
              <p className="mt-2 text-sm text-riftapp-text-muted">
                Are you sure you want to leave <span className="font-semibold text-white">{leaveConfirmHub.name}</span>?
              </p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => setLeaveConfirmHub(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-riftapp-text-muted transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const hubId = leaveConfirmHub.id;
                  setLeaveConfirmHub(null);
                  try {
                    await leaveHub(hubId);
                  } catch { /* ignore */ }
                }}
                className="rounded-md bg-riftapp-danger px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-riftapp-danger/90 active:scale-[0.98]"
              >
                Leave Server
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
