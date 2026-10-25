import { setIcon } from 'obsidian';
import type { Plugin } from 'obsidian';

const COMPLETION_VISIBLE_MS = 1500;

export class DownloadStatusBar {
	private readonly iconEl: HTMLElement;
	private readonly msgEl: HTMLSpanElement;
	private isDownloading = false;
	private completionTimer: number | null = null;

	constructor(plugin: Plugin, onCancel: () => void) {
		const item = plugin.addStatusBarItem();
		const container = item.createEl('a', { cls: 'onp-status' });
		this.iconEl = container.createDiv({ cls: 'onp-status-icon' });
		this.msgEl = container.createSpan({ cls: 'onp-status-msg', text: ' Note player' });
		setIcon(this.iconEl, 'music');

		plugin.registerDomEvent(container, 'click', () => {
			if (this.isDownloading) onCancel();
		});
	}

	/** Shows the live-source state; progress and completion from `update` take over from it. */
	showStream(phase: 'connecting' | 'streaming' | 'idle'): void {
		if (phase === 'idle') return this.reset();
		this.clearCompletionTimer();
		this.isDownloading = false;
		setIcon(this.iconEl, phase === 'connecting' ? 'loader' : 'radio');
		this.msgEl.setText(phase === 'connecting' ? ' Connecting…' : ' Streaming');
	}

	update(percent: number, verb = 'Downloading'): void {
		this.clearCompletionTimer();

		if (percent >= 0 && percent < 100) {
			this.isDownloading = true;
			setIcon(this.iconEl, 'loader');
			this.msgEl.setText(` ${verb} ${Math.round(percent)}%`);
		} else if (percent === 100) {
			this.isDownloading = false;
			setIcon(this.iconEl, 'check');
			this.msgEl.setText(verb === 'Saving' ? ' Saved ✓' : ' Downloaded ✓');
			this.completionTimer = window.setTimeout(() => this.reset(), COMPLETION_VISIBLE_MS);
		} else {
			// percent === -1 (error) or cancel — Notice toast in main.ts handles messaging
			this.reset();
		}
	}

	destroy(): void {
		this.clearCompletionTimer();
	}

	private clearCompletionTimer(): void {
		if (this.completionTimer === null) return;
		window.clearTimeout(this.completionTimer);
		this.completionTimer = null;
	}

	private reset(): void {
		this.completionTimer = null;
		this.isDownloading = false;
		setIcon(this.iconEl, 'music');
		this.msgEl.setText(' Note player');
	}
}
