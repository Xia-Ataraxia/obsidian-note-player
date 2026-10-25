import { Menu } from 'obsidian';
import type { PlaylistSummary, PlaylistTrack, PlaylistViewHost } from '../../types/view';
import type { RunAction } from './view-parts';

export function openPlaylistMenu(
	event: MouseEvent,
	host: PlaylistViewHost,
	playlist: PlaylistSummary,
	run: RunAction,
): void {
	const menu = new Menu();
	const add = (title: string, icon: string, onClick: () => void) =>
		menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(onClick));

	add('Open playlist note', 'file-text', () => {
		void run('', () => host.openPlaylist(playlist.path), false);
	});

	if (host.selectActivePlaylist) {
		add('Load active playlist note', 'crosshair', () => {
			void run('Loaded active playlist', () => host.selectActivePlaylist?.() ?? Promise.resolve());
		});
	}

	if (host.addActiveNoteToPlaylist) {
		add('Add active note', 'plus', () => {
			void run('Added active note to playlist', () => host.addActiveNoteToPlaylist?.() ?? Promise.resolve());
		});
	}

	if (host.openBase) {
		add('Open music.base', 'table-2', () => {
			void run('', () => host.openBase?.('music') ?? Promise.resolve(), false);
		});
		add('Open playlists.base', 'files', () => {
			void run('', () => host.openBase?.('playlists') ?? Promise.resolve(), false);
		});
	}

	if (host.refreshCompanionBases) {
		add('Refresh companion bases files', 'layout-grid', () => {
			void run('Refreshed companion Bases files', () => host.refreshCompanionBases?.() ?? Promise.resolve());
		});
	}

	add('Refresh library', 'refresh-cw', () => {
		void run('Refreshed library', () => host.refresh());
	});

	menu.showAtMouseEvent(event);
}

export function openTrackMenu(
	event: MouseEvent,
	host: PlaylistViewHost,
	track: PlaylistTrack,
	run: RunAction,
): void {
	const menu = new Menu();
	const add = (title: string, icon: string, onClick: () => void) =>
		menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(onClick));

	add('Play track', 'play', () => {
		void run(`Playing ${track.title}`, () => host.playTrack(track.path));
	});
	add('Open note', 'file-text', () => {
		void run('', () => host.openNote(track.path), false);
	});
	add('Remove from playlist', 'minus-circle', () => {
		void run(`Removed ${track.title}`, () => host.removeTrackFromPlaylist(track.path));
	});

	menu.showAtMouseEvent(event);
}
