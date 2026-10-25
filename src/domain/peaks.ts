export const PEAK_COUNT = 1000;

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

/** Bar height = loudness, not peak: mastered music peaks near 0 dBFS everywhere, so peaks flatten into a block. */
const NORMALISE_PERCENTILE = 0.95;
/** >1 expands the range so quiet sections stay visibly lower than loud ones. */
const DYNAMICS_CURVE = 2;
const FORMAT_VERSION = 2;

/** Per-bucket RMS across channels, normalised by the 95th percentile and curved, stored as 0..255. */
export function computePeaks(channels: ArrayLike<number>[], count = PEAK_COUNT): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0) return [];
  const rms = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * length) / count);
    const to = Math.min(length, Math.max(from + 1, Math.floor(((i + 1) * length) / count)));
    let sum = 0;
    for (const channel of channels) {
      for (let j = from; j < to; j++) sum += (channel[j] ?? 0) ** 2;
    }
    rms[i] = Math.sqrt(sum / ((to - from) * channels.length));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const reference = sorted[Math.min(count - 1, Math.floor(count * NORMALISE_PERCENTILE))] ?? 0;
  if (reference === 0) return rms.map(() => 0);
  return rms.map((v) => Math.round(clamp01(v / reference) ** DYNAMICS_CURVE * 255));
}

export function serializePeaks(peaks: number[]): string {
  return JSON.stringify({ v: FORMAT_VERSION, peaks });
}

export function parsePeaks(json: string): number[] | null {
  try {
    const data: unknown = JSON.parse(json);
    const { v, peaks } = (data ?? {}) as { v?: unknown; peaks?: unknown };
    if (v !== FORMAT_VERSION) return null; // older peak-based caches re-decode from the local audio
    if (!Array.isArray(peaks) || peaks.length === 0) return null;
    return peaks.every((v) => typeof v === 'number' && v >= 0 && v <= 255) ? (peaks as number[]) : null;
  } catch {
    return null;
  }
}

/** Averages stored levels into `bars` heights in 0..1 (averaging keeps dips visible; max-pooling hides them). */
export function resamplePeaks(peaks: number[], bars: number): number[] {
  if (peaks.length === 0 || bars <= 0) return [];
  return Array.from({ length: bars }, (_, i) => {
    const from = Math.floor((i * peaks.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let sum = 0;
    for (let j = from; j < to; j++) sum += peaks[j] ?? 0;
    return sum / (to - from) / 255;
  });
}

/** Soft pseudo-waveform shown before real peaks exist; `t` seconds drives the shimmer. */
export function placeholderHeight(index: number, t: number): number {
  const base = 0.28 + 0.22 * Math.abs(Math.sin(index * 0.37) * Math.cos(index * 0.11 + 1.3));
  const shimmer = 0.5 + 0.5 * Math.sin(t * 2.2 - index * 0.12);
  return base * (0.7 + 0.3 * shimmer);
}

/** Critically-tuned spring; substepped so a long frame cannot blow it up. */
export function springStep(
  pos: number, vel: number, target: number, dt: number, stiffness = 150, damping = 15,
): [number, number] {
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    vel += (stiffness * (target - pos) - damping * vel) * h;
    pos += vel * h;
  }
  return [pos, vel];
}

/** Fast attack, slow release, like a console level meter. */
export function meterStep(prev: number, target: number, dt: number): number {
  const rate = target > prev ? 40 : 5;
  return prev + (target - prev) * (1 - Math.exp(-rate * dt));
}

export function ratioAt(x: number, left: number, width: number): number {
  return width > 0 ? clamp01((x - left) / width) : 0;
}

/** Ratio after moving `deltaSeconds` from `time`, clamped to the track. */
export function nudgeRatio(time: number, duration: number, deltaSeconds: number): number {
  return duration > 0 ? clamp01((time + deltaSeconds) / duration) : 0;
}
