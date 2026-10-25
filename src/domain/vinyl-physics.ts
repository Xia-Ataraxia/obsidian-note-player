/** 33⅓ rpm: one revolution every 1800 ms. */
export const REV_MS = 1800;
/** Degrees per millisecond at playing speed. */
export const PLAY_OMEGA = 360 / REV_MS;
export const SCRUB_SECONDS_PER_REV = 10;
/** Deck geometry in plinth units (100 wide, 80 deep); the SVG layers and CSS share it. */
export const DECK = {
  pivot: { x: 88, y: 16 },
  centre: { x: 40, y: 42 },
  /** Pivot to stylus tip. */
  armLength: 56.5,
  grooveOuter: 27,
  grooveInner: 13.8,
  armRest: 10,
};

/** Tonearm angle (CSS clockwise degrees, 0 pointing down) at which the stylus sits on a groove radius. */
export function grooveAngle(radius: number): number {
  const { pivot, centre, armLength } = DECK;
  const dx = centre.x - pivot.x;
  const dy = centre.y - pivot.y;
  const dist = Math.hypot(dx, dy);
  const bearing = (Math.atan2(-dx, dy) * 180) / Math.PI;
  const cos = (armLength ** 2 + dist ** 2 - radius ** 2) / (2 * armLength * dist);
  return bearing - (Math.acos(cos) * 180) / Math.PI;
}

/** Tonearm angle when parked, on the outer groove and on the inner groove. */
export const ARM_REST = DECK.armRest;
export const ARM_START = grooveAngle(DECK.grooveOuter);
export const ARM_END = grooveAngle(DECK.grooveInner);

export interface Spin {
  /** Degrees per millisecond. */
  omega: number;
  /** Rate of change of omega; keeps starts and stops smooth. */
  alpha: number;
}

const SUBSTEP_MS = 8;

/**
 * Critically damped flywheel: omega chases `target` without overshoot and with zero
 * initial acceleration, so the platter eases in and coasts out instead of snapping.
 * `settleMs` is roughly how long it takes to get within a couple of percent.
 */
export function stepSpin(spin: Spin, target: number, dtMs: number, settleMs: number): Spin {
  const wn = 5.8 / (settleMs / 1000);
  let { omega, alpha } = spin;
  for (let left = dtMs; left > 0; left -= SUBSTEP_MS) {
    const h = Math.min(left, SUBSTEP_MS) / 1000;
    alpha += (wn * wn * (target - omega) - 2 * wn * alpha) * h;
    omega += alpha * h;
  }
  return { omega, alpha };
}

/** Total extra rotation a released platter travels while coasting back to `target`. */
export function coastDegrees(omega: number, target: number, settleMs: number): number {
  const wn = 5.8 / (settleMs / 1000);
  return ((omega - target) * 2) / wn * 1000;
}

export function armAngle(ratio: number): number {
  return ARM_START + Math.min(Math.max(ratio, 0), 1) * (ARM_END - ARM_START);
}

export function ratioFromArmAngle(deg: number): number {
  return Math.min(Math.max((deg - ARM_START) / (ARM_END - ARM_START), 0), 1);
}

/** Clockwise degrees of (x, y) around (cx, cy), 0 pointing up. */
export function pointerAngle(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
}

/** Tonearm angle for a pointer, measured from the pivot with 0 pointing down. */
export function armPointerAngle(px: number, py: number, x: number, y: number): number {
  return (Math.atan2(px - x, y - py) * 180) / Math.PI;
}

/** Smallest signed difference between two angles. */
export function angleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function scrubSeconds(deg: number): number {
  return (deg / 360) * SCRUB_SECONDS_PER_REV;
}

/** Screen-space offset back onto the deck plane, inverting rotateX(tilt) rotateZ(yaw). */
export function unprojectDeck(dx: number, dy: number, tiltDeg: number, yawDeg: number): { x: number; y: number } {
  const py = dy / Math.cos((tiltDeg * Math.PI) / 180);
  const r = (yawDeg * Math.PI) / 180;
  return { x: dx * Math.cos(r) + py * Math.sin(r), y: -dx * Math.sin(r) + py * Math.cos(r) };
}
