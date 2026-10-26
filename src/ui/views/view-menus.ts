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
			void run('', () => host.selectActivePlaylist?.() ?? Promise.resolve(), false);
		});
	}

	if (host.addActiveNoteToPlaylist) {
		add('Add active note', 'plus', () => {
			void run('', () => host.addActiveNoteToPlaylist?.() ?? Promise.resolve(), false);
		});
	}

	if (host.openBase) {
		add('Open music base', 'table-2', () => {
			void run('', () => host.openBase?.('music') ?? Promise.resolve(), false);
		});
		add('Open playlists base', 'files', () => {
			void run('', () => host.openBase?.('playlists') ?? Promise.resolve(), false);
		});
	}

	if (host.refreshCompanionBases) {
		add('Refresh companion Bases files', 'layout-grid', () => {
			void run('', () => host.refreshCompanionBases?.() ?? Promise.resolve(), false);
		});
	}

	add('Refresh library', 'refresh-cw', () => {
		void run('', () => host.refresh(true), false);
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
		void run('', () => host.playTrack(track.path), false);
	});
	add('Open note', 'file-text', () => {
		void run('', () => host.openNote(track.path), false);
	});
	menu.addItem((item) =>
		item.setTitle('Remove from playlist').setIcon('minus-circle').setWarning(true).onClick(() => {
			void run('', () => host.removeTrackFromPlaylist(track.path), false);
		}),
	);

	menu.showAtMouseEvent(event);
}
