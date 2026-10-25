import { setIcon } from 'obsidian';
import type { Plugin } from 'obsidian';

const COMPLETION_VISIBLE_MS = 1500;
const SWAP_MS = 140;

type Tone = 'idle' | 'busy' | 'live' | 'done' | 'failed';

export class DownloadStatusBar {
	private readonly container: HTMLElement;
	private readonly iconEl: HTMLElement;
	private readonly msgEl: HTMLSpanElement;
	private isDownloading = false;
	private canRetry = false;
	private completionTimer: number | null = null;
	private swapTimer: number | null = null;
	private pendingText = '';

	constructor(plugin: Plugin, onCancel: () => void, onRetry: () => void) {
		const item = plugin.addStatusBarItem();
		this.container = item.createEl('a', { cls: 'onp-status' });
		this.iconEl = this.container.createDiv({ cls: 'onp-status-icon' });
		this.msgEl = this.container.createSpan({ cls: 'onp-status-msg' });
		this.show('music', 'Note player', 'idle');

		plugin.registerDomEvent(this.container, 'click', () => {
			if (this.isDownloading) onCancel();
			else if (this.canRetry) onRetry();
		});
	}

	/** Shows the live-source state; progress and completion from `update` take over from it. */
	showStream(phase: 'connecting' | 'streaming' | 'failed' | 'idle'): void {
		if (phase === 'idle') return this.reset();
		this.clearCompletionTimer();
		this.isDownloading = false;
		this.canRetry = phase === 'failed';
		if (phase === 'connecting') this.show('loader', 'Connecting…', 'busy');
		else if (phase === 'streaming') this.show('radio', 'Streaming', 'live');
		else this.show('cloud-off', 'Unavailable · click to retry', 'failed');
	}

	update(percent: number, verb = 'Downloading'): void {
		this.clearCompletionTimer();

		if (percent >= 0 && percent < 100) {
			this.isDownloading = true;
			this.canRetry = false;
			this.show('loader', `${verb} ${Math.round(percent)}%`, 'busy');
		} else if (percent === 100) {
			this.isDownloading = false;
			this.canRetry = false;
			this.show('check', verb === 'Saving' ? 'Saved' : 'Downloaded', 'done');
			this.completionTimer = window.setTimeout(() => this.reset(), COMPLETION_VISIBLE_MS);
		} else if (!this.canRetry) {
			this.reset();
		}
	}

	destroy(): void {
		this.clearCompletionTimer();
		this.clearSwapTimer();
	}

	/** Fades the text out and back in on a change; plain updates (progress ticks) skip the fade. */
	private show(icon: string, text: string, tone: Tone): void {
		const changed = this.container.dataset.tone !== tone || this.container.dataset.icon !== icon;
		this.container.dataset.tone = tone;
		this.container.dataset.icon = icon;
		this.pendingText = text;
		if (!changed) {
			if (this.swapTimer === null) this.msgEl.setText(text);
			return;
		}
		this.clearSwapTimer();
		this.container.addClass('is-swapping');
		this.swapTimer = window.setTimeout(() => {
			this.swapTimer = null;
			setIcon(this.iconEl, icon);
			this.msgEl.setText(this.pendingText);
			this.container.removeClass('is-swapping');
		}, SWAP_MS);
	}

	private clearCompletionTimer(): void {
		if (this.completionTimer === null) return;
		window.clearTimeout(this.completionTimer);
		this.completionTimer = null;
	}

	private clearSwapTimer(): void {
		if (this.swapTimer === null) return;
		window.clearTimeout(this.swapTimer);
		this.swapTimer = null;
	}

	private reset(): void {
		this.completionTimer = null;
		this.isDownloading = false;
		this.canRetry = false;
		this.show('music', 'Note player', 'idle');
	}
}
