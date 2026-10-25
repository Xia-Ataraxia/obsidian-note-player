export const PEAK_COUNT = 2000;

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

/** Bar height = loudness, not peak: mastered music peaks near 0 dBFS everywhere, so peaks flatten into a block. */
const REFERENCE_PERCENTILE = 0.995;
/** Reference sits above the loudest buckets so loud sections stay below the ceiling. */
const HEADROOM_DB = 1.5;
/** The quietest 30% of buckets anchor the bottom of the scale, so a uniformly loud track still spreads out. */
const FLOOR_PERCENTILE = 0.3;
const MIN_RANGE_DB = 10;
const MAX_RANGE_DB = 36;
/** >1 gently pushes mid levels down so loud sections keep texture. */
const EASE = 1.6;
/** Height fraction at the anchor level; the loud range uses the rest. */
const KNEE = 0.3;
const FORMAT_VERSION = 8;

/** Short RMS windows inside a bucket; beats and kicks survive as the bucket's upper percentile. */
const SUB_WINDOW = 441;
const TRANSIENT_PERCENTILE = 0.9;
const TRANSIENT_BLEND = 0.5;

function windowRms(channels: ArrayLike<number>[], from: number, to: number): number {
  let sum = 0;
  for (const channel of channels) {
    for (let j = from; j < to; j++) sum += (channel[j] ?? 0) ** 2;
  }
  return Math.sqrt(sum / ((to - from) * channels.length));
}

/** Blend of the bucket's mean RMS and its p90 short-window RMS, so loud sections keep beat texture. */
function bucketLevel(channels: ArrayLike<number>[], from: number, to: number): number {
  const mean = windowRms(channels, from, to);
  if (to - from < SUB_WINDOW * 2) return mean;
  const subs: number[] = [];
  for (let j = from; j < to; j += SUB_WINDOW) subs.push(windowRms(channels, j, Math.min(to, j + SUB_WINDOW)));
  subs.sort((a, b) => a - b);
  const peak = subs[Math.min(subs.length - 1, Math.floor(subs.length * TRANSIENT_PERCENTILE))] ?? mean;
  return mean * (1 - TRANSIENT_BLEND) + peak * TRANSIENT_BLEND;
}

/** Per-bucket RMS across channels, mapped in dB below a near-max reference and eased, stored as 0..255. */
export function computePeaks(channels: ArrayLike<number>[], count = PEAK_COUNT): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0) return [];
  const rms = Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * length) / count);
    const to = Math.min(length, Math.max(from + 1, Math.floor(((i + 1) * length) / count)));
    return bucketLevel(channels, from, to);
  });
  const sorted = [...rms].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(count - 1, Math.floor(count * q))] ?? 0;
  const reference = at(REFERENCE_PERCENTILE) * 10 ** (HEADROOM_DB / 20);
  if (reference === 0) return rms.map(() => 0);
  const floorDb = 20 * Math.log10(Math.max(at(FLOOR_PERCENTILE), 1e-9) / reference);
  const range = Math.min(MAX_RANGE_DB, Math.max(MIN_RANGE_DB, -floorDb));
  return rms.map((v) => {
    const db = v > 0 ? 20 * Math.log10(v / reference) : -Infinity;
    if (db >= -range) return Math.round(clamp01(KNEE + (1 - KNEE) * (1 + db / range) ** EASE) * 255);
    // Below the anchor, quieter passages keep falling so verses stay distinct from silence.
    return Math.round(KNEE * clamp01(1 + (db + range) / (MAX_RANGE_DB - range + 12)) * 255);
  });
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
