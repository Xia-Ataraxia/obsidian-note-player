import { describe, expect, it } from 'vitest';
import { chooseSource, shouldKeepSaving } from '../src/domain/playback-source';
import { shareInFlight } from '../src/utils/in-flight';

describe('chooseSource', () => {
	it('prefers the cache, then a stream, then download', () => {
		expect(chooseSource(true, 'https://x')).toBe('cached');
		expect(chooseSource(false, 'https://x')).toBe('stream');
		expect(chooseSource(false, null)).toBe('download');
	});
});

describe('shouldKeepSaving', () => {
	it('drops the save when the track was skipped early', () => {
		expect(shouldKeepSaving(2)).toBe(false);
		expect(shouldKeepSaving(10)).toBe(true);
	});
});

describe('shareInFlight', () => {
	it('starts one job per key and clears it when settled', async () => {
		const pending = new Map<string, Promise<number>>();
		let starts = 0;
		const start = () => { starts++; return Promise.resolve(starts); };
		const [a, b] = [shareInFlight(pending, 'id', start), shareInFlight(pending, 'id', start)];
		expect(a).toBe(b);
		await a;
		expect(starts).toBe(1);
		expect(pending.size).toBe(0);
		await shareInFlight(pending, 'id', start);
		expect(starts).toBe(2);
	});

	it('clears the key after rejection', async () => {
		const pending = new Map<string, Promise<void>>();
		await expect(shareInFlight(pending, 'id', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
		expect(pending.size).toBe(0);
	});
});
