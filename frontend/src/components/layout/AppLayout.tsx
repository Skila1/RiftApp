import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import HubSidebar from '../sidebar/HubSidebar';
import StreamSidebar from '../sidebar/StreamSidebar';
import DMSidebar from '../sidebar/DMSidebar';
import MemberList from '../sidebar/MemberList';
import ChatPanel from '../chat/ChatPanel';
import UserProfilePopover from '../shared/UserProfilePopover';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useHubStore } from '../../stores/hubStore';
import { useDMStore } from '../../stores/dmStore';

export default function AppLayout() {
  useWebSocket();
  const loadHubs = useHubStore((s) => s.loadHubs);
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const params = useParams<{ hubId?: string; streamId?: string; conversationId?: string }>();

  useEffect(() => {
    loadHubs();
  }, [loadHubs]);

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

  return (
    <div className="h-screen flex overflow-hidden">
      <HubSidebar />
      {activeConversationId ? <DMSidebar /> : <StreamSidebar />}
      <ChatPanel />
      {activeHubId && !activeConversationId && <MemberList />}
      <UserProfilePopover />
    </div>
  );
}
