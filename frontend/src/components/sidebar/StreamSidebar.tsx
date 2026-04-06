import { useCallback, useMemo, useRef, useState } from 'react';
import { useHubStore } from '../../stores/hubStore';
import { useStreamStore } from '../../stores/streamStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import HubSettingsModal from '../settings/HubSettingsModal';
import { VoiceChannelIcon } from '../voice/VoiceIcons';
import CreateChannelModal from '../modals/CreateChannelModal';
import CreateCategoryModal from '../modals/CreateCategoryModal';
import EditChannelModal from '../modals/EditChannelModal';
import InviteToServerModal from '../modals/InviteToServerModal';
import VoiceUserItem from '../voice/VoiceUserItem';
import ChannelContextMenu, { type ChannelMenuTarget } from '../context-menus/ChannelContextMenu';
import { MenuOverlay } from '../context-menus/MenuOverlay';
import type { User, Stream } from '../../types';
import { api } from '../../api/client';
import { canModerateVoice, hasPermission, PermManageStreams } from '../../utils/permissions';

export default function StreamSidebar() {
  const streams = useStreamStore((s) => s.streams);
  const categories = useStreamStore((s) => s.categories);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const activeStreamId = useStreamStore((s) => s.activeStreamId);
  const setActiveStream = useStreamStore((s) => s.setActiveStream);
  const hubs = useHubStore((s) => s.hubs);
  const hubPermissions = useHubStore((s) => (activeHubId ? s.hubPermissions[activeHubId] : undefined));
  const canManageChannels = hasPermission(hubPermissions, PermManageStreams);
  const canModerateUsers = canModerateVoice(hubPermissions);
  const streamUnreads = useStreamStore((s) => s.streamUnreads);
  const hubMembers = usePresenceStore((s) => s.hubMembers);
  const [showHubSettings, setShowHubSettings] = useState(false);
  const voiceStreamId = useVoiceStore((s) => s.streamId);
  const voiceConnected = useVoiceStore((s) => s.connected);
  const voiceConnecting = useVoiceStore((s) => s.connecting);
  const voiceJoin = useVoiceStore((s) => s.join);
  const voiceMoveToStream = useVoiceStore((s) => s.moveToStream);
  const voiceMembers = useStreamStore((s) => s.voiceMembers);
  const voiceUiOpen = useVoiceChannelUiStore((s) => s.isOpen);
  const activeVoiceChannelId = useVoiceChannelUiStore((s) => s.activeChannelId);
  const setActiveVoiceChannel = useVoiceChannelUiStore((s) => s.setActiveChannel);
  const openVoiceView = useVoiceChannelUiStore((s) => s.openVoiceView);
  const closeVoiceView = useVoiceChannelUiStore((s) => s.closeVoiceView);

  // Header context menu
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);
  // Blank-space context menu (right-click on empty area in channel list)
  const [blankSpaceMenu, setBlankSpaceMenu] = useState<{ x: number; y: number } | null>(null);
  const [createChannelFor, setCreateChannelFor] = useState<string | undefined>(undefined);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [channelMenu, setChannelMenu] = useState<ChannelMenuTarget | null>(null);
  const [editChannelStream, setEditChannelStream] = useState<Stream | null>(null);
  const [createChannelInitialType, setCreateChannelInitialType] = useState<number | undefined>(undefined);
  const [draggedVoiceUser, setDraggedVoiceUser] = useState<{ userId: string; sourceStreamId: string } | null>(null);
  const [voiceDropTargetId, setVoiceDropTargetId] = useState<string | null>(null);
  const lastVoiceClickAtRef = useRef(0);

  // Collapsible categories
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const activeHub = hubs.find((h) => h.id === activeHubId);

  // Only list channels for the active hub (avoids stale UI if store ever mixes hubs).
  const streamsForHub = useMemo(
    () =>
      activeHubId != null ? streams.filter((s) => s.hub_id === activeHubId) : [],
    [streams, activeHubId],
  );
  const categoriesForHub = useMemo(
    () =>
      activeHubId != null ? categories.filter((c) => c.hub_id === activeHubId) : [],
    [categories, activeHubId],
  );

  // Group streams by category
  const firstTextStreamId = useMemo(
    () => streamsForHub.find((s) => s.type === 0)?.id,
    [streamsForHub],
  );

  const { uncategorized, grouped } = useMemo(() => {
    const uncategorized: Stream[] = [];
    const grouped: Record<string, Stream[]> = {};
    for (const cat of categoriesForHub) {
      grouped[cat.id] = [];
    }
    for (const s of streamsForHub) {
      if (s.category_id && grouped[s.category_id]) {
        grouped[s.category_id].push(s);
      } else {
        uncategorized.push(s);
      }
    }
    return { uncategorized, grouped };
  }, [streamsForHub, categoriesForHub]);



  const toggleCollapse = (catId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleVoiceClick = useCallback(
    (streamId: string) => {
      const now = Date.now();
      if (now - lastVoiceClickAtRef.current < 200) return;
      lastVoiceClickAtRef.current = now;

      if (voiceConnecting) return;

      if (!voiceConnected || !voiceStreamId) {
        setActiveVoiceChannel(streamId);
        void voiceJoin(streamId);
        return;
      }

      if (voiceStreamId !== streamId) {
        setActiveVoiceChannel(streamId);
        void voiceMoveToStream(streamId);
        return;
      }

      if (voiceUiOpen && activeVoiceChannelId === streamId) {
        closeVoiceView();
        return;
      }

      openVoiceView(streamId);
    },
    [activeVoiceChannelId, closeVoiceView, openVoiceView, setActiveVoiceChannel, voiceConnected, voiceConnecting, voiceJoin, voiceMoveToStream, voiceStreamId, voiceUiOpen],
  );

  const clearVoiceDragState = useCallback(() => {
    setDraggedVoiceUser(null);
    setVoiceDropTargetId(null);
  }, []);

  const handleVoiceUserDragStart = useCallback((userId: string, sourceStreamId: string) => {
    if (!canModerateUsers) return;
    setDraggedVoiceUser({ userId, sourceStreamId });
  }, [canModerateUsers]);

  const handleVoiceUserDrop = useCallback(async (targetStreamId: string) => {
    if (!activeHubId || !draggedVoiceUser) return;
    if (draggedVoiceUser.sourceStreamId === targetStreamId) {
      clearVoiceDragState();
      return;
    }
    try {
      await api.moveUserToChannel(activeHubId, draggedVoiceUser.userId, targetStreamId);
    } catch {
      /* ignore drop failure */
    } finally {
      clearVoiceDragState();
    }
  }, [activeHubId, draggedVoiceUser, clearVoiceDragState]);

  const closeHubSettings = useCallback(() => setShowHubSettings(false), []);
  const closeCreateChannel = useCallback(() => setShowCreateChannel(false), []);
  const closeCreateCategory = useCallback(() => setShowCreateCategory(false), []);
  const closeInviteModal = useCallback(() => setShowInviteModal(false), []);

  const handleHeaderContext = (e: React.MouseEvent) => {
    e.preventDefault();
    setHeaderMenu({ x: e.clientX, y: e.clientY });
  };

  const handleChannelListContext = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only trigger on empty space — not on channel items, buttons, or labels
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [data-channel-item]')) return;
    e.preventDefault();
    setBlankSpaceMenu({ x: e.clientX, y: e.clientY });
  };

  if (!activeHubId) {
    return (
      <div className="sidebar w-60 min-h-0 overflow-hidden flex-shrink-0 bg-riftapp-surface flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-riftapp-panel flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-text-dim">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-riftapp-text-dim text-sm leading-relaxed">
              Select or create a hub to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar w-60 min-h-0 overflow-hidden flex-shrink-0 bg-riftapp-surface flex flex-col">
      {/* Hub header */}
      <div
        className="h-12 flex items-center border-b border-riftapp-border/60 flex-shrink-0"
        onContextMenu={handleHeaderContext}
      >
        <button
          onClick={() => setShowHubSettings(true)}
          title="Hub settings"
          className="flex-1 flex items-center justify-between px-4 h-full
            hover:bg-riftapp-surface-hover active:bg-riftapp-panel transition-colors duration-150 group min-w-0"
        >
          <h2 className="font-semibold text-[14px] truncate">{activeHub?.name}</h2>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            className="text-riftapp-text-dim group-hover:text-riftapp-text transition-colors flex-shrink-0 ml-1"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          onClick={() => setShowInviteModal(true)}
          title="Invite people to this hub"
          className={`w-10 h-full flex items-center justify-center border-l border-riftapp-border/40 transition-all duration-150 active:scale-95 flex-shrink-0 ${
            showInviteModal
              ? 'bg-riftapp-accent/15 text-riftapp-accent'
              : 'text-riftapp-text-dim hover:text-riftapp-text hover:bg-riftapp-surface-hover'
          }`}
          aria-label="Invite people"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        </button>
      </div>

      {showHubSettings && activeHub && (
        <HubSettingsModal hub={activeHub} onClose={closeHubSettings} />
      )}

      {headerMenu && (
        <MenuOverlay x={headerMenu.x} y={headerMenu.y} onClose={() => setHeaderMenu(null)}>
          <div className="bg-[#111214] rounded-md border border-black/40 shadow-modal py-1.5 min-w-[200px] text-[13px] text-[#dbdee1] select-none">
            <button
              type="button"
              onClick={() => {
                setCreateChannelInitialType(undefined);
                setCreateChannelFor(undefined);
                setShowCreateChannel(true);
                setHeaderMenu(null);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#949ba4] shrink-0">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Channel
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateCategory(true);
                setHeaderMenu(null);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#949ba4] shrink-0">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Create Category
            </button>
            <div className="mx-2 my-1 h-px bg-white/[0.06]" />
            <button
              type="button"
              onClick={() => {
                setShowInviteModal(true);
                setHeaderMenu(null);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#949ba4] shrink-0">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              Invite to Server
            </button>
          </div>
        </MenuOverlay>
      )}

      {channelMenu && activeHubId && (
        <ChannelContextMenu
          hubId={activeHubId}
          target={channelMenu}
          unreadCount={streamUnreads[channelMenu.stream.id] || 0}
          canManageChannels={canManageChannels}
          firstTextStreamId={firstTextStreamId}
          onClose={() => setChannelMenu(null)}
          onInviteServer={() => setShowInviteModal(true)}
          onCreateTextChannel={(catId) => {
            setCreateChannelInitialType(0);
            setCreateChannelFor(catId ?? undefined);
            setShowCreateChannel(true);
          }}
          onCreateVoiceChannel={(catId) => {
            setCreateChannelInitialType(1);
            setCreateChannelFor(catId ?? undefined);
            setShowCreateChannel(true);
          }}
          onEditChannel={(s) => setEditChannelStream(s)}
        />
      )}

      {/* Blank-space context menu */}
      {blankSpaceMenu && (
        <MenuOverlay x={blankSpaceMenu.x} y={blankSpaceMenu.y} onClose={() => setBlankSpaceMenu(null)}>
          <div className="bg-[#111214] rounded-md border border-black/40 shadow-modal py-1.5 min-w-[200px] text-[13px] text-[#dbdee1] select-none">
            <button
              type="button"
              onClick={() => {
                setCreateChannelInitialType(undefined);
                setCreateChannelFor(undefined);
                setShowCreateChannel(true);
                setBlankSpaceMenu(null);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#949ba4] shrink-0">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Channel
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateCategory(true);
                setBlankSpaceMenu(null);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#949ba4] shrink-0">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Create Category
            </button>
            <div className="mx-2 my-1 h-px bg-white/[0.06]" />
            <button
              type="button"
              onClick={() => {
                setShowInviteModal(true);
                setBlankSpaceMenu(null);
              }}
              className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#949ba4] shrink-0">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              Invite to Server
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* Channels list */}
      <DndChannelList
        activeHubId={activeHubId}
        uncategorized={uncategorized}
        grouped={grouped}
        categoriesForHub={categoriesForHub}
        collapsed={collapsed}
        toggleCollapse={toggleCollapse}
        activeStreamId={activeStreamId}
        activeVoiceChannelId={activeVoiceChannelId}
        voiceUiOpen={voiceUiOpen}
        streamUnreads={streamUnreads}
        setActiveStream={setActiveStream}
        handleVoiceClick={handleVoiceClick}
        voiceMembers={voiceMembers}
        hubMembers={hubMembers}
        canModerateUsers={canModerateUsers}
        draggedVoiceUser={draggedVoiceUser}
        voiceDropTargetId={voiceDropTargetId}
        onVoiceUserDragStart={handleVoiceUserDragStart}
        onVoiceUserDragEnd={clearVoiceDragState}
        onVoiceDropTargetChange={setVoiceDropTargetId}
        onVoiceUserDrop={handleVoiceUserDrop}
        canManageChannels={canManageChannels}
        streamsForHub={streamsForHub}
        onChannelContext={(stream, e) => {
          e.preventDefault();
          e.stopPropagation();
          setChannelMenu({ stream, x: e.clientX, y: e.clientY });
        }}
        onContextMenu={handleChannelListContext}
      />

      {showCreateChannel && activeHubId && (
        <CreateChannelModal
          hubId={activeHubId}
          categoryId={createChannelFor}
          initialType={createChannelInitialType}
          onClose={() => {
            setCreateChannelInitialType(undefined);
            closeCreateChannel();
          }}
        />
      )}
      {editChannelStream && <EditChannelModal stream={editChannelStream} onClose={() => setEditChannelStream(null)} />}
      {showCreateCategory && activeHubId && (
        <CreateCategoryModal hubId={activeHubId} onClose={closeCreateCategory} />
      )}
      {showInviteModal && activeHub && (
        <InviteToServerModal hub={activeHub} onClose={closeInviteModal} />
      )}
    </div>
  );
}

/* ───── Drag-and-drop channel list ───── */

const UNCATEGORIZED_CONTAINER = '__uncategorized__';

interface DndChannelListProps {
  activeHubId: string;
  uncategorized: Stream[];
  grouped: Record<string, Stream[]>;
  categoriesForHub: import('../../types').Category[];
  collapsed: Set<string>;
  toggleCollapse: (catId: string) => void;
  activeStreamId: string | null;
  activeVoiceChannelId: string | null;
  voiceUiOpen: boolean;
  streamUnreads: Record<string, number>;
  setActiveStream: (id: string) => Promise<void>;
  handleVoiceClick: (streamId: string) => void;
  voiceMembers: Record<string, string[]>;
  hubMembers: Record<string, User>;
  canModerateUsers: boolean;
  draggedVoiceUser: { userId: string; sourceStreamId: string } | null;
  voiceDropTargetId: string | null;
  onVoiceUserDragStart: (userId: string, sourceStreamId: string) => void;
  onVoiceUserDragEnd: () => void;
  onVoiceDropTargetChange: (streamId: string | null) => void;
  onVoiceUserDrop: (targetStreamId: string) => void;
  canManageChannels: boolean;
  streamsForHub: Stream[];
  onChannelContext: (stream: Stream, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function DndChannelList({
  activeHubId,
  uncategorized,
  grouped,
  categoriesForHub,
  collapsed,
  toggleCollapse,
  activeStreamId,
  activeVoiceChannelId,
  voiceUiOpen,
  streamUnreads,
  setActiveStream,
  handleVoiceClick,
  voiceMembers,
  hubMembers,
  canModerateUsers,
  draggedVoiceUser,
  voiceDropTargetId,
  onVoiceUserDragStart,
  onVoiceUserDragEnd,
  onVoiceDropTargetChange,
  onVoiceUserDrop,
  canManageChannels,
  streamsForHub,
  onChannelContext,
  onContextMenu,
}: DndChannelListProps) {
  const reorderStreams = useStreamStore((s) => s.reorderStreams);
  const reorderCategories = useStreamStore((s) => s.reorderCategories);

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [activeType, setActiveType] = useState<'channel' | 'category' | null>(null);
  const [overCategoryId, setOverCategoryId] = useState<string | null>(null);

  // Timer ref for auto-expanding collapsed categories on hover
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Require 5px of movement before starting a drag (prevents accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Build flat list of all channel ids per container for SortableContext
  const uncatIds = useMemo(() => uncategorized.map((s) => s.id), [uncategorized]);
  const categoryIds = useMemo(() => categoriesForHub.map((c) => `cat-${c.id}`), [categoriesForHub]);

  const activeStream = activeId && activeType === 'channel'
    ? streamsForHub.find((s) => s.id === activeId) ?? null
    : null;
  const activeCategory = activeId && activeType === 'category'
    ? categoriesForHub.find((c) => `cat-${c.id}` === activeId) ?? null
    : null;

  // Find which container a channel belongs to
  function findContainer(channelId: string): string {
    if (uncategorized.some((s) => s.id === channelId)) return UNCATEGORIZED_CONTAINER;
    for (const cat of categoriesForHub) {
      if ((grouped[cat.id] || []).some((s) => s.id === channelId)) return cat.id;
    }
    return UNCATEGORIZED_CONTAINER;
  }

  function handleDragStart(event: DragStartEvent) {
    if (!canManageChannels) return;
    const id = event.active.id;
    if (String(id).startsWith('cat-')) {
      setActiveType('category');
    } else {
      setActiveType('channel');
    }
    setActiveId(id);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !canManageChannels) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Category dragging — don't process container changes
    if (activeIdStr.startsWith('cat-')) return;

    // Auto-expand collapsed categories on hover
    if (overIdStr.startsWith('cat-') || overIdStr.startsWith('drop-cat-')) {
      const catId = overIdStr.replace('cat-', '').replace('drop-', '');
      if (collapsed.has(catId)) {
        if (!expandTimerRef.current) {
          expandTimerRef.current = setTimeout(() => {
            toggleCollapse(catId);
            expandTimerRef.current = null;
          }, 500);
        }
      }
      setOverCategoryId(catId);
    } else if (overIdStr === UNCATEGORIZED_CONTAINER || overIdStr === `drop-${UNCATEGORIZED_CONTAINER}`) {
      setOverCategoryId(UNCATEGORIZED_CONTAINER);
    } else {
      // over is a channel — figure out which container it's in
      setOverCategoryId(findContainer(overIdStr));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }

    setActiveId(null);
    setActiveType(null);
    setOverCategoryId(null);

    const { active, over } = event;
    if (!over || !canManageChannels) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // ─── Category reorder ───
    if (activeIdStr.startsWith('cat-') && overIdStr.startsWith('cat-')) {
      const oldIndex = categoriesForHub.findIndex((c) => `cat-${c.id}` === activeIdStr);
      const newIndex = categoriesForHub.findIndex((c) => `cat-${c.id}` === overIdStr);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(categoriesForHub, oldIndex, newIndex).map((c, i) => ({
          ...c,
          position: i,
        }));
        reorderCategories(activeHubId, newOrder);
      }
      return;
    }

    // ─── Channel reorder / move ───
    if (activeIdStr.startsWith('cat-')) return; // shouldn't happen

    const draggedStream = streamsForHub.find((s) => s.id === activeIdStr);
    if (!draggedStream) return;

    // Determine target container
    let targetContainer: string;
    if (overIdStr.startsWith('cat-')) {
      targetContainer = overIdStr.replace('cat-', '');
    } else if (overIdStr.startsWith('drop-cat-')) {
      targetContainer = overIdStr.replace('drop-cat-', '');
    } else if (overIdStr === UNCATEGORIZED_CONTAINER || overIdStr === `drop-${UNCATEGORIZED_CONTAINER}`) {
      targetContainer = UNCATEGORIZED_CONTAINER;
    } else {
      targetContainer = findContainer(overIdStr);
    }

    const sourceContainer = findContainer(activeIdStr);
    const newCategoryId = targetContainer === UNCATEGORIZED_CONTAINER ? null : targetContainer;

    // Get the channels in the target container
    let targetList: Stream[];
    if (targetContainer === UNCATEGORIZED_CONTAINER) {
      targetList = [...uncategorized];
    } else {
      targetList = [...(grouped[targetContainer] || [])];
    }

    // Remove from source if moving between containers
    if (sourceContainer !== targetContainer) {
      targetList = targetList.filter((s) => s.id !== activeIdStr);
      // Find insertion index based on over element
      const overChannel = targetList.find((s) => s.id === overIdStr);
      const insertIdx = overChannel ? targetList.indexOf(overChannel) : targetList.length;
      targetList.splice(insertIdx, 0, draggedStream);
    } else {
      // Same container — reorder
      const oldIdx = targetList.findIndex((s) => s.id === activeIdStr);
      let newIdx = targetList.findIndex((s) => s.id === overIdStr);
      if (oldIdx === -1) return;
      if (newIdx === -1) newIdx = targetList.length - 1;
      if (oldIdx === newIdx) return;
      targetList = arrayMove(targetList, oldIdx, newIdx);
    }

    // Build the full new streams array with updated positions + category assignments
    const updatedStreams = streamsForHub.map((s) => {
      if (s.id === activeIdStr) {
        return { ...s, category_id: newCategoryId };
      }
      return s;
    });

    // Reassign positions: for each container, set incrementing positions
    const allContainers = [UNCATEGORIZED_CONTAINER, ...categoriesForHub.map((c) => c.id)];
    const containerStreams: Record<string, Stream[]> = {};

    for (const cid of allContainers) {
      if (cid === targetContainer) {
        containerStreams[cid] = targetList;
      } else if (cid === sourceContainer && sourceContainer !== targetContainer) {
        // Remove the dragged stream from the source
        containerStreams[cid] = (cid === UNCATEGORIZED_CONTAINER ? uncategorized : (grouped[cid] || []))
          .filter((s) => s.id !== activeIdStr);
      } else {
        containerStreams[cid] = cid === UNCATEGORIZED_CONTAINER ? uncategorized : (grouped[cid] || []);
      }
    }

    let posCounter = 0;
    const finalStreams: Stream[] = [];
    for (const cid of allContainers) {
      for (const s of containerStreams[cid]) {
        const catId = cid === UNCATEGORIZED_CONTAINER ? null : cid;
        finalStreams.push({
          ...updatedStreams.find((u) => u.id === s.id) || s,
          position: posCounter++,
          category_id: s.id === activeIdStr ? newCategoryId : (catId !== null ? catId : (s.category_id && !categoriesForHub.some((c) => c.id === s.category_id) ? null : s.category_id)),
        });
      }
    }

    // Include any streams not yet accounted for (shouldn't happen, but safety)
    for (const s of updatedStreams) {
      if (!finalStreams.some((f) => f.id === s.id)) {
        finalStreams.push({ ...s, position: posCounter++ });
      }
    }

    reorderStreams(activeHubId, finalStreams);
  }

  function handleDragCancel() {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
    setActiveId(null);
    setActiveType(null);
    setOverCategoryId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto py-3 px-2 space-y-1" onContextMenu={onContextMenu}>
        {/* Uncategorized channels */}
        {uncategorized.length > 0 && (
          <SortableContext items={uncatIds} strategy={verticalListSortingStrategy}>
            <div className={`rounded-md transition-colors ${overCategoryId === UNCATEGORIZED_CONTAINER && activeType === 'channel' ? 'bg-riftapp-accent/5' : ''}`}>
              <ChannelGroup
                streams={uncategorized}
                hubId={activeHubId}
                activeStreamId={activeStreamId}
                activeVoiceChannelId={activeVoiceChannelId}
                voiceUiOpen={voiceUiOpen}
                streamUnreads={streamUnreads}
                onSelect={setActiveStream}
                onVoiceClick={handleVoiceClick}
                voiceMembers={voiceMembers}
                hubMembers={hubMembers}
                canModerateVoiceUsers={canModerateUsers}
                draggedVoiceUser={draggedVoiceUser}
                voiceDropTargetId={voiceDropTargetId}
                onVoiceUserDragStart={onVoiceUserDragStart}
                onVoiceUserDragEnd={onVoiceUserDragEnd}
                onVoiceDropTargetChange={onVoiceDropTargetChange}
                onVoiceUserDrop={onVoiceUserDrop}
                draggable={canManageChannels}
                dragActiveId={activeId}
                onChannelContext={onChannelContext}
              />
            </div>
          </SortableContext>
        )}

        {/* Categories (sortable) */}
        <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
          {categoriesForHub.map((cat) => {
            const catStreams = grouped[cat.id] || [];
            const isCollapsed = collapsed.has(cat.id);
            const catItemIds = catStreams.map((s) => s.id);
            const isOverThis = overCategoryId === cat.id && activeType === 'channel';

            return (
              <SortableCategory
                key={cat.id}
                cat={cat}
                isCollapsed={isCollapsed}
                toggleCollapse={toggleCollapse}
                isOver={isOverThis}
                draggable={canManageChannels}
              >
                <SortableContext items={catItemIds} strategy={verticalListSortingStrategy}>
                  {!isCollapsed && (
                    <ChannelGroup
                      streams={catStreams}
                      hubId={activeHubId}
                      activeStreamId={activeStreamId}
                      activeVoiceChannelId={activeVoiceChannelId}
                      voiceUiOpen={voiceUiOpen}
                      streamUnreads={streamUnreads}
                      onSelect={setActiveStream}
                      onVoiceClick={handleVoiceClick}
                      voiceMembers={voiceMembers}
                      hubMembers={hubMembers}
                      canModerateVoiceUsers={canModerateUsers}
                      draggedVoiceUser={draggedVoiceUser}
                      voiceDropTargetId={voiceDropTargetId}
                      onVoiceUserDragStart={onVoiceUserDragStart}
                      onVoiceUserDragEnd={onVoiceUserDragEnd}
                      onVoiceDropTargetChange={onVoiceDropTargetChange}
                      onVoiceUserDrop={onVoiceUserDrop}
                      draggable={canManageChannels}
                      dragActiveId={activeId}
                      onChannelContext={onChannelContext}
                    />
                  )}
                  {/* Empty category drop zone */}
                  {!isCollapsed && catStreams.length === 0 && (
                    <div className="py-2 px-3 text-[11px] text-riftapp-text-dim/50 italic text-center">
                      Drop channels here
                    </div>
                  )}
                </SortableContext>
              </SortableCategory>
            );
          })}
        </SortableContext>
      </div>

      {/* Drag overlay — floating preview */}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
        {activeStream && (
          <div className="channel-item channel-item-active shadow-elevation-md rounded-md opacity-90 pointer-events-none">
            <span className="text-lg leading-none text-riftapp-text-muted">
              {activeStream.type === 0 ? '#' : (
                <VoiceChannelIcon size={16} className="flex-shrink-0 text-riftapp-text-dim" />
              )}
            </span>
            <span className="truncate">{activeStream.name}</span>
          </div>
        )}
        {activeCategory && (
          <div className="flex items-center gap-0.5 section-label px-1 bg-riftapp-surface shadow-elevation-md rounded-md opacity-90 pointer-events-none py-1">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="opacity-60">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span className="truncate uppercase">{activeCategory.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* ───── Sortable category wrapper ───── */

interface SortableCategoryProps {
  cat: import('../../types').Category;
  isCollapsed: boolean;
  toggleCollapse: (catId: string) => void;
  isOver: boolean;
  draggable: boolean;
  children: React.ReactNode;
}

function SortableCategory({ cat, isCollapsed, toggleCollapse, isOver, draggable, children }: SortableCategoryProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `cat-${cat.id}`,
    disabled: !draggable,
    data: { type: 'category', catId: cat.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`mt-2 rounded-md transition-colors ${isOver ? 'bg-riftapp-accent/10 ring-1 ring-riftapp-accent/30' : ''}`}>
      <button
        onClick={() => toggleCollapse(cat.id)}
        className={`flex items-center gap-0.5 flex-1 min-w-0 section-label px-1 mb-1 hover:text-riftapp-text transition-colors ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        {...(draggable ? { ...attributes, ...listeners } : {})}
      >
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`opacity-60 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="truncate uppercase">{cat.name}</span>
      </button>
      {children}
    </div>
  );
}

/* ───── Channel group (text + voice items) ───── */

interface ChannelGroupProps {
  streams: Stream[];
  hubId: string | null;
  activeStreamId: string | null;
  activeVoiceChannelId: string | null;
  voiceUiOpen: boolean;
  streamUnreads: Record<string, number>;
  onSelect: (id: string) => Promise<void>;
  onVoiceClick: (streamId: string) => void;
  voiceMembers: Record<string, string[]>;
  hubMembers: Record<string, User>;
  canModerateVoiceUsers: boolean;
  draggedVoiceUser: { userId: string; sourceStreamId: string } | null;
  voiceDropTargetId: string | null;
  onVoiceUserDragStart: (userId: string, sourceStreamId: string) => void;
  onVoiceUserDragEnd: () => void;
  onVoiceDropTargetChange: (streamId: string | null) => void;
  onVoiceUserDrop: (targetStreamId: string) => void;
  onChannelContext: (stream: Stream, e: React.MouseEvent) => void;
  draggable?: boolean;
  dragActiveId?: UniqueIdentifier | null;
}

function ChannelGroup({
  streams,
  hubId,
  activeStreamId,
  activeVoiceChannelId,
  voiceUiOpen,
  streamUnreads,
  onSelect,
  onVoiceClick,
  voiceMembers,
  hubMembers,
  canModerateVoiceUsers,
  draggedVoiceUser,
  voiceDropTargetId,
  onVoiceUserDragStart,
  onVoiceUserDragEnd,
  onVoiceDropTargetChange,
  onVoiceUserDrop,
  onChannelContext,
  draggable,
  dragActiveId,
}: ChannelGroupProps) {
  const voiceStreamId = useVoiceStore((s) => s.streamId);
  const voiceConnected = useVoiceStore((s) => s.connected);
  const voiceParticipants = useVoiceStore((s) => s.participants);
  const speakingSignals = useVoiceStore((s) => s.speakingSignals);
  const hideNamesByStream = useVoiceChannelUiStore((s) => s.hideNamesByStream);
  const textStreams = streams.filter((s) => s.type === 0);
  const voiceStreams = streams.filter((s) => s.type === 1);

  return (
    <div className="space-y-0.5">
      {textStreams.map((stream) => (
        <SortableChannelItem
          key={stream.id}
          stream={stream}
          activeStreamId={activeStreamId}
          unread={streamUnreads[stream.id] || 0}
          onSelect={onSelect}
          onContextMenu={onChannelContext}
          draggable={draggable}
          isDragActive={dragActiveId === stream.id}
        />
      ))}
      {voiceStreams.map((stream) => {
        const isConnected = voiceStreamId === stream.id && voiceConnected;
        const isTargeted = activeVoiceChannelId === stream.id;
        const isViewing = voiceUiOpen && activeVoiceChannelId === stream.id;
        const memberIds = voiceMembers[stream.id] || [];
        const hasMembers = isConnected ? voiceParticipants.length > 0 : memberIds.length > 0;
        const hideVcNames = hideNamesByStream[stream.id] ?? false;
        return (
          <SortableVoiceItem
            key={stream.id}
            stream={stream}
            isConnected={isConnected}
            isTargeted={isTargeted}
            isViewing={isViewing}
            memberIds={memberIds}
            hasMembers={hasMembers}
            hideVcNames={hideVcNames}
            voiceParticipants={isConnected ? voiceParticipants : []}
            speakingSignals={speakingSignals}
            hubMembers={hubMembers}
            hubId={hubId}
            canModerateVoiceUsers={canModerateVoiceUsers}
            draggedVoiceUser={draggedVoiceUser}
            voiceDropTargetId={voiceDropTargetId}
            onVoiceUserDragStart={onVoiceUserDragStart}
            onVoiceUserDragEnd={onVoiceUserDragEnd}
            onVoiceDropTargetChange={onVoiceDropTargetChange}
            onVoiceUserDrop={onVoiceUserDrop}
            onVoiceClick={onVoiceClick}
            onContextMenu={onChannelContext}
            draggable={draggable}
            isDragActive={dragActiveId === stream.id}
          />
        );
      })}
    </div>
  );
}

/* ───── Sortable text channel item ───── */

function SortableChannelItem({
  stream,
  activeStreamId,
  unread,
  onSelect,
  onContextMenu,
  draggable,
  isDragActive,
}: {
  stream: Stream;
  activeStreamId: string | null;
  unread: number;
  onSelect: (id: string) => Promise<void>;
  onContextMenu: (stream: Stream, e: React.MouseEvent) => void;
  draggable?: boolean;
  isDragActive?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: stream.id,
    disabled: !draggable,
    data: { type: 'channel', stream },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isActive = activeStreamId === stream.id;
  const hasUnread = unread > 0 && !isActive;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging || isDragActive ? 'opacity-40' : ''} transition-opacity`}
      data-channel-item
    >
      <button
        type="button"
        onClick={() => onSelect(stream.id)}
        onContextMenu={(e) => onContextMenu(stream, e)}
        title={`#${stream.name}`}
        className={`channel-item ${isActive ? 'channel-item-active' : 'channel-item-idle'} ${hasUnread ? '!text-riftapp-text font-semibold' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        {...(draggable ? { ...attributes, ...listeners } : {})}
      >
        <span className={`text-lg leading-none ${isActive ? 'text-riftapp-text-muted' : 'text-riftapp-text-dim'}`}>#</span>
        <span className="truncate">{stream.name}</span>
        {hasUnread && (
          <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-riftapp-accent text-[11px] font-bold text-white leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}

/* ───── Sortable voice channel item ───── */

function SortableVoiceItem({
  stream,
  isConnected,
  isTargeted,
  isViewing,
  memberIds,
  hasMembers,
  hideVcNames,
  voiceParticipants,
  speakingSignals,
  hubMembers,
  hubId,
  canModerateVoiceUsers,
  draggedVoiceUser,
  voiceDropTargetId,
  onVoiceUserDragStart,
  onVoiceUserDragEnd,
  onVoiceDropTargetChange,
  onVoiceUserDrop,
  onVoiceClick,
  onContextMenu,
  draggable,
  isDragActive,
}: {
  stream: Stream;
  isConnected: boolean;
  isTargeted: boolean;
  isViewing: boolean;
  memberIds: string[];
  hasMembers: boolean;
  hideVcNames: boolean;
  voiceParticipants: { identity: string; isSpeaking: boolean; isMuted: boolean; isScreenSharing: boolean }[];
  speakingSignals: Record<string, boolean>;
  hubMembers: Record<string, User>;
  hubId: string | null;
  canModerateVoiceUsers: boolean;
  draggedVoiceUser: { userId: string; sourceStreamId: string } | null;
  voiceDropTargetId: string | null;
  onVoiceUserDragStart: (userId: string, sourceStreamId: string) => void;
  onVoiceUserDragEnd: () => void;
  onVoiceDropTargetChange: (streamId: string | null) => void;
  onVoiceUserDrop: (targetStreamId: string) => void;
  onVoiceClick: (streamId: string) => void;
  onContextMenu: (stream: Stream, e: React.MouseEvent) => void;
  draggable?: boolean;
  isDragActive?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: stream.id,
    disabled: !draggable,
    data: { type: 'channel', stream },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const canAcceptVoiceDrop = Boolean(
    canModerateVoiceUsers && draggedVoiceUser && draggedVoiceUser.sourceStreamId !== stream.id,
  );
  const isVoiceDropTarget = voiceDropTargetId === stream.id && canAcceptVoiceDrop;
  const screenSharers = useStreamStore((s) => s.voiceScreenSharers[stream.id]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging || isDragActive ? 'opacity-40' : ''} transition-opacity`}
      data-channel-item
    >
      <button
        type="button"
        onClick={() => onVoiceClick(stream.id)}
        onContextMenu={(e) => onContextMenu(stream, e)}
        onDragEnter={() => {
          if (!canAcceptVoiceDrop) return;
          onVoiceDropTargetChange(stream.id);
        }}
        onDragOver={(e) => {
          if (!canAcceptVoiceDrop) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (voiceDropTargetId !== stream.id) onVoiceDropTargetChange(stream.id);
        }}
        onDragLeave={(e) => {
          if (!canAcceptVoiceDrop) return;
          const nextTarget = e.relatedTarget as Node | null;
          if (nextTarget && e.currentTarget.contains(nextTarget)) return;
          if (voiceDropTargetId === stream.id) onVoiceDropTargetChange(null);
        }}
        onDrop={(e) => {
          if (!canAcceptVoiceDrop) return;
          e.preventDefault();
          void onVoiceUserDrop(stream.id);
        }}
        title={isConnected ? stream.name : `Join ${stream.name}`}
        className={`channel-item ${isViewing ? 'channel-item-active !text-riftapp-success' : isConnected ? '!text-riftapp-success channel-item-idle' : isTargeted ? 'channel-item-active !text-riftapp-success/90' : hasMembers ? '!text-riftapp-success/70 channel-item-idle' : 'channel-item-idle'} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isVoiceDropTarget ? '!bg-riftapp-accent/15 !text-riftapp-accent ring-1 ring-riftapp-accent/50' : ''}`}
        {...(draggable ? { ...attributes, ...listeners } : {})}
      >
        <VoiceChannelIcon
          size={16}
          className={`flex-shrink-0 ${isConnected || isTargeted || hasMembers ? 'text-riftapp-success' : 'text-riftapp-text-dim'}`}
        />
        <span className="truncate">{stream.name}</span>
      </button>
      {isConnected && voiceParticipants.length > 0 && (
        <div className="ml-3 pl-3 border-l-2 border-riftapp-border/30 space-y-0.5 mt-0.5 mb-1">
          {voiceParticipants.map((p) => {
            const member = hubMembers[p.identity];
            return (
              <VoiceUserItem
                key={p.identity}
                participant={{ ...p, isCameraOn: false, videoTrack: undefined, screenTrack: undefined }}
                member={member}
                streamId={stream.id}
                hubId={hubId}
                hideName={hideVcNames}
                canModerate={canModerateVoiceUsers}
                onVoiceDragStart={onVoiceUserDragStart}
                onVoiceDragEnd={onVoiceUserDragEnd}
                isDragging={draggedVoiceUser?.userId === p.identity}
              />
            );
          })}
        </div>
      )}
      {!isConnected && memberIds.length > 0 && (
        <div className="ml-3 pl-3 border-l-2 border-riftapp-border/30 space-y-0.5 mt-0.5 mb-1">
          {memberIds.map((uid) => {
            const member = hubMembers[uid];
            return (
              <VoiceUserItem
                key={uid}
                participant={{
                  identity: uid,
                  isSpeaking: Boolean(speakingSignals[uid]),
                  isMuted: false,
                  isCameraOn: false,
                  isScreenSharing: Boolean(screenSharers?.includes(uid)),
                }}
                member={member}
                streamId={stream.id}
                hubId={hubId}
                hideName={hideVcNames}
                canModerate={canModerateVoiceUsers}
                onVoiceDragStart={onVoiceUserDragStart}
                onVoiceDragEnd={onVoiceUserDragEnd}
                isDragging={draggedVoiceUser?.userId === uid}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
