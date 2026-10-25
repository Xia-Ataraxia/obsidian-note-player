/** Static DOM for the record player. Every layer shares the plinth's 100 x 80 box (see DECK). */
import { DECK } from '../../domain/vinyl-physics';
import { buildArm, restPost, type ArmParts } from './turntable-arm';
import { layer, shape } from './turntable-svg';
import { buildWood } from './turntable-wood';

export interface TurntableParts extends ArmParts {
  scene: HTMLElement;
  warp: HTMLElement;
  platter: HTMLElement;
  lamp: SVGElement;
}

const DUST_MOTES = 7;

function hardware(deck: HTMLElement): SVGElement {
  const svg = layer(deck, 'onp-deck-top');
  const { pivot, centre } = DECK;
  const at = (n: number) => String(n);
  shape(svg, 'circle', 'onp-deck-well', { cx: at(centre.x), cy: at(centre.y), r: '33.4' });
  shape(svg, 'rect', 'onp-base', { x: at(pivot.x - 6.4), y: at(pivot.y - 6.4), width: '12.8', height: '12.8', rx: '3.4' });
  shape(svg, 'circle', 'onp-base-ring', { cx: at(pivot.x), cy: at(pivot.y), r: '5.2' });
  const rest = restPost();
  shape(svg, 'circle', 'onp-rest-ring', { cx: at(rest.x), cy: at(rest.y), r: '2.3' });
  shape(svg, 'circle', 'onp-rest-pin', { cx: at(rest.x), cy: at(rest.y), r: '0.9' });
  for (const x of [14, 62]) {
    shape(svg, 'rect', 'onp-hinge', { x: at(x), y: '0.7', width: '8', height: '3.2', rx: '0.7' });
    shape(svg, 'circle', 'onp-screw', { cx: at(x + 1.6), cy: '2.3', r: '0.45' });
    shape(svg, 'circle', 'onp-screw', { cx: at(x + 6.4), cy: '2.3', r: '0.45' });
  }
  for (const [x, label, on] of [[9, '33', true], [17, '45', false]] as const) {
    shape(svg, 'circle', ['onp-speed', on ? 'is-on' : 'is-off'], { cx: at(x), cy: '72.6', r: '2.3' });
    shape(svg, 'text', 'onp-speed-label', { x: at(x), y: '77.6', 'text-anchor': 'middle' }).setText(label);
  }
  return shape(svg, 'circle', 'onp-lamp', { cx: '8', cy: '65.5', r: '1.15' });
}

function platterStack(scene: HTMLElement): { warp: HTMLElement; platter: HTMLElement } {
  const warp = scene.createDiv({ cls: 'onp-warp' });
  warp.createDiv({ cls: 'onp-platter-ring' });
  const platter = warp.createDiv({ cls: 'onp-platter' });
  platter.createDiv({ cls: 'onp-strobe' });
  const vinyl = platter.createDiv({ cls: 'onp-vinyl' });
  vinyl.createDiv({ cls: 'onp-vinyl-grooves' });
  vinyl.createDiv({ cls: 'onp-vinyl-bands' });
  vinyl.createDiv({ cls: 'onp-vinyl-wear' });
  const label = vinyl.createDiv({ cls: 'onp-vinyl-label' });
  label.createDiv({ cls: 'onp-vinyl-label-art' });
  label.createDiv({ cls: 'onp-vinyl-label-paper' });
  label.createDiv({ cls: 'onp-vinyl-hole' });
  return { warp, platter };
}

function lid(scene: HTMLElement): void {
  const el = scene.createDiv({ cls: 'onp-lid' });
  el.createDiv({ cls: 'onp-lid-scratch' });
  el.createDiv({ cls: 'onp-lid-streak' });
  el.createDiv({ cls: 'onp-lid-edge' });
  for (const side of ['is-left', 'is-right']) el.createDiv({ cls: ['onp-lid-hinge', side] });
}

export function buildTurntableParts(root: HTMLElement): TurntableParts {
  root.createDiv({ cls: 'onp-glow' });
  const dust = root.createDiv({ cls: 'onp-dust' });
  for (let i = 1; i <= DUST_MOTES; i++) dust.createSpan({ cls: 'onp-mote' }).setCssProps({ '--i': String(i) });

  const scene = root.createDiv({ cls: 'onp-scene' });
  scene.createDiv({ cls: 'onp-contact' });
  scene.createDiv({ cls: 'onp-front' });
  const deck = scene.createDiv({ cls: 'onp-deck' });
  buildWood(deck);
  deck.createDiv({ cls: 'onp-deck-gloss' });
  const lamp = hardware(deck);

  const { warp, platter } = platterStack(scene);
  scene.createDiv({ cls: 'onp-sheen' });
  const spindle = layer(scene, 'onp-spindle-layer');
  shape(spindle, 'circle', 'onp-spindle', { cx: String(DECK.centre.x), cy: String(DECK.centre.y), r: '1.5' });
  shape(spindle, 'circle', 'onp-spindle-glint', { cx: String(DECK.centre.x - 0.4), cy: String(DECK.centre.y - 0.5), r: '0.5' });

  const arm = buildArm(scene);
  lid(scene);
  return { scene, warp, platter, lamp, ...arm };
}
