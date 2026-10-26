import { spawn, type ChildProcess } from 'child_process';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { FLAT_PLAYLIST_PRINT } from '../domain/track-import';
import { isStreamUrlFresh, parseStreamOutput, parseYtdlpError, parseYtdlpProgress, STREAM_PRINT_ARGS, ytdlpCandidates } from '../domain/ytdlp';
import type { AudioCachePort, VaultAdapter } from '../types/view';
import type { AudioFormat } from '../types/audio';
import { shareInFlight } from '../utils/in-flight';

/** yt-dlp retries unreachable hosts for minutes; first play must not wait on that. */
const STREAM_RESOLVE_TIMEOUT_MS = 6_000;

export class AudioCacheService implements AudioCachePort {
	private cacheDir: string;        // vault-relative
	readonly format: AudioFormat;
	private ytdlpPath: string;
	private activeDownloads = new Map<string, ChildProcess>();
	private downloadPromises = new Map<string, Promise<string>>();
	private progressListeners = new Map<string, Set<(percent: number) => void>>();
	private streamPromises = new Map<string, Promise<string>>();
	private streamUrls = new Map<string, string>();
	private streamMeta = new Map<string, { title: string; author: string }>();
	/** Fires when a stream resolve returns the video's title and uploader. */
	onMeta: ((videoId: string) => void) | null = null;
	/** Fires when a stream resolve starts or ends, so views can swap loading for loaded or failed. */
	onResolveChange: (() => void) | null = null;
	private resolvers = new Set<ChildProcess>();
	private adapter: VaultAdapter;
	private absBase: string;

	private probing: Promise<boolean> | null = null;

	constructor(vaultBasePath: string, adapter: VaultAdapter, format: AudioFormat, pluginDir: string, ytdlpPath?: string) {
		this.adapter = adapter;
		this.format = format;
		this.ytdlpPath = ytdlpPath ?? '';
		this.absBase = vaultBasePath;
		this.cacheDir = `${pluginDir}/audio-cache`;
		if (!this.ytdlpPath) void this.checkAvailable();
	}

	/** One spawn per candidate in priority order; ENOENT means not installed there. yt-dlp creates the cache folder itself. */
	private static probe(path: string): Promise<boolean> {
		return new Promise((resolve) => {
			const proc = spawn(path, ['--version']);
			proc.once('error', () => resolve(false));
			proc.once('spawn', () => { proc.kill('SIGTERM'); resolve(true); });
		});
	}

	private async locateYtdlp(): Promise<string> {
		for (const candidate of ytdlpCandidates(homedir(), process.env.PATH ?? '')) {
			if (await AudioCacheService.probe(candidate)) return candidate;
		}
		return '';
	}

	/** Cached once found; a miss is re-probed on the next call so a fresh install is picked up. */
	checkAvailable(): Promise<boolean> {
		if (this.ytdlpPath) return Promise.resolve(true);
		this.probing ??= this.locateYtdlp().then((path) => {
			this.ytdlpPath = path;
			this.probing = null;
			return path !== '';
		});
		return this.probing;
	}

	async hasCached(videoId: string): Promise<boolean> {
		return this.adapter.exists(this.vaultRelativePath(videoId));
	}

	getFileUrl(videoId: string): string {
		return this.adapter.getResourcePath(this.vaultRelativePath(videoId));
	}

	private vaultRelativePath(videoId: string): string {
		return `${this.cacheDir}/${videoId}.${this.format}`;
	}

	private absolutePath(videoId: string): string {
		return join(this.absBase, this.vaultRelativePath(videoId));
	}

	download(videoId: string, onProgress: (percent: number) => void): Promise<string> {
		const output = this.absolutePath(videoId);
		const listeners = this.progressListeners.get(videoId) ?? new Set();
		listeners.add(onProgress);
		this.progressListeners.set(videoId, listeners);
		return shareInFlight(this.downloadPromises, videoId, async () => {
			if (await this.adapter.exists(this.vaultRelativePath(videoId))) return output;
			await this.cleanIntermediate(videoId);
			return this.runDownload(videoId, output);
		});
	}

	private runDownload(videoId: string, output: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let stderrOutput = '';
			const proc = spawn(this.ytdlpPath, [
				'-x', '--audio-format', this.format, '--audio-quality', '0',
				'--no-playlist',
				// Defaults retry an unreachable network for minutes; these fail in ~15s so retry is offered.
				'--socket-timeout', '5', '--retries', '2', '--extractor-retries', '0',
				'-o', join(this.absBase, this.cacheDir, `${videoId}.%(ext)s`),
				`https://www.youtube.com/watch?v=${videoId}`,
			], { env: this.spawnEnv() });

			this.activeDownloads.set(videoId, proc);

			// yt-dlp prints `[download] NN%` to stdout; stderr carries warnings and errors.
			const onOutput = (data: Buffer) => {
				const chunk = data.toString();
				stderrOutput += chunk;
				const percent = parseYtdlpProgress(chunk);
				if (percent !== null) this.progressListeners.get(videoId)?.forEach((notify) => notify(percent));
			};
			proc.stdout.on('data', onOutput);
			proc.stderr.on('data', onOutput);

			proc.on('close', (code) => {
				this.forget(videoId, proc);
				if (code !== 0) {
					reject(new Error(parseYtdlpError(stderrOutput)));
					return;
				}
				void this.adapter.exists(this.vaultRelativePath(videoId)).then(async (found) => {
					if (!found) throw new Error(parseYtdlpError(stderrOutput));
					await this.cleanIntermediate(videoId);
					resolve(output);
				}).catch(reject);
			});

			proc.on('error', (err) => {
				this.forget(videoId, proc);
				reject(err);
			});
		});
	}

	/** Ignores late events from a cancelled process so they cannot clear a newer run's state. */
	private forget(videoId: string, proc: ChildProcess): void {
		if (this.activeDownloads.get(videoId) !== proc) return;
		this.activeDownloads.delete(videoId);
		this.progressListeners.delete(videoId);
	}

	/** Direct audio URL for live playback. googlevideo URLs expire, so never persist them. */
	resolveStreamUrl(videoId: string): Promise<string> {
		const cached = this.streamUrls.get(videoId);
		if (cached && isStreamUrlFresh(cached, Date.now())) return Promise.resolve(cached);
		const started = !this.streamPromises.has(videoId);
		const promise = shareInFlight(this.streamPromises, videoId, () => new Promise<string>((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			const proc = spawn(this.ytdlpPath, [
				'-f', 'bestaudio[ext=m4a]/bestaudio', ...STREAM_PRINT_ARGS, '--no-playlist',
				`https://www.youtube.com/watch?v=${videoId}`,
			], { env: this.spawnEnv(), timeout: STREAM_RESOLVE_TIMEOUT_MS });
			this.resolvers.add(proc);
			proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
			proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
			proc.on('error', (err) => { this.resolvers.delete(proc); reject(err); });
			proc.on('close', (code) => {
				this.resolvers.delete(proc);
				const info = parseStreamOutput(stdout);
				if (code === 0 && info) {
					this.streamUrls.set(videoId, info.url);
					this.streamMeta.set(videoId, info);
					this.onMeta?.(videoId);
					resolve(info.url);
				}
				else reject(new Error(parseYtdlpError(stderr)));
			});
		}));
		if (started) {
			promise.catch(() => undefined).finally(() => this.onResolveChange?.());
			this.onResolveChange?.();
		}
		return promise;
	}

	isResolving(videoId: string): boolean {
		return this.streamPromises.has(videoId);
	}

	metaFor(videoId: string): { title: string; author: string } | undefined {
		return this.streamMeta.get(videoId);
	}

	/** Warms the stream-URL cache so the next click skips the yt-dlp round trip. */
	prefetchStream(videoId: string): void {
		this.resolveStreamUrl(videoId).catch(() => undefined);
	}

	/** Kills every in-flight yt-dlp process; called on plugin unload. */
	dispose(): void {
		for (const videoId of [...this.activeDownloads.keys()]) this.cancel(videoId);
		for (const proc of this.resolvers) proc.kill('SIGTERM');
		this.resolvers.clear();
	}

	/** Raw flat-playlist rows (`id<TAB>title<TAB>uploader<TAB>playlist_title`). */
	listPlaylist(listId: string): Promise<string> {
		return new Promise((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			const proc = spawn(this.ytdlpPath, [
				'--flat-playlist', '--print', FLAT_PLAYLIST_PRINT,
				`https://www.youtube.com/playlist?list=${listId}`,
			], { env: this.spawnEnv() });
			proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
			proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
			proc.on('error', reject);
			proc.on('close', (code) => {
				if (code === 0) resolve(stdout);
				else reject(new Error(parseYtdlpError(stderr)));
			});
		});
	}

	cancel(videoId: string): void {
		this.downloadPromises.delete(videoId);
		this.progressListeners.delete(videoId);
		const proc = this.activeDownloads.get(videoId);
		if (proc) {
			proc.kill('SIGTERM');
			this.activeDownloads.delete(videoId);
			void this.cleanIntermediate(videoId);
		}
	}

	isAvailable(): boolean {
		if (!this.ytdlpPath) void this.checkAvailable();
		return this.ytdlpPath !== '';
	}

	/** Obsidian's process.env.PATH often excludes Homebrew/user paths.
	 *  Ensure the directory containing yt-dlp (and likely ffmpeg) is on PATH. */
	private spawnEnv(): Record<string, string | undefined> {
		const ytdlpDir = dirname(this.ytdlpPath);
		const currentPath = process.env.PATH ?? '';
		if (currentPath.split(':').includes(ytdlpDir)) return { ...process.env };
		return { ...process.env, PATH: `${ytdlpDir}:${currentPath}` };
	}

	private async cleanIntermediate(videoId: string): Promise<void> {
		if (!(await this.adapter.exists(this.cacheDir))) return;
		const targetExt = `.${this.format}`;
		const { files } = await this.adapter.list(this.cacheDir);
		for (const file of files) {
			const name = file.slice(file.lastIndexOf('/') + 1);
			if (name.startsWith(videoId + '.') && !name.endsWith(targetExt)) await this.adapter.remove(file);
		}
	}
}
