import { ARM_REST, DECK } from '../../domain/vinyl-physics';
import { layer, shape } from './turntable-svg';

const { x: PX, y: PY } = DECK.pivot;
const SHELL_X = 85.3;
const SHELL_Y = 64.8;
const SHELL_TURN = -21;

/** Rear stub and counterweight, straight tube, bakelite headshell: drawn twice, once as the cast shadow. */
function drawArm(group: SVGElement, prefix: string): void {
  const part = (tag: string, cls: string, attr: Record<string, string>, parent: SVGElement = group) =>
    shape(parent, tag, [prefix, cls], attr);
  part('rect', 'onp-arm-rod', { x: String(PX - 0.6), y: String(PY - 8), width: '1.2', height: '9' });
  part('rect', 'onp-arm-weight', { x: String(PX - 3.4), y: '2.2', width: '6.8', height: '6.4', rx: '1.3' });
  for (const y of [3.6, 7.2]) part('rect', 'onp-arm-ring', { x: String(PX - 3.4), y: String(y), width: '6.8', height: '0.35' });
  part('path', 'onp-arm-tube', { d: `M${PX} ${PY} L${SHELL_X} ${SHELL_Y}` });
  part('path', 'onp-arm-glint', { d: `M${PX - 0.3} ${PY + 3} L${SHELL_X - 0.3} ${SHELL_Y - 2}` });
  const shell = shape(group, 'g', [], { transform: `translate(${SHELL_X} ${SHELL_Y}) rotate(${SHELL_TURN})` });
  part('rect', 'onp-arm-shell', { x: '-2', y: '0', width: '4', height: '5.2', rx: '0.9' }, shell);
  part('path', 'onp-arm-lift', { d: 'M1.8 2.2 L4.9 3.6 L4.7 4.3 L1.8 3.3 Z' }, shell);
  part('rect', 'onp-arm-cartridge', { x: '-1.8', y: '4.6', width: '3.6', height: '2.6', rx: '0.5' }, shell);
  part('rect', 'onp-arm-stylus', { x: '-0.25', y: '7.2', width: '0.5', height: '0.9' }, shell);
}

export interface ArmParts {
  rig: HTMLElement;
  arm: SVGSVGElement;
  grab: SVGElement;
  hub: SVGElement;
}

export function buildArm(scene: HTMLElement): ArmParts {
  const rig = scene.createDiv({ cls: 'onp-arm-rig' });
  drawArm(shape(layer(rig, 'onp-arm-cast-layer'), 'g', 'onp-arm-shadow'), 'onp-arm-cast');
  const arm = layer(rig, 'onp-tonearm');
  drawArm(shape(arm, 'g', 'onp-arm-body'), 'onp-arm-part');
  const hub = shape(arm, 'circle', 'onp-arm-hub', { cx: String(PX), cy: String(PY), r: '3.7' });
  shape(arm, 'circle', 'onp-arm-hub-cap', { cx: String(PX), cy: String(PY), r: '1.7' });
  const grab = shape(arm, 'path', 'onp-arm-grab', { d: `M${PX} ${PY + 9} L${PX} 66` });
  return { rig, arm, grab, hub };
}

/** Where the stylus sits when the arm is parked; the rest post goes under it. */
export function restPost(): { x: number; y: number } {
  const rad = (ARM_REST * Math.PI) / 180;
  return { x: PX - DECK.armLength * Math.sin(rad), y: PY + DECK.armLength * Math.cos(rad) };
}
