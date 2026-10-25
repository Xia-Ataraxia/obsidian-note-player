import { describe, expect, it } from 'vitest';
import {
  angleDelta, ARM_END, ARM_REST, ARM_START, armAngle, grooveAngle, armPointerAngle, coastDegrees, PLAY_OMEGA, pointerAngle, ratioFromArmAngle, stepSpin, unprojectDeck,
} from '../src/domain/vinyl-physics';

const run = (omega: number, target: number, ms: number, settle: number) => {
  let spin = { omega, alpha: 0 };
  for (let t = 0; t < ms; t += 16) spin = stepSpin(spin, target, 16, settle);
  return spin;
};

describe('stepSpin', () => {
  it('starts gently, then reaches speed without overshooting', () => {
    expect(run(0, PLAY_OMEGA, 100, 900).omega).toBeLessThan(PLAY_OMEGA * 0.2);
    expect(run(0, PLAY_OMEGA, 1000, 900).omega).toBeGreaterThan(PLAY_OMEGA * 0.95);
    expect(run(0, PLAY_OMEGA, 3000, 900).omega).toBeLessThanOrEqual(PLAY_OMEGA * 1.001);
  });

  it('coasts down and stops', () => {
    expect(run(PLAY_OMEGA, 0, 300, 1400).omega).toBeGreaterThan(PLAY_OMEGA * 0.5);
    expect(run(PLAY_OMEGA, 0, 3000, 1400).omega).toBeLessThan(PLAY_OMEGA * 0.01);
  });

  it('coastDegrees matches the integrated motion', () => {
    let spin = { omega: 1, alpha: 0 };
    let travelled = 0;
    for (let t = 0; t < 4000; t += 8) {
      spin = stepSpin(spin, 0, 8, 1000);
      travelled += spin.omega * 8;
    }
    expect(Math.abs(travelled - coastDegrees(1, 0, 1000))).toBeLessThan(15);
  });
});

describe('geometry', () => {
  it('maps tonearm angle and ratio both ways', () => {
    expect(ratioFromArmAngle(armAngle(0.4))).toBeCloseTo(0.4);
    expect(ratioFromArmAngle(-30)).toBe(0);
    expect(ratioFromArmAngle(90)).toBe(1);
  });

  it('measures pointer angles', () => {
    expect(pointerAngle(0, 0, 0, -1)).toBeCloseTo(0);
    expect(pointerAngle(0, 0, 1, 0)).toBeCloseTo(90);
    expect(armPointerAngle(0, 0, 0, 1)).toBeCloseTo(0);
    expect(armPointerAngle(0, 0, -1, 1)).toBeCloseTo(45);
  });

  it('wraps angle deltas', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });
});

describe('arm geometry', () => {
  it('sweeps inward from the outer groove to the inner one, past the rest post', () => {
    expect(ARM_REST).toBeLessThan(ARM_START);
    expect(ARM_START).toBeLessThan(ARM_END);
    expect(ARM_START).toBeCloseTo(33.4, 0);
    expect(ARM_END).toBeCloseTo(47.4, 0);
    expect(grooveAngle(21)).toBeGreaterThan(ARM_START);
    expect(grooveAngle(21)).toBeLessThan(ARM_END);
  });
});

describe('unprojectDeck', () => {
  const project = (x: number, y: number, tilt: number, yaw: number) => {
    const t = (tilt * Math.PI) / 180;
    const r = (yaw * Math.PI) / 180;
    return { dx: x * Math.cos(r) - y * Math.sin(r), dy: (x * Math.sin(r) + y * Math.cos(r)) * Math.cos(t) };
  };

  it('round-trips a deck point through the camera', () => {
    const { dx, dy } = project(7, -3, 58, -22);
    const back = unprojectDeck(dx, dy, 58, -22);
    expect(back.x).toBeCloseTo(7);
    expect(back.y).toBeCloseTo(-3);
  });
});
