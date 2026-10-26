type WinWithObserver = Window & { ResizeObserver: typeof ResizeObserver };

/** Elements are built in the main document and move into a popout later, so the observer follows the window that owns the element. */
export function observeResize(el: HTMLElement, onResize: (rect: DOMRectReadOnly) => void): () => void {
	let observer: ResizeObserver | null = null;
	const attach = (win: Window): void => {
		observer?.disconnect();
		observer = new (win as WinWithObserver).ResizeObserver((entries) => {
			const rect = entries.at(0)?.contentRect;
			if (rect) onResize(rect);
		});
		observer.observe(el);
	};
	attach(el.win);
	const off = el.onWindowMigrated(attach);
	return () => {
		off();
		observer?.disconnect();
	};
}
