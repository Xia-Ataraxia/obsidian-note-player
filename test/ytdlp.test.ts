import { describe, expect, it } from 'vitest';
import { parseYtdlpError, parseYtdlpProgress } from '../src/domain/ytdlp';

describe('parseYtdlpProgress', () => {
  it('reads the download percentage', () => {
    expect(parseYtdlpProgress('[download]  42.5% of 3.2MiB')).toBe(42.5);
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
