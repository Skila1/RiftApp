const SAMPLE_RATE = 22_050;

type ToneSegment = {
  kind: 'tone';
  durationMs: number;
  frequency: number;
  volume?: number;
};

type SilenceSegment = {
  kind: 'silence';
  durationMs: number;
};

type SoundSegment = ToneSegment | SilenceSegment;

let notificationAudio: HTMLAudioElement | null = null;
let incomingCallAudio: HTMLAudioElement | null = null;
let outgoingCallAudio: HTMLAudioElement | null = null;

function segmentSampleCount(durationMs: number) {
  return Math.max(1, Math.round((durationMs / 1000) * SAMPLE_RATE));
}

function buildSoundDataUrl(segments: SoundSegment[]) {
  if (typeof window === 'undefined' || typeof btoa !== 'function') {
    return null;
  }

  let totalSamples = 0;
  for (const segment of segments) {
    totalSamples += segmentSampleCount(segment.durationMs);
  }

  const wavBuffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(wavBuffer);

  let offset = 0;
  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
    offset += value.length;
  };

  writeString('RIFF');
  view.setUint32(offset, 36 + totalSamples * 2, true);
  offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, SAMPLE_RATE, true);
  offset += 4;
  view.setUint32(offset, SAMPLE_RATE * 2, true);
  offset += 4;
  view.setUint16(offset, 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString('data');
  view.setUint32(offset, totalSamples * 2, true);
  offset += 4;

  let sampleOffset = offset;
  for (const segment of segments) {
    const samples = segmentSampleCount(segment.durationMs);
    const fadeSamples = Math.max(1, Math.min(Math.floor(SAMPLE_RATE * 0.01), Math.floor(samples / 4)));

    for (let index = 0; index < samples; index += 1) {
      let amplitude = 0;
      if (segment.kind === 'tone') {
        const startFade = Math.min(1, index / fadeSamples);
        const endFade = Math.min(1, (samples - index - 1) / fadeSamples);
        const envelope = Math.max(0, Math.min(startFade, endFade, 1));
        amplitude = Math.sin((2 * Math.PI * segment.frequency * index) / SAMPLE_RATE) * (segment.volume ?? 0.3) * envelope;
      }
      view.setInt16(sampleOffset, Math.max(-1, Math.min(1, amplitude)) * 0x7fff, true);
      sampleOffset += 2;
    }
  }

  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function createAudio(segments: SoundSegment[], loop = false, volume = 0.35) {
  if (typeof Audio === 'undefined') {
    return null;
  }
  const dataUrl = buildSoundDataUrl(segments);
  if (!dataUrl) {
    return null;
  }
  try {
    const audio = new Audio(dataUrl);
    audio.loop = loop;
    audio.volume = volume;
    return audio;
  } catch {
    return null;
  }
}

function getNotificationAudio() {
  if (!notificationAudio) {
    notificationAudio = createAudio([
      { kind: 'tone', durationMs: 110, frequency: 880, volume: 0.22 },
      { kind: 'silence', durationMs: 28 },
      { kind: 'tone', durationMs: 90, frequency: 1174, volume: 0.18 },
    ], false, 0.32);
  }
  return notificationAudio;
}

function getIncomingCallAudio() {
  if (!incomingCallAudio) {
    incomingCallAudio = createAudio([
      { kind: 'tone', durationMs: 220, frequency: 659, volume: 0.22 },
      { kind: 'silence', durationMs: 80 },
      { kind: 'tone', durationMs: 220, frequency: 784, volume: 0.24 },
      { kind: 'silence', durationMs: 1280 },
    ], true, 0.28);
  }
  return incomingCallAudio;
}

function getOutgoingCallAudio() {
  if (!outgoingCallAudio) {
    outgoingCallAudio = createAudio([
      { kind: 'tone', durationMs: 180, frequency: 523, volume: 0.2 },
      { kind: 'silence', durationMs: 70 },
      { kind: 'tone', durationMs: 220, frequency: 659, volume: 0.24 },
      { kind: 'silence', durationMs: 1550 },
    ], true, 0.24);
  }
  return outgoingCallAudio;
}

export function playNotificationSound() {
  const audio = getNotificationAudio();
  if (!audio) {
    return;
  }
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    return;
  }
  void audio.play().catch(() => {});
}

export function startIncomingCallSound() {
  const audio = getIncomingCallAudio();
  if (!audio) {
    return;
  }
  if (!audio.paused) {
    return;
  }
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}

export function stopIncomingCallSound() {
  if (!incomingCallAudio) {
    return;
  }
  incomingCallAudio.pause();
  try {
    incomingCallAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
}

export function startOutgoingCallSound() {
  const audio = getOutgoingCallAudio();
  if (!audio) {
    return;
  }
  if (!audio.paused) {
    return;
  }
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}

export function stopOutgoingCallSound() {
  if (!outgoingCallAudio) {
    return;
  }
  outgoingCallAudio.pause();
  try {
    outgoingCallAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
}