import type { PlaylistTrack } from '../types/view';
import type { MusicTrack } from '../types/music';

export class PlaybackStateManager {
	currentTrackPath: string | null = null;
	/** Where the current track still sits in the index until the rename is indexed. */
	private renamedFrom: string | null = null;

	/** The path moves at once; the index trails the vault, so the old entry stands in until it catches up. */
	followRename(from: string, to: string): void {
		if (this.currentTrackPath !== from) return;
		this.currentTrackPath = to;
		this.renamedFrom = from;
	}

	play(path: string, tracks: MusicTrack[]): void {
		const track = tracks.find((entry) => entry.path === path);
		if (!track) {
			throw new Error(`Track not found: ${path}`);
		}
		this.currentTrackPath = path;
	}

	/** Manual skip. Repeat-one loops in the audio element, so it never reaches here and must not block Next. */
	next(queue: PlaylistTrack[]): boolean {
		if (queue.length === 0) return false;

		if (!this.currentTrackPath) {
			this.currentTrackPath = queue[0]!.path;
			return true;
		}

		const currentIndex = queue.findIndex((track) => track.path === this.currentTrackPath);
		if (currentIndex < 0 || currentIndex >= queue.length - 1) return false;

		this.currentTrackPath = queue[currentIndex + 1]!.path;
		return true;
	}

	previous(queue: PlaylistTrack[]): boolean {
		if (queue.length === 0) return false;

		if (!this.currentTrackPath) {
			this.currentTrackPath = queue[0]!.path;
			return true;
		}

		const currentIndex = queue.findIndex((track) => track.path === this.currentTrackPath);
		if (currentIndex <= 0) return false;

		this.currentTrackPath = queue[currentIndex - 1]!.path;
		return true;
	}

	validateCurrent(tracks: MusicTrack[]): void {
		if (this.currentTrackPath && !tracks.some((track) => track.path === this.currentTrackPath)) {
			this.currentTrackPath = null;
		}
	}

	resolveCurrentTrack(
		queue: PlaylistTrack[],
		library: MusicTrack[],
		toPlaylistTrack: (track: MusicTrack) => PlaylistTrack,
	): PlaylistTrack | null {
		if (!this.currentTrackPath) return null;

		const queuedTrack = queue.find((track) => track.path === this.currentTrackPath);
		if (queuedTrack) return queuedTrack;

		const libraryTrack = library.find((track) => track.path === this.currentTrackPath);
		if (libraryTrack) return toPlaylistTrack(libraryTrack);

		const stale = this.renamedFrom;
		const old = queue.find((track) => track.path === stale);
		const oldLibrary = library.find((track) => track.path === stale);
		const standIn = old ?? (oldLibrary ? toPlaylistTrack(oldLibrary) : null);
		return standIn && { ...standIn, path: this.currentTrackPath };
	}
}
