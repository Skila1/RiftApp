import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import HubSidebar from '../sidebar/HubSidebar';
import StreamSidebar from '../sidebar/StreamSidebar';
import DMSidebar from '../sidebar/DMSidebar';
import MemberList from '../sidebar/MemberList';
import ChatPanel from '../chat/ChatPanel';
import VoiceView from '../voice/VoiceView';
import FriendsPage from '../friends/FriendsPage';
import MiniProfilePopover from '../shared/MiniProfilePopover';
import FullProfileModal from '../shared/FullProfileModal';
import SelfProfilePopover from '../shared/SelfProfilePopover';
import UserContextMenu from '../shared/UserContextMenu';
import ScreenShareModal from '../voice/ScreenShareModal';
import VoiceBottomBar from '../voice/VoiceBottomBar';
import FloatingActiveSpeakerMedia from '../voice/FloatingActiveSpeakerMedia';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useHubStore } from '../../stores/hubStore';
import { useStreamStore } from '../../stores/streamStore';
import { useDMStore } from '../../stores/dmStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useFriendStore } from '../../stores/friendStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';

export default function AppLayout() {
  useWebSocket();
  const [showMemberList, setShowMemberList] = useState(true);
  const loadHubs = useHubStore((s) => s.loadHubs);
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const params = useParams<{ hubId?: string; streamId?: string; conversationId?: string }>();

  useEffect(() => {
    loadHubs();
    loadNotifications();
  }, [loadHubs, loadNotifications]);

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
  const streams = useStreamStore((s) => s.streams);
  const voiceStreamId = useVoiceStore((s) => s.streamId);
  const voiceConnecting = useVoiceStore((s) => s.connecting);
  const voiceUiOpen = useVoiceChannelUiStore((s) => s.isOpen);
  const activeVoiceChannelId = useVoiceChannelUiStore((s) => s.activeChannelId);
  const resetVoiceView = useVoiceChannelUiStore((s) => s.resetVoiceView);

  useEffect(() => {
    if (!voiceConnecting && !voiceStreamId) {
      resetVoiceView();
    }
  }, [resetVoiceView, voiceConnecting, voiceStreamId]);

  useEffect(() => {
    if (!activeVoiceChannelId) return;
    if (!streams.some((stream) => stream.id === activeVoiceChannelId)) {
      resetVoiceView();
    }
  }, [activeVoiceChannelId, resetVoiceView, streams]);

  useEffect(() => {
    if (!activeHubId || activeConversationId || voiceUiOpen) {
      setShowMemberList(true);
    }
  }, [activeConversationId, activeHubId, voiceUiOpen]);

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
      ) : voiceUiOpen ? (
        <VoiceView />
      ) : (
        <ChatPanel
          showMemberList={showMemberList}
          onToggleMemberList={() => setShowMemberList((current) => !current)}
        />
      )}
      {activeHubId && !activeConversationId && !voiceUiOpen && showMemberList && <MemberList />}
      <MiniProfilePopover />
      <FullProfileModal />
      <SelfProfilePopover />
      <UserContextMenu />
      <ScreenShareModal />
      <FloatingActiveSpeakerMedia />
    </div>
  );
}
