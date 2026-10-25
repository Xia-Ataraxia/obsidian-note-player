import type { AudioCachePort } from '../../types/view';
import type { PlaylistTrack } from '../../types/view';
import type { PlaybackState, RepeatMode } from '../../types/playback';
import { chooseSource, shouldKeepSaving } from '../../domain/playback-source';
import { FADE_IN_MS, FADE_OUT_MS, needleDelayMs, rampRate } from '../../domain/turntable';

export type { PlaybackState };

export type StreamPhase = 'connecting' | 'streaming' | 'failed' | 'idle';

const FADE_STEP_MS = 20;
const HAVE_FUTURE_DATA = 3;

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
	private pendingAudio: HTMLAudioElement | null = null;
	private landed = false;
	private landingTracked = false;
	private savingVideoId: string | null = null;
	private lastTrack: PlaylistTrack | null = null;
	private armMovedAt: number | null = null;
	private cancelReadyWait: (() => void) | null = null;
	private fadeToken = 0;
	private readonly volume = 1;

	onDownloadProgress: ((percent: number, error?: string) => void) | null = null;
	/** Background save of a streamed track; kept separate so it never raises download notices. */
	onSaveProgress: ((percent: number) => void) | null = null;
	onStreamPhase: ((phase: StreamPhase) => void) | null = null;
	/** True while the needle is down but the music is not ready yet. */
	onNeedleWait: ((waiting: boolean) => void) | null = null;

	constructor(
		host: HTMLElement,
		private readonly onEnded: () => Promise<void>,
		private readonly onPlaybackChange: (playbackState: PlaybackState) => void,
	) {
		this.host = host;
	}

	private reducedMotion(): boolean {
		return this.host.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	private emit(state: PlaybackState): void {
		if (state !== 'playing') {
			this.armMovedAt = null;
			this.landed = false;
		}
		this.onPlaybackChange(state);
	}

	/** Intent to play: the arm starts swinging now, whatever the audio source is doing. */
	private armDown(): void {
		this.armMovedAt ??= performance.now();
		this.emit('playing');
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
			this.onStreamPhase?.('failed');
			this.emit('paused');
			return;
		}

		const videoId = track.videoId;
		this.lastTrack = track;
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
		if (autoplayEnabled) {
			this.armDown();
			this.onNeedleWait?.(true);
		} else {
			this.emit('paused');
		}

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
		void this.downloadThenPlay(videoId, autoplay, ++this.downloadToken);
	}

	private async downloadThenPlay(videoId: string, autoplayEnabled: boolean, token: number): Promise<void> {
		if (!this.audioCacheService) return;
		this.onNeedleWait?.(false);
		this.emit('paused');
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
				console.debug('[note-player] playback unavailable', e);
				this.onDownloadProgress?.(-1);
				this.onStreamPhase?.('failed');
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

	/** Quiet retry for the last track that could not load. */
	retry(): void {
		if (this.lastTrack) void this.render(this.lastTrack, true);
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
		const audio = this.audioElement;
		if (!audio) return false;
		if (this.cancelPendingStart()) {
			this.emit('paused');
			return true;
		}
		if (audio.paused) return true;
		// Music fades out first; the arm lifts when the `pause` event fires.
		void this.fade(audio, 0, FADE_OUT_MS).then((done) => {
			if (!done) return;
			audio.pause();
			audio.volume = this.volume;
		});
		return true;
	}

	getVolume(): number {
		return this.volume;
	}

	/** Order: arm swings, needle lands, only then the music fades in. */
	private startAudio(audio: HTMLAudioElement): void {
		if (this.pendingAudio) return;
		if (!audio.paused) {
			void this.fade(audio, this.volume, FADE_IN_MS);
			return;
		}
		this.armDown();
		this.pendingAudio = audio;
		if (this.landed) return this.releasePending();
		// Without a turntable view to report the touchdown, fall back to the nominal swing time.
		if (this.landingTracked) return;
		this.startTimer = window.setTimeout(() => this.releasePending(), needleDelayMs(performance.now() - (this.armMovedAt ?? performance.now()), this.reducedMotion()));
	}

	/** The turntable reports touchdown; this is the only gate that lets music start. */
	needleLanded(): void {
		this.landed = true;
		this.releasePending();
	}

	trackLanding(tracked: boolean): void {
		this.landingTracked = tracked;
	}

	private releasePending(): void {
		if (this.startTimer !== null) window.clearTimeout(this.startTimer);
		this.startTimer = null;
		const audio = this.pendingAudio;
		this.pendingAudio = null;
		if (audio) this.beginPlayback(audio);
	}

	private beginPlayback(audio: HTMLAudioElement): void {
		if (audio !== this.audioElement) return;
		const go = () => {
			this.cancelReadyWait = null;
			this.onNeedleWait?.(false);
			audio.volume = 0;
			audio.play().then(() => this.fade(audio, this.volume, FADE_IN_MS)).catch(() => {
				audio.volume = this.volume; // interrupted by pause — benign
			});
		};
		if (audio.readyState >= HAVE_FUTURE_DATA) return go();
		this.onNeedleWait?.(true);
		audio.addEventListener('canplay', go, { once: true });
		this.cancelReadyWait = () => audio.removeEventListener('canplay', go);
	}

	private cancelPendingStart(): boolean {
		const waiting = this.pendingAudio !== null || this.cancelReadyWait !== null;
		this.pendingAudio = null;
		if (this.startTimer !== null) window.clearTimeout(this.startTimer);
		this.startTimer = null;
		this.cancelReadyWait?.();
		this.cancelReadyWait = null;
		this.onNeedleWait?.(false);
		return waiting;
	}

	/** Resolves true when the ramp completed, false when a newer fade took over. */
	private fade(audio: HTMLAudioElement, to: number, durationMs: number): Promise<boolean> {
		const token = ++this.fadeToken;
		const from = audio.volume;
		const startedAt = performance.now();
		return new Promise((resolve) => {
			const step = () => {
				if (token !== this.fadeToken) return resolve(false);
				const elapsed = performance.now() - startedAt;
				audio.volume = Math.min(1, Math.max(0, rampRate(from, to, elapsed, durationMs)));
				if (elapsed < durationMs) window.setTimeout(step, FADE_STEP_MS);
				else resolve(true);
			};
			step();
		});
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
		this.emit(autoplayEnabled ? 'playing' : 'paused');
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
		this.emit('idle');
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
			this.emit('paused');
			void this.onEnded();
		});
		audio.addEventListener('play', () => {
			if (this.suppressCallbacks) return;
			this.emit('playing');
		});
		audio.addEventListener('pause', () => {
			if (this.suppressCallbacks) return;
			this.emit('paused');
		});
		if (onError) audio.addEventListener('error', onError);
		this.audioElement = audio;

		if (autoplay) this.startAudio(audio);
	}
}
