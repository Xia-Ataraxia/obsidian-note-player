import type { Plugin } from 'obsidian';

export interface CommandActions {
	openView: () => Promise<void>;
	refreshLibrary: () => Promise<void>;
	refreshBases: () => Promise<void>;
	addActiveNote: () => Promise<void>;
	loadActivePlaylist: () => Promise<void>;
}

export function registerCommands(plugin: Plugin, actions: CommandActions): void {
	const commands: Array<[id: string, name: string, run: () => Promise<void>]> = [
		['open-youtube-note-playlist', 'Open player view', actions.openView],
		['refresh-youtube-note-library', 'Refresh music library', actions.refreshLibrary],
		['refresh-youtube-playlist-bases', 'Create or refresh companion bases files', actions.refreshBases],
		['add-active-note-to-selected-playlist', 'Add active note to selected playlist', actions.addActiveNote],
		['load-active-playlist-note', 'Load active playlist note into player', actions.loadActivePlaylist],
	];

	for (const [id, name, run] of commands) {
		plugin.addCommand({ id, name, callback: () => { void run(); } });
	}
}
