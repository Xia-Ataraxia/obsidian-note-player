import type { YoutubePlaylistPropertyMapping } from '../types/settings';
import { buildYoutubeWatchUrl } from '../utils/youtube';

export interface TrackMeta {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
}

export interface FlatPlaylist {
  title: string;
  entries: Array<Omit<TrackMeta, 'thumbnailUrl'>>;
}

export type ImportPlan =
  | { action: 'create' }
  | { action: 'reuse'; path: string }
  | { action: 'already-in-playlist'; path: string };

export const FLAT_PLAYLIST_PRINT = '%(id)s\t%(title)s\t%(uploader)s\t%(playlist_title)s';

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function parseOembed(json: unknown): { title: string; author: string; thumbnailUrl: string } | null {
  if (typeof json !== 'object' || json === null) return null;
  const record = json as Record<string, unknown>;
  const title = asText(record.title);
  if (!title) return null;
  return { title, author: asText(record.author_name), thumbnailUrl: asText(record.thumbnail_url) };
}

/** Import saves the bare video id as the title when oEmbed fails (private or removed videos). */
export function isUnavailable(track: { title: string; artist: string; videoId: string }): boolean {
  return !track.artist && track.title === track.videoId;
}

export function trackLabel(track: { title: string; artist: string; videoId: string }): string {
  return isUnavailable(track) ? 'Unavailable video' : track.title;
}

export function buildMusicFrontmatter(
  meta: TrackMeta,
  mapping: YoutubePlaylistPropertyMapping,
): Record<string, string> {
  const frontmatter: Record<string, string> = {
    type: mapping.musicNoteType,
    [mapping.musicUrlProperties[0] ?? 'source']: buildYoutubeWatchUrl(meta.videoId),
  };
  if (meta.author) frontmatter[mapping.musicArtistProperties[0] ?? 'author'] = meta.author;
  if (meta.thumbnailUrl) frontmatter[mapping.musicThumbnailProperties[0] ?? 'image'] = meta.thumbnailUrl;
  return frontmatter;
}

export function classifyImport(
  videoId: string,
  tracks: ReadonlyArray<{ path: string; videoId: string }>,
  playlistTrackPaths: readonly string[],
): ImportPlan {
  const existing = tracks.find((track) => track.videoId === videoId);
  if (!existing) return { action: 'create' };
  return playlistTrackPaths.includes(existing.path)
    ? { action: 'already-in-playlist', path: existing.path }
    : { action: 'reuse', path: existing.path };
}

export function parseFlatPlaylistOutput(stdout: string): FlatPlaylist {
  const result: FlatPlaylist = { title: '', entries: [] };
  for (const line of stdout.split('\n')) {
    const [id = '', title = '', author = '', playlistTitle = ''] = line.replace(/\r$/, '').split('\t');
    if (!VIDEO_ID_PATTERN.test(id)) continue;
    result.title ||= asText(playlistTitle);
    result.entries.push({ videoId: id, title: asText(title) || id, author: asText(author) });
  }
  return result;
}

// yt-dlp prints "NA" for missing fields
function asText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === 'NA' ? '' : text;
}
