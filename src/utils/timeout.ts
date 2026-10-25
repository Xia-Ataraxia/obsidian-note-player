/** Settles with `fallback` if `promise` hasn't resolved within `ms`; the original keeps running. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	return new Promise((resolve) => {
		const timer = window.setTimeout(() => resolve(fallback), ms);
		promise.then(resolve, () => resolve(fallback)).finally(() => window.clearTimeout(timer));
	});
}
