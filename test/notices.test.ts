import { describe, expect, it } from 'vitest';
import { SUCCESS_NOTICE_MS, noticeDuration, renderNotice } from '../src/domain/notices';

describe('renderNotice', () => {
  it('interpolates params and prefixes the plugin name', () => {
    expect(renderNotice('Added {{title}} to {{playlist}}.', { title: 'A', playlist: 'B' })).toBe('Added A to B.');
  });

  it('renders missing params as empty', () => {
    expect(renderNotice('Hi {{name}}')).toBe('Hi ');
  });

  it('gives confirmations one short duration and leaves warnings at the default', () => {
    expect(noticeDuration('track_added')).toBe(SUCCESS_NOTICE_MS);
    expect(noticeDuration('invalid_youtube_url')).toBeUndefined();
  });
});
