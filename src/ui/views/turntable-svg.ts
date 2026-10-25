export type Attrs = Record<string, string>;

export function shape(parent: Element, tag: string, cls: string | string[], attr: Attrs = {}): SVGElement {
  return parent.createSvg(tag as 'path', { cls, attr });
}

/** SVG layers share the deck's 100 x 80 box. */
export function layer(parent: Element, cls: string): SVGSVGElement {
  return parent.createSvg('svg', { cls, attr: { viewBox: '0 0 100 80' } });
}
