import { describe, it, expect } from 'vitest';
import { dedupe, sanitizeFileName, uniqueName } from '../src/utils/dedupe';

describe('dedupe', () => {
	it('removes duplicate values', () => {
		expect(dedupe(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
	});

	it('preserves insertion order', () => {
		expect(dedupe(['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
	});

	it('returns empty array for empty input', () => {
		expect(dedupe([])).toEqual([]);
	});

	it('returns single element unchanged', () => {
		expect(dedupe(['only'])).toEqual(['only']);
	});

	it('handles all duplicates', () => {
		expect(dedupe(['x', 'x', 'x'])).toEqual(['x']);
	});
});

describe('sanitizeFileName', () => {
	it('returns trimmed input unchanged when valid', () => {
		expect(sanitizeFileName('My Playlist')).toBe('My Playlist');
	});

	it('replaces forbidden characters with spaces', () => {
		expect(sanitizeFileName('a\\b/c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
	});

	it('replaces characters that break wikilinks', () => {
		expect(sanitizeFileName('Song #1 ^live')).toBe('Song 1 live');
	});

	it('collapses multiple spaces', () => {
		expect(sanitizeFileName('hello   world')).toBe('hello world');
	});

	it('returns default name for empty input', () => {
		expect(sanitizeFileName('')).toBe('New Playlist');
	});

	it('returns default name for whitespace-only input', () => {
		expect(sanitizeFileName('   ')).toBe('New Playlist');
	});

	it('trims leading and trailing whitespace', () => {
		expect(sanitizeFileName('  My Playlist  ')).toBe('My Playlist');
	});
});

describe('uniqueName', () => {
  it('keeps a free name and numbers a taken one from 2', () => {
    expect(uniqueName('Song', () => false)).toBe('Song');
    expect(uniqueName('Song', (name) => ['Song', 'Song 2'].includes(name))).toBe('Song 3');
  });
});
