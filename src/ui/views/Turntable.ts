import type { PlaybackState } from '../../types/playback';
import { rampRate, SPIN_DOWN_MS, SPIN_UP_MS, SWING_MS } from '../../domain/turntable';
import type { PlaylistTrack } from '../../types/view';
import type { TurntableSound } from './turntable-sound';

const SETTLE_MS = 120;
const SPIN_MS = 1800;
const REDUCED_SPIN_FACTOR = 4;

/**
 * Persistent record player. The view detaches and re-attaches `el` on every render,
 * so the spin lives in a Web Animation (not a CSS one) and survives detaching.
 */
export class Turntable {
  readonly el: HTMLElement;
  private readonly vinyl: HTMLElement;
  private spin: Animation | null = null;
  private spinDoc: Document | null = null;
  private spinDuration = 0;
  private state: PlaybackState = 'idle';
  private videoId = '';
  private rate = 0;
  private frame = 0;
  private settleTimer = 0;
  private timerWin: Window | null = null;

  constructor(private readonly sound: TurntableSound) {
    this.el = createDiv({ cls: 'onp-turntable is-idle' });
    this.el.setAttribute('aria-hidden', 'true');
    const platter = this.el.createDiv({ cls: 'onp-turntable-platter' });
    this.vinyl = platter.createDiv({ cls: 'onp-vinyl' });
    this.vinyl.createDiv({ cls: 'onp-vinyl-grooves' });
    this.vinyl.createDiv({ cls: 'onp-vinyl-label' });
    this.vinyl.createDiv({ cls: 'onp-vinyl-spindle' });
    const arm = this.el.createDiv({ cls: 'onp-tonearm' });
    arm.createDiv({ cls: 'onp-tonearm-pivot' });
    arm.createDiv({ cls: 'onp-tonearm-arm' });
    arm.createDiv({ cls: 'onp-tonearm-head' });
  }

  update(track: PlaylistTrack | null, state: PlaybackState, soundsOn: boolean): void {
    // Flush styles so the arm transition starts from the pre-render state after re-attach.
    void this.el.offsetWidth;
    this.setLabel(track?.videoId ?? '', track?.thumbnailUrl ?? '');
    if (state === this.state) return;
    const wasPlaying = this.state === 'playing';
    this.state = state;
    this.el.removeClasses(['is-idle', 'is-paused', 'is-playing']);
    this.el.addClass(`is-${state}`);

    if (state === 'playing') {
      if (soundsOn) this.sound.drop();
      this.settleLater();
      this.ramp(1, SPIN_UP_MS);
    } else {
      if (wasPlaying && soundsOn) this.sound.lift();
      this.ramp(0, SPIN_DOWN_MS);
    }
  }

  destroy(): void {
    this.cancelTimers();
    this.spin?.cancel();
    this.spin = null;
    this.el.remove();
  }

  private setLabel(videoId: string, thumbnailUrl: string): void {
    if (videoId === this.videoId) return;
    this.videoId = videoId;
    this.el.setCssProps({ '--onp-label-image': thumbnailUrl ? `url("${thumbnailUrl}")` : 'none' });
  }

  private settleLater(): void {
    this.cancelTimers();
    const win = this.el.win;
    this.timerWin = win;
    this.settleTimer = win.setTimeout(() => {
      this.el.addClass('is-landing');
      this.settleTimer = win.setTimeout(() => this.el.removeClass('is-landing'), SETTLE_MS);
    }, SWING_MS);
  }

  private ramp(target: number, durationMs: number): void {
    const spin = this.ensureSpin();
    if (!spin) return;
    const win = this.el.win;
    win.cancelAnimationFrame(this.frame);
    this.timerWin = win;
    const from = this.rate;
    if (target > 0) spin.play();
    const startedAt = win.performance.now();
    const step = (now: number) => {
      const elapsed = now - startedAt;
      this.rate = rampRate(from, target, elapsed, durationMs);
      spin.updatePlaybackRate(Math.max(this.rate, 0.001));
      if (elapsed < durationMs) {
        this.frame = win.requestAnimationFrame(step);
      } else if (target === 0) {
        spin.pause();
      }
    };
    this.frame = win.requestAnimationFrame(step);
  }

  private ensureSpin(): Animation | null {
    const doc = this.vinyl.ownerDocument;
    const reduced = doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
    const duration = reduced ? SPIN_MS * REDUCED_SPIN_FACTOR : SPIN_MS;
    if (this.spin && this.spinDoc === doc && this.spinDuration === duration) return this.spin;
    this.spin?.cancel();
    this.spin = this.vinyl.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration, iterations: Infinity },
    );
    this.spinDuration = duration;
    this.spin.pause();
    this.spinDoc = doc;
    return this.spin;
  }

  private cancelTimers(): void {
    this.timerWin?.cancelAnimationFrame(this.frame);
    this.timerWin?.clearTimeout(this.settleTimer);
    this.el.removeClass('is-landing');
  }
}
