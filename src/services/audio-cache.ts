import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { FLAT_PLAYLIST_PRINT } from '../domain/track-import';
import { parseYtdlpError, parseYtdlpProgress } from '../domain/ytdlp';
import type { AudioCachePort, VaultAdapter } from '../types/view';
import type { AudioFormat } from '../types/audio';
import { shareInFlight } from '../utils/in-flight';

/** yt-dlp retries unreachable hosts for minutes; first play must not wait on that. */
const STREAM_RESOLVE_TIMEOUT_MS = 10_000;

export class AudioCacheService implements AudioCachePort {
	private cacheDir: string;        // vault-relative
	private format: AudioFormat;
	private ytdlpPath: string;
	private activeDownloads = new Map<string, ChildProcess>();
	private downloadPromises = new Map<string, Promise<string>>();
	private progressListeners = new Map<string, Set<(percent: number) => void>>();
	private streamPromises = new Map<string, Promise<string>>();
	private resolvers = new Set<ChildProcess>();
	private adapter: VaultAdapter;
	private absBase: string;

	constructor(vaultBasePath: string, adapter: VaultAdapter, format: AudioFormat, pluginDir: string, configDir: string, ytdlpPath?: string) {
		this.adapter = adapter;
		this.format = format;
		this.ytdlpPath = ytdlpPath ?? AudioCacheService.discoverYtdlpPath();
		this.absBase = vaultBasePath;
		this.cacheDir = `${pluginDir}/audio-cache`;
		const absPath = join(vaultBasePath, this.cacheDir);
		if (!existsSync(absPath)) mkdirSync(absPath, { recursive: true });
		this.adoptLegacyCache(join(vaultBasePath, configDir, 'plugins', 'obsidian-note-player', 'audio-cache'), absPath);
	}

	private adoptLegacyCache(legacyDir: string, targetDir: string): void {
		if (legacyDir === targetDir || !existsSync(legacyDir)) return;
		for (const file of readdirSync(legacyDir)) {
			const target = join(targetDir, file);
			if (!existsSync(target)) renameSync(join(legacyDir, file), target);
		}
	}

	private static discoverYtdlpPath(): string {
		const result = spawnSync('which', ['yt-dlp'], { encoding: 'utf-8' });
		if (result.status === 0 && result.stdout.trim()) {
			return result.stdout.trim();
		}
		return '/opt/homebrew/bin/yt-dlp'; // fallback for macOS
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
		if (existsSync(output)) return Promise.resolve(output);

		const listeners = this.progressListeners.get(videoId) ?? new Set();
		listeners.add(onProgress);
		this.progressListeners.set(videoId, listeners);
		return shareInFlight(this.downloadPromises, videoId, () => this.runDownload(videoId, output));
	}

	private runDownload(videoId: string, output: string): Promise<string> {
		this.cleanIntermediate(videoId);
		return new Promise<string>((resolve, reject) => {
			let stderrOutput = '';
			const proc = spawn(this.ytdlpPath, [
				'-x', '--audio-format', this.format, '--audio-quality', '0',
				'--no-playlist',
				'-o', join(this.absBase, this.cacheDir, `${videoId}.%(ext)s`),
				`https://www.youtube.com/watch?v=${videoId}`,
			], { env: this.spawnEnv() });

			this.activeDownloads.set(videoId, proc);

			proc.stderr.on('data', (data: Buffer) => {
				const line = data.toString();
				stderrOutput += line;
				const percent = parseYtdlpProgress(line);
				if (percent !== null) this.progressListeners.get(videoId)?.forEach((notify) => notify(percent));
			});

			proc.stdout.on('data', (data: Buffer) => {
				stderrOutput += data.toString();
			});

			proc.on('close', (code) => {
				this.forget(videoId, proc);
				if (code === 0 && existsSync(output)) {
					this.cleanIntermediate(videoId);
					resolve(output);
				} else {
					reject(new Error(parseYtdlpError(stderrOutput)));
				}
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
		return shareInFlight(this.streamPromises, videoId, () => new Promise<string>((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			const proc = spawn(this.ytdlpPath, [
				'-f', 'bestaudio[ext=m4a]/bestaudio', '-g', '--no-playlist',
				`https://www.youtube.com/watch?v=${videoId}`,
			], { env: this.spawnEnv(), timeout: STREAM_RESOLVE_TIMEOUT_MS });
			this.resolvers.add(proc);
			proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
			proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
			proc.on('error', (err) => { this.resolvers.delete(proc); reject(err); });
			proc.on('close', (code) => {
				this.resolvers.delete(proc);
				const url = stdout.trim().split('\n')[0];
				if (code === 0 && url) resolve(url);
				else reject(new Error(parseYtdlpError(stderr)));
			});
		}));
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
			this.cleanIntermediate(videoId);
		}
	}

	isAvailable(): boolean {
		return AudioCacheService.isAvailable(this.ytdlpPath);
	}

	/** Obsidian's process.env.PATH often excludes Homebrew/user paths.
	 *  Ensure the directory containing yt-dlp (and likely ffmpeg) is on PATH. */
	private spawnEnv(): Record<string, string | undefined> {
		const ytdlpDir = dirname(this.ytdlpPath);
		const currentPath = process.env.PATH ?? '';
		if (currentPath.split(':').includes(ytdlpDir)) return { ...process.env };
		return { ...process.env, PATH: `${ytdlpDir}:${currentPath}` };
	}

	private cleanIntermediate(videoId: string): void {
		const absDir = join(this.absBase, this.cacheDir);
		const targetExt = `.${this.format}`;
		for (const file of readdirSync(absDir)) {
			if (file.startsWith(videoId + '.') && !file.endsWith(targetExt)) {
				unlinkSync(join(absDir, file));
			}
		}
	}

	static isAvailable(ytdlpPath?: string): boolean {
		const path = ytdlpPath ?? AudioCacheService.discoverYtdlpPath();
		const result = spawnSync(path, ['--version'], { stdio: 'ignore' });
		return result.status === 0;
	}
}
