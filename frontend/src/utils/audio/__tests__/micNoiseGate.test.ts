import { describe, expect, it, vi } from 'vitest';

import { AUTO_THRESHOLD_MIN, MicNoiseGateProcessor } from '../micNoiseGate';

function createFakeAnalyser(level: number) {
  const byte = Math.max(0, Math.min(255, Math.round(128 + level * 128)));
  return {
    getByteTimeDomainData(buffer: Uint8Array) {
      buffer.fill(byte);
    },
  };
}

function createProcessor() {
  const onSpeakingStateChange = vi.fn();
  const onMetricsChange = vi.fn();
  const processor = new MicNoiseGateProcessor(
    {
      automaticSensitivity: false,
      manualThreshold: 0.02,
      releaseMs: 30,
      noiseSuppressionEnabled: true,
      inputVolume: 1,
    },
    {
      onSpeakingStateChange,
      onMetricsChange,
    },
  );

  return {
    processor: processor as never as Record<string, unknown>,
    onSpeakingStateChange,
    onMetricsChange,
  };
}

describe('MicNoiseGateProcessor', () => {
  it('uses raw microphone level for speaking detection even if processed output is low', () => {
    const { processor, onSpeakingStateChange } = createProcessor();

    processor.rawAnalyser = createFakeAnalyser(0.035);
    processor.processedAnalyser = createFakeAnalyser(0.002);
    processor.outputAnalyser = createFakeAnalyser(0);
    processor.rawSamples = new Uint8Array(256);
    processor.processedSamples = new Uint8Array(256);
    processor.outputSamples = new Uint8Array(256);
    processor.noiseFloor = AUTO_THRESHOLD_MIN;
    processor.speaking = false;
    processor.holdUntil = 0;

    (processor.tick as () => void)();

    expect(onSpeakingStateChange).toHaveBeenCalledWith(true);
  });

  it('does not let processed audio alone trigger speaking when raw mic input is below threshold', () => {
    const { processor, onSpeakingStateChange, onMetricsChange } = createProcessor();

    processor.rawAnalyser = createFakeAnalyser(0.008);
    processor.processedAnalyser = createFakeAnalyser(0.045);
    processor.outputAnalyser = createFakeAnalyser(0.045);
    processor.rawSamples = new Uint8Array(256);
    processor.processedSamples = new Uint8Array(256);
    processor.outputSamples = new Uint8Array(256);
    processor.noiseFloor = AUTO_THRESHOLD_MIN;
    processor.speaking = false;
    processor.holdUntil = 0;

    (processor.tick as () => void)();

    expect(onSpeakingStateChange).not.toHaveBeenCalledWith(true);
    expect(onMetricsChange).toHaveBeenCalled();
    const [metrics] = onMetricsChange.mock.lastCall as [{ level: number; rawLevel?: number; processedLevel?: number; outputLevel?: number }];
    expect(metrics.level).toBeCloseTo(metrics.rawLevel ?? 0, 3);
    expect((metrics.processedLevel ?? 0)).toBeGreaterThan(metrics.level);
  });

  it('creates a fallback AudioContext when none is provided by LiveKit', async () => {
    const onSpeakingStateChange = vi.fn();
    const proc = new MicNoiseGateProcessor(
      {
        automaticSensitivity: false,
        manualThreshold: 0.02,
        releaseMs: 30,
        noiseSuppressionEnabled: false,
        inputVolume: 1,
      },
      { onSpeakingStateChange },
    );

    // Simulate LiveKit calling init() without an audioContext (as it does in practice)
    const fakeTrack = {
      getSettings: () => ({ channelCount: 1 }),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;

    // In jsdom, AudioContext isn't available, so we stub the constructor
    const mockDestination = { stream: { getAudioTracks: () => [fakeTrack] }, disconnect: vi.fn() };
    const stubNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const mockNodes = {
      createMediaStreamSource: vi.fn(() => stubNode()),
      createAnalyser: vi.fn(() => ({ ...stubNode(), fftSize: 256, smoothingTimeConstant: 0 })),
      createGain: vi.fn(() => ({ ...stubNode(), gain: { value: 0 } })),
      createChannelSplitter: vi.fn(() => stubNode()),
      createChannelMerger: vi.fn(() => stubNode()),
      createMediaStreamDestination: vi.fn(() => mockDestination),
      state: 'running',
      close: vi.fn(() => Promise.resolve()),
    };
    const realAudioContext = globalThis.AudioContext;
    const realMediaStream = globalThis.MediaStream;
    globalThis.MediaStream = class FakeMediaStream {
      constructor() { /* stub */ }
    } as unknown as typeof MediaStream;
    const ctorSpy = vi.fn();
    globalThis.AudioContext = class FakeAudioContext {
      constructor(...args: unknown[]) {
        ctorSpy(...args);
        Object.assign(this, mockNodes);
      }
    } as unknown as typeof AudioContext;

    try {
      await proc.init({ track: fakeTrack } as never);
      // Should have created its own AudioContext
      expect(ctorSpy).toHaveBeenCalledWith({ sampleRate: 48000 });
    } finally {
      await proc.destroy();
      globalThis.AudioContext = realAudioContext;
      globalThis.MediaStream = realMediaStream;
    }
  });
});