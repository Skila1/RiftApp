import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/auth';
import { useStreamStore } from '../stores/streamStore';
import { useMessageStore } from '../stores/messageStore';
import { usePresenceStore } from '../stores/presenceStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useDMStore } from '../stores/dmStore';
import { useFriendStore } from '../stores/friendStore';
import { isConversationMuted, useConversationMuteStore } from '../stores/conversationMuteStore';
import { isHubMuted, useHubNotificationStore } from '../stores/hubNotificationStore';
import { useHubStore } from '../stores/hubStore';
import { useVoiceStore } from '../stores/voiceStore';
import { useVoiceChannelUiStore } from '../stores/voiceChannelUiStore';
import type { Message, Notification, Conversation, Hub, User, WSEvent, DMCallRing, DMCallRingEnd } from '../types';
import { publicAssetUrl } from '../utils/publicAssetUrl';
import { api } from '../api/client';
import { playNotificationSound } from '../utils/audio/appSounds';
import { debugVoiceSpeaking } from '../utils/audio/voiceSpeakingDebug';

const HEARTBEAT_INTERVAL = 30000;
const TYPING_EXPIRE_MS = 3000;
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

let globalSend: (op: string, d?: unknown) => void = () => {};

export function wsSend(op: string, d?: unknown) {
  globalSend(op, d);
}

export function useWsSend() {
  return globalSend;
}

function isMutedHubNotification(hubId?: string, streamId?: string) {
  const resolvedHubId = hubId ?? (streamId ? useStreamStore.getState().streamHubMap[streamId] : undefined);
  if (!resolvedHubId) {
    return false;
  }
  const { hubSettingsByHubId, localMutedUntilByHubId } = useHubNotificationStore.getState();
  return isHubMuted(hubSettingsByHubId[resolvedHubId], localMutedUntilByHubId[resolvedHubId]);
}

function isMutedConversationNotification(conversationId?: string) {
  if (!conversationId) {
    return false;
  }
  const { mutedUntilByConversationId } = useConversationMuteStore.getState();
  return isConversationMuted(mutedUntilByConversationId[conversationId]);
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number>();
  const typingTimersRef = useRef<Map<string, number>>(new Map());
  const token = useAuthStore((s) => s.token);
  const activeStreamId = useStreamStore((s) => s.activeStreamId);
  const prevStreamRef = useRef<string | null>(null);

  const send = useCallback((op: string, d?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ op, d }));
    }
  }, []);

  const canApplyVoiceStreamEvent = useCallback((streamId: string) => {
    const streamState = useStreamStore.getState();
    if (streamState.streams.some((stream) => stream.id === streamId)) {
      return true;
    }
    const voiceState = useVoiceStore.getState();
    if (voiceState.streamId === streamId) {
      return true;
    }
    const voiceUiState = useVoiceChannelUiStore.getState();
    return voiceUiState.activeChannelKind === 'stream' && voiceUiState.activeChannelId === streamId;
  }, []);

  const canApplyVoiceConversationEvent = useCallback((conversationId: string) => {
    if (useDMStore.getState().conversations.some((conversation) => conversation.id === conversationId)) {
      return true;
    }
    const voiceState = useVoiceStore.getState();
    if (voiceState.conversationId === conversationId) {
      return true;
    }
    const voiceUiState = useVoiceChannelUiStore.getState();
    return voiceUiState.activeChannelKind === 'conversation' && voiceUiState.activeChannelId === conversationId;
  }, []);

  // Keep global ref in sync
  useEffect(() => {
    globalSend = send;
    return () => { globalSend = () => {}; };
  }, [send]);

  useEffect(() => {
    if (!token) return;

    let reconnectAttempts = 0;
    let reconnectTimer: number | undefined;
    let disposed = false;

    function connect() {
      if (disposed) return;

      const wsBase = import.meta.env.VITE_WS_URL;
      const wsUrl = wsBase
        ? `${wsBase}/ws?token=${token}`
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws?token=${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0;
        heartbeatRef.current = window.setInterval(() => {
          send('heartbeat');
        }, HEARTBEAT_INTERVAL);

        const authUser = useAuthStore.getState().user;
        if (authUser) {
          const resolvedStatus = usePresenceStore.getState().hydrateSelfPresence(authUser.id, authUser.status);
          if (resolvedStatus > 0) {
            send('set_status', { status: resolvedStatus });
          }
        }

        // Re-subscribe to active stream on (re)connect
        const currentStream = useStreamStore.getState().activeStreamId;
        if (currentStream) {
          send('subscribe', { stream_id: currentStream });
          prevStreamRef.current = currentStream;
        }
      };

      ws.onmessage = (event) => {
        const evt: WSEvent = JSON.parse(event.data);
        switch (evt.op) {
          case 'message_create':
            useMessageStore.getState().addMessage(evt.d as Message);
            break;
          case 'message_update': {
            const nextMessage = evt.d as Message;
            if (nextMessage.conversation_id) {
              useDMStore.getState().updateDMMessage(nextMessage);
            } else {
              useMessageStore.getState().updateMessage(nextMessage);
            }
            break;
          }
          case 'message_delete': {
            const d = evt.d as { id: string; stream_id?: string; conversation_id?: string };
            if (d.stream_id) {
              useMessageStore.getState().removeMessage(d.id);
            } else {
              useDMStore.getState().removeDMMessage(d.id);
            }
            break;
          }
          case 'typing_start': {
            const { user_id, stream_id } = evt.d as { user_id: string; stream_id: string };
            usePresenceStore.getState().addTyper(stream_id, user_id);

            // Clear any existing timer for this user+stream, set auto-expiry
            const key = `${stream_id}:${user_id}`;
            const prev = typingTimersRef.current.get(key);
            if (prev) clearTimeout(prev);
            typingTimersRef.current.set(
              key,
              window.setTimeout(() => {
                usePresenceStore.getState().removeTyper(stream_id, user_id);
                typingTimersRef.current.delete(key);
              }, TYPING_EXPIRE_MS),
            );
            break;
          }
          case 'typing_stop': {
            const { user_id, stream_id } = evt.d as { user_id: string; stream_id: string };
            usePresenceStore.getState().removeTyper(stream_id, user_id);
            const key = `${stream_id}:${user_id}`;
            const timer = typingTimersRef.current.get(key);
            if (timer) {
              clearTimeout(timer);
              typingTimersRef.current.delete(key);
            }
            break;
          }
          case 'presence_update': {
            const { user_id, status } = evt.d as { user_id: string; status: number };
            usePresenceStore.getState().setPresence(user_id, status);
            break;
          }
          case 'notification_create': {
            const notif = evt.d as Notification;
            useNotificationStore.getState().addNotification(notif);
            if (
              notif.type !== 'dm'
              && notif.type !== 'dm_call'
              && notif.type !== 'dm_call_missed'
              && !isMutedHubNotification(notif.hub_id, notif.stream_id)
            ) {
              playNotificationSound();
            }
            break;
          }
          case 'dm_message_create': {
            const dmMsg = evt.d as Message;
            useDMStore.getState().addDMMessage(dmMsg);
            if (dmMsg.conversation_id) {
              useVoiceStore.getState().clearConversationCallOutcome(dmMsg.conversation_id);
            }
            // Auto-ack if this conversation is currently active (user can see the message)
            const activeConvId = useDMStore.getState().activeConversationId;
            if (dmMsg.conversation_id && dmMsg.conversation_id === activeConvId) {
              useDMStore.getState().ackDM(dmMsg.conversation_id);
            } else if (
              dmMsg.author_id
              && dmMsg.author_id !== useAuthStore.getState().user?.id
              && !isMutedConversationNotification(dmMsg.conversation_id)
            ) {
              playNotificationSound();
            }
            break;
          }
          case 'dm_conversation_create': {
            useDMStore.getState().addConversation(evt.d as Conversation);
            break;
          }
          case 'dm_conversation_update': {
            useDMStore.getState().updateConversation(evt.d as Conversation);
            break;
          }
          case 'dm_conversation_delete': {
            const { conversation_id } = evt.d as { conversation_id: string };
            useDMStore.getState().removeConversation(conversation_id);
            break;
          }
          case 'dm_call_ring': {
            useVoiceStore.getState().setConversationCallRing(evt.d as DMCallRing);
            break;
          }
          case 'dm_call_ring_end': {
            const endData = evt.d as DMCallRingEnd;
            useVoiceStore.getState().clearConversationCallRing(endData.conversation_id);
            useVoiceStore.getState().setConversationCallOutcome(endData);
            break;
          }
          case 'reaction_add': {
            const { message_id, user_id, emoji, emoji_id, file_url } = evt.d as { message_id: string; user_id: string; emoji: string; emoji_id?: string; file_url?: string };
            const msgState = useMessageStore.getState();
            const dmState = useDMStore.getState();
            if (msgState.messages.some((m) => m.id === message_id)) {
              msgState.applyReactionAdd(message_id, user_id, emoji, false, emoji_id, file_url);
            } else if (dmState.dmMessages.some((m) => m.id === message_id)) {
              dmState.applyReactionAdd(message_id, user_id, emoji);
            }
            break;
          }
          case 'reaction_remove': {
            const { message_id, user_id, emoji, emoji_id } = evt.d as { message_id: string; user_id: string; emoji: string; emoji_id?: string };
            const msgState = useMessageStore.getState();
            const dmState = useDMStore.getState();
            if (msgState.messages.some((m) => m.id === message_id)) {
              msgState.applyReactionRemove(message_id, user_id, emoji, false, emoji_id);
            } else if (dmState.dmMessages.some((m) => m.id === message_id)) {
              dmState.applyReactionRemove(message_id, user_id, emoji);
            }
            break;
          }
          case 'voice_state_update': {
            const { stream_id, conversation_id, user_id, action } = evt.d as { stream_id?: string; conversation_id?: string; user_id: string; action: 'join' | 'leave' };
            if (stream_id) {
              if (!canApplyVoiceStreamEvent(stream_id)) {
                break;
              }
              useStreamStore.getState().applyVoiceState(stream_id, user_id, action);
            } else if (conversation_id) {
              if (!canApplyVoiceConversationEvent(conversation_id)) {
                break;
              }
              useVoiceStore.getState().applyConversationVoiceState(conversation_id, user_id, action);
            } else {
              break;
            }
            const voiceState = useVoiceStore.getState();
            if (action === 'join') {
              // Fetch profile for unknown users so their display name is shown immediately
              if (!usePresenceStore.getState().usersById[user_id]) {
                api.getUser(user_id).then((u) => usePresenceStore.getState().mergeUser(u)).catch(() => {});
              }
            } else {
              voiceState.clearSpeakingSignal(user_id);
            }
            break;
          }
          case 'voice_screen_share_update': {
            const { stream_id, conversation_id, user_id, sharing } = evt.d as { stream_id?: string; conversation_id?: string; user_id: string; sharing: boolean };
            if (stream_id) {
              if (!canApplyVoiceStreamEvent(stream_id)) {
                break;
              }
              useStreamStore.getState().applyVoiceScreenShare(stream_id, user_id, sharing);
            } else if (conversation_id) {
              if (!canApplyVoiceConversationEvent(conversation_id)) {
                break;
              }
              useVoiceStore.getState().applyConversationVoiceScreenShare(conversation_id, user_id, sharing);
            }
            break;
          }
          case 'voice_deafen_update': {
            const { stream_id, conversation_id, user_id, deafened } = evt.d as { stream_id?: string; conversation_id?: string; user_id: string; deafened: boolean };
            if (stream_id) {
              if (!canApplyVoiceStreamEvent(stream_id)) {
                break;
              }
              useStreamStore.getState().applyVoiceDeafen(stream_id, user_id, deafened);
            } else if (conversation_id) {
              if (!canApplyVoiceConversationEvent(conversation_id)) {
                break;
              }
              useVoiceStore.getState().applyConversationVoiceDeafen(conversation_id, user_id, deafened);
            }
            break;
          }
          case 'voice_speaking_update': {
            const { stream_id, conversation_id, user_id, speaking } = evt.d as { stream_id?: string; conversation_id?: string; user_id: string; speaking: boolean };
            if (stream_id && !canApplyVoiceStreamEvent(stream_id)) {
              break;
            }
            if (conversation_id && !canApplyVoiceConversationEvent(conversation_id)) {
              break;
            }
            if (!speaking && user_id === useAuthStore.getState().user?.id) {
              break;
            }
            debugVoiceSpeaking('Received speaking update', {
              userId: user_id,
              speaking,
              streamId: stream_id ?? null,
              conversationId: conversation_id ?? null,
            });
            useVoiceStore.getState().applySpeakingSignal(user_id, speaking);
            break;
          }
          case 'voice_move': {
            const { stream_id } = evt.d as { stream_id: string };
            useVoiceChannelUiStore.getState().setActiveChannel(stream_id);
            void useVoiceStore.getState().moveToStream(stream_id);
            break;
          }
          case 'voice_disconnect': {
            useVoiceChannelUiStore.getState().resetVoiceView();
            void useVoiceStore.getState().leave();
            break;
          }
          case 'friend_request': {
            const { user_id } = evt.d as { user_id: string };
            useFriendStore.getState().handleFriendRequest(user_id);
            break;
          }
          case 'friend_accept': {
            const { user_id } = evt.d as { user_id: string };
            useFriendStore.getState().handleFriendAccept(user_id);
            break;
          }
          case 'friend_remove': {
            const { user_id } = evt.d as { user_id: string };
            useFriendStore.getState().handleFriendRemove(user_id);
            break;
          }
          case 'hub_update': {
            useHubStore.getState().applyHubUpdate(evt.d as Hub);
            break;
          }
          case 'role_update': {
            const { hub_id } = evt.d as { hub_id: string };
            if (hub_id) {
              useHubStore.getState().loadHubPermissions(hub_id);
            }
            break;
          }
          case 'stream_update': {
            const { hub_id } = evt.d as { hub_id: string };
            if (hub_id && useHubStore.getState().activeHubId === hub_id) {
              useStreamStore.getState().invalidateHubLayoutCache(hub_id);
              void useStreamStore.getState().reloadLayout(hub_id);
            }
            break;
          }
          case 'category_update': {
            const { hub_id } = evt.d as { hub_id: string };
            if (hub_id && useHubStore.getState().activeHubId === hub_id) {
              useStreamStore.getState().invalidateHubLayoutCache(hub_id);
              void useStreamStore.getState().reloadLayout(hub_id);
            }
            break;
          }
          case 'user_update': {
            const user = evt.d as User;
            const authState = useAuthStore.getState();
            if (authState.user?.id === user.id) {
              authState.setUser(user);
            }
            usePresenceStore.getState().mergeUser(user);
            useMessageStore.getState().patchUser(user);
            useDMStore.getState().patchUser(user);
            useFriendStore.getState().patchUser(user);
            useNotificationStore.getState().patchUser(user);
            break;
          }
          case 'soundboard_play': {
            const { stream_id, file_url, user_id } = evt.d as { stream_id: string; sound_id: string; name: string; file_url: string; user_id: string };
            const voiceState = useVoiceStore.getState();
            if (!voiceState.connected || voiceState.streamId !== stream_id) {
              break;
            }

            voiceState.triggerSoundboardSpeaking(user_id, 1600);

            // Play the sound locally for this user (all voice channel users receive this event)
            try {
              const url = publicAssetUrl(file_url);
              const audio = new Audio(url);
              audio.volume = 0.5;
              audio.addEventListener('loadedmetadata', () => {
                if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
                useVoiceStore.getState().triggerSoundboardSpeaking(user_id, audio.duration * 1000);
              }, { once: true });
              audio.play().catch(() => {});
            } catch { /* Audio not available */ }
            break;
          }
        }
      };

      ws.onclose = () => {
        clearInterval(heartbeatRef.current);
        // Clear all typing timers
        typingTimersRef.current.forEach((t) => clearTimeout(t));
        typingTimersRef.current.clear();

        // Reconnect with exponential backoff
        if (!disposed && useAuthStore.getState().token) {
          const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
            RECONNECT_MAX_DELAY,
          );
          reconnectAttempts++;
          reconnectTimer = window.setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeatRef.current);
      typingTimersRef.current.forEach((t) => clearTimeout(t));
      typingTimersRef.current.clear();
      wsRef.current?.close();
    };
  }, [canApplyVoiceStreamEvent, token, send]);

  // Subscribe/unsubscribe to active stream
  useEffect(() => {
    if (prevStreamRef.current) {
      send('unsubscribe', { stream_id: prevStreamRef.current });
    }
    if (activeStreamId) {
      send('subscribe', { stream_id: activeStreamId });
    }
    prevStreamRef.current = activeStreamId;
  }, [activeStreamId, send]);

  return { send };
}
