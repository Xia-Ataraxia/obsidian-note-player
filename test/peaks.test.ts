import { describe, expect, it } from 'vitest';
import {
  computePeaks, meterStep, nudgeRatio, parsePeaks, placeholderHeight, ratioAt, resamplePeaks, serializePeaks, springStep,
} from '../src/domain/peaks';

describe('computePeaks', () => {
  it('takes the loudest sample per bucket across channels, normalised to 255', () => {
    const left = Float32Array.from([0.1, -0.2, 0.0, 0.0]);
    const right = Float32Array.from([0.0, 0.0, 0.0, -0.4]);
    expect(computePeaks([left, right], 2)).toEqual([128, 255]);
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
    expect(parsePeaks('{"peaks":[300]}')).toBeNull();
    expect(parsePeaks('{"peaks":[]}')).toBeNull();
  });
});

describe('resamplePeaks', () => {
  it('max-pools down and stays within 0..1', () => {
    expect(resamplePeaks([0, 255, 51, 0], 2)).toEqual([1, 0.2]);
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
