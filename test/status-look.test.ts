import { describe, expect, it } from 'vitest';
import { clipTitle, restingLook, statusLabel } from '../src/domain/status-look';

describe('restingLook', () => {
  it('shows the accent state while playing and a pause icon when paused', () => {
    expect(restingLook('Song', 'playing', false)).toEqual({ icon: 'audio-lines', text: 'Song', tone: 'playing' });
    expect(restingLook('Song', 'paused', false)).toEqual({ icon: 'pause', text: 'Song', tone: 'idle' });
  });

  it('falls back to the plugin name when idle', () => {
    expect(restingLook(null, 'idle', false)).toEqual({ icon: 'music', text: 'Note Player', tone: 'idle' });
  });

  it('keeps the live radio look only while a stream is actually playing', () => {
    expect(restingLook('Song', 'playing', true).tone).toBe('live');
    expect(restingLook(null, 'playing', true).text).toBe('Streaming');
    expect(restingLook('Song', 'paused', true).icon).toBe('pause');
  });
});

describe('clipTitle', () => {
  it('clips long titles with an ellipsis and leaves short ones alone', () => {
    expect(clipTitle('short')).toBe('short');
    expect(clipTitle('x'.repeat(40))).toHaveLength(28);
    expect(clipTitle('x'.repeat(40)).endsWith('…')).toBe(true);
  });
});

describe('statusLabel', () => {
  it('always names the click action', () => {
    expect(statusLabel('Note Player', 'open')).toBe('Note Player · click to open');
    expect(statusLabel('Downloading 40%', 'cancel')).toContain('cancel');
  });
});
