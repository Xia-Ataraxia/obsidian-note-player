import { shape } from './turntable-svg';

let serial = 0;

/**
 * Walnut top: one long-streak noise bent by a slow warp for cathedral figure, two
 * flood layers (dark and light) masked by the grain, plus fine pores. Colours come from CSS.
 */
export function buildWood(parent: HTMLElement): SVGSVGElement {
  const id = `onp-wood-${serial++}`;
  const svg = parent.createSvg('svg', { cls: 'onp-wood', attr: { viewBox: '0 0 100 80', preserveAspectRatio: 'none' } });
  const filter = shape(svg.createSvg('defs'), 'filter', [], {
    id, x: '0', y: '0', width: '100', height: '80', filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB',
  });
  const prim = (tag: string, attr: Record<string, string>, cls: string[] = []) => shape(filter, tag, cls, attr);
  const noise = (frequency: string, octaves: string, seed: string, result: string) =>
    prim('feTurbulence', { type: 'fractalNoise', baseFrequency: frequency, numOctaves: octaves, seed, result });
  const mask = (input: string, channel: 'R' | 'G', gain: string, bias: string, result: string) => {
    const row = (c: string) => (c === channel ? gain : '0');
    prim('feColorMatrix', {
      in: input, type: 'matrix', result,
      values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${row('R')} ${row('G')} 0 0 ${bias}`,
    });
  };
  const paint = (cls: string, input: string, result: string) => {
    prim('feFlood', { result: `${result}-c` }, [cls]);
    prim('feComposite', { in: `${result}-c`, in2: input, operator: 'in', result });
  };

  noise('0.011 0.5', '4', '11', 'grain');
  noise('0.018 0.045', '2', '4', 'bend');
  prim('feDisplacementMap', { in: 'grain', in2: 'bend', scale: '9', xChannelSelector: 'R', yChannelSelector: 'G', result: 'wavy' });
  mask('wavy', 'R', '4.2', '-1.75', 'dark-mask');
  mask('wavy', 'G', '3.6', '-1.55', 'light-mask');
  paint('onp-wood-flood-dark', 'dark-mask', 'dark');
  paint('onp-wood-flood-light', 'light-mask', 'light');
  noise('0.07 2.2', '2', '23', 'pore-noise');
  mask('pore-noise', 'R', '2.4', '-1.05', 'pore-mask');
  paint('onp-wood-flood-dark', 'pore-mask', 'pores');
  const merge = prim('feMerge', {});
  for (const layerName of ['SourceGraphic', 'light', 'dark', 'pores']) shape(merge, 'feMergeNode', [], { in: layerName });

  shape(svg, 'rect', 'onp-wood-base', { width: '100', height: '80', filter: `url(#${id})` });
  return svg;
}
