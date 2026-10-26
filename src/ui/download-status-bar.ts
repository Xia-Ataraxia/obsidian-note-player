import { setIcon } from 'obsidian';
import type { Plugin } from 'obsidian';

const COMPLETION_VISIBLE_MS = 1500;
const SWAP_MS = 140;
const FLASH_MS = 1400;
const TITLE_MAX = 28;

export type Tone = 'idle' | 'busy' | 'live' | 'done' | 'warn' | 'failed';

export class DownloadStatusBar {
	private readonly container: HTMLElement;
	private readonly iconEl: HTMLElement;
	private readonly msgEl: HTMLSpanElement;
	private isDownloading = false;
	private canRetry = false;
	private completionTimer: number | null = null;
	private swapTimer: number | null = null;
	private pendingText = '';
	private nowPlaying: string | null = null;
	private base = { icon: 'music', text: 'Note Player', tone: 'idle' as Tone };
	private flashTimer: number | null = null;

	constructor(plugin: Plugin, onCancel: () => void, onRetry: () => void) {
		const item = plugin.addStatusBarItem();
		this.container = item.createEl('a', { cls: 'onp-status' });
		this.iconEl = this.container.createDiv({ cls: 'onp-status-icon' });
		this.msgEl = this.container.createSpan({ cls: 'onp-status-msg' });
		this.show('music', 'Note Player', 'idle');

		plugin.registerDomEvent(this.container, 'click', () => {
			if (this.isDownloading) onCancel();
			else if (this.canRetry) onRetry();
		});
	}

	get el(): HTMLElement {
		return this.container;
	}

	/** Momentary feedback (e.g. the volume); the underlying state returns afterwards. */
	flash(icon: string, text: string, tone: Tone = 'done'): void {
		this.clearFlashTimer();
		this.paint(icon, text, tone);
		this.flashTimer = window.setTimeout(() => {
			this.flashTimer = null;
			this.paint(this.base.icon, this.base.text, this.base.tone);
		}, FLASH_MS);
	}

	/** Shows the live-source state; progress and completion from `update` take over from it. */
	showStream(phase: 'connecting' | 'streaming' | 'failed' | 'missing' | 'idle'): void {
		if (phase === 'idle') return this.reset();
		this.clearCompletionTimer();
		this.isDownloading = false;
		this.canRetry = phase === 'failed' || phase === 'missing';
		if (phase === 'connecting') this.show('loader', 'Connecting…', 'busy');
		else if (phase === 'streaming') this.show('radio', this.nowPlayingText() ?? 'Streaming', 'live');
		else if (phase === 'missing') this.show('wrench', 'yt-dlp missing', 'warn');
		else this.show('cloud-off', "Couldn't load", 'failed');
		if (this.canRetry) this.container.setAttr('aria-label', phase === 'missing' ? 'yt-dlp not found · click for setup' : "Couldn't load · click to retry");
	}

	/** The resting bar names the playing track; busy and failed states keep priority. */
	setNowPlaying(title: string | null): void {
		this.nowPlaying = title;
		const tone = this.base.tone;
		if (tone === 'idle') this.reset();
		else if (tone === 'live') this.show('radio', this.nowPlayingText() ?? 'Streaming', 'live');
	}

	private nowPlayingText(): string | null {
		const title = this.nowPlaying;
		if (!title) return null;
		return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…` : title;
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
		this.clearFlashTimer();
		this.clearCompletionTimer();
		this.clearSwapTimer();
	}

	/** Fades the text out and back in on a change; plain updates (progress ticks) skip the fade. */
	private show(icon: string, text: string, tone: Tone): void {
		this.base = { icon, text, tone };
		this.container.removeAttribute('aria-label');
		if (this.flashTimer === null) this.paint(icon, text, tone);
	}

	private paint(icon: string, text: string, tone: Tone): void {
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

	private clearFlashTimer(): void {
		if (this.flashTimer === null) return;
		window.clearTimeout(this.flashTimer);
		this.flashTimer = null;
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
		const title = this.nowPlayingText();
		if (title) this.show('audio-lines', title, 'idle');
		else this.show('music', 'Note Player', 'idle');
	}
}
