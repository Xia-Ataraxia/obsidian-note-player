import { setIcon } from 'obsidian';
import type { PlaylistSummary, PlaylistViewHost, PlaylistViewState } from '../../types/view';
import { openPlaylistMenu } from './view-menus';
import { createActionButton, createIconButton, renderEmptyState, type RunAction } from './view-parts';

export function renderHero(
	panel: HTMLElement,
	state: PlaylistViewState,
	selectedPlaylist: PlaylistSummary | undefined,
	host: PlaylistViewHost,
	run: RunAction,
): void {
	panel.empty();

	if (state.isLoading) {
		renderEmptyState(panel, 'Loading playlist', 'Scanning playlists and music notes from the vault.');
		return;
	}

	if (state.errorMessage) {
		renderEmptyState(panel, 'Playlist error', state.errorMessage);
		return;
	}

	if (!selectedPlaylist) {
		renderEmptyState(panel, 'Choose a playlist', 'Select a playlist note to see its cover, metadata, and ordered tracks.');
		return;
	}

	const coverImage = selectedPlaylist.coverImage ?? state.queue[0]?.thumbnailUrl ?? state.currentTrack?.thumbnailUrl ?? '';
	const hero = panel.createDiv({ cls: 'onp-playlist-hero' });
	const cover = hero.createDiv({ cls: 'onp-hero-cover' });
	if (coverImage) {
		cover.setCssProps({ '--onp-cover-image': `url("${coverImage}")` });
	} else {
		const icon = cover.createDiv({ cls: 'onp-empty-icon' });
		setIcon(icon, 'music-4');
	}

	const copy = hero.createDiv({ cls: 'onp-hero-copy' });
	copy.createDiv({ cls: 'onp-hero-kicker', text: 'Playlist' });
	copy.createEl('h2', { cls: 'onp-hero-title', text: selectedPlaylist.title });
	copy.createDiv({
		cls: 'onp-hero-meta',
		text: `${selectedPlaylist.trackCount} tracks • ${state.library.length} music notes`,
	});

	if (selectedPlaylist.description) {
		copy.createDiv({ cls: 'onp-hero-description', text: selectedPlaylist.description });
	}

	const actions = copy.createDiv({ cls: 'onp-hero-actions' });
	if (!state.currentTrack && state.queue.length > 0) {
		actions.appendChild(createActionButton('Play all', 'play', () => {
			const firstTrack = state.queue[0];
			if (!firstTrack) return;
			void run(`Playing ${firstTrack.title}`, () => host.playTrack(firstTrack.path));
		}, { cta: true, iconOnly: true }));
	}

	actions.appendChild(createIconButton('Playlist actions', 'more-vertical', (event) => {
		openPlaylistMenu(event, host, selectedPlaylist, run);
	}));
}
