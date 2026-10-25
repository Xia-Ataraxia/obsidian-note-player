import type { Plugin } from 'obsidian';
import type { PlaybackState } from '../types/playback';
import { DownloadStatusBar } from './download-status-bar';
import { PlayerSurface } from './views/PlayerSurface';

interface PlayerCallbacks {
	onEnded: () => Promise<void>;
	onStateChange: (state: PlaybackState) => void;
}

export function createPlayer(plugin: Plugin, callbacks: PlayerCallbacks) {
	const hostEl = createDiv({ cls: 'onp-player-video' });
	const surface = new PlayerSurface(hostEl, callbacks.onEnded, callbacks.onStateChange);
	const statusBar = new DownloadStatusBar(plugin, () => surface.cancelDownload(), () => surface.retry());

	surface.onDownloadProgress = (percent: number) => statusBar.update(percent);

	surface.onSaveProgress = (percent: number) => statusBar.update(percent, 'Saving');
	surface.onStreamPhase = (phase) => statusBar.showStream(phase);

	return { surface, hostEl, statusBar };
}
