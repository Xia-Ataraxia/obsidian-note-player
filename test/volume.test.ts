import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOLUME, clampVolume, effectiveVolume, normalizeVolume, setLevel, stepVolume, toggleMute, volumeIcon, volumeLabel, wheelDelta,
} from '../src/domain/volume';

describe('volume', () => {
  it('clamps and rounds to whole percents', () => {
    expect(clampVolume(1.4)).toBe(1);
    expect(clampVolume(-2)).toBe(0);
    expect(clampVolume(0.456)).toBe(0.46);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME.level);
  });

  it('normalizes loaded settings', () => {
    expect(normalizeVolume(undefined, undefined)).toEqual(DEFAULT_VOLUME);
    expect(normalizeVolume(3, true)).toEqual({ level: 1, muted: true });
    expect(normalizeVolume('x', 'yes')).toEqual(DEFAULT_VOLUME);
  });

  it('mute is silent but remembers the level', () => {
    const muted = toggleMute({ level: 0.6, muted: false });
    expect(effectiveVolume(muted)).toBe(0);
    expect(muted.level).toBe(0.6);
    expect(toggleMute(muted)).toEqual({ level: 0.6, muted: false });
  });

  it('unmuting from zero restores an audible level', () => {
    expect(toggleMute({ level: 0, muted: true }).level).toBe(DEFAULT_VOLUME.level);
  });

  it('steps within bounds and unmutes when turning up', () => {
    expect(stepVolume({ level: 0.98, muted: false }, 0.05).level).toBe(1);
    expect(stepVolume({ level: 0.02, muted: false }, -0.05).level).toBe(0);
    expect(stepVolume({ level: 0.4, muted: true }, 0.05)).toEqual({ level: 0.45, muted: false });
    expect(stepVolume({ level: 0.4, muted: true }, -0.05)).toEqual({ level: 0.4, muted: true });
  });

  it('setLevel unmutes', () => {
    expect(setLevel(0.3)).toEqual({ level: 0.3, muted: false });
  });

  it('maps wheel to a bounded delta, up is louder', () => {
    expect(wheelDelta(-100, 0)).toBeCloseTo(0.05);
    expect(wheelDelta(100, 0)).toBeCloseTo(-0.05);
    expect(wheelDelta(-5000, 0)).toBe(0.1);
    expect(wheelDelta(-1, 1)).toBeCloseTo(0.0165);
  });

  it('picks the icon and label from the effective level', () => {
    expect(volumeIcon({ level: 0.9, muted: true })).toBe('volume-x');
    expect(volumeIcon({ level: 0.2, muted: false })).toBe('volume');
    expect(volumeIcon({ level: 0.5, muted: false })).toBe('volume-1');
    expect(volumeIcon({ level: 0.9, muted: false })).toBe('volume-2');
    expect(volumeLabel({ level: 0.455, muted: false })).toBe('Volume 46%');
    expect(volumeLabel({ level: 0.5, muted: true })).toBe('Muted');
  });
});
