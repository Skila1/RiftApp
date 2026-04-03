import HubSidebar from '../sidebar/HubSidebar';
import StreamSidebar from '../sidebar/StreamSidebar';
import DMSidebar from '../sidebar/DMSidebar';
import ChatPanel from '../chat/ChatPanel';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAppStore } from '../../stores/app';
import { useEffect } from 'react';

export default function AppLayout() {
  useWebSocket();
  const loadHubs = useAppStore((s) => s.loadHubs);
  const activeConversationId = useAppStore((s) => s.activeConversationId);

  useEffect(() => {
    loadHubs();
  }, [loadHubs]);

  return (
    <div className="h-screen flex overflow-hidden">
      <HubSidebar />
      {activeConversationId ? <DMSidebar /> : <StreamSidebar />}
      <ChatPanel />
    </div>
  );
}
