import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import HubSidebar from '../sidebar/HubSidebar';
import StreamSidebar from '../sidebar/StreamSidebar';
import DMSidebar from '../sidebar/DMSidebar';
import GroupDMMemberList from '../sidebar/GroupDMMemberList';
import MemberList from '../sidebar/MemberList';
import ChatPanel from '../chat/ChatPanel';
import VoiceView from '../voice/VoiceView';
import FriendsPage from '../friends/FriendsPage';
import MiniProfilePopover from '../shared/MiniProfilePopover';
import FullProfileModal from '../shared/FullProfileModal';
import SelfProfilePopover from '../shared/SelfProfilePopover';
import UserContextMenu from '../shared/UserContextMenu';
import DesktopScreenSharePickerModal from '../voice/DesktopScreenSharePickerModal';
import ScreenShareModal from '../voice/ScreenShareModal';
import IncomingDMCallPrompt from '../voice/IncomingDMCallPrompt';
import VoiceBottomBar from '../voice/VoiceBottomBar';
import FloatingActiveSpeakerMedia from '../voice/FloatingActiveSpeakerMedia';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuthStore } from '../../stores/auth';
import { useHubStore } from '../../stores/hubStore';
import { useStreamStore } from '../../stores/streamStore';
import { useDMStore } from '../../stores/dmStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useFriendStore } from '../../stores/friendStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import { getDesktop } from '../../utils/desktop';
import { getDesktopAttentionSignalCount } from '../../utils/desktopAttention';
import { isGroupConversation } from '../../utils/conversations';

export default function AppLayout() {
  useWebSocket();
  const [showMemberList, setShowMemberList] = useState(true);
  const [searchSidebarOpen, setSearchSidebarOpen] = useState(false);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const loadHubs = useHubStore((s) => s.loadHubs);
  const loadConversations = useDMStore((s) => s.loadConversations);
  const dmTotalUnread = useDMStore((s) => s.dmTotalUnread);
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);
  const notificationUnreadCount = useNotificationStore((s) => s.unreadCount);
  const loadConversationCallStates = useVoiceStore((s) => s.loadConversationCallStates);
  const conversationCallRings = useVoiceStore((s) => s.conversationCallRings);
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const conversations = useDMStore((s) => s.conversations);
  const streamUnreads = useStreamStore((s) => s.streamUnreads);
  const params = useParams<{ hubId?: string; streamId?: string; conversationId?: string }>();
  const desktopAttentionSignalCount = useMemo(() => getDesktopAttentionSignalCount({
    notificationUnreadCount,
    dmUnreadCount: dmTotalUnread,
    streamUnreads,
    conversationCallRings,
    currentUserId,
  }), [conversationCallRings, currentUserId, dmTotalUnread, notificationUnreadCount, streamUnreads]);
  const currentAttentionSignalCountRef = useRef(desktopAttentionSignalCount);
  const previousAttentionSignalCountRef = useRef<number | null>(null);

  useEffect(() => {
    loadHubs();
    void loadConversations();
    loadNotifications();
    void loadConversationCallStates();
  }, [loadConversationCallStates, loadConversations, loadHubs, loadNotifications]);

  useEffect(() => {
    currentAttentionSignalCountRef.current = desktopAttentionSignalCount;
  }, [desktopAttentionSignalCount]);

  // Keep DM list, friend requests, and notifications fresh when returning to the tab.
  useEffect(() => {
    let t: number;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        useDMStore.getState().loadConversations();
        useFriendStore.getState().loadPendingCount();
        useNotificationStore.getState().loadNotifications();
        void useVoiceStore.getState().loadConversationCallStates();
      }, 250);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) {
      return undefined;
    }

    const clearTaskbarAttention = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        return;
      }

      desktop.setAttentionRequested(false);
      previousAttentionSignalCountRef.current = currentAttentionSignalCountRef.current;
    };

    window.addEventListener('focus', clearTaskbarAttention);
    document.addEventListener('visibilitychange', clearTaskbarAttention);

    return () => {
      desktop.setAttentionRequested(false);
      window.removeEventListener('focus', clearTaskbarAttention);
      document.removeEventListener('visibilitychange', clearTaskbarAttention);
    };
  }, []);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) {
      return;
    }

    const hasWindowAttention = document.visibilityState === 'visible' && document.hasFocus();
    if (previousAttentionSignalCountRef.current === null) {
      previousAttentionSignalCountRef.current = desktopAttentionSignalCount;
      if (hasWindowAttention || desktopAttentionSignalCount === 0) {
        desktop.setAttentionRequested(false);
      }
      return;
    }

    if (hasWindowAttention) {
      desktop.setAttentionRequested(false);
      previousAttentionSignalCountRef.current = desktopAttentionSignalCount;
      return;
    }

    if (desktopAttentionSignalCount === 0) {
      desktop.setAttentionRequested(false);
    } else if (desktopAttentionSignalCount > previousAttentionSignalCountRef.current) {
      desktop.setAttentionRequested(true);
    }

    previousAttentionSignalCountRef.current = desktopAttentionSignalCount;
  }, [desktopAttentionSignalCount]);

  useEffect(() => {
    if (params.hubId) {
      const hub = useHubStore.getState();
      if (hub.activeHubId !== params.hubId) {
        hub.setActiveHub(params.hubId);
      }
    } else if (params.conversationId) {
      const dm = useDMStore.getState();
      if (dm.activeConversationId !== params.conversationId) {
        dm.loadConversations().then(() => {
          dm.setActiveConversation(params.conversationId!);
        });
      }
    }
  }, [params.hubId, params.conversationId]);

  const activeHubId = useHubStore((s) => s.activeHubId);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );
  const streams = useStreamStore((s) => s.streams);
  const voiceTargetId = useVoiceStore((s) => s.targetId);
  const voiceConnecting = useVoiceStore((s) => s.connecting);
  const voiceUiOpen = useVoiceChannelUiStore((s) => s.isOpen);
  const activeVoiceChannelId = useVoiceChannelUiStore((s) => s.activeChannelId);
  const activeVoiceChannelKind = useVoiceChannelUiStore((s) => s.activeChannelKind);
  const resetVoiceView = useVoiceChannelUiStore((s) => s.resetVoiceView);
  const showFullVoiceView = voiceUiOpen && activeVoiceChannelKind !== null;
  const showGroupDMMemberList = Boolean(
    activeConversation
    && isGroupConversation(activeConversation, currentUserId)
    && !activeHubId
    && !showFullVoiceView
    && showMemberList
    && !searchSidebarOpen,
  );

  useEffect(() => {
    if (!voiceConnecting && !voiceTargetId) {
      resetVoiceView();
    }
  }, [resetVoiceView, voiceConnecting, voiceTargetId]);

  useEffect(() => {
    if (activeVoiceChannelKind !== 'stream') return;
    if (!activeVoiceChannelId) return;
    if (!streams.some((stream) => stream.id === activeVoiceChannelId)) {
      resetVoiceView();
    }
  }, [activeVoiceChannelId, activeVoiceChannelKind, resetVoiceView, streams]);

  useEffect(() => {
    if (!activeHubId || activeConversationId || showFullVoiceView) {
      setShowMemberList(true);
    }
  }, [activeConversationId, activeHubId, showFullVoiceView]);

  return (
    <div className="app-root h-full min-h-0 flex overflow-hidden bg-riftapp-content">
      {/* Left sidebar group: server list + channel list + bottom voice/user bar */}
      <div className="flex-shrink-0 flex flex-col h-full bg-riftapp-chrome">
        <div className="flex flex-1 min-h-0">
          <HubSidebar />
          {!activeHubId ? <DMSidebar /> : <StreamSidebar />}
        </div>
        <VoiceBottomBar />
      </div>
      {!activeHubId && !activeConversationId ? (
        <FriendsPage />
      ) : showFullVoiceView ? (
        <VoiceView />
      ) : (
        <ChatPanel
          showMemberList={showMemberList}
          onToggleMemberList={() => setShowMemberList((current) => !current)}
          onSearchPanelVisibilityChange={setSearchSidebarOpen}
        />
      )}
      {activeHubId && !activeConversationId && !showFullVoiceView && showMemberList && !searchSidebarOpen ? <MemberList /> : null}
      {showGroupDMMemberList && activeConversation ? <GroupDMMemberList conversation={activeConversation} /> : null}
      <MiniProfilePopover />
      <FullProfileModal />
      <SelfProfilePopover />
      <UserContextMenu />
      <DesktopScreenSharePickerModal />
      <ScreenShareModal />
      <IncomingDMCallPrompt />
      <FloatingActiveSpeakerMedia />
    </div>
  );
}
