const AUTO_THRESHOLD_MULTIPLIER = 1.55;
const AUTO_THRESHOLD_OFFSET = 0.0025;
const AUTO_THRESHOLD_MIN = 0.006;
const AUTO_THRESHOLD_MAX = 0.08;
const NOISE_FLOOR_RISE_SMOOTHING = 0.05;
const NOISE_FLOOR_FALL_SMOOTHING = 0.012;

export const DEFAULT_MANUAL_MIC_THRESHOLD = 0.025;
export const DEFAULT_MIC_GATE_RELEASE_MS = 90;

export interface MicNoiseGateSettings {
  automaticSensitivity: boolean;
  manualThreshold: number;
  releaseMs: number;
}

interface MicNoiseGateCallbacks {
  onSpeakingStateChange: (speaking: boolean) => void;
}

interface MicNoiseGateInitOptions {
  track: MediaStreamTrack;
  audioContext: AudioContext;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export class MicNoiseGateProcessor {
  name = 'riftapp-mic-noise-gate';
  processedTrack?: MediaStreamTrack;

  private settings: MicNoiseGateSettings;

  private readonly callbacks: MicNoiseGateCallbacks;

  private source: MediaStreamAudioSourceNode | null = null;

  private analyser: AnalyserNode | null = null;

  private gain: GainNode | null = null;

  private destination: MediaStreamAudioDestinationNode | null = null;

  private samples: Uint8Array<ArrayBuffer> | null = null;

  private frame: ReturnType<typeof setInterval> | null = null;

  private speaking = false;

  private holdUntil = 0;

  private noiseFloor = AUTO_THRESHOLD_MIN;

  constructor(settings: MicNoiseGateSettings, callbacks: MicNoiseGateCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
  }

  updateSettings(next: Partial<MicNoiseGateSettings>) {
    this.settings = { ...this.settings, ...next };

    if (!this.settings.automaticSensitivity && this.settings.manualThreshold <= 0) {
      this.setSpeaking(true);
      this.setGain(1);
    }
  }

  async init({ track, audioContext }: MicNoiseGateInitOptions) {
    this.teardownGraph();

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

    this.source.connect(this.analyser);
    this.source.connect(this.gain);
    this.gain.connect(this.destination);

    this.processedTrack = this.destination.stream.getAudioTracks()[0] ?? track;

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
    const now = performance.now();
    const threshold = this.getThreshold();
    const shouldOpen = threshold <= 0 || level >= threshold;

    if (shouldOpen) {
      this.holdUntil = now + this.settings.releaseMs;
      this.setGain(1);
      this.setSpeaking(true);
    } else if (this.speaking && now >= this.holdUntil) {
      this.setGain(0);
      this.setSpeaking(false);
    }

    if (this.settings.automaticSensitivity && !this.speaking && threshold > 0) {
      this.updateNoiseFloor(level);
    }
  }

  private getThreshold() {
    if (!this.settings.automaticSensitivity) {
      return clamp(this.settings.manualThreshold, 0, AUTO_THRESHOLD_MAX);
    }

    return clamp(
      this.noiseFloor * AUTO_THRESHOLD_MULTIPLIER + AUTO_THRESHOLD_OFFSET,
      AUTO_THRESHOLD_MIN,
      AUTO_THRESHOLD_MAX,
    );
  }

  private updateNoiseFloor(level: number) {
    const cappedLevel = Math.min(level, Math.max(this.noiseFloor * 2.5, AUTO_THRESHOLD_MIN * 2));
    const smoothing = cappedLevel > this.noiseFloor
      ? NOISE_FLOOR_RISE_SMOOTHING
      : NOISE_FLOOR_FALL_SMOOTHING;

    this.noiseFloor = clamp(
      this.noiseFloor * (1 - smoothing) + cappedLevel * smoothing,
      AUTO_THRESHOLD_MIN * 0.5,
      AUTO_THRESHOLD_MAX,
    );
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

  private teardownGraph() {
    if (this.frame != null) {
      clearInterval(this.frame);
      this.frame = null;
    }

    this.source?.disconnect();
    this.analyser?.disconnect();
    this.gain?.disconnect();
    this.destination?.disconnect();

    this.source = null;
    this.analyser = null;
    this.gain = null;
    this.destination = null;
    this.samples = null;
  }
}