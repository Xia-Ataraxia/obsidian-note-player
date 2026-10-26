import type { MusicTrack, PlaylistNote } from '../types/music';
import type { PlaylistSummary, PlaylistTrack } from '../types/view';

export function resolveSelectedPlaylistPath(
  lastPlaylistPath: string | null,
  playlists: PlaylistNote[],
): string | null {
  if (lastPlaylistPath && playlists.some((playlist) => playlist.path === lastPlaylistPath)) {
    return lastPlaylistPath;
  }
  return playlists[0]?.path ?? null;
}

/** The track that followed the removed one (wrapping to the first at the end), or null when nothing is left. */
export function successorAfterRemoval(queuePaths: readonly string[], removedPath: string): string | null {
  const index = queuePaths.indexOf(removedPath);
  const rest = queuePaths.filter((path) => path !== removedPath);
  return rest[index < 0 ? 0 : index] ?? rest[0] ?? null;
}

export function getPlaylistOrThrow(playlistPath: string, playlists: PlaylistNote[]): PlaylistNote {
  const playlist = playlists.find((entry) => entry.path === playlistPath);
  if (!playlist) {
    throw new Error(`Playlist not found: ${playlistPath}`);
  }
  return playlist;
}

export function toPlaylistSummary(playlist: PlaylistNote): PlaylistSummary {
  return {
    path: playlist.path,
    title: playlist.title,
    trackCount: playlist.trackPaths.length,
    description: playlist.description || undefined,
    coverImage: playlist.coverUrl || undefined,
  };
}

export function toPlaylistTrack(track: MusicTrack): PlaylistTrack {
  return {
    path: track.path,
    title: track.title,
    artist: track.artist,
    sourceUrl: track.sourceUrl,
    videoId: track.videoId,
    thumbnailUrl: track.thumbnailUrl,
    tags: track.tags,
  };
}

export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved as T);
  return next;
}

/** Moves `item` within the current list, so entries added since the drag started survive. */
export function moveValue<T>(items: readonly T[], item: T, toIndex: number): T[] {
  const fromIndex = items.indexOf(item);
  if (fromIndex < 0) return [...items];
  return moveItem(items, fromIndex, Math.min(toIndex, items.length - 1));
}
