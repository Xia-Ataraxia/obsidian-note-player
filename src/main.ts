import { debounce, Plugin, WorkspaceLeaf } from 'obsidian';
import { MUSIC_BASE_NAME, PLAYLISTS_BASE_NAME } from './domain/base-files';
import { DEFAULT_SETTINGS, normalizeSettings } from './domain/config';
import { buildMusicLibrary } from './domain/library-index';
import { PlaybackStateManager } from './domain/playback-state';
import { resolveSelectedPlaylistPath, getPlaylistOrThrow, moveItem, toPlaylistSummary, toPlaylistTrack } from './domain/playlist-manager';
import { createPlaylistNoteContent, updatePlaylistNoteContent } from './domain/playlist-storage';
import type { MusicLibrarySnapshot, PlaylistNote } from './types/music';
import type { NotePlayerSettings } from './types/settings';
import type { AudioCachePort, PlaylistTrack, PlaylistViewHost, PlaylistViewState } from './types/view';
import { dedupe, sanitizeFileName } from './utils/dedupe';
import { AudioCacheService } from './services/audio-cache';
import { openCompanionBase, writeCompanionBaseFiles } from './services/companion-bases';
import { TrackImporter } from './services/track-importer';
import { ensureFolder, getAvailablePath, openNoteInTab, collectNoteSnapshots, rewriteNote, waitForMetadata } from './services/vault-io';
import { registerCommands } from './ui/commands';
import { showNotice } from './ui/notices';
import { canonicalizeNotePath } from './utils/wikilink';
import type { PlaybackState } from './types/playback';
import { NotePlayerSettingsTab } from './ui/settings';
import { VIEW_TYPE_NOTE_PLAYER, VIEW_TYPE_LEGACY, NotePlayerView } from './ui/views/NotePlayerView';
import type { PlayerSurface } from './ui/views/PlayerSurface';
import type { DownloadStatusBar } from './ui/download-status-bar';
import { createPlayer } from './ui/player-setup';

const EMPTY_LIBRARY: MusicLibrarySnapshot = {
  tracks: [],
  playlists: [],
};

export default class NotePlayerPlugin extends Plugin implements PlaylistViewHost {
  settings: NotePlayerSettings = DEFAULT_SETTINGS;

  private library: MusicLibrarySnapshot = EMPTY_LIBRARY;
  private changeListeners = new Set<() => void>();
  private readonly scheduleRefresh = debounce(() => { void this.refreshIndex(); }, 250, true);
  private readonly playback = new PlaybackStateManager();
  private isLoading = false;
  private errorMessage: string | null = null;
  private audioCacheService: AudioCacheService | null = null;
  private vaultBasePath = '';
  private playerSurface: PlayerSurface | null = null;
  private playerHostEl: HTMLDivElement | null = null;
  private viewPlaybackState: PlaybackState = 'idle';
  private downloadStatusBar: DownloadStatusBar | null = null;
  private readonly importer = new TrackImporter({
    app: this.app,
    getSettings: () => this.settings,
    getLibrary: () => this.library,
    getSelectedPlaylistPath: () => this.selectedPlaylist()?.path ?? null,
    getAudioCache: () => this.audioCacheService,
    createPlaylist: (name) => this.createPlaylistNote(name),
    addTracks: (playlistPath, paths) => this.addPathsToPlaylist(playlistPath, paths),
  });

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.refreshIndex();

    this.vaultBasePath = (this.app.vault.adapter as { getBasePath?(): string }).getBasePath?.() ?? '';
    this.audioCacheService = this.createAudioCache();

    const player = createPlayer(this, {
      onEnded: () => this.playNext(),
      onStateChange: (state) => {
        if (this.viewPlaybackState === state) return;
        this.viewPlaybackState = state;
        this.notifyChange();
      },
      currentTitle: () => this.getState().currentTrack?.title ?? 'track',
    });
    this.playerSurface = player.surface;
    this.playerHostEl = player.hostEl;
    this.downloadStatusBar = player.statusBar;
    if (this.audioCacheService) this.playerSurface.setAudioCacheService(this.audioCacheService);
    this.playerSurface.setRepeatMode(this.settings.repeatMode);

    const createView = (leaf: WorkspaceLeaf) => new NotePlayerView(leaf, this, this.playerSurface!, this.playerHostEl!);
    this.registerView(VIEW_TYPE_NOTE_PLAYER, createView);
    this.registerView(VIEW_TYPE_LEGACY, createView);

    this.addRibbonIcon('play-square', 'Open note player', () => {
      void this.activateView();
    });

    registerCommands(this, {
      openView: () => this.activateView(),
      refreshLibrary: () => this.refresh(true),
      refreshBases: () => this.refreshCompanionBases(),
      addActiveNote: () => this.addActiveNoteToSelectedPlaylist(),
      loadActivePlaylist: () => this.activateActivePlaylist(),
      addTrackFromUrl: (input) => this.addTrackFromUrl(input),
    });

    this.addSettingTab(new NotePlayerSettingsTab(this.app, this));
    this.registerVaultRefreshEvents();

    if (this.settings.autoOpenOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        void this.activateView();
      });
    }
  }

  onunload(): void {
    this.downloadStatusBar?.destroy();
    this.downloadStatusBar = null;
    this.playerSurface?.destroy();
    this.playerSurface = null;
    this.playerHostEl = null;
    this.scheduleRefresh.cancel();
  }

  async loadSettings(): Promise<void> {
    const loaded = { ...DEFAULT_SETTINGS, ...(await this.loadData() as Partial<NotePlayerSettings>) };
    this.settings = normalizeSettings(loaded);
  }

  async saveSettings(): Promise<void> {
    this.settings = normalizeSettings(this.settings);
    await this.saveData(this.settings);

    const audioCache = this.createAudioCache();
    if (audioCache) {
      this.audioCacheService = audioCache;
      this.playerSurface?.setAudioCacheService(audioCache);
      this.playerSurface?.setRepeatMode(this.settings.repeatMode);
    }
  }

  private createAudioCache(): AudioCacheService | null {
    if (!this.vaultBasePath || !AudioCacheService.isAvailable()) return null;
    const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return new AudioCacheService(this.vaultBasePath, this.app.vault.adapter, this.settings.audioFormat, pluginDir, this.app.vault.configDir);
  }

  getState(): PlaylistViewState {
    const selectedPlaylistPath = resolveSelectedPlaylistPath(this.settings.lastPlaylistPath, this.library.playlists);
    const selectedPlaylist =
      this.library.playlists.find((playlist) => playlist.path === selectedPlaylistPath) ?? null;
    const queue = selectedPlaylist?.tracks.map(toPlaylistTrack) ?? [];
    const currentTrack = this.playback.resolveCurrentTrack(queue, this.library.tracks, toPlaylistTrack);

    return {
      isLoading: this.isLoading,
      errorMessage: this.errorMessage,
      playlists: this.library.playlists.map(toPlaylistSummary),
      selectedPlaylistPath,
      queue,
      library: this.library.tracks.map(toPlaylistTrack),
      currentTrack,
      autoplayEnabled: this.settings.autoplayEnabled,
      playbackState: this.viewPlaybackState,
      repeatMode: this.settings.repeatMode,
      turntableSounds: this.settings.turntableSounds,
    };
  }

  subscribe(callback: () => void): () => void {
    this.changeListeners.add(callback);
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  async refresh(notify = false): Promise<void> {
    await this.refreshIndex();

    if (notify) {
      showNotice('library_refreshed', {
        trackCount: this.library.tracks.length,
        playlistCount: this.library.playlists.length,
      });
    }
  }

  async refreshCompanionBases(): Promise<void> {
    await writeCompanionBaseFiles(this.app, this.settings, true);
  }

  async selectPlaylist(path: string | null): Promise<void> {
    this.settings.lastPlaylistPath = path;
    await this.saveSettings();
    this.playback.currentTrackPath = null;
    this.notifyChange();
  }

  async selectActivePlaylist(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      showNotice('active_note_not_playlist');
      return;
    }

    const playlist = this.library.playlists.find((entry) => entry.path === activeFile.path);
    if (!playlist) {
      showNotice('active_note_not_playlist');
      return;
    }

    await this.selectPlaylist(playlist.path);
    showNotice('playlist_loaded', { name: playlist.title });
  }

  async createPlaylist(name: string): Promise<void> {
    await this.createPlaylistNote(name);
  }

  playTrack(path: string): Promise<void> {
    this.playback.play(path, this.library.tracks);
    this.notifyChange();
    return Promise.resolve();
  }

  playPrevious(): Promise<void> {
    if (this.playback.previous(this.currentQueue())) {
      this.notifyChange();
    }
    return Promise.resolve();
  }

  playNext(): Promise<void> {
    if (this.playback.next(this.currentQueue(), this.settings.repeatMode)) {
      this.notifyChange();
    }
    return Promise.resolve();
  }

  async addTrackToPlaylist(trackPath: string): Promise<void> {
    const playlistPath = resolveSelectedPlaylistPath(this.settings.lastPlaylistPath, this.library.playlists);
    if (!playlistPath) {
      showNotice('playlist_missing');
      return;
    }

    await this.addTrackToSpecificPlaylist(playlistPath, trackPath);
    if (!this.playback.currentTrackPath) {
      this.playback.currentTrackPath = trackPath;
      this.notifyChange();
    }
  }

  addTrackFromUrl(input: string): Promise<void> {
    return this.importer.importFromInput(input);
  }

  private addPathsToPlaylist(playlistPath: string, paths: string[]): Promise<void> {
    const playlist = getPlaylistOrThrow(playlistPath, this.library.playlists);
    return this.savePlaylistTracks(playlistPath, dedupe([...playlist.trackPaths, ...paths]), { refresh: true });
  }

  async addActiveNoteToPlaylist(): Promise<void> {
    await this.addActiveNoteToSelectedPlaylist();
  }

  async removeTrackFromPlaylist(trackPath: string): Promise<void> {
    const playlistPath = resolveSelectedPlaylistPath(this.settings.lastPlaylistPath, this.library.playlists);
    if (!playlistPath) {
      showNotice('playlist_missing');
      return;
    }

    await this.removeTrackFromSpecificPlaylist(playlistPath, trackPath);
    if (this.playback.currentTrackPath === trackPath) {
      this.playback.currentTrackPath = this.currentQueue()[0]?.path ?? null;
      this.notifyChange();
    }
  }

  async moveTrackInPlaylist(fromIndex: number, toIndex: number): Promise<void> {
    const playlist = this.selectedPlaylist();
    if (!playlist || fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= playlist.trackPaths.length || toIndex >= playlist.trackPaths.length) {
      return;
    }

    const nextTrackPaths = moveItem(playlist.trackPaths, fromIndex, toIndex);
    playlist.trackPaths = nextTrackPaths;
    playlist.tracks = moveItem(playlist.tracks, fromIndex, toIndex);
    this.notifyChange();

    await this.savePlaylistTracks(playlist.path, nextTrackPaths);
  }

  async openNote(path: string): Promise<void> {
    await this.revealTrack(path);
  }

  async openPlaylist(path: string): Promise<void> {
    await this.revealPlaylist(path);
  }

  async openBase(kind: 'music' | 'playlists'): Promise<void> {
    await openCompanionBase(this.app, this.settings, kind === 'music' ? MUSIC_BASE_NAME : PLAYLISTS_BASE_NAME);
  }

  async toggleAutoplay(): Promise<void> {
    await this.setAutoplayEnabled(!this.settings.autoplayEnabled);
  }

  async toggleRepeatMode(): Promise<void> {
    this.settings.repeatMode = this.settings.repeatMode === 'one' ? 'none' : 'one';
    this.playerSurface?.setRepeatMode(this.settings.repeatMode);
    await this.saveSettings();
    this.notifyChange();
  }

  getAudioCacheService(): AudioCachePort | null {
    return this.audioCacheService;
  }

  async setAutoplayEnabled(enabled: boolean): Promise<void> {
    this.settings.autoplayEnabled = enabled;
    await this.saveSettings();
    this.notifyChange();
  }

  private async addTrackToSpecificPlaylist(playlistPath: string, trackPath: string): Promise<void> {
    const playlist = getPlaylistOrThrow(playlistPath, this.library.playlists);
    const nextTrackPaths = dedupe([...playlist.trackPaths, trackPath]);
    await this.savePlaylistTracks(playlistPath, nextTrackPaths, { refresh: true });

    const track = this.library.tracks.find((entry) => entry.path === trackPath);
    showNotice('track_added', {
      title: track?.title ?? trackPath,
      playlist: playlist.title,
    });
  }

  private async removeTrackFromSpecificPlaylist(playlistPath: string, trackPath: string): Promise<void> {
    const playlist = getPlaylistOrThrow(playlistPath, this.library.playlists);
    const nextTrackPaths = playlist.trackPaths.filter((entry) => entry !== trackPath);
    await this.savePlaylistTracks(playlistPath, nextTrackPaths, { refresh: true });

    const track = this.library.tracks.find((entry) => entry.path === trackPath);
    showNotice('track_removed', {
      title: track?.title ?? trackPath,
      playlist: playlist.title,
    });
  }

  private async createPlaylistNote(name: string, seedTrackPaths: string[] = []): Promise<string> {
    const filePath = getAvailablePath(this.app, this.settings.playlistFolder, sanitizeFileName(name));
    await ensureFolder(this.app, this.settings.playlistFolder);
    const file = await this.app.vault.create(
      filePath,
      createPlaylistNoteContent({ trackPaths: seedTrackPaths }, this.settings),
    );
    await waitForMetadata(this.app, file);

    this.settings.lastPlaylistPath = filePath;
    await this.saveSettings();
    await this.refreshIndex();

    showNotice('playlist_created', { name });
    return filePath;
  }

  revealTrack(path: string): Promise<void> {
    return openNoteInTab(this.app, path);
  }

  revealPlaylist(path: string): Promise<void> {
    return openNoteInTab(this.app, path);
  }

  private async activateView(): Promise<void> {
    const existing = [
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_NOTE_PLAYER),
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_LEGACY),
    ];
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]!);
      return;
    }

    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_NOTE_PLAYER, active: true });
    void this.app.workspace.revealLeaf(leaf);
  }

  private registerVaultRefreshEvents(): void {
    const { metadataCache, vault } = this.app;
    const schedule = () => this.scheduleRefresh();
    this.registerEvent(metadataCache.on('changed', schedule));
    this.registerEvent(metadataCache.on('resolved', schedule));
    this.registerEvent(vault.on('rename', schedule));
    this.registerEvent(vault.on('delete', schedule));
    this.registerEvent(vault.on('create', schedule));
  }

  private async refreshIndex(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.notifyChange();

    try {
      this.library = buildMusicLibrary(collectNoteSnapshots(this.app), this.settings);

      const selected = resolveSelectedPlaylistPath(this.settings.lastPlaylistPath, this.library.playlists);
      if (this.library.playlists.length > 0 && selected !== this.settings.lastPlaylistPath) {
        if (!this.settings.lastPlaylistPath ||
            !this.library.playlists.some((p) => p.path === this.settings.lastPlaylistPath)) {
          this.settings.lastPlaylistPath = selected;
          await this.saveSettings();
        }
      }

      this.playback.validateCurrent(this.library.tracks);

    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Note Player] Failed to refresh library', error);
    } finally {
      this.isLoading = false;
      this.notifyChange();
    }
  }

  private async savePlaylistTracks(
    playlistPath: string,
    trackPaths: string[],
    opts: { refresh?: boolean } = {},
  ): Promise<void> {
    const playlist = getPlaylistOrThrow(playlistPath, this.library.playlists);
    await rewriteNote(this.app, playlistPath, (existing) => updatePlaylistNoteContent(existing, {
      trackPaths: trackPaths.map((trackPath) => canonicalizeNotePath(trackPath)),
      coverUrl: playlist.coverUrl || undefined,
      description: playlist.description || undefined,
    }, this.settings));

    if (opts.refresh) {
      await this.refreshIndex();
      showNotice('playlist_saved', { name: playlist.title });
    }
  }

  private async activateActivePlaylist(): Promise<void> {
    await this.selectActivePlaylist();
    await this.activateView();
  }

  private async addActiveNoteToSelectedPlaylist(): Promise<void> {
    const playlistPath = resolveSelectedPlaylistPath(this.settings.lastPlaylistPath, this.library.playlists);
    if (!playlistPath) {
      showNotice('playlist_missing');
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      showNotice('active_note_not_music');
      return;
    }

    const track = this.library.tracks.find((entry) => entry.path === activeFile.path);
    if (!track) {
      showNotice('active_note_not_music');
      return;
    }

    await this.addTrackToSpecificPlaylist(playlistPath, track.path);
  }

  private selectedPlaylist(): PlaylistNote | null {
    const selectedPlaylistPath = resolveSelectedPlaylistPath(this.settings.lastPlaylistPath, this.library.playlists);
    return this.library.playlists.find((playlist) => playlist.path === selectedPlaylistPath) ?? null;
  }

  private currentQueue(): PlaylistTrack[] {
    return this.selectedPlaylist()?.tracks.map(toPlaylistTrack) ?? [];
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }
}

