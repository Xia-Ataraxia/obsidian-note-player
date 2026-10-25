export const SWING_MS = 600;
export const AUDIO_START_MS = 650;
export const SPIN_UP_MS = 900;
export const SPIN_DOWN_MS = 700;
export const CRACKLE_SECONDS = 1.8;

export type SoundKind = 'drop' | 'lift';
export type Rng = () => number;

const KIND_LEVEL: Record<SoundKind, number> = { drop: 0.9, lift: 0.3 };

export function easeOut(progress: number): number {
  const p = Math.min(Math.max(progress, 0), 1);
  return 1 - (1 - p) ** 3;
}

export function rampRate(from: number, to: number, elapsedMs: number, durationMs: number): number {
  return from + (to - from) * easeOut(elapsedMs / durationMs);
}

export function soundGain(kind: SoundKind, volume: number): number {
  return KIND_LEVEL[kind] * Math.min(Math.max(volume, 0), 1);
}

/** White noise with an exponential decay that reaches about -60 dB at the end. */
export function renderNoiseBurst(sampleRate: number, durationMs: number, rng: Rng): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = (rng() * 2 - 1) * Math.exp((-6.9 * i) / length);
  }
  return out;
}

export function renderThump(sampleRate: number, durationMs: number, hz: number): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate) * Math.exp((-6.9 * i) / length);
  }
  return out;
}

/** Sparse random pops over a faint hiss; the whole bed fades out quadratically. */
export function renderCrackle(sampleRate: number, seconds: number, rng: Rng): Float32Array<ArrayBuffer> {
  const length = Math.round(sampleRate * seconds);
  const out = new Float32Array(length);
  const popsPerSecond = 40;
  for (let i = 0; i < length; i++) {
    const fade = (1 - i / length) ** 2;
    const hiss = (rng() * 2 - 1) * 0.02;
    const pop = rng() < popsPerSecond / sampleRate ? (rng() * 2 - 1) * 0.8 : 0;
    out[i] = (hiss + pop) * fade;
  }
  return out;
}
