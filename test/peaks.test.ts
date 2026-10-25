import { describe, expect, it } from 'vitest';
import {
  computePeaks, meterStep, nudgeRatio, parsePeaks, placeholderHeight, ratioAt, resamplePeaks, serializePeaks, springStep,
} from '../src/domain/peaks';

describe('computePeaks', () => {
  it('shows loudness: quiet and loud sections get clearly different heights', () => {
    const rate = 1000;
    const signal = Float32Array.from({ length: rate * 10 }, (_, i) => (i < rate * 5 ? 0.1 : 0.8) * Math.sin(i * 0.3));
    const bars = computePeaks([signal], 10);
    expect(Math.max(...bars.slice(0, 5))).toBeLessThan(Math.min(...bars.slice(5)) * 0.5);
  });

  it('does not saturate compressed loud music', () => {
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    // Hard-clipped everywhere (peak ~1.0), but verses sit ~16 dB under choruses, which have kick-like beats.
    const signal = Float32Array.from({ length: 200000 }, (_, i) => {
      const chorus = Math.floor(i / 25000) % 5 >= 3;
      const env = chorus ? (0.5 + 0.5 * Math.abs(Math.sin(i / 700))) * (0.75 + 0.25 * Math.sin(i / 3000)) : 0.15;
      return Math.max(-1, Math.min(1, 1.6 * env * (0.6 * Math.sin(i * 0.3) + 0.4 * noise())));
    });
    const bars = computePeaks([signal], 200).map((v) => v / 255);
    const median = [...bars].sort((a, b) => a - b)[100] ?? 1;
    expect(median).toBeLessThan(0.75);
    expect(bars.filter((v) => v >= 0.98).length / bars.length).toBeLessThanOrEqual(0.05);
    const loud = bars.filter((v) => v > 0.5);
    const mean = loud.reduce((a, b) => a + b, 0) / loud.length;
    expect(Math.sqrt(loud.reduce((a, b) => a + (b - mean) ** 2, 0) / loud.length)).toBeGreaterThan(0.08);
    expect(Math.max(...bars)).toBeGreaterThan(0.9);
    expect(Math.min(...bars)).toBeLessThan(0.6);
  });

  it('returns nothing for empty input and zeros for silence', () => {
    expect(computePeaks([], 4)).toEqual([]);
    expect(computePeaks([new Float32Array(8)], 4)).toEqual([0, 0, 0, 0]);
  });

  it('yields the requested count even when samples are fewer than buckets', () => {
    expect(computePeaks([Float32Array.from([1, 0.5])], 5)).toHaveLength(5);
  });
});

describe('peaks json', () => {
  it('round-trips and rejects garbage', () => {
    expect(parsePeaks(serializePeaks([0, 128, 255]))).toEqual([0, 128, 255]);
    expect(parsePeaks('nope')).toBeNull();
    expect(parsePeaks('{"v":1,"peaks":[1]}')).toBeNull();
    expect(parsePeaks('{"v":2,"peaks":[300]}')).toBeNull();
    expect(parsePeaks('{"v":2,"peaks":[]}')).toBeNull();
  });
});

describe('resamplePeaks', () => {
  it('averages down and stays within 0..1', () => {
    expect(resamplePeaks([0, 255, 51, 51], 2)).toEqual([0.5, 0.2]);
    expect(resamplePeaks([], 4)).toEqual([]);
  });
});

describe('placeholderHeight', () => {
  it('is deterministic, bounded and shimmers over time', () => {
    for (let i = 0; i < 50; i++) {
      const h = placeholderHeight(i, 1.2);
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThanOrEqual(0.5);
    }
    expect(placeholderHeight(3, 0)).toBe(placeholderHeight(3, 0));
    expect(placeholderHeight(3, 0)).not.toBe(placeholderHeight(3, 1));
  });
});

describe('springStep', () => {
  it('settles on the target', () => {
    let state: [number, number] = [0, 0];
    for (let i = 0; i < 120; i++) state = springStep(state[0], state[1], 1, 1 / 60);
    expect(state[0]).toBeCloseTo(1, 2);
    expect(Math.abs(state[1])).toBeLessThan(0.01);
  });

  it('stays finite on a very long frame', () => {
    expect(Number.isFinite(springStep(0, 0, 1, 5)[0])).toBe(true);
  });
});

describe('meterStep', () => {
  it('rises faster than it falls', () => {
    expect(meterStep(0, 1, 0.05)).toBeGreaterThan(1 - meterStep(1, 0, 0.05));
  });
});

describe('seek helpers', () => {
  it('clamps pointer ratio and nudges within the track', () => {
    expect(ratioAt(50, 0, 100)).toBe(0.5);
    expect(ratioAt(-10, 0, 100)).toBe(0);
    expect(ratioAt(10, 0, 0)).toBe(0);
    expect(nudgeRatio(2, 100, -5)).toBe(0);
    expect(nudgeRatio(98, 100, 5)).toBe(1);
    expect(nudgeRatio(50, 100, 5)).toBeCloseTo(0.55);
    expect(nudgeRatio(5, 0, 5)).toBe(0);
  });
});
