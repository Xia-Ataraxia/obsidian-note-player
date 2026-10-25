import { setIcon } from 'obsidian';
import { VOLUME_STEP, volumeIcon, volumeLabel } from '../../domain/volume';
import type { VolumePort, VolumeState } from '../../types/volume';

/** Speaker button plus slider. Returns a disposer; the card is rebuilt on every render. */
export function renderVolumeControl(container: HTMLElement, volume: VolumePort): () => void {
	const group = container.createDiv({ cls: 'onp-volume' });
	const button = group.createEl('button', { cls: 'clickable-icon onp-volume-button', attr: { type: 'button' } });
	const slider = group.createEl('input', {
		cls: 'onp-volume-slider',
		attr: { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Volume' },
	});

	const sync = (state: VolumeState) => {
		const label = volumeLabel(state);
		const shown = state.muted ? 0 : state.level;
		slider.value = String(Math.round(shown * 100));
		slider.setCssProps({ '--onp-volume-fill': `${Math.round(shown * 100)}%` });
		slider.setAttribute('aria-valuetext', label);
		button.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute');
		button.setAttribute('title', label);
		button.toggleClass('is-muted', state.muted || state.level === 0);
		setIcon(button, volumeIcon(state));
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
