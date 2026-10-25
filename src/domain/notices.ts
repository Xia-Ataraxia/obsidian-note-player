export const NOTICE_CATALOG = {
	library_refreshed: { template: 'Refreshed {{trackCount}} tracks across {{playlistCount}} playlists.' },
	bases_refreshed: { template: 'Refreshed {{count}} companion Bases files in {{folder}}.' },
	playlist_saved: { template: 'Saved playlist {{name}}.' },
	playlist_created: { template: 'Created playlist {{name}}.' },
	playlist_loaded: { template: 'Loaded playlist {{name}}.' },
	track_added: { template: 'Added {{title}} to {{playlist}}.' },
	track_removed: { template: 'Removed {{title}} from {{playlist}}.' },
	active_note_not_music: { template: 'The active note is not a music note with a playable source.' },
	active_note_not_playlist: { template: 'The active note is not a playlist note.' },
	playlist_missing: { template: 'Choose a playlist first.' },
	download_started: { template: 'Downloading {{title}}…' },
	download_complete: { template: 'Downloaded {{title}}.' },
	download_failed: { template: 'Download failed: {{reason}}' },
	download_cancelled: { template: 'Download cancelled.' },
	track_already_in_playlist: { template: '{{title}} is already in {{playlist}}.' },
	invalid_youtube_url: { template: 'Not a YouTube video or playlist URL.' },
	metadata_unavailable: { template: 'YouTube metadata unavailable; saved with a placeholder title.' },
	tracks_imported: { template: 'Added {{count}} tracks to {{playlist}}.' },
	ytdlp_unavailable: { template: 'yt-dlp is not installed. Install via: brew install yt-dlp' },
} as const;

export type NoticeId = keyof typeof NOTICE_CATALOG;

export function renderNotice(template: string, params: Record<string, string | number> = {}): string {
	const text = template.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key: string) => String(params[key] ?? ''));
	return `[Note Player] ${text}`;
}
