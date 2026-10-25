import { describe, expect, it } from 'vitest';
import {
  easeOut, rampRate, renderCrackle, renderNoiseBurst, renderThump, soundGain,
} from '../src/domain/turntable';

const seeded = (): (() => number) => {
  let state = 42;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const peak = (data: Float32Array, from = 0, to = data.length) =>
  data.slice(from, to).reduce((max, value) => Math.max(max, Math.abs(value)), 0);

describe('rampRate', () => {
  it('eases from start to target and clamps', () => {
    expect(rampRate(0, 1, 0, 900)).toBe(0);
    expect(rampRate(0, 1, 900, 900)).toBe(1);
    expect(rampRate(0, 1, 5000, 900)).toBe(1);
    expect(rampRate(1, 0, 350, 700)).toBeLessThan(0.5);
    expect(rampRate(0, 1, 450, 900)).toBeGreaterThan(0.5);
  });

  it('easeOut is monotonic', () => {
    expect(easeOut(0.2)).toBeLessThan(easeOut(0.6));
  });
});

describe('soundGain', () => {
  it('scales with volume and keeps the lift quieter than the drop', () => {
    expect(soundGain('drop', 0)).toBe(0);
    expect(soundGain('drop', 0.5)).toBeCloseTo(soundGain('drop', 1) / 2);
    expect(soundGain('lift', 1)).toBeLessThan(soundGain('drop', 1));
    expect(soundGain('drop', 5)).toBe(soundGain('drop', 1));
  });
});

describe('synth', () => {
  const rate = 44100;

  it('burst and thump have the requested length and decay', () => {
    const burst = renderNoiseBurst(rate, 8, seeded());
    const thump = renderThump(rate, 40, 90);
    expect(burst.length).toBe(Math.round(rate * 0.008));
    expect(thump.length).toBe(Math.round(rate * 0.04));
    expect(peak(burst)).toBeLessThanOrEqual(1);
    expect(peak(burst, burst.length - 20)).toBeLessThan(0.01);
    expect(peak(thump, thump.length - 20)).toBeLessThan(0.01);
  });

  it('crackle is sparse, bounded and fades out', () => {
    const crackle = renderCrackle(rate, 1.8, seeded());
    const half = crackle.length / 2;
    expect(peak(crackle)).toBeLessThanOrEqual(1);
    expect(peak(crackle, 0, half)).toBeGreaterThan(peak(crackle, half) * 1.5);
    const loud = crackle.filter((value) => Math.abs(value) > 0.1).length;
    expect(loud).toBeGreaterThan(0);
    expect(loud).toBeLessThan(crackle.length / 200);
  });
});
