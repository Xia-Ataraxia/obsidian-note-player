import type { VolumeState } from '../types/volume';

export const DEFAULT_VOLUME: VolumeState = { level: 0.8, muted: false };
export const VOLUME_STEP = 0.05;
export const VOLUME_RAMP_MS = 80;
const WHEEL_LINE_PX = 33;
const WHEEL_SENSITIVITY = 0.0005;

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME.level;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

/** What the speakers get: muted is silent, but `level` keeps the level to come back to. */
export function effectiveVolume(state: VolumeState): number {
  return state.muted ? 0 : state.level;
}

export function normalizeVolume(level: unknown, muted: unknown): VolumeState {
  return {
    level: typeof level === 'number' ? clampVolume(level) : DEFAULT_VOLUME.level,
    muted: muted === true,
  };
}

/** Any deliberate level change unmutes; dragging to zero parks the level at zero. */
export function setLevel(level: number): VolumeState {
  return { level: clampVolume(level), muted: false };
}

/** Turning up while muted resumes from the remembered level; turning down stays muted. */
export function stepVolume(state: VolumeState, delta: number): VolumeState {
  if (state.muted && delta < 0) return state;
  return setLevel(state.level + delta);
}

/** Unmuting from level 0 would stay silent, so it restores the default level instead. */
export function toggleMute(state: VolumeState): VolumeState {
  if (!state.muted) return { ...state, muted: true };
  return { level: state.level > 0 ? state.level : DEFAULT_VOLUME.level, muted: false };
}

export function wheelDelta(deltaY: number, deltaMode: number): number {
  const pixels = deltaMode === 1 ? deltaY * WHEEL_LINE_PX : deltaY;
  return Math.max(-0.1, Math.min(0.1, -pixels * WHEEL_SENSITIVITY));
}

export type VolumeIcon = 'volume-x' | 'volume' | 'volume-1' | 'volume-2';

export function volumeIcon(state: VolumeState): VolumeIcon {
  const v = effectiveVolume(state);
  if (v <= 0) return 'volume-x';
  if (v < 0.34) return 'volume';
  if (v < 0.67) return 'volume-1';
  return 'volume-2';
}

export function volumeLabel(state: VolumeState): string {
  return state.muted ? 'Muted' : `Volume ${Math.round(state.level * 100)}%`;
}
