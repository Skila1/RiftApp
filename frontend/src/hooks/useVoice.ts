import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Participant,
  ConnectionState,
} from 'livekit-client';
import { api } from '../api/client';

export interface VoiceParticipant {
  identity: string;
  isSpeaking: boolean;
  isMuted: boolean;
}

interface VoiceState {
  connected: boolean;
  connecting: boolean;
  roomName: string | null;
  streamId: string | null;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  pttActive: boolean;
  pttMode: boolean;
  join: (streamId: string) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  togglePTT: () => void;
}

const CONNECT_TIMEOUT_MS = 15_000;

// Generate a simple tone-based sound via Web Audio API
function playTone(frequency: number, duration: number, gain: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available
  }
}

function playJoinSound() {
  playTone(880, 0.15, 0.15);
  setTimeout(() => playTone(1100, 0.15, 0.12), 100);
}

function playLeaveSound() {
  playTone(600, 0.15, 0.12);
  setTimeout(() => playTone(440, 0.2, 0.1), 100);
}

/** Remove all <audio>/<video> elements that livekit-client attached to document.body */
function detachAllRoomAudio(room: Room) {
  room.remoteParticipants.forEach((rp) => {
    rp.audioTrackPublications.forEach((pub) => {
      if (pub.track) {
        pub.track.detach().forEach((el) => el.remove());
      }
    });
  });
}

/** Safely stop local microphone and release the hardware device */
async function stopLocalMic(room: Room) {
  try {
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (micPub?.track) {
      micPub.track.stop();
      await room.localParticipant.unpublishTrack(micPub.track);
    }
  } catch {
    // Already stopped — ignore
  }
}

export function useVoice(): VoiceState {
  const roomRef = useRef<Room | null>(null);
  const joiningRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [pttMode, setPttMode] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  const pttModeRef = useRef(false);
  const wasMutedBeforeDeafenRef = useRef(false);

  const resetState = useCallback(() => {
    setConnected(false);
    setConnecting(false);
    setRoomName(null);
    setStreamId(null);
    setParticipants([]);
    setIsMuted(false);
    setIsDeafened(false);
    setPttActive(false);
  }, []);

  const updateParticipants = useCallback((room: Room) => {
    if (room.state !== ConnectionState.Connected) return;
    const toVP = (p: Participant): VoiceParticipant => ({
      identity: p.identity,
      isSpeaking: p.isSpeaking,
      isMuted: !p.isMicrophoneEnabled,
    });

    const list: VoiceParticipant[] = [toVP(room.localParticipant)];
    room.remoteParticipants.forEach((rp) => {
      list.push(toVP(rp));
    });
    setParticipants(list);
  }, []);

  /** Fully tear down current room — mic release, audio detach, disconnect */
  const destroyRoom = useCallback(async (room: Room) => {
    detachAllRoomAudio(room);
    await stopLocalMic(room);
    room.removeAllListeners();
    room.disconnect();
  }, []);

  const join = useCallback(async (sid: string) => {
    // Prevent concurrent join calls (double-click guard)
    if (joiningRef.current) return;
    joiningRef.current = true;

    // Leave existing room first
    if (roomRef.current) {
      const old = roomRef.current;
      roomRef.current = null;
      await destroyRoom(old);
    }

    setConnecting(true);
    try {
      const { token, url } = await api.getVoiceToken(sid);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Wire events
      const onUpdate = () => updateParticipants(room);

      room.on(RoomEvent.ParticipantConnected, (rp) => {
        onUpdate();
        playJoinSound();
        // If we are deafened, preemptively mute any tracks from the new participant
        // (they haven't subscribed yet, TrackSubscribed will handle it)
        void rp;
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        onUpdate();
        playLeaveSound();
      });
      room.on(RoomEvent.TrackSubscribed, onUpdate);
      room.on(RoomEvent.TrackUnsubscribed, onUpdate);
      room.on(RoomEvent.TrackMuted, onUpdate);
      room.on(RoomEvent.TrackUnmuted, onUpdate);
      room.on(RoomEvent.ActiveSpeakersChanged, onUpdate);
      room.on(RoomEvent.LocalTrackPublished, onUpdate);
      room.on(RoomEvent.LocalTrackUnpublished, onUpdate);
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Disconnected) {
          // Only reset if this is still the active room (not replaced)
          if (roomRef.current === room) {
            roomRef.current = null;
            detachAllRoomAudio(room);
            room.removeAllListeners();
            resetState();
          }
        }
      });

      // Attach remote audio tracks automatically, clean up on unsubscribe
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrackPublication['track'], _pub: RemoteTrackPublication, _rp: RemoteParticipant) => {
          if (track && track.kind === Track.Kind.Audio) {
            const el = track.attach();
            document.body.appendChild(el);
          }
        },
      );
      room.on(
        RoomEvent.TrackUnsubscribed,
        (track: RemoteTrackPublication['track']) => {
          if (track) {
            track.detach().forEach((el) => el.remove());
          }
        },
      );

      // Connect with timeout
      await Promise.race([
        room.connect(url, token),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS),
        ),
      ]);

      // Guard: if we were replaced or unmounted during the await, bail out
      if (roomRef.current !== room) {
        room.disconnect();
        return;
      }

      // In PTT mode, start muted; otherwise start unmuted
      const startMuted = pttModeRef.current;
      await room.localParticipant.setMicrophoneEnabled(!startMuted);

      setConnected(true);
      setRoomName(room.name);
      setStreamId(sid);
      setIsMuted(startMuted);
      setIsDeafened(false);
      updateParticipants(room);
      playJoinSound();
    } catch (err) {
      console.error('Failed to join voice channel:', err);
      // Clean up failed room
      if (roomRef.current) {
        roomRef.current.removeAllListeners();
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      resetState();
    } finally {
      setConnecting(false);
      joiningRef.current = false;
    }
  }, [updateParticipants, destroyRoom, resetState]);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      resetState();
      return;
    }
    roomRef.current = null;
    playLeaveSound();
    await destroyRoom(room);
    resetState();
  }, [destroyRoom, resetState]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const wasEnabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!wasEnabled);
    setIsMuted(wasEnabled);
    updateParticipants(room);
  }, [updateParticipants]);

  const toggleDeafen = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;

    setIsDeafened((prev) => {
      const next = !prev;
      // Mute/unmute all remote audio tracks
      room.remoteParticipants.forEach((rp) => {
        rp.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            if (next) {
              pub.track.detach().forEach((el) => el.remove());
            } else {
              const el = pub.track.attach();
              document.body.appendChild(el);
            }
          }
        });
      });
      if (next) {
        // Remember mic state before deafening, then mute
        wasMutedBeforeDeafenRef.current = !room.localParticipant.isMicrophoneEnabled;
        if (room.localParticipant.isMicrophoneEnabled) {
          room.localParticipant.setMicrophoneEnabled(false);
          setIsMuted(true);
          updateParticipants(room);
        }
      } else {
        // Restore mic to pre-deafen state
        if (!wasMutedBeforeDeafenRef.current) {
          room.localParticipant.setMicrophoneEnabled(true);
          setIsMuted(false);
          updateParticipants(room);
        }
      }
      return next;
    });
  }, [updateParticipants]);

  const togglePTT = useCallback(() => {
    setPttMode((prev) => {
      const next = !prev;
      pttModeRef.current = next;
      const room = roomRef.current;
      if (room && room.state === ConnectionState.Connected) {
        // When enabling PTT, mute mic immediately
        if (next) {
          room.localParticipant.setMicrophoneEnabled(false);
          setIsMuted(true);
          setPttActive(false);
          updateParticipants(room);
        } else {
          // When disabling PTT, unmute mic
          room.localParticipant.setMicrophoneEnabled(true);
          setIsMuted(false);
          updateParticipants(room);
        }
      }
      return next;
    });
  }, [updateParticipants]);

  // Push-to-talk key handler (spacebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pttModeRef.current || !roomRef.current) return;
      if (e.code !== 'Space') return;
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      if (e.repeat) return;
      const room = roomRef.current;
      if (room.state !== ConnectionState.Connected) return;
      room.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
      setPttActive(true);
      updateParticipants(room);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!pttModeRef.current || !roomRef.current) return;
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      const room = roomRef.current;
      if (room.state !== ConnectionState.Connected) return;
      room.localParticipant.setMicrophoneEnabled(false);
      setIsMuted(true);
      setPttActive(false);
      updateParticipants(room);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updateParticipants]);

  // Cleanup on unmount — full teardown
  useEffect(() => {
    return () => {
      const room = roomRef.current;
      if (room) {
        roomRef.current = null;
        detachAllRoomAudio(room);
        stopLocalMic(room);
        room.removeAllListeners();
        room.disconnect();
      }
    };
  }, []);

  return {
    connected,
    connecting,
    roomName,
    streamId,
    participants,
    isMuted,
    isDeafened,
    pttActive,
    pttMode,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    togglePTT,
  };
}
