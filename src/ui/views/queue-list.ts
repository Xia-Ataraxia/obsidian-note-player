import { setIcon } from 'obsidian';
import { plural } from '../../utils/plural';
import type { PlaylistSummary, PlaylistTrack, PlaylistViewHost, PlaylistViewState } from '../../types/view';
import { openTrackMenu } from './view-menus';
import { buildClass, createIconButton, renderEmptyState, type RunAction } from './view-parts';

export interface QueueContext {
	host: PlaylistViewHost;
	run: RunAction;
	selectedPlaylist: PlaylistSummary | undefined;
	getDragFrom: () => number | null;
	setDragFrom: (index: number | null) => void;
}

const renderedSignatures = new WeakMap<HTMLElement, string>();

function queueSignature(state: PlaylistViewState, ctx: QueueContext): string {
	const rows = state.queue.map((t) => [t.path, t.title, t.artist, t.thumbnailUrl].join('\u0001'));
	return [ctx.selectedPlaylist?.path ?? '', state.isLoading, ...rows].join('\u0002');
}

// Same rows, new current track: toggle in place so the highlight transition can run.
function syncCurrentRow(panel: HTMLElement, state: PlaylistViewState): boolean {
	const rows = Array.from(panel.querySelectorAll<HTMLElement>('.onp-queue-list > .onp-track-row'));
	if (rows.length !== state.queue.length) return false;
	rows.forEach((row, index) => {
		const isCurrent = state.currentTrack?.path === state.queue[index]?.path;
		row.toggleClass('is-current', isCurrent);
		const actions = row.querySelector<HTMLElement>('.onp-row-actions');
		const bars = actions?.querySelector('.onp-eq-bars');
		if (isCurrent && actions && !bars) renderEqBars(actions);
		if (!isCurrent) bars?.remove();
	});
	return true;
}

function renderEqBars(actions: HTMLElement): void {
	const eqBars = createDiv({ cls: 'onp-row-state onp-eq-bars' });
	eqBars.setAttribute('aria-label', 'Playing');
	eqBars.setAttribute('title', 'Playing');
	for (let i = 0; i < 3; i++) eqBars.createDiv({ cls: 'onp-eq-bar' });
	actions.prepend(eqBars);
}

export function renderQueue(panel: HTMLElement, state: PlaylistViewState, ctx: QueueContext): void {
	const signature = queueSignature(state, ctx);
	if (ctx.getDragFrom() === null && renderedSignatures.get(panel) === signature && syncCurrentRow(panel, state)) return;
	renderedSignatures.set(panel, signature);
	panel.empty();

	const header = panel.createDiv({ cls: 'onp-section-header' });
	header.createDiv({ cls: 'onp-section-title', text: 'Tracks' });
	header.createDiv({
		cls: 'onp-section-meta',
		text: ctx.selectedPlaylist ? plural(state.queue.length, 'track') : 'Select a playlist first',
	});

	if (state.isLoading) {
		renderEmptyState(panel, 'Loading playlist', 'Reading playlist note references.');
		return;
	}
	if (!ctx.selectedPlaylist) {
		renderEmptyState(panel, 'Choose a playlist', 'The playlist rows appear here once you select a playlist.');
		return;
	}
	if (state.queue.length === 0) {
		renderEmptyState(panel, 'Playlist is empty', 'Paste a YouTube URL here or use the link button to add a track.');
		return;
	}

	const list = panel.createDiv({ cls: 'onp-list onp-queue-list' });
	state.queue.forEach((track, index) => renderRow(list, state, ctx, track, index));
}

function renderRow(
	list: HTMLElement,
	state: PlaylistViewState,
	ctx: QueueContext,
	track: PlaylistTrack,
	index: number,
): void {
	const { host, run } = ctx;
	const isCurrent = state.currentTrack?.path === track.path;
	const row = list.createDiv({
		cls: buildClass('onp-track-row', {
			'is-current': isCurrent,
			'is-drag-source': ctx.getDragFrom() === index,
		}),
	});

	const grip = row.createDiv({ cls: 'onp-row-grip' });
	grip.setAttribute('draggable', 'true');
	grip.setAttribute('aria-label', 'Drag to reorder');
	grip.setAttribute('title', 'Drag to reorder');
	setIcon(grip.createDiv({ cls: 'onp-row-grip-icon' }), 'grip-vertical');
	grip.createSpan({ cls: 'onp-row-order', text: String(index + 1).padStart(2, '0') });

	grip.addEventListener('dragstart', (event) => {
		ctx.setDragFrom(index);
		row.addClass('is-drag-source');
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(index));
			event.dataTransfer.setDragImage(row, 28, 28);
		}
	});
	grip.addEventListener('dragend', () => {
		ctx.setDragFrom(null);
		row.removeClass('is-drag-source');
		row.removeClass('is-drop-target');
	});
	row.addEventListener('dragenter', (event) => {
		event.preventDefault();
		row.addClass('is-drop-target');
	});
	row.addEventListener('dragover', (event) => {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		row.addClass('is-drop-target');
	});
	row.addEventListener('dragleave', () => {
		row.removeClass('is-drop-target');
	});
	row.addEventListener('drop', (event) => {
		event.preventDefault();
		row.removeClass('is-drop-target');
		const rawIndex = event.dataTransfer?.getData('text/plain');
		const fromIndex = rawIndex ? Number(rawIndex) : ctx.getDragFrom();
		if (fromIndex === null || Number.isNaN(fromIndex) || fromIndex === index) return;
		void run('Saved new queue order', () => host.moveTrackInPlaylist(fromIndex, index));
	});

	const play = () => {
		void run(`Playing ${track.title}`, () => host.playTrack(track.path));
	};

	const thumb = row.createDiv({ cls: 'onp-row-thumb' });
	thumb.setCssProps({ '--onp-thumb-image': `url("${track.thumbnailUrl}")` });
	setIcon(thumb.createDiv({ cls: 'onp-row-thumb-play' }), 'play');
	thumb.addEventListener('click', play);

	const body = row.createDiv({ cls: 'onp-row-copy' });
	body.createDiv({ cls: 'onp-row-title', text: track.title }).setAttribute('title', track.path);
	body.createDiv({ cls: 'onp-row-subtitle', text: track.artist || 'Unknown artist' });
	body.addEventListener('click', play);

	const rowActions = row.createDiv({ cls: 'onp-row-actions' });
	if (isCurrent) {
		renderEqBars(rowActions);
	}
	rowActions.appendChild(createIconButton('Track actions', 'more-vertical', (event) => {
		openTrackMenu(event, host, track, run);
	}));
}
