import { setIcon } from 'obsidian';
import { VOLUME_STEP, volumeIcon, volumeLabel } from '../../domain/volume';
import type { VolumePort, VolumeState } from '../../types/volume';

/** Speaker button that reveals a slider on hover or focus. Returns a disposer; the card is rebuilt on every render. */
export function renderVolumeControl(container: HTMLElement, volume: VolumePort): () => void {
	const group = container.createDiv({ cls: 'onp-volume' });
	const button = group.createEl('button', { cls: 'onp-button is-icon-only onp-volume-button', attr: { type: 'button' } });
	const icon = button.createSpan({ cls: 'onp-button-icon' });
	const slider = group.createDiv({ cls: 'onp-volume-slot' }).createEl('input', {
		cls: 'onp-volume-slider',
		attr: { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Volume' },
	});

	const sync = (state: VolumeState) => {
		const label = volumeLabel(state);
		const shown = state.muted ? 0 : state.level;
		slider.value = String(Math.round(shown * 100));
		slider.setCssProps({ '--np-vol': String(Math.round(shown * 100) / 100) });
		slider.setAttribute('aria-valuetext', label);
		button.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute');
		button.setAttribute('title', label);
		slider.setAttribute('title', label);
		const quiet = state.muted || state.level === 0;
		group.toggleClass('is-muted', quiet);
		button.toggleClass('is-muted', quiet);
		setIcon(icon, volumeIcon(state));
	};

	button.addEventListener('click', (event) => {
		event.preventDefault();
		volume.toggleMute();
	});
	slider.addEventListener('input', () => volume.setVolume(Number(slider.value) / 100));
	slider.addEventListener('keydown', (event) => {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		volume.step(event.key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP);
	});

	sync(volume.getState());
	return volume.subscribe(sync);
}
