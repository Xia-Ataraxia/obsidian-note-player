import { requestUrl, type App, type TFile } from 'obsidian';
import {
  buildMusicFrontmatter, classifyImport, parseFlatPlaylistOutput, parseOembed, type TrackMeta,
} from '../domain/track-import';
import type { MusicLibrarySnapshot } from '../types/music';
import type { NotePlayerSettings } from '../types/settings';
import type { AudioCachePort } from '../types/view';
import { sanitizeFileName } from '../utils/dedupe';
import { buildYoutubeThumbnailUrl, buildYoutubeWatchUrl, parseYoutubeUrl } from '../utils/youtube';
import { showNotice } from '../ui/notices';
import { ensureFolder, getAvailablePath, waitForMetadata } from './vault-io';

const INBOX_NAME = 'Inbox';

export interface TrackImporterDeps {
  app: App;
  getSettings(): NotePlayerSettings;
  getLibrary(): MusicLibrarySnapshot;
  getSelectedPlaylistPath(): string | null;
  getAudioCache(): AudioCachePort | null;
  createPlaylist(name: string): Promise<string>;
  addTracks(playlistPath: string, trackPaths: string[]): Promise<void>;
}

export class TrackImporter {
  private inFlight = false;

  constructor(private readonly deps: TrackImporterDeps) {}

  async importFromInput(input: string): Promise<void> {
    const target = parseYoutubeUrl(input);
    if (!target) {
      showNotice('invalid_youtube_url');
      return;
    }
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      if (target.kind === 'video') await this.importVideo(target.videoId);
      else await this.importPlaylist(target.listId);
    } finally {
      this.inFlight = false;
    }
  }

  private async importVideo(videoId: string): Promise<void> {
    const playlistPath = this.deps.getSelectedPlaylistPath() ?? await this.deps.createPlaylist(INBOX_NAME);
    const playlist = this.playlistOf(playlistPath);
    const plan = classifyImport(videoId, this.deps.getLibrary().tracks, playlist.trackPaths);

    if (plan.action === 'already-in-playlist') {
      showNotice('track_already_in_playlist', { title: this.titleOf(plan.path), playlist: playlist.title });
      return;
    }

    let trackPath: string;
    let title: string;
    if (plan.action === 'reuse') {
      trackPath = plan.path;
      title = this.titleOf(plan.path);
    } else {
      const meta = await this.fetchMeta(videoId);
      title = meta.title;
      const file = await this.createTrackNote(meta);
      await waitForMetadata(this.deps.app, file);
      trackPath = file.path;
    }
    await this.deps.addTracks(playlistPath, [trackPath]);
    showNotice('track_added', { title, playlist: playlist.title });
  }

  private async importPlaylist(listId: string): Promise<void> {
    const cache = this.deps.getAudioCache();
    if (!cache?.isAvailable() || typeof cache.listPlaylist !== 'function') {
      showNotice('ytdlp_unavailable');
      return;
    }
    const flat = parseFlatPlaylistOutput(await cache.listPlaylist(listId));
    if (flat.entries.length === 0) {
      showNotice('invalid_youtube_url');
      return;
    }

    const playlistPath = this.deps.getSelectedPlaylistPath()
      ?? await this.deps.createPlaylist(flat.title || INBOX_NAME);
    const playlist = this.playlistOf(playlistPath);
    const known: Array<{ path: string; videoId: string }> = [...this.deps.getLibrary().tracks];
    const paths: string[] = [];
    let lastCreated: TFile | null = null;

    for (const entry of flat.entries) {
      const plan = classifyImport(entry.videoId, known, [...playlist.trackPaths, ...paths]);
      if (plan.action === 'already-in-playlist') continue;
      if (plan.action === 'reuse') {
        paths.push(plan.path);
        continue;
      }
      lastCreated = await this.createTrackNote({ ...entry, thumbnailUrl: buildYoutubeThumbnailUrl(entry.videoId) });
      known.push({ path: lastCreated.path, videoId: entry.videoId });
      paths.push(lastCreated.path);
    }

    if (lastCreated) await waitForMetadata(this.deps.app, lastCreated);
    if (paths.length === 0) {
      showNotice('track_already_in_playlist', { title: flat.title || listId, playlist: playlist.title });
      return;
    }
    await this.deps.addTracks(playlistPath, paths);
    showNotice('tracks_imported', { count: paths.length, playlist: playlist.title });
  }

  private async fetchMeta(videoId: string): Promise<TrackMeta> {
    const fallback: TrackMeta = {
      videoId,
      title: `YouTube ${videoId}`,
      author: '',
      thumbnailUrl: buildYoutubeThumbnailUrl(videoId),
    };
    try {
      const watchUrl = buildYoutubeWatchUrl(videoId);
      const response = await requestUrl({
        url: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
        throw: false,
      });
      const oembed = response.status === 200 ? parseOembed(response.json) : null;
      if (oembed) return { videoId, ...oembed, thumbnailUrl: oembed.thumbnailUrl || fallback.thumbnailUrl };
    } catch {
      // network or JSON failure falls through to the placeholder
    }
    showNotice('metadata_unavailable');
    return fallback;
  }

  private async createTrackNote(meta: TrackMeta): Promise<TFile> {
    const { app } = this.deps;
    const settings = this.deps.getSettings();
    const folder = settings.musicFolder || app.fileManager.getNewFileParent('').path;
    await ensureFolder(app, folder);
    const path = getAvailablePath(app, folder, sanitizeFileName(meta.title, 'Untitled track'));
    const file = await app.vault.create(path, `![](${buildYoutubeWatchUrl(meta.videoId)})\n`);
    await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      Object.assign(frontmatter, buildMusicFrontmatter(meta, settings));
    });
    return file;
  }

  private playlistOf(path: string) {
    const playlist = this.deps.getLibrary().playlists.find((entry) => entry.path === path);
    if (!playlist) throw new Error(`Playlist not found: ${path}`);
    return playlist;
  }

  private titleOf(trackPath: string): string {
    return this.deps.getLibrary().tracks.find((track) => track.path === trackPath)?.title ?? trackPath;
  }
}
