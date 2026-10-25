import type { Plugin } from 'obsidian';
import type { PlaybackState } from '../types/playback';
import { DownloadStatusBar } from './download-status-bar';
import { showNotice } from './notices';
import { PlayerSurface } from './views/PlayerSurface';
import { VolumeController, registerVolumeCommands } from './volume';
import { volumeIcon, volumeLabel } from '../domain/volume';
import type { VolumeState } from '../types/volume';

interface PlayerCallbacks {
	onEnded: () => Promise<void>;
	onStateChange: (state: PlaybackState) => void;
	volume: { level: number; muted: boolean; persist: (state: VolumeState) => void };
}

export function createPlayer(plugin: Plugin, callbacks: PlayerCallbacks) {
	const hostEl = createDiv({ cls: 'onp-player-video' });
	const surface = new PlayerSurface(hostEl, callbacks.onEnded, callbacks.onStateChange);
	const statusBar = new DownloadStatusBar(plugin, () => surface.cancelDownload(), () => surface.retry());

	surface.onDownloadProgress = (percent: number) => statusBar.update(percent);

	surface.onSaveProgress = (percent: number) => statusBar.update(percent, 'Saving');
	surface.onStreamPhase = (phase) => statusBar.showStream(phase);
	surface.onNeedSetup = () => showNotice('ytdlp_unavailable');

	const volume = new VolumeController(callbacks.volume.level, callbacks.volume.muted, {
		apply: (level) => surface.setVolume(level),
		persist: callbacks.volume.persist,
		feedback: (state) => statusBar.flash(volumeIcon(state), volumeLabel(state), state.muted ? 'idle' : 'done'),
	});
	registerVolumeCommands(plugin, volume);
	plugin.registerDomEvent(statusBar.el, 'wheel', (event) => {
		event.preventDefault();
		volume.wheel(event);
	}, { passive: false });

	return { surface, hostEl, statusBar, volume };
}
