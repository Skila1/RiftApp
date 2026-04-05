import { useEffect } from 'react';
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
import { useWebSocket } from '../../hooks/useWebSocket';
import { useHubStore } from '../../stores/hubStore';
import { useStreamStore } from '../../stores/streamStore';
import { useDMStore } from '../../stores/dmStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useFriendStore } from '../../stores/friendStore';

export default function AppLayout() {
  useWebSocket();
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
  const viewingVoiceStreamId = useStreamStore((s) => s.viewingVoiceStreamId);

  return (
    <div className="h-screen flex overflow-hidden">
      <HubSidebar />
      {!activeHubId ? <DMSidebar /> : <StreamSidebar />}
      {!activeHubId && !activeConversationId ? (
        <FriendsPage />
      ) : viewingVoiceStreamId ? (
        <VoiceView />
      ) : (
        <ChatPanel />
      )}
      {activeHubId && !activeConversationId && !viewingVoiceStreamId && <MemberList />}
      <MiniProfilePopover />
      <FullProfileModal />
      <SelfProfilePopover />
      <UserContextMenu />
      <ScreenShareModal />
    </div>
  );
}
