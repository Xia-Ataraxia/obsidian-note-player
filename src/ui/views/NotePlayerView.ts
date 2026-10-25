import {
	ItemView,
	Notice,
	WorkspaceLeaf,
} from 'obsidian';
import type {
	PlaylistSummary,
	PlaylistTrack,
	PlaylistViewHost,
	PlaylistViewState,
} from '../../types/view';
import type { VolumePort } from '../../types/volume';
import { renderVolumeControl } from './volume-control';
import { PlaylistNameModal } from './PlaylistNameModal';
import { YoutubeUrlModal } from './YoutubeUrlModal';
import { Turntable } from './Turntable';
import { TurntableSound } from './turntable-sound';
import { parseYoutubeUrl } from '../../utils/youtube';
import { PlayerSurface, type StreamPhase } from './PlayerSurface';
import { WaveformProgress } from './WaveformProgress';
import { renderHero } from './hero-panel';
import { renderQueue } from './queue-list';
import { createActionButton, createIconButton, type RunAction } from './view-parts';

export const VIEW_TYPE_NOTE_PLAYER = 'obsidian-note-player-view';
export const VIEW_TYPE_LEGACY = 'youtube-note-playlist-view';

interface ViewElements {
	root: HTMLElement;
	toolbarPanel: HTMLElement;
	heroPanel: HTMLElement;
	playerPanel: HTMLElement;
	playerVideo: HTMLElement;
	queuePanel: HTMLElement;
}

export class NotePlayerView extends ItemView {
	private readonly host: PlaylistViewHost;
	private readonly playerSurface: PlayerSurface;
	private readonly playerHostEl: HTMLElement;
	private readonly volume: VolumePort;
	private disposeVolumeControl: (() => void) | null = null;
	private unsubscribeSound: (() => void) | null = null;
	private elements: ViewElements | null = null;
	private unsubscribe: (() => void) | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private dragFromIndex: number | null = null;
	private actionInFlight = false;
	private lastRenderedTrackPath: string | null = null;
	private progressIntervalId: number | null = null;
	private subtitleEl: HTMLElement | null = null;
	private subtitleText = '';
	private wave: { videoId: string; ui: WaveformProgress } | null = null;
	private isRendering = false;
	private readonly sound = new TurntableSound(
		() => this.playerSurface.getVolume(),
		() => this.contentEl.win.matchMedia('(prefers-reduced-motion: reduce)').matches,
	);
	private readonly turntable = new Turntable(this.sound);

	constructor(
		leaf: WorkspaceLeaf,
		host: PlaylistViewHost,
		playerSurface: PlayerSurface,
		playerHostEl: HTMLElement,
		volume: VolumePort,
	) {
		super(leaf);
		this.host = host;
		this.playerSurface = playerSurface;
		this.playerHostEl = playerHostEl;
		this.volume = volume;
		this.navigation = false;
	}

	getViewType(): string {
		return VIEW_TYPE_NOTE_PLAYER;
	}

	getDisplayText(): string {
		return 'Note player';
	}

	getIcon(): string {
		return 'play-square';
	}

	onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('onp-view-root');
		root.tabIndex = -1;
		root.focus({ preventScroll: true });
		for (const gesture of ['pointerdown', 'keydown'] as const) {
			this.registerDomEvent(root, gesture, () => this.sound.unlock(root.win));
		}
		this.registerDomEvent(root, 'paste', (event) => this.handlePaste(event));
		this.playerSurface.trackLanding(true);
		this.playerSurface.onCached = (videoId) => void this.loadPeaks(videoId);
		this.registerEvent(this.app.workspace.on('css-change', () => this.wave?.ui.refreshColors()));
		this.turntable.onLanded = () => this.playerSurface.needleLanded();
		this.playerSurface.onNeedleWait = (waiting) => (waiting ? this.sound.startGroove() : this.sound.stopGroove());
		this.playerSurface.onPhaseView = (phase) => this.showPhase(phase);
		this.unsubscribeSound = this.volume.subscribe(() => this.sound.applyVolume());

		const toolbarPanel = root.createDiv({ cls: 'onp-pane-section onp-toolbar-panel' });
		const heroPanel = root.createDiv({ cls: 'onp-pane-section onp-hero-panel' });
		const playerPanel = root.createDiv({ cls: 'onp-pane-section onp-player-panel' });
		const queuePanel = root.createDiv({ cls: 'onp-pane-section onp-queue-panel' });

		this.elements = {
			root,
			toolbarPanel,
			heroPanel,
			playerPanel,
			playerVideo: this.playerHostEl,
			queuePanel,
		};
		this.registerDomEvent(playerPanel, 'wheel', (event) => {
			event.preventDefault();
			this.volume.wheel(event);
		}, { passive: false });

		this.resizeObserver = new ResizeObserver((entries) => {
			const nextWidth = entries.at(0)?.contentRect.width ?? root.clientWidth;
			this.applyResponsiveClasses(nextWidth);
		});
		this.resizeObserver.observe(root);
		this.applyResponsiveClasses(root.clientWidth);

		this.unsubscribe = this.host.subscribe(() => {
			this.render();
		});

		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.stopProgressInterval();
		this.disposeVolumeControl?.();
		this.disposeVolumeControl = null;
		this.unsubscribeSound?.();
		this.unsubscribeSound = null;
		this.disposeWave();
		this.playerSurface.onCached = null;
		this.playerSurface.onNeedleWait = null;
		this.playerSurface.onPhaseView = null;
		this.playerSurface.trackLanding(false);
		this.turntable.destroy();
		this.sound.close();
		if (this.playerHostEl.parentElement) {
			this.playerHostEl.parentElement.removeChild(this.playerHostEl);
		}
		this.elements = null;
		return Promise.resolve();
	}

	private render(): void {
		if (this.isRendering) return;

		const elements = this.elements;
		if (!elements) return;

		this.isRendering = true;
		try {
			const state = this.host.getState();
			this.renderToolbar(state);
			this.renderHero(state);
			this.renderPlayer(state);
			renderQueue(elements.queuePanel, state, {
					host: this.host,
					run: this.runAction,
					selectedPlaylist: this.getSelectedPlaylist(state),
					getDragFrom: () => this.dragFromIndex,
					setDragFrom: (index) => { this.dragFromIndex = index; },
				});
		} finally {
			this.isRendering = false;
		}
	}

	private applyResponsiveClasses(width: number): void {
		const root = this.elements?.root;
		if (!root) return;

		root.classList.toggle('is-narrow', width < 860);
		root.classList.toggle('is-compact', width < 560);
	}

	private renderToolbar(state: PlaylistViewState): void {
		const elements = this.elements;
		if (!elements) return;

		elements.toolbarPanel.empty();

		const bar = elements.toolbarPanel.createDiv({ cls: 'onp-toolbar-bar' });
		const copy = bar.createDiv({ cls: 'onp-toolbar-copy' });
		copy.createDiv({ cls: 'onp-toolbar-label', text: 'Note Player' });

		const controls = bar.createDiv({ cls: 'onp-toolbar-controls' });
		const select = controls.createEl('select', { cls: 'dropdown onp-toolbar-select' });
		select.createEl('option', { value: '', text: 'Select a playlist' });
		for (const playlist of state.playlists) {
			select.createEl('option', { value: playlist.path, text: playlist.title });
		}
		select.value = state.selectedPlaylistPath ?? '';
		select.addEventListener('change', () => {
			const value = select.value;
			void this.runAction(
				value ? `Loaded ${this.lookupPlaylistTitle(state.playlists, value)}` : 'Cleared playlist',
				() => this.host.selectPlaylist(value || null),
			);
		});

		controls.appendChild(createIconButton('Create playlist', 'plus', () => {
			this.openCreatePlaylistModal();
		}));

		if (this.host.addTrackFromUrl) {
			controls.appendChild(createIconButton('Add YouTube URL', 'link', () => {
				this.openYoutubeUrlModal();
			}));
		}

		if (this.host.selectActivePlaylist) {
			controls.appendChild(createIconButton('Load active playlist note', 'crosshair', () => {
				void this.runAction('Loaded active playlist', () => this.host.selectActivePlaylist?.() ?? Promise.resolve());
			}));
		}

		controls.appendChild(createIconButton('Refresh library', 'refresh-cw', () => {
			void this.runAction('Refreshed library', () => this.host.refresh());
		}));
	}

	private renderHero(state: PlaylistViewState): void {
		const elements = this.elements;
		if (!elements) return;
		renderHero(elements.heroPanel, state, this.getSelectedPlaylist(state), this.host, this.runAction);
	}

	private renderPlayer(state: PlaylistViewState): void {
		const elements = this.elements;
		if (!elements) return;

		// Detach player host before emptying — it holds the live YouTube iframe.
		if (this.playerHostEl.parentElement) {
			this.playerHostEl.parentElement.removeChild(this.playerHostEl);
		}

		this.disposeVolumeControl?.();
		this.disposeVolumeControl = null;
		elements.playerPanel.empty();

		const current = state.currentTrack;
		if (!current) {
			elements.playerPanel.addClass('onp-hidden');
			this.lastRenderedTrackPath = null;
			this.disposeWave();
			this.stopProgressInterval();
			this.turntable.update(null, state.playbackState, state.turntableSounds);
			// Only clear the surface when it actually has a track loaded.
			// Calling clear() unconditionally triggers onPlaybackChange('idle') -> notifyChange -> render -> infinite loop.
			if (state.playbackState !== 'idle') {
				this.playerSurface.clear();
			}
			return;
		}

		const playbackState = state.playbackState;

		elements.playerPanel.removeClass('onp-hidden');
		const playerRail = elements.playerPanel.createDiv({ cls: 'onp-now-playing-shell' });
		playerRail.prepend(this.turntable.el);
		this.turntable.update(current, playbackState, state.turntableSounds);
		const summary = playerRail.createDiv({ cls: 'onp-now-playing-summary' });
		const trackCard = summary.createDiv({ cls: 'onp-track-card onp-track-card--compact onp-track-card--no-thumb onp-player-track-card' });
		const meta = trackCard.createDiv({ cls: 'onp-track-meta' });
		meta.createDiv({ cls: 'onp-now-playing-kicker', text: 'Now playing' });
		meta.createDiv({ cls: 'onp-track-title', text: current.title });
		this.subtitleEl = meta.createDiv({ cls: 'onp-track-subtitle' });
		this.subtitleText = `${current.artist || 'Unknown artist'} • ${state.autoplayEnabled ? 'Autoplay on' : 'Autoplay off'}`;
		this.showPhase(this.playerSurface.phase);

		const controls = summary.createDiv({ cls: 'onp-control-row onp-player-controls' });
		controls.appendChild(createActionButton('Previous', 'skip-back', () => {
			void this.runAction('Moved to previous track', () => this.host.playPrevious());
		}, { iconOnly: true }));
		controls.appendChild(createActionButton(
			playbackState === 'playing' ? 'Pause current track' : 'Play current track',
			playbackState === 'playing' ? 'pause' : 'play',
			() => {
				void this.toggleCurrentPlayback(current);
			},
			{ cta: true, iconOnly: true },
		));
		controls.appendChild(createActionButton('Next', 'skip-forward', () => {
			void this.runAction('Moved to next track', () => this.host.playNext());
		}, { iconOnly: true }));
		controls.createDiv({ cls: 'onp-controls-spacer' });
		controls.appendChild(createActionButton('Open note', 'file-text', () => {
			void this.runAction('', () => this.host.openNote(current.path), false);
		}, { iconOnly: true }));
		controls.appendChild(createActionButton(
			state.autoplayEnabled ? 'Disable autoplay' : 'Enable autoplay',
			state.autoplayEnabled ? 'radio' : 'circle',
			() => {
				void this.toggleAutoplay(state.autoplayEnabled);
			},
			{ iconOnly: true, active: state.autoplayEnabled },
		));
		if (this.host.toggleRepeatMode) {
			controls.appendChild(createActionButton(
				state.repeatMode === 'one' ? 'Disable repeat' : 'Repeat one',
				'repeat-1',
				() => {
					void this.runAction(
						state.repeatMode === 'one' ? 'Repeat off' : 'Repeat one',
						() => this.host.toggleRepeatMode?.() ?? Promise.resolve(),
					);
				},
				{ iconOnly: true, active: state.repeatMode === 'one' },
			));
		}

		this.mountWave(summary, current.videoId);
		const volumeRow = summary.createDiv({ cls: 'onp-volume-row' });
		this.disposeVolumeControl = renderVolumeControl(volumeRow, this.volume);

		this.syncProgressBar();
		if (playbackState === 'playing') {
			this.startProgressInterval();
		} else {
			this.stopProgressInterval();
		}

		const videoShell = playerRail.createDiv({
			cls: 'onp-player-video-shell',
		});
		videoShell.appendChild(this.playerHostEl);
		void this.playerSurface.render(current, state.autoplayEnabled);

		this.lastRenderedTrackPath = current.path;
	}

	/** Updates the subtitle in place so the connecting state appears with no re-render. */
	private showPhase(phase: StreamPhase): void {
		const el = this.subtitleEl;
		if (!el) return;
		const connecting = phase === 'connecting';
		el.toggleClass('is-connecting', connecting);
		el.setText(connecting ? 'Connecting…' : this.subtitleText);
	}

	private getSelectedPlaylist(state: PlaylistViewState): PlaylistSummary | undefined {
		return state.playlists.find((playlist) => playlist.path === state.selectedPlaylistPath);
	}

	private lookupPlaylistTitle(playlists: PlaylistSummary[], path: string): string {
		return playlists.find((playlist) => playlist.path === path)?.title ?? 'playlist';
	}

	private startProgressInterval(): void {
		this.stopProgressInterval();
		this.progressIntervalId = window.setInterval(() => {
			this.syncProgressBar();
		}, 1000);
	}

	private stopProgressInterval(): void {
		if (this.progressIntervalId !== null) {
			window.clearInterval(this.progressIntervalId);
			this.progressIntervalId = null;
		}
	}

	private syncProgressBar(): void {
		const duration = this.playerSurface.getDuration();
		this.turntable.setProgress(duration > 0 ? Math.min(this.playerSurface.getCurrentTime() / duration, 1) : 0);
		this.wave?.ui.sync();
	}

	private mountWave(parent: HTMLElement, videoId: string): void {
		this.disposeWave();
		const ui = new WaveformProgress(parent, {
			getTime: () => this.playerSurface.getCurrentTime(),
			getDuration: () => this.playerSurface.getDuration(),
			isPlaying: () => this.host.getState().playbackState === 'playing',
			seekTo: (ratio) => this.playerSurface.seekTo(ratio),
			reducedMotion: () => this.contentEl.win.matchMedia('(prefers-reduced-motion: reduce)').matches,
		});
		this.wave = { videoId, ui };
		const known = this.host.getPeaksStore?.()?.peek(videoId);
		if (known) ui.setPeaks(known, false);
		else void this.loadPeaks(videoId);
	}

	private async loadPeaks(videoId: string): Promise<void> {
		const peaks = await this.host.getPeaksStore?.()?.ensure(videoId);
		if (peaks && this.wave?.videoId === videoId) this.wave.ui.setPeaks(peaks, true);
	}

	private disposeWave(): void {
		this.wave?.ui.destroy();
		this.wave = null;
	}

	private async toggleCurrentPlayback(current: PlaylistTrack): Promise<void> {
		const playbackState = this.host.getState().playbackState;
		if (playbackState === 'playing') {
			this.playerSurface.pause();
			return;
		}

		const handled = this.playerSurface.play();
		if (!handled) {
			await this.host.playTrack(current.path);
		}
	}

	private async toggleAutoplay(currentValue: boolean): Promise<void> {
		if (this.host.setAutoplayEnabled) {
			await this.runAction(
				currentValue ? 'Autoplay disabled' : 'Autoplay enabled',
				() => this.host.setAutoplayEnabled?.(!currentValue) ?? Promise.resolve(),
			);
			return;
		}

		if (this.host.toggleAutoplay) {
			await this.runAction(
				currentValue ? 'Autoplay disabled' : 'Autoplay enabled',
				() => this.host.toggleAutoplay?.() ?? Promise.resolve(),
			);
		}
	}

	private handlePaste(event: ClipboardEvent): void {
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
		const text = event.clipboardData?.getData('text') ?? '';
		if (!/youtu/i.test(text) || !parseYoutubeUrl(text)) return;
		event.preventDefault();
		this.addFromUrl(text);
	}

	private addFromUrl(input: string): void {
		void this.runAction('', () => this.host.addTrackFromUrl?.(input) ?? Promise.resolve(), false);
	}

	private openYoutubeUrlModal(): void {
		new YoutubeUrlModal(this.app, (input) => this.addFromUrl(input)).open();
	}

	private openCreatePlaylistModal(): void {
		new PlaylistNameModal(this.app, (name) => {
			void this.runAction(`Created ${name}`, () => this.host.createPlaylist(name));
		}).open();
	}

	private readonly runAction: RunAction = async (successMessage, action, showSuccess = true) => {
		if (this.actionInFlight) return;
		this.actionInFlight = true;

		try {
			await action();
			if (showSuccess && successMessage) {
				new Notice(successMessage, 1800);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		} finally {
			this.actionInFlight = false;
			this.render();
		}
	};
}
