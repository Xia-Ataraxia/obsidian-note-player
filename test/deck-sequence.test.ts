import { describe, expect, it } from 'vitest';
import { deckSteps, LID_CLOSE_HOLD_MS, LID_OPEN_MS } from '../src/domain/deck-sequence';
import { SWING_MS } from '../src/domain/turntable';

const shut = { open: false, armed: false };
const at = (steps: ReturnType<typeof deckSteps>, key: 'open' | 'armed') => steps.find((s) => key in s.pose);

describe('deckSteps', () => {
  it('opens the lid first, then swings the arm, then lands', () => {
    const steps = deckSteps(true, shut, true, false);
    expect(at(steps, 'open')).toMatchObject({ atMs: 0, pose: { open: true } });
    expect(at(steps, 'armed')?.atMs).toBe(LID_OPEN_MS);
    expect(steps.find((s) => s.land)?.atMs).toBe(LID_OPEN_MS + SWING_MS);
  });

  it('skips the lid wait without a lid or when it is already open', () => {
    expect(at(deckSteps(true, shut, false, false), 'armed')?.atMs).toBe(0);
    expect(at(deckSteps(true, { open: true, armed: false }, true, false), 'armed')?.atMs).toBe(0);
  });

  it('lifts the arm first and closes the lid after it is home', () => {
    const steps = deckSteps(false, { open: true, armed: true }, true, false);
    expect(at(steps, 'armed')).toMatchObject({ atMs: 0, pose: { armed: false } });
    expect(at(steps, 'open')?.atMs).toBe(SWING_MS + LID_CLOSE_HOLD_MS);
  });

  it('reverses at once when interrupted before the arm moved', () => {
    expect(at(deckSteps(false, { open: true, armed: false }, true, false), 'open')?.atMs).toBe(0);
  });

  it('shortens, never skips, under reduced motion', () => {
    const steps = deckSteps(true, shut, true, true);
    expect(at(steps, 'armed')?.atMs).toBeGreaterThan(0);
    expect(at(steps, 'armed')?.atMs).toBeLessThan(LID_OPEN_MS);
  });
});
