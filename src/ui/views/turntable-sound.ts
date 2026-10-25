import {
  CRACKLE_SECONDS, renderCrackle, renderNoiseBurst, renderThump, soundGain, SWING_MS, type SoundKind,
} from '../../domain/turntable';

type AudioWindow = Window & { AudioContext: typeof AudioContext };

/** Synthesized needle drop, lift and crackle. The context is created lazily on a user gesture. */
export class TurntableSound {
  private ctx: AudioContext | null = null;

  constructor(private readonly getVolume: () => number) {}

  unlock(win: Window): void {
    this.ctx ??= new (win as AudioWindow).AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  drop(): void {
    this.play('drop', SWING_MS / 1000);
  }

  lift(): void {
    this.play('lift', 0);
  }

  close(): void {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
  }

  private play(kind: SoundKind, delaySec: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
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

  private startBuffer(samples: Float32Array<ArrayBuffer>, target: AudioNode, at: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(target);
    source.start(at);
  }
}
