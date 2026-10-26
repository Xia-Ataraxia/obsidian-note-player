import { describe, expect, it } from 'vitest';
import { parseStreamOutput, parseYtdlpError, parseYtdlpProgress } from '../src/domain/ytdlp';

describe('parseYtdlpProgress', () => {
  it('reads the download percentage', () => {
    expect(parseYtdlpProgress('[download]  42.5% of 3.2MiB')).toBe(42.5);
  });

  it('reads the latest percentage from a chunk of carriage-return updates', () => {
    expect(parseYtdlpProgress('[download]   2.8% of 6.7MiB\r[download]  51.6% of 6.7MiB\r')).toBe(51.6);
  });

  it('returns null for unrelated lines', () => {
    expect(parseYtdlpProgress('[ExtractAudio] Destination')).toBeNull();
  });
});

describe('parseYtdlpError', () => {
  it('maps known failures to friendly messages', () => {
    expect(parseYtdlpError('ERROR: Video unavailable')).toBe('This video is unavailable or has been removed.');
    expect(parseYtdlpError('ERROR: Private video')).toBe('This video is private.');
    expect(parseYtdlpError('ERROR: Sign in to confirm your age')).toBe('This video requires age verification.');
  });

  it('does not read "age" inside other words as age verification', () => {
    expect(parseYtdlpError('[youtube] abc: Downloading webpage')).not.toBe('This video requires age verification.');
  });

  it('falls back to the stderr tail', () => {
    expect(parseYtdlpError('boom')).toBe('boom');
    expect(parseYtdlpError('')).toBe('Unknown error.');
  });
});

describe('parseStreamOutput', () => {
  it('reads title, uploader and url in print order', () => {
    expect(parseStreamOutput('Song\nBand\nhttps://x/y?expire=1\n'))
      .toEqual({ url: 'https://x/y?expire=1', title: 'Song', author: 'Band' });
  });

  it('keeps an empty uploader and rejects output without a url', () => {
    expect(parseStreamOutput('Song\n\nhttps://x/y')?.author).toBe('');
    expect(parseStreamOutput('Song\nBand\n')).toBeNull();
  });
});
