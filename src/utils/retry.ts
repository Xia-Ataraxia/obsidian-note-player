/** Runs `attempt` up to `tries` times, pausing `delayMs` between tries, and returns the first non-null result. */
export async function retryUntil<T>(
	attempt: () => Promise<T | null>,
	tries: number,
	delayMs: number,
	sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
): Promise<T | null> {
	for (let index = 0; index < tries; index++) {
		if (index > 0) await sleep(delayMs);
		const result = await attempt();
		if (result !== null) return result;
	}
	return null;
}
