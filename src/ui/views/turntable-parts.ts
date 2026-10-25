/** Static DOM for the record player. Geometry is in a 100x100 box shared by every layer. */
export const PIVOT_X = 84;
export const PIVOT_Y = 13;

export interface TurntableParts {
  warp: HTMLElement;
  platter: HTMLElement;
  arm: SVGSVGElement;
  armGrab: SVGElement;
}

type Attrs = Record<string, string>;

function shape(parent: SVGElement, tag: string, cls: string, attr: Attrs): SVGElement {
  return parent.createSvg(tag as 'path', { cls, attr });
}

/** The arm is drawn twice: once as a soft shadow cast on the platter, once as metal. */
function drawArm(group: SVGElement, prefix: string): void {
  shape(group, 'rect', `${prefix} onp-arm-weight`, { x: '80.4', y: '1.2', width: '7.2', height: '6.4', rx: '1.4' });
  shape(group, 'rect', `${prefix} onp-arm-rod`, { x: '83.4', y: '7', width: '1.2', height: '7' });
  shape(group, 'path', `${prefix} onp-arm-tube`, { d: 'M83.2 13 L84.8 13 L84.45 70 L83.55 70 Z' });
  shape(group, 'path', `${prefix} onp-arm-shell`, { d: 'M82 68 L86 68 L86.8 77 L81.2 77 Z' });
  shape(group, 'path', `${prefix} onp-arm-lever`, { d: 'M86.4 71 L89.6 69.4 L89.8 70.4 L86.6 72.4 Z' });
  shape(group, 'rect', `${prefix} onp-arm-cartridge`, { x: '81.4', y: '76.4', width: '5.2', height: '5.2', rx: '0.8' });
  shape(group, 'rect', `${prefix} onp-arm-stylus`, { x: '83.75', y: '81.4', width: '0.5', height: '0.9' });
}

export function buildTurntableParts(root: HTMLElement): TurntableParts {
  const warp = root.createDiv({ cls: 'onp-warp' });
  warp.createDiv({ cls: 'onp-platter-ring' });
  const platter = warp.createDiv({ cls: 'onp-platter' });
  const vinyl = platter.createDiv({ cls: 'onp-vinyl' });
  vinyl.createDiv({ cls: 'onp-vinyl-grooves' });
  vinyl.createDiv({ cls: 'onp-vinyl-bands' });
  const label = vinyl.createDiv({ cls: 'onp-vinyl-label' });
  label.createDiv({ cls: 'onp-vinyl-label-art' });
  label.createDiv({ cls: 'onp-vinyl-label-paper' });
  label.createDiv({ cls: 'onp-vinyl-hole' });

  root.createDiv({ cls: 'onp-sheen' });

  const top = root.createSvg('svg', { cls: 'onp-deck-top', attr: { viewBox: '0 0 100 100' } });
  shape(top, 'circle', 'onp-deck-base', { cx: String(PIVOT_X), cy: String(PIVOT_Y), r: '8.6' });
  shape(top, 'circle', 'onp-deck-base-inner', { cx: String(PIVOT_X), cy: String(PIVOT_Y), r: '6.2' });
  shape(top, 'circle', 'onp-deck-rest', { cx: '93.4', cy: '66.2', r: '2.3' });
  shape(top, 'circle', 'onp-deck-knob', { cx: '9.5', cy: '90.5', r: '4' });
  shape(top, 'circle', 'onp-deck-led', { cx: '9.5', cy: '90.5', r: '1.2' });
  shape(top, 'circle', 'onp-spindle', { cx: '50', cy: '50', r: '1.7' });
  shape(top, 'circle', 'onp-spindle-glint', { cx: '49.6', cy: '49.5', r: '0.6' });

  const arm = root.createSvg('svg', { cls: 'onp-tonearm', attr: { viewBox: '0 0 100 100' } });
  drawArm(shape(arm, 'g', 'onp-arm-shadow', {}), 'onp-arm-cast');
  drawArm(shape(arm, 'g', 'onp-arm-body', {}), 'onp-arm-part');
  shape(arm, 'circle', 'onp-arm-hub', { cx: String(PIVOT_X), cy: String(PIVOT_Y), r: '4.4' });
  shape(arm, 'circle', 'onp-arm-hub-cap', { cx: String(PIVOT_X), cy: String(PIVOT_Y), r: '2.2' });
  const armGrab = shape(arm, 'path', 'onp-arm-grab', { d: `M${PIVOT_X} ${PIVOT_Y + 8} L${PIVOT_X} 82` });
  return { warp, platter, arm, armGrab };
}
