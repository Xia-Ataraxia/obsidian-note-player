/** Returns the pending promise for `key`, starting `start` only if none is pending. */
export function shareInFlight<T>(pending: Map<string, Promise<T>>, key: string, start: () => Promise<T>): Promise<T> {
	const existing = pending.get(key);
	if (existing) return existing;
	const promise: Promise<T> = start().finally(() => { if (pending.get(key) === promise) pending.delete(key); });
	pending.set(key, promise);
	return promise;
}
