import { describe, expect, it } from 'vitest';
import { dragLevel, KNOB_DRAG_PX, knobAngle, lampDim } from '../src/domain/knob';
import { lidOpen, strobeSharpness } from '../src/domain/turntable';

describe('knob', () => {
  it('sweeps 270 degrees', () => {
    expect(knobAngle(0)).toBe(-135);
    expect(knobAngle(1)).toBe(135);
    expect(knobAngle(2)).toBe(135);
  });

  it('drags up for louder, clamped, with a pull onto notches', () => {
    expect(dragLevel(0.5, -KNOB_DRAG_PX)).toBe(1);
    expect(dragLevel(0.5, KNOB_DRAG_PX)).toBe(0);
    expect(dragLevel(0.5, -0.3 * KNOB_DRAG_PX)).toBe(0.8);
    expect(dragLevel(0.5, -0.0256 * KNOB_DRAG_PX)).toBeCloseTo(0.5256);
    expect(dragLevel(0.5, -0.011 * KNOB_DRAG_PX)).toBe(0.5);
  });

  it('dims the lamp only when silent', () => {
    expect(lampDim(0, false)).toBe(true);
    expect(lampDim(0.5, true)).toBe(true);
    expect(lampDim(0.5, false)).toBe(false);
  });
});

describe('deck state', () => {
  it('opens the lid unless idle', () => {
    expect(lidOpen('idle')).toBe(false);
    expect(lidOpen('playing')).toBe(true);
    expect(lidOpen('paused')).toBe(true);
  });

  it('blurs the strobe as the platter reaches speed', () => {
    expect(strobeSharpness(0)).toBe(1);
    expect(strobeSharpness(1)).toBeCloseTo(0.2);
    expect(strobeSharpness(1.5)).toBeCloseTo(0.2);
  });
});
