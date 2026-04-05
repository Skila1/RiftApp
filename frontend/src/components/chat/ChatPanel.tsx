import { useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStreamStore } from '../../stores/streamStore';
import { useMessageStore } from '../../stores/messageStore';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { useWsSend } from '../../hooks/useWebSocket';
import MessageInput from './MessageInput';
import MessageItem from './MessageItem';
import TypingIndicator from './TypingIndicator';
export default function ChatPanel() {
  const messages = useMessageStore((s) => s.messages);
  const messagesLoading = useMessageStore((s) => s.messagesLoading);
  const activeStreamId = useStreamStore((s) => s.activeStreamId);
  const streams = useStreamStore((s) => s.streams);
  const user = useAuthStore((s) => s.user);
  const bottomRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const wasNearBottomRef = useRef(true);
  const send = useWsSend();
  const lastReadMessageIds = useStreamStore((s) => s.lastReadMessageIds);

  // DM state
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const dmMessages = useDMStore((s) => s.dmMessages);
  const dmMessagesLoading = useDMStore((s) => s.dmMessagesLoading);
  const conversations = useDMStore((s) => s.conversations);
  const sendDMMessage = useDMStore((s) => s.sendDMMessage);
  const ackDM = useDMStore((s) => s.ackDM);

  const isDMMode = !!activeConversationId;

  const activeStream = useMemo(
    () => streams.find((s) => s.id === activeStreamId),
    [streams, activeStreamId]
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const displayMessages = isDMMode ? dmMessages : messages;
  const isLoading = isDMMode ? dmMessagesLoading : messagesLoading;

  // Compute unread divider position for stream messages
  const firstUnreadIndex = useMemo(() => {
    if (isDMMode || !activeStreamId) return -1;
    const lastReadId = lastReadMessageIds[activeStreamId];
    if (!lastReadId) return -1; // no read state => don't show divider
    const idx = displayMessages.findIndex((m) => m.id === lastReadId);
    if (idx < 0 || idx >= displayMessages.length - 1) return -1;
    return idx + 1; // first unread is the message after lastReadId
  }, [isDMMode, activeStreamId, lastReadMessageIds, displayMessages]);

  const onTyping = useCallback(() => {
    if (activeStreamId) {
      send('typing', { stream_id: activeStreamId });
    }
  }, [activeStreamId, send]);

  const onTypingStop = useCallback(() => {
    if (activeStreamId) {
      send('typing_stop', { stream_id: activeStreamId });
    }
  }, [activeStreamId, send]);

  const hasScrolledToUnread = useRef(false);

  useEffect(() => {
    hasScrolledToUnread.current = false;
    prevMessageCountRef.current = 0;
    wasNearBottomRef.current = true;
  }, [activeStreamId, activeConversationId]);

  useLayoutEffect(() => {
    if (isLoading) {
      return;
    }
    const el = scrollContainerRef.current;
    const bottomEl = bottomRef.current;

    if (!hasScrolledToUnread.current && unreadRef.current) {
      unreadRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
      hasScrolledToUnread.current = true;
      prevMessageCountRef.current = displayMessages.length;
      wasNearBottomRef.current = true;
      return;
    }

    if (!el || !bottomEl) {
      prevMessageCountRef.current = displayMessages.length;
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = el;
    const distBottom = scrollHeight - scrollTop - clientHeight;
    const grew = displayMessages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = displayMessages.length;

    if (grew && (wasNearBottomRef.current || distBottom < 80)) {
      bottomEl.scrollIntoView({ behavior: 'smooth' });
      wasNearBottomRef.current = true;
    } else {
      wasNearBottomRef.current = distBottom < 80;
    }
  }, [displayMessages.length, isLoading, firstUnreadIndex]);

  // Ack DM conversation when it becomes active and messages have loaded
  useEffect(() => {
    if (isDMMode && activeConversationId && !isLoading && dmMessages.length > 0) {
      ackDM(activeConversationId);
    }
  }, [isDMMode, activeConversationId, isLoading, dmMessages.length, ackDM]);

  // Empty state — no stream and no DM selected
  if (!activeStreamId && !activeConversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-riftapp-bg">
        <div className="text-center animate-fade-in max-w-sm px-6">
          <div className="w-16 h-16 rounded-3xl bg-riftapp-surface flex items-center justify-center mx-auto mb-5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-text-dim">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-riftapp-text mb-1 tracking-tight">Welcome to RiftApp</h2>
          <p className="text-riftapp-text-dim text-sm mb-6">Here's how to get started:</p>
          <ol className="text-left space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-riftapp-accent/20 text-riftapp-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span className="text-riftapp-text-muted"><span className="text-riftapp-text font-medium">Create a Hub</span> — click <span className="font-bold text-riftapp-success">+</span> in the left rail to start a new community.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-riftapp-accent/20 text-riftapp-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span className="text-riftapp-text-muted"><span className="text-riftapp-text font-medium">Invite people</span> — click the person+ icon in the hub header to generate an invite code.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-riftapp-accent/20 text-riftapp-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span className="text-riftapp-text-muted"><span className="text-riftapp-text font-medium">Join an existing hub</span> — click the arrow icon in the left rail and enter an invite code.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-riftapp-accent/20 text-riftapp-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
              <span className="text-riftapp-text-muted"><span className="text-riftapp-text font-medium">Send a DM</span> — click the chat bubble icon, then press <span className="font-bold text-riftapp-accent">+</span> to message someone.</span>
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-riftapp-bg min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-riftapp-border/60 flex-shrink-0 shadow-[0_1px_0_rgba(0,0,0,0.2)]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isDMMode ? (
            <>
              <span className="text-riftapp-text-dim text-lg font-medium">@</span>
              <h3 className="font-semibold text-[15px] truncate">{activeConversation?.recipient?.display_name || 'Direct Message'}</h3>
            </>
          ) : (
            <>
              <span className="text-riftapp-text-dim text-lg font-medium">#</span>
              <h3 className="font-semibold text-[15px] truncate">{activeStream?.name}</h3>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
        <motion.div
          key={activeStreamId || activeConversationId || 'empty'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-full"
        >
        {isLoading ? (
          <div className="px-4 py-4 space-y-4 animate-fade-in">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-3">
                {/* Avatar skeleton */}
                <div className="w-9 h-9 rounded-full bg-riftapp-surface/60 flex-shrink-0 animate-pulse" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  {/* Name + timestamp */}
                  <div className="flex items-center gap-2">
                    <div className="h-3 rounded-full bg-riftapp-surface/80 animate-pulse" style={{ width: `${60 + (i % 3) * 20}px` }} />
                    <div className="h-2.5 rounded-full bg-riftapp-surface/50 animate-pulse w-10" />
                  </div>
                  {/* Message lines */}
                  <div className="h-3 rounded-full bg-riftapp-surface/60 animate-pulse" style={{ width: `${50 + ((i * 37) % 40)}%` }} />
                  {i % 3 === 0 && (
                    <div className="h-3 rounded-full bg-riftapp-surface/40 animate-pulse" style={{ width: `${30 + ((i * 17) % 30)}%` }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full animate-fade-in">
            <div className="text-center px-8">
              <div className="w-16 h-16 rounded-full bg-riftapp-surface flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl font-bold text-riftapp-text-dim">{isDMMode ? '@' : '#'}</span>
              </div>
              {isDMMode ? (
                <>
                  <h3 className="text-xl font-bold mb-1">{activeConversation?.recipient?.display_name}</h3>
                  <p className="text-riftapp-text-dim text-sm max-w-sm">
                    This is the beginning of your conversation with <span className="font-semibold text-riftapp-text">{activeConversation?.recipient?.display_name}</span>.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold mb-1">Welcome to #{activeStream?.name}</h3>
                  <p className="text-riftapp-text-dim text-sm max-w-sm">
                    This is the very beginning of the <span className="font-semibold text-riftapp-text">#{activeStream?.name}</span> stream. Send a message to get things started!
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            {displayMessages.map((msg, i) => {
              const prev = displayMessages[i - 1];
              const showHeader =
                !prev ||
                prev.author_id !== msg.author_id ||
                new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 300000;

              const showUnreadDivider = i === firstUnreadIndex;

              return (
                <div key={msg.id}>
                  {showUnreadDivider && (
                    <div ref={unreadRef} className="flex items-center gap-2 my-2 px-2">
                      <div className="flex-1 h-px bg-riftapp-danger/60" />
                      <span className="text-[11px] font-semibold text-riftapp-danger uppercase tracking-wide flex-shrink-0">
                        New Messages
                      </span>
                      <div className="flex-1 h-px bg-riftapp-danger/60" />
                    </div>
                  )}
                  <MessageItem
                    message={msg}
                    showHeader={showHeader}
                    isOwn={msg.author_id === user?.id}
                    isDM={isDMMode}
                  />
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
        </motion.div>
        </AnimatePresence>
      </div>

      {/* Typing indicator + Input */}
      {activeStreamId && <TypingIndicator streamId={activeStreamId} />}
      <MessageInput
        streamName={isDMMode ? (activeConversation?.recipient?.display_name || '') : (activeStream?.name || '')}
        onTyping={isDMMode ? undefined : onTyping}
        onTypingStop={isDMMode ? undefined : onTypingStop}
        isDMMode={isDMMode}
        onSendDM={isDMMode ? sendDMMessage : undefined}
      />
    </div>
  );
}
