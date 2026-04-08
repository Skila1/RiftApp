import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

const AUTO_THRESHOLD_MULTIPLIER = 1.55;
const AUTO_THRESHOLD_OFFSET = 0.0025;
export const AUTO_THRESHOLD_MIN = 0.006;
export const AUTO_THRESHOLD_MAX = 0.08;
const NOISE_FLOOR_RISE_SMOOTHING = 0.05;
const NOISE_FLOOR_FALL_SMOOTHING = 0.012;

export const DEFAULT_MANUAL_MIC_THRESHOLD = 0.025;
export const DEFAULT_MIC_GATE_RELEASE_MS = 30;

export interface MicNoiseGateSettings {
  automaticSensitivity: boolean;
  manualThreshold: number;
  releaseMs: number;
  noiseSuppressionEnabled: boolean;
  inputVolume: number;
}

export interface MicNoiseGateMetrics {
  level: number;
  threshold: number;
  aboveThreshold: boolean;
  speaking: boolean;
}

interface MicNoiseGateCallbacks {
  onSpeakingStateChange: (speaking: boolean) => void;
  onMetricsChange?: (metrics: MicNoiseGateMetrics) => void;
}

interface MicNoiseGateInitOptions {
  track: MediaStreamTrack;
  audioContext: AudioContext;
}

type RnnoiseModule = typeof import('@sapphi-red/web-noise-suppressor');

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function estimateAutomaticMicThreshold(noiseFloor: number) {
  return clamp(
    noiseFloor * AUTO_THRESHOLD_MULTIPLIER + AUTO_THRESHOLD_OFFSET,
    AUTO_THRESHOLD_MIN,
    AUTO_THRESHOLD_MAX,
  );
}

export function updateAutomaticMicNoiseFloor(noiseFloor: number, level: number) {
  const cappedLevel = Math.min(level, Math.max(noiseFloor * 2.5, AUTO_THRESHOLD_MIN * 2));
  const smoothing = cappedLevel > noiseFloor
    ? NOISE_FLOOR_RISE_SMOOTHING
    : NOISE_FLOOR_FALL_SMOOTHING;

  return clamp(
    noiseFloor * (1 - smoothing) + cappedLevel * smoothing,
    AUTO_THRESHOLD_MIN * 0.5,
    AUTO_THRESHOLD_MAX,
  );
}

export function normalizeMicMeterLevel(level: number) {
  return clamp(level / AUTO_THRESHOLD_MAX, 0, 1);
}

let rnnoiseBinaryPromise: Promise<ArrayBuffer> | null = null;
let rnnoiseModulePromise: Promise<RnnoiseModule> | null = null;
const rnnoiseLoadedContexts = new WeakSet<AudioContext>();

async function loadRnnoiseModule() {
  if (!rnnoiseModulePromise) {
    rnnoiseModulePromise = import('@sapphi-red/web-noise-suppressor').catch((error) => {
      rnnoiseModulePromise = null;
      throw error;
    });
  }

  return rnnoiseModulePromise;
}

async function loadRnnoiseBinary() {
  if (!rnnoiseBinaryPromise) {
    const { loadRnnoise } = await loadRnnoiseModule();
    rnnoiseBinaryPromise = loadRnnoise({
      url: rnnoiseWasmPath,
      simdUrl: rnnoiseSimdWasmPath,
    }).catch((error) => {
      rnnoiseBinaryPromise = null;
      throw error;
    });
  }

  return rnnoiseBinaryPromise;
}

export async function createRnnoiseNode(audioContext: AudioContext, maxChannels = 1) {
  if (typeof audioContext.audioWorklet?.addModule !== 'function') {
    throw new Error('AudioWorklet is unavailable.');
  }

  if (!rnnoiseLoadedContexts.has(audioContext)) {
    await audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
    rnnoiseLoadedContexts.add(audioContext);
  }

  const wasmBinary = await loadRnnoiseBinary();
  const { RnnoiseWorkletNode } = await loadRnnoiseModule();
  return new RnnoiseWorkletNode(audioContext, {
    maxChannels,
    wasmBinary: wasmBinary.slice(0),
  });
}

export class MicNoiseGateProcessor {
  name = 'riftapp-mic-noise-gate';
  processedTrack?: MediaStreamTrack;

  private settings: MicNoiseGateSettings;

  private readonly callbacks: MicNoiseGateCallbacks;

  private source: MediaStreamAudioSourceNode | null = null;

  private analyser: AnalyserNode | null = null;

  private gain: GainNode | null = null;

  private rnnoise: RnnoiseWorkletNode | null = null;

  private stereoSplitter: ChannelSplitterNode | null = null;

  private stereoMerger: ChannelMergerNode | null = null;

  private destination: MediaStreamAudioDestinationNode | null = null;

  private samples: Uint8Array<ArrayBuffer> | null = null;

  private frame: ReturnType<typeof setInterval> | null = null;

  private speaking = false;

  private holdUntil = 0;

  private noiseFloor = AUTO_THRESHOLD_MIN;

  private lastLevel = 0;

  constructor(settings: MicNoiseGateSettings, callbacks: MicNoiseGateCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
  }

  updateSettings(next: Partial<MicNoiseGateSettings>) {
    this.settings = { ...this.settings, ...next };

    if (this.speaking) {
      this.setGain(this.getOpenGain());
    }

    if (!this.settings.automaticSensitivity && this.settings.manualThreshold <= 0) {
      this.setSpeaking(true);
      this.setGain(this.getOpenGain());
    }

    this.emitMetrics(this.lastLevel, this.getThreshold(), this.lastLevel >= this.getThreshold());
  }

  async init({ track, audioContext }: MicNoiseGateInitOptions) {
    this.teardownGraph();

    const inputChannelCount = clamp(Math.round(track.getSettings().channelCount ?? 1), 1, 2);
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.08;
    this.gain = audioContext.createGain();
    this.destination = audioContext.createMediaStreamDestination();
    this.samples = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.noiseFloor = AUTO_THRESHOLD_MIN;
    this.holdUntil = 0;
    this.speaking = false;

    let processedSource: AudioNode = this.source;

    if (this.settings.noiseSuppressionEnabled) {
      try {
        this.rnnoise = await createRnnoiseNode(audioContext, inputChannelCount);
        this.source.connect(this.rnnoise);
        processedSource = this.rnnoise;
      } catch (error) {
        console.warn('RNNoise initialization failed, falling back to raw microphone input.', error);
      }
    }

    processedSource.connect(this.analyser);
    this.stereoSplitter = audioContext.createChannelSplitter(2);
    this.stereoMerger = audioContext.createChannelMerger(2);
    processedSource.connect(this.stereoSplitter);
    this.stereoSplitter.connect(this.stereoMerger, 0, 0);
    this.stereoSplitter.connect(this.stereoMerger, inputChannelCount > 1 ? 1 : 0, 1);
    this.stereoMerger.connect(this.gain);
    this.gain.connect(this.destination);

    this.processedTrack = this.destination.stream.getAudioTracks()[0] ?? track;

    if (!this.settings.automaticSensitivity && this.settings.manualThreshold <= 0) {
      this.setGain(this.getOpenGain());
      this.setSpeaking(true);
    } else {
      this.setGain(0);
    }

    this.emitMetrics(0, this.getThreshold(), false);

    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
    } catch {
      /* ignore audio context resume failures */
    }

    this.startTicking();
  }

  async restart(options: MicNoiseGateInitOptions) {
    await this.init(options);
  }

  async destroy() {
    this.teardownGraph();
    this.setSpeaking(false);
    this.processedTrack?.stop();
    this.processedTrack = undefined;
  }

  private startTicking() {
    this.frame = setInterval(() => this.tick(), 16);
  }

  private tick() {
    if (!this.analyser || !this.samples) {
      return;
    }

    this.analyser.getByteTimeDomainData(this.samples);
    let sumSquares = 0;
    for (let index = 0; index < this.samples.length; index += 1) {
      const sample = (this.samples[index] - 128) / 128;
      sumSquares += sample * sample;
    }

    const level = Math.sqrt(sumSquares / this.samples.length);
    this.lastLevel = level;
    const now = performance.now();
    const threshold = this.getThreshold();
    const shouldOpen = threshold <= 0 || level >= threshold;

    if (shouldOpen) {
      this.holdUntil = now + this.settings.releaseMs;
      this.setGain(this.getOpenGain());
      this.setSpeaking(true);
    } else if (this.speaking && now >= this.holdUntil) {
      this.setGain(0);
      this.setSpeaking(false);
    }

    if (this.settings.automaticSensitivity && !this.speaking && threshold > 0) {
      this.updateNoiseFloor(level);
    }

    const currentThreshold = this.getThreshold();
    this.emitMetrics(level, currentThreshold, level >= currentThreshold);
  }

  private getThreshold() {
    if (!this.settings.automaticSensitivity) {
      return clamp(this.settings.manualThreshold, 0, AUTO_THRESHOLD_MAX);
    }

    return estimateAutomaticMicThreshold(this.noiseFloor);
  }

  private updateNoiseFloor(level: number) {
    this.noiseFloor = updateAutomaticMicNoiseFloor(this.noiseFloor, level);
  }

  private getOpenGain() {
    return clamp(this.settings.inputVolume, 0, 1);
  }

  private setGain(value: number) {
    if (!this.gain) {
      return;
    }

    this.gain.gain.value = value;
  }

  private setSpeaking(speaking: boolean) {
    if (this.speaking === speaking) {
      return;
    }

    this.speaking = speaking;
    this.callbacks.onSpeakingStateChange(speaking);
  }

  private emitMetrics(level: number, threshold: number, aboveThreshold: boolean) {
    this.callbacks.onMetricsChange?.({
      level,
      threshold,
      aboveThreshold,
      speaking: this.speaking,
    });
  }

  private teardownGraph() {
    if (this.frame != null) {
      clearInterval(this.frame);
      this.frame = null;
    }

    this.source?.disconnect();
    this.analyser?.disconnect();
    this.gain?.disconnect();
    this.stereoSplitter?.disconnect();
    this.stereoMerger?.disconnect();
    this.destination?.disconnect();
    this.rnnoise?.disconnect();

    try {
      this.rnnoise?.destroy();
    } catch {
      /* ignore RNNoise cleanup failures */
    }

    this.source = null;
    this.analyser = null;
    this.gain = null;
    this.stereoSplitter = null;
    this.stereoMerger = null;
    this.destination = null;
    this.rnnoise = null;
    this.samples = null;
  }
}