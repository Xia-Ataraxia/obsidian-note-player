export const KNOB_SWEEP = 270;
const KNOB_MIN_ANGLE = -KNOB_SWEEP / 2;
/** Vertical pixels for a full turn. */
export const KNOB_DRAG_PX = 160;
const DETENTS = 10;
const DETENT_PULL = 0.012;

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

export function knobAngle(level: number): number {
  return KNOB_MIN_ANGLE + clamp01(level) * KNOB_SWEEP;
}

/** Dragging up turns the knob up; levels near a notch snap onto it. */
export function dragLevel(start: number, dy: number): number {
  const level = clamp01(start - dy / KNOB_DRAG_PX);
  const notch = Math.round(level * DETENTS) / DETENTS;
  return Math.abs(level - notch) < DETENT_PULL ? notch : level;
}

/** The lamp stays lit but dims when the volume is all the way down. */
export function lampDim(level: number, muted: boolean): boolean {
  return muted || level <= 0;
}
