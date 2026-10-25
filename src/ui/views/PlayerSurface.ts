import type { AudioCachePort } from '../../types/view';
import type { PlaylistTrack } from '../../types/view';
import type { PlaybackState, RepeatMode } from '../../types/playback';
import { chooseSource, shouldKeepSaving } from '../../domain/playback-source';
import { AUDIO_START_MS } from '../../domain/turntable';

export type { PlaybackState };

export type StreamPhase = 'connecting' | 'streaming' | 'idle';

export function formatTime(seconds: number): string {
	const s = Math.floor(seconds);
	const mins = Math.floor(s / 60);
	const secs = s % 60;
	return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export class PlayerSurface {
	private currentVideoId: string | null = null;
	private currentAutoplay = false;
	private host: HTMLElement;
	private audioElement: HTMLAudioElement | null = null;
	private audioCacheService: AudioCachePort | null = null;
	private suppressCallbacks = false;
	private isDownloading = false;
	private downloadToken = 0;
	private downloadCancelled = false;
	private repeatMode: RepeatMode = 'none';
	private startTimer: number | null = null;
	private savingVideoId: string | null = null;

	onDownloadProgress: ((percent: number, error?: string) => void) | null = null;
	/** Background save of a streamed track; kept separate so it never raises download notices. */
	onSaveProgress: ((percent: number) => void) | null = null;
	onStreamPhase: ((phase: StreamPhase) => void) | null = null;

	constructor(
		host: HTMLElement,
		private readonly onEnded: () => Promise<void>,
		private readonly onPlaybackChange: (playbackState: PlaybackState) => void,
	) {
		this.host = host;
	}

	setAudioCacheService(service: AudioCachePort): void {
		this.audioCacheService = service;
	}

	setRepeatMode(mode: RepeatMode): void {
		this.repeatMode = mode;
	}

	async render(track: PlaylistTrack, autoplayEnabled: boolean): Promise<void> {
		if (this.currentVideoId === track.videoId && (this.audioElement || this.isDownloading)) return;

		// Cancel any in-flight download for a different track and invalidate its callbacks
		if (this.currentVideoId && this.currentVideoId !== track.videoId) {
			this.downloadToken++; // immediately invalidate stale callbacks
			this.releasePrevious(this.currentVideoId);
		}

		this.silentPauseAudio();
		this.audioElement = null;
		this.onStreamPhase?.('idle');

		if (!this.audioCacheService) {
			this.renderUnavailable();
			return;
		}

		const videoId = track.videoId;
		const token = ++this.downloadToken;

		if (await this.audioCacheService.hasCached(videoId)) {
			if (token !== this.downloadToken) return;
			this.mountAudio(this.audioCacheService.getFileUrl(videoId), autoplayEnabled);
			this.activateTrack(videoId, autoplayEnabled);
			return;
		}

		this.currentVideoId = videoId;
		this.currentAutoplay = autoplayEnabled;
		this.isDownloading = true;
		this.onPlaybackChange('paused');

		const streamUrl = await this.resolveStream(videoId);
		if (token !== this.downloadToken) return;
		if (chooseSource(false, streamUrl) === 'stream' && streamUrl) {
			this.isDownloading = false;
			this.startStream(videoId, streamUrl, autoplayEnabled);
			return;
		}
		await this.downloadThenPlay(videoId, autoplayEnabled, token);
	}

	private async resolveStream(videoId: string): Promise<string | null> {
		const service = this.audioCacheService;
		if (typeof service?.resolveStreamUrl !== 'function') return null;
		this.onStreamPhase?.('connecting');
		try {
			return await service.resolveStreamUrl(videoId);
		} catch (e) {
			console.debug('[note-player] stream unavailable, downloading instead', e);
			this.onStreamPhase?.('idle');
			return null;
		}
	}

	private startStream(videoId: string, url: string, autoplay: boolean): void {
		this.mountAudio(url, autoplay, () => this.streamFailed(videoId, autoplay));
		this.activateTrack(videoId, autoplay);
		this.onStreamPhase?.('streaming');
		this.saveInBackground(videoId);
	}

	/** Never swaps the source mid-song; the cached file is used from the next play. */
	private saveInBackground(videoId: string): void {
		const service = this.audioCacheService;
		if (!service) return;
		this.savingVideoId = videoId;
		service.download(videoId, (percent) => {
			if (this.savingVideoId === videoId) this.onSaveProgress?.(percent);
		}).then(() => {
			if (this.savingVideoId === videoId) this.onSaveProgress?.(100);
		}).catch((e: unknown) => {
			console.debug('[note-player] background save failed', e);
			if (this.savingVideoId === videoId) this.onSaveProgress?.(-1);
		}).finally(() => {
			if (this.savingVideoId === videoId) this.savingVideoId = null;
		});
	}

	/** Leaving a track: stop its foreground download, or its background save if it was skipped early. */
	private releasePrevious(videoId: string): void {
		const skipped = this.savingVideoId === videoId && !shouldKeepSaving(this.getCurrentTime());
		if (this.isDownloading || skipped) {
			this.audioCacheService?.cancel(videoId);
			if (skipped) {
				this.savingVideoId = null;
				this.onSaveProgress?.(-1);
			}
		}
	}

	/** A stream that dies before producing sound falls back to the download path. */
	private streamFailed(videoId: string, autoplay: boolean): void {
		if (this.currentVideoId !== videoId || this.getCurrentTime() > 0) return;
		console.debug('[note-player] stream failed, falling back to download');
		this.silentPauseAudio();
		this.audioElement = null;
		this.savingVideoId = null;
		this.onStreamPhase?.('idle');
		this.isDownloading = true;
		this.onPlaybackChange('paused');
		void this.downloadThenPlay(videoId, autoplay, ++this.downloadToken);
	}

	private async downloadThenPlay(videoId: string, autoplayEnabled: boolean, token: number): Promise<void> {
		if (!this.audioCacheService) return;
		this.onDownloadProgress?.(0);

		try {
			await this.audioCacheService.download(videoId, (percent) => {
				if (token !== this.downloadToken) return;
				this.onDownloadProgress?.(percent);
			});
			if (token !== this.downloadToken) return;
			this.onDownloadProgress?.(100);
			this.mountAudio(this.audioCacheService.getFileUrl(videoId), autoplayEnabled);
			this.activateTrack(videoId, autoplayEnabled);
		} catch (e) {
			if (token !== this.downloadToken) return;
			if (!this.downloadCancelled) {
				const reason = e instanceof Error ? e.message : String(e);
				this.onDownloadProgress?.(-1, reason);
				this.renderUnavailable();
			} else {
				this.currentVideoId = null;
			}
		} finally {
			if (token === this.downloadToken) {
				this.isDownloading = false;
				this.downloadCancelled = false;
			}
		}
	}

	cancelDownload(): void {
		if (this.savingVideoId) {
			this.audioCacheService?.cancel(this.savingVideoId);
			this.savingVideoId = null;
			this.onSaveProgress?.(-1);
		} else if (this.currentVideoId) {
			this.downloadCancelled = true;
			this.onDownloadProgress?.(-1);
			this.audioCacheService?.cancel(this.currentVideoId);
		}
	}

	play(): boolean {
		if (!this.audioElement) return false;
		this.startAudio(this.audioElement);
		return true;
	}

	pause(): boolean {
		if (!this.audioElement) return false;
		if (this.cancelPendingStart()) this.onPlaybackChange('paused');
		this.audioElement.pause();
		return true;
	}

	getVolume(): number {
		return this.audioElement?.volume ?? 1;
	}

	/** Lets the tonearm land before the music starts. */
	private startAudio(audio: HTMLAudioElement): void {
		if (this.startTimer !== null) return;
		this.startTimer = window.setTimeout(() => {
			this.startTimer = null;
			void audio.play().catch(() => { /* interrupted by pause — benign */ });
		}, AUDIO_START_MS);
	}

	private cancelPendingStart(): boolean {
		if (this.startTimer === null) return false;
		window.clearTimeout(this.startTimer);
		this.startTimer = null;
		return true;
	}

	getCurrentTime(): number {
		return this.audioElement?.currentTime ?? 0;
	}

	getDuration(): number {
		return this.audioElement?.duration || 0;
	}

	private activateTrack(videoId: string, autoplayEnabled: boolean): void {
		this.currentVideoId = videoId;
		this.currentAutoplay = autoplayEnabled;
		this.onPlaybackChange(autoplayEnabled ? 'playing' : 'paused');
	}

	seekTo(ratio: number): void {
		if (!this.audioElement) return;
		const duration = this.audioElement.duration || 0;
		if (duration > 0) this.audioElement.currentTime = ratio * duration;
	}

	clear(): void {
		this.currentVideoId = null;
		this.currentAutoplay = false;
		this.silentPauseAudio();
		this.audioElement = null;
		// Notify idle AFTER all teardown is complete so any synchronous
		// re-render triggered by the subscriber sees a fully clean surface.
		this.onPlaybackChange('idle');
	}

	destroy(): void {
		this.downloadToken++;
		this.savingVideoId = null;
		this.silentPauseAudio();
		this.audioElement = null;
	}

	/** Pause the audio element without triggering playback-change notifications.
	 *  The `pause` event fires synchronously from HTMLAudioElement.pause(),
	 *  which would cause re-entrant render cycles through onPlaybackChange. */
	private silentPauseAudio(): void {
		this.cancelPendingStart();
		if (!this.audioElement) return;
		this.suppressCallbacks = true;
		try {
			this.audioElement.pause();
		} finally {
			this.suppressCallbacks = false;
		}
	}

	private mountAudio(url: string, autoplay: boolean, onError?: () => void): void {
		this.silentPauseAudio();
		this.audioElement?.remove();

		const audio = new Audio(url);
		audio.addEventListener('ended', () => {
			if (this.suppressCallbacks) return;
			if (this.repeatMode === 'one') {
				audio.currentTime = 0;
				void audio.play();
				return;
			}
			this.onPlaybackChange('paused');
			void this.onEnded();
		});
		audio.addEventListener('play', () => {
			if (this.suppressCallbacks) return;
			this.onPlaybackChange('playing');
		});
		audio.addEventListener('pause', () => {
			if (this.suppressCallbacks) return;
			this.onPlaybackChange('paused');
		});
		if (onError) audio.addEventListener('error', onError);
		this.audioElement = audio;

		if (autoplay) this.startAudio(audio);
	}

	private renderUnavailable(): void {
		this.host.empty();
		const notice = this.host.createDiv({ cls: 'onp-player-unavailable' });
		notice.textContent = 'Playback unavailable — install yt-dlp for audio playback.';
		this.onPlaybackChange('paused');
	}
}
