import { describe, expect, it } from 'vitest';
import { isStreamUrlFresh, streamUrlExpiry, ytdlpCandidates } from '../src/domain/ytdlp';

describe('ytdlpCandidates', () => {
	it('puts PATH first and adds user and Homebrew locations without duplicates', () => {
		const list = ytdlpCandidates('/Users/a', '/opt/homebrew/bin:/bin');
		expect(list[0]).toBe('/opt/homebrew/bin/yt-dlp');
		expect(list).toContain('/Users/a/.local/bin/yt-dlp');
		expect(list.filter((p) => p === '/opt/homebrew/bin/yt-dlp')).toHaveLength(1);
	});
});

describe('stream url expiry', () => {
	const url = 'https://rr1.googlevideo.com/videoplayback?expire=2000000&id=x';
	it('parses expire seconds', () => expect(streamUrlExpiry(url)).toBe(2_000_000_000));
	it('is fresh before the margin and stale inside it', () => {
		expect(isStreamUrlFresh(url, 1_000_000_000)).toBe(true);
		expect(isStreamUrlFresh(url, 1_999_950_000)).toBe(false);
	});
	it('treats urls without expiry as fresh', () => expect(isStreamUrlFresh('https://x/y', 0)).toBe(true));
});
