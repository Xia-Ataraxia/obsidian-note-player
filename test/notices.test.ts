import { describe, expect, it } from 'vitest';
import { renderNotice } from '../src/domain/notices';

describe('renderNotice', () => {
  it('interpolates params and prefixes the plugin name', () => {
    expect(renderNotice('Added {{title}} to {{playlist}}.', { title: 'A', playlist: 'B' })).toBe('Added A to B.');
  });

  it('renders missing params as empty', () => {
    expect(renderNotice('Hi {{name}}')).toBe('Hi ');
  });
});
