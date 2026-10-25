import type { Plugin } from 'obsidian';
import type { PlaybackState } from '../types/playback';
import { DownloadStatusBar } from './download-status-bar';
import { showNotice } from './notices';
import { PlayerSurface } from './views/PlayerSurface';

interface PlayerCallbacks {
	onEnded: () => Promise<void>;
	onStateChange: (state: PlaybackState) => void;
	currentTitle: () => string;
}

export function createPlayer(plugin: Plugin, callbacks: PlayerCallbacks) {
	const hostEl = createDiv({ cls: 'onp-player-video' });
	const surface = new PlayerSurface(hostEl, callbacks.onEnded, callbacks.onStateChange);
	const statusBar = new DownloadStatusBar(plugin, () => surface.cancelDownload());

	surface.onDownloadProgress = (percent: number, error?: string) => {
		if (percent === 0) {
			showNotice('download_started', { title: callbacks.currentTitle() });
		} else if (percent === 100) {
			showNotice('download_complete', { title: callbacks.currentTitle() });
		} else if (percent === -1) {
			showNotice('download_failed', { reason: error ?? 'Unknown error' });
		}
		statusBar.update(percent);
	};

	surface.onSaveProgress = (percent: number) => statusBar.update(percent, 'Saving');
	surface.onStreamPhase = (phase) => statusBar.showStream(phase);

	return { surface, hostEl, statusBar };
}
