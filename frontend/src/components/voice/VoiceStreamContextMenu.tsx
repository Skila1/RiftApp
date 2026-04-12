import { useCallback, useEffect, useState } from 'react';
import { MenuOverlay, menuDivider } from '../context-menus/MenuOverlay';
import type { VoiceParticipant } from '../../stores/voiceStore';
import { useVoiceStore } from '../../stores/voiceStore';

function Row({
  children,
  onClick,
  disabled,
  right,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-md text-[14px] flex items-center justify-between gap-3 transition-colors ${
        disabled ? 'text-[#5c5e66] cursor-not-allowed opacity-60' : 'text-riftapp-text hover:bg-riftapp-accent hover:text-white'
      }`}
    >
      <div className="min-w-0 flex-1 text-left">{children}</div>
      {right != null ? <span className="shrink-0 flex items-center">{right}</span> : null}
    </button>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block pr-4 text-[11px] font-normal leading-snug text-riftapp-text-dim">{children}</span>;
}

function StopIcon() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded border border-riftapp-border-light bg-riftapp-menu-hover">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-riftapp-text">
        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function CheckboxMark({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
        checked ? 'bg-[#5865f2] border-[#5865f2]' : 'border-riftapp-border-light bg-riftapp-menu-hover'
      }`}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

function PopOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riftapp-text-muted">
      <path d="M14 3h7v7M10 14L21 3M21 14v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riftapp-text-dim">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  participant: VoiceParticipant;
  x: number;
  y: number;
  onClose: () => void;
  onStopWatching: () => void;
  onPopOutStream: () => void;
  onMoreOptions: () => void;
}

export default function VoiceStreamContextMenu({
  participant,
  x,
  y,
  onClose,
  onStopWatching,
  onPopOutStream,
  onMoreOptions,
}: Props) {
  const identity = participant.identity;
  const streamVolumes = useVoiceStore((s) => s.streamVolumes);
  const streamAudioMuted = useVoiceStore((s) => s.streamAudioMuted);
  const streamAttenuationEnabled = useVoiceStore((s) => s.streamAttenuationEnabled);
  const streamAttenuationStrength = useVoiceStore((s) => s.streamAttenuationStrength);
  const setStreamVolume = useVoiceStore((s) => s.setStreamVolume);
  const toggleStreamAudioMute = useVoiceStore((s) => s.toggleStreamAudioMute);
  const setStreamAttenuationEnabled = useVoiceStore((s) => s.setStreamAttenuationEnabled);
  const setStreamAttenuationStrength = useVoiceStore((s) => s.setStreamAttenuationStrength);

  const vol = streamVolumes[identity] ?? 1;
  const [streamVolSlider, setStreamVolSlider] = useState(Math.round(vol * 100));
  const [attenSlider, setAttenSlider] = useState(streamAttenuationStrength);

  useEffect(() => {
    setStreamVolSlider(Math.round((streamVolumes[identity] ?? 1) * 100));
  }, [identity, streamVolumes]);

  useEffect(() => {
    setAttenSlider(streamAttenuationStrength);
  }, [streamAttenuationStrength]);

  const handleStop = useCallback(() => {
    onStopWatching();
    onClose();
  }, [onClose, onStopWatching]);

  const streamMuted = Boolean(streamAudioMuted[identity]);

  return (
    <MenuOverlay x={x} y={y} onClose={onClose}>
      <div
        className="rift-context-menu-shell"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="px-1">
          <Row onClick={handleStop} right={<StopIcon />}>
            Stop Watching
          </Row>
          <Row
            onClick={() => toggleStreamAudioMute(identity)}
            right={<CheckboxMark checked={streamMuted} />}
          >
            Mute
          </Row>
        </div>

        {menuDivider()}

        <div className="px-3 py-2">
          <div className="mb-2 text-[12px] font-semibold text-riftapp-text">Stream Volume</div>
          <input
            type="range"
            min={0}
            max={100}
            value={streamVolSlider}
            onChange={(e) => {
              const n = Number(e.target.value);
              setStreamVolSlider(n);
              setStreamVolume(identity, n / 100);
            }}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #5865f2 0%, #5865f2 ${streamVolSlider}%, #4e5058 ${streamVolSlider}%, #4e5058 100%)`,
            }}
          />
        </div>

        {menuDivider()}

        <div className="px-1">
          <Row onClick={() => { onPopOutStream(); onClose(); }} right={<PopOutIcon />}>
            Pop Out Stream
          </Row>
        </div>

        {menuDivider()}

        <div className="px-1">
          <Row
            onClick={() => setStreamAttenuationEnabled(!streamAttenuationEnabled)}
            right={<CheckboxMark checked={streamAttenuationEnabled} />}
          >
            <div>
              Stream Attenuation
              <SubLabel>Automatically reduce stream volume when people are talking.</SubLabel>
            </div>
          </Row>
        </div>

        <div className="px-3 py-2">
          <div className="mb-2 text-[12px] font-semibold text-riftapp-text">Stream Attenuation Strength</div>
          <input
            type="range"
            min={0}
            max={100}
            value={attenSlider}
            onChange={(e) => {
              const n = Number(e.target.value);
              setAttenSlider(n);
              setStreamAttenuationStrength(n);
            }}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #5865f2 0%, #5865f2 ${attenSlider}%, #4e5058 ${attenSlider}%, #4e5058 100%)`,
            }}
          />
        </div>

        {menuDivider()}

        <div className="px-1">
          <Row
            onClick={() => {
              onMoreOptions();
            }}
            right={<ChevronRight />}
          >
            More Options
          </Row>
        </div>
      </div>
    </MenuOverlay>
  );
}
