import { describe, expect, it } from 'vitest';
import { retryUntil } from '../src/utils/retry';

describe('retryUntil', () => {
  it('retries once after a null, pausing between tries', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retryUntil(async () => (++calls === 2 ? 'ok' : null), 2, 400, async (ms) => { waits.push(ms); });
    expect(result).toBe('ok');
    expect(waits).toEqual([400]);
  });

  it('gives up after the last try and skips the pause when the first succeeds', async () => {
    const waits: number[] = [];
    expect(await retryUntil(async () => null, 2, 400, async (ms) => { waits.push(ms); })).toBeNull();
    expect(waits).toEqual([400]);
    expect(await retryUntil(async () => 1, 2, 400, async (ms) => { waits.push(ms); })).toBe(1);
    expect(waits).toEqual([400]);
  });
});
