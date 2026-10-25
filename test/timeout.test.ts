import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../src/utils/timeout';

describe('withTimeout', () => {
	let fire: () => void = () => undefined;
	const clearTimeout = vi.fn();

	beforeEach(() => {
		vi.stubGlobal('window', {
			setTimeout: (fn: () => void) => { fire = fn; return 1; },
			clearTimeout,
		});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		clearTimeout.mockClear();
	});

	it('resolves with the value when it arrives in time and clears the timer', async () => {
		await expect(withTimeout(Promise.resolve('ok'), 5000, 'fallback')).resolves.toBe('ok');
		expect(clearTimeout).toHaveBeenCalledWith(1);
	});

	it('falls back on rejection', async () => {
		await expect(withTimeout(Promise.reject(new Error('offline')), 5000, 'fallback')).resolves.toBe('fallback');
	});

	it('falls back when the promise hangs past the limit', async () => {
		const result = withTimeout(new Promise<string>(() => undefined), 5000, 'fallback');
		fire();
		await expect(result).resolves.toBe('fallback');
	});
});
