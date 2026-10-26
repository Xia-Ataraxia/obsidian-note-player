import { setIcon } from 'obsidian';
import type { Plugin } from 'obsidian';
import { restingLabel, restingLook, statusLabel } from '../domain/status-look';
import type { StatusAction, StatusPlayback, StatusTone } from '../domain/status-look';

const COMPLETION_VISIBLE_MS = 1500;
const SWAP_MS = 140;
const FLASH_MS = 1400;

export type Tone = StatusTone;

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
	private loading = false;
	private playback: StatusPlayback = 'idle';
	private streaming = false;
	private base = { icon: 'music', text: 'Note Player', tone: 'idle' as Tone };
	private flashTimer: number | null = null;

	constructor(plugin: Plugin, onCancel: () => void, onRetry: () => void, onOpen: () => void) {
		const item = plugin.addStatusBarItem();
		this.container = item.createEl('a', { cls: 'onp-status', attr: { role: 'button', tabindex: '0' } });
		this.iconEl = this.container.createDiv({ cls: 'onp-status-icon' });
		this.msgEl = this.container.createSpan({ cls: 'onp-status-msg' });
		this.show('music', 'Note Player', 'idle');

		const activate = () => {
			if (this.isDownloading) onCancel();
			else if (this.canRetry) onRetry();
			else onOpen();
		};
		plugin.registerDomEvent(this.container, 'click', activate);
		plugin.registerDomEvent(this.container, 'keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			activate();
		});
	}

	get el(): HTMLElement {
		return this.container;
	}

	/** Momentary feedback (e.g. the volume); the underlying state returns afterwards. */
	flash(icon: string, text: string, tone: Tone = 'done'): void {
		this.clearFlashTimer();
		this.paint(icon, text, tone);
		this.flashTimer = this.container.win.setTimeout(() => {
			this.flashTimer = null;
			this.paint(this.base.icon, this.base.text, this.base.tone);
		}, FLASH_MS);
	}

	/** Shows the live-source state; progress and completion from `update` take over from it. */
	showStream(phase: 'connecting' | 'streaming' | 'failed' | 'missing' | 'idle'): void {
		this.streaming = phase === 'streaming';
		if (phase === 'idle') return this.reset();
		this.clearCompletionTimer();
		this.isDownloading = false;
		this.canRetry = phase === 'failed' || phase === 'missing';
		if (phase === 'connecting') this.show('loader', 'Connecting…', 'busy');
		else if (phase === 'streaming') this.rest();
		else if (phase === 'missing') this.show('wrench', 'yt-dlp missing', 'warn');
		else this.show('cloud-off', "Couldn't load", 'failed');
	}

	/** The resting bar names the playing track and its state; busy and failed states keep priority. */
	setNowPlaying(title: string | null, playback: StatusPlayback, loading = false): void {
		this.nowPlaying = title;
		this.loading = loading;
		this.playback = playback;
		const tone = this.base.tone;
		if (tone === 'idle' || tone === 'live' || tone === 'playing') this.rest();
	}

	private rest(): void {
		const look = restingLook(this.nowPlaying, this.playback, this.streaming);
		this.show(look.icon, look.text, look.tone, restingLabel(this.nowPlaying, this.playback, look.text, this.loading));
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
			this.completionTimer = this.container.win.setTimeout(() => this.reset(), COMPLETION_VISIBLE_MS);
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
	private show(icon: string, text: string, tone: Tone, label = text): void {
		this.base = { icon, text, tone };
		this.container.setAttr('aria-label', statusLabel(label, this.action()));
		if (this.flashTimer === null) this.paint(icon, text, tone);
	}

	private action(): StatusAction {
		if (this.isDownloading) return 'cancel';
		return this.canRetry ? 'retry' : 'open';
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
		this.swapTimer = this.container.win.setTimeout(() => {
			this.swapTimer = null;
			setIcon(this.iconEl, icon);
			this.msgEl.setText(this.pendingText);
			this.container.removeClass('is-swapping');
		}, SWAP_MS);
	}

	private clearFlashTimer(): void {
		if (this.flashTimer === null) return;
		this.container.win.clearTimeout(this.flashTimer);
		this.flashTimer = null;
	}

	private clearCompletionTimer(): void {
		if (this.completionTimer === null) return;
		this.container.win.clearTimeout(this.completionTimer);
		this.completionTimer = null;
	}

	private clearSwapTimer(): void {
		if (this.swapTimer === null) return;
		this.container.win.clearTimeout(this.swapTimer);
		this.swapTimer = null;
	}

	private reset(): void {
		this.completionTimer = null;
		this.isDownloading = false;
		this.canRetry = false;
		this.rest();
	}
}
