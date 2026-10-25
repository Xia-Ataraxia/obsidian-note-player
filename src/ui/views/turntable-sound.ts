import {
  CRACKLE_SECONDS, GROOVE_SECONDS, renderCrackle, renderGroove, renderNoiseBurst, renderThump, soundGain, swingMs, type SoundKind,
} from '../../domain/turntable';

type AudioWindow = Window & { AudioContext: typeof AudioContext };

/** Synthesized needle drop, lift and crackle. The context is created lazily on a user gesture. */
export class TurntableSound {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private groove: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor(private readonly getVolume: () => number, private readonly isReduced: () => boolean = () => false) {}

  /** The "Turntable sounds" setting; gating here covers every caller, including the crackle. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stopGroove();
  }

  unlock(win: Window): void {
    this.ctx ??= new (win as AudioWindow).AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  drop(): void {
    this.play('drop', swingMs(this.isReduced()) / 1000);
  }

  lift(): void {
    this.play('lift', 0);
  }

  /** Soft run-in crackle while the needle waits for the music; starts after the drop thock. */
  startGroove(): void {
    const ctx = this.ctx;
    const level = soundGain('lift', this.getVolume());
    if (!this.enabled || this.groove || !ctx || ctx.state !== 'running' || level <= 0) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(level * 0.5, ctx.currentTime + swingMs(this.isReduced()) / 1000 + 0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    filter.connect(gain).connect(ctx.destination);
    const source = this.startBuffer(renderGroove(ctx.sampleRate, GROOVE_SECONDS, Math.random), filter, ctx.currentTime + swingMs(this.isReduced()) / 1000);
    if (!source) return;
    source.loop = true;
    this.groove = { source, gain };
  }

  /** Mute and level changes reach a crackle that is already looping. */
  applyVolume(): void {
    const ctx = this.ctx;
    if (!ctx || !this.groove) return;
    this.groove.gain.gain.setTargetAtTime(soundGain('lift', this.getVolume()) * 0.5, ctx.currentTime, 0.03);
  }

  stopGroove(): void {
    const ctx = this.ctx;
    const groove = this.groove;
    this.groove = null;
    if (!ctx || !groove) return;
    groove.gain.gain.cancelScheduledValues(ctx.currentTime);
    groove.gain.gain.setValueAtTime(groove.gain.gain.value, ctx.currentTime);
    groove.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    groove.source.stop(ctx.currentTime + 0.25);
  }

  close(): void {
    this.stopGroove();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
  }

  private play(kind: SoundKind, delaySec: number): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const gain = soundGain(kind, this.getVolume());
    if (gain <= 0) return;

    const at = ctx.currentTime + delaySec;
    const master = ctx.createGain();
    master.gain.value = gain;
    master.connect(ctx.destination);

    const burst = ctx.createBiquadFilter();
    burst.type = 'bandpass';
    burst.frequency.value = kind === 'drop' ? 3000 : 2400;
    burst.connect(master);
    this.startBuffer(renderNoiseBurst(ctx.sampleRate, 8, Math.random), burst, at);
    this.startBuffer(renderThump(ctx.sampleRate, kind === 'drop' ? 40 : 20, 90), master, at);

    if (kind === 'drop') {
      const bed = ctx.createBiquadFilter();
      bed.type = 'highpass';
      bed.frequency.value = 1500;
      const bedGain = ctx.createGain();
      bedGain.gain.value = 0.35;
      bed.connect(bedGain).connect(master);
      this.startBuffer(renderCrackle(ctx.sampleRate, CRACKLE_SECONDS, Math.random), bed, at);
    }
  }

  private startBuffer(samples: Float32Array<ArrayBuffer>, target: AudioNode, at: number): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(target);
    source.start(at);
    return source;
  }
}
