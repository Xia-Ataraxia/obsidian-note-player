export interface VolumeState {
  level: number;
  muted: boolean;
}

/** What a view needs to show and drive the volume; the turntable knob binds to this too. */
export interface VolumePort {
  getState(): VolumeState;
  /** Sets the level (0 to 1) and unmutes. */
  setVolume(level: number): void;
  step(delta: number): void;
  toggleMute(): void;
  /** Wheel gesture; up is louder. */
  wheel(event: { deltaY: number; deltaMode: number }): void;
  subscribe(listener: (state: VolumeState) => void): () => void;
}
