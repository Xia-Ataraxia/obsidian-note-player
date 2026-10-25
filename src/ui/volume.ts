import { debounce, type Plugin } from 'obsidian';
import {
	VOLUME_STEP, effectiveVolume, normalizeVolume, setLevel, stepVolume, toggleMute, wheelDelta,
} from '../domain/volume';
import type { VolumePort, VolumeState } from '../types/volume';

const SAVE_DELAY_MS = 500;

interface VolumeHooks {
	apply: (volume: number) => void;
	persist: (state: VolumeState) => void;
	feedback: (state: VolumeState) => void;
}

export class VolumeController implements VolumePort {
	private state: VolumeState;
	private readonly listeners = new Set<(state: VolumeState) => void>();
	private readonly save = debounce(() => this.hooks.persist(this.state), SAVE_DELAY_MS, true);

	constructor(level: number, muted: boolean, private readonly hooks: VolumeHooks) {
		this.state = normalizeVolume(level, muted);
		hooks.apply(effectiveVolume(this.state));
	}

	getState(): VolumeState {
		return this.state;
	}

	setVolume(level: number): void {
		this.commit(setLevel(level));
	}

	step(delta: number): void {
		this.commit(stepVolume(this.state, delta));
	}

	toggleMute(): void {
		this.commit(toggleMute(this.state));
	}

	wheel(event: { deltaY: number; deltaMode: number }): void {
		this.step(wheelDelta(event.deltaY, event.deltaMode));
	}

	subscribe(listener: (state: VolumeState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Writes a pending change right away; call on unload so the last tweak is not lost. */
	flush(): void {
		this.save.run();
	}

	private commit(next: VolumeState): void {
		if (next.level === this.state.level && next.muted === this.state.muted) {
			this.hooks.feedback(next);
			return;
		}
		this.state = next;
		this.hooks.apply(effectiveVolume(next));
		for (const listener of this.listeners) listener(next);
		this.hooks.feedback(next);
		this.save();
	}
}

export function registerVolumeCommands(plugin: Plugin, volume: VolumeController): void {
	const commands: Array<[id: string, name: string, run: () => void]> = [
		['volume-up', 'Volume up', () => volume.step(VOLUME_STEP)],
		['volume-down', 'Volume down', () => volume.step(-VOLUME_STEP)],
		['toggle-mute', 'Mute/unmute', () => volume.toggleMute()],
	];
	for (const [id, name, run] of commands) plugin.addCommand({ id, name, callback: run });
}
