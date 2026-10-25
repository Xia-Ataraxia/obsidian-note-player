/** Flat 2D deck: only a record, an arm and a state cue. Mirrors the parts Turntable drives. */
import type { TurntableParts } from './turntable-parts';

export type MinimalParts = Pick<TurntableParts, 'scene' | 'warp' | 'platter' | 'grab' | 'hub'>;

export function buildMinimalParts(root: HTMLElement): MinimalParts {
  const scene = root.createDiv({ cls: 'onp-min' });
  const warp = scene.createDiv({ cls: 'onp-min-platter' });
  const platter = warp.createDiv({ cls: 'onp-min-vinyl' });
  platter.createDiv({ cls: 'onp-min-grooves' });
  platter.createDiv({ cls: 'onp-min-sheen' });
  platter.createDiv({ cls: 'onp-min-label' });
  platter.createDiv({ cls: 'onp-min-spindle' });
  const arm = scene.createDiv({ cls: 'onp-min-arm' });
  arm.createDiv({ cls: 'onp-min-base' });
  arm.createDiv({ cls: 'onp-min-weight' });
  arm.createDiv({ cls: 'onp-min-tube' });
  arm.createDiv({ cls: 'onp-min-head' });
  arm.createDiv({ cls: 'onp-min-pivot' });
  // The 3D deck's arm drag does not apply here; these stay inert.
  const grab = scene.createSvg('svg', { cls: 'onp-hidden' });
  const hub = scene.createSvg('svg', { cls: 'onp-hidden' });
  return { scene, warp, platter, grab, hub };
}
