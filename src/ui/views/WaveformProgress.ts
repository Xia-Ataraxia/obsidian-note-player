import { meterStep, nudgeRatio, placeholderHeight, ratioAt, resamplePeaks, springStep } from '../../domain/peaks';
import { formatTime } from './PlayerSurface';
import { barCountFor, drawMeter, drawWave, readColors, type WaveColors } from './waveform-draw';

const SEEK_STEP_SECONDS = 5;
const FADE_SECONDS = 0.25;
const METER_HOLD_FALL = 0.6;
/** Loud masters peak almost everywhere; an expansion curve keeps the dynamics visible. */

export interface WaveformHooks {
	getTime(): number;
	getDuration(): number;
	isPlaying(): boolean;
	seekTo(ratio: number): void;
	reducedMotion(): boolean;
}

/** Mastering-style progress: peak waveform, gliding playhead, scrub, console clock and level meter. */
export class WaveformProgress {
	private static showRemaining = true;

	readonly el: HTMLElement;
	private readonly stage: HTMLElement;
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D | null;
	private readonly meterCanvas: HTMLCanvasElement;
	private readonly meterCtx: CanvasRenderingContext2D | null;
	private readonly tipEl: HTMLElement;
	private readonly elapsedEl: HTMLElement;
	private readonly remainEl: HTMLElement;
	private readonly observer: ResizeObserver;
	private colors: WaveColors;
	private peaks: number[] | null = null;
	private pooled: number[] = [];
	private reveal = 1;
	private revealVel = 0;
	private hover: number | null = null;
	private dragRatio: number | null = null;
	private width = 0;
	private height = 0;
	private level = 0;
	private hold = 0;
	private raf = 0;
	private last = 0;
	private destroyed = false;

	constructor(parent: HTMLElement, private readonly hooks: WaveformHooks) {
		this.el = parent.createDiv({ cls: 'onp-wave' });
		this.stage = this.el.createDiv({ cls: 'onp-wave-stage' });
		this.stage.tabIndex = 0;
		this.stage.setAttr('role', 'slider');
		this.stage.setAttr('aria-label', 'Seek');
		this.stage.setAttr('aria-valuemin', '0');
		this.canvas = this.stage.createEl('canvas', { cls: 'onp-wave-canvas' });
		this.ctx = this.canvas.getContext('2d');
		this.tipEl = this.stage.createDiv({ cls: 'onp-wave-tip' });

		const clock = this.el.createDiv({ cls: 'onp-wave-clock' });
		this.elapsedEl = clock.createSpan({ cls: 'onp-wave-time' });
		this.meterCanvas = clock.createEl('canvas', { cls: 'onp-wave-meter' });
		this.meterCtx = this.meterCanvas.getContext('2d');
		this.remainEl = clock.createSpan({ cls: 'onp-wave-time onp-wave-time--remain' });
		this.remainEl.setAttr('role', 'button');
		this.remainEl.setAttr('title', 'Toggle remaining / total');
		this.remainEl.tabIndex = 0;
		const toggleRemain = () => {
			WaveformProgress.showRemaining = !WaveformProgress.showRemaining;
			this.update(true);
		};
		this.remainEl.addEventListener('click', toggleRemain);
		this.remainEl.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			toggleRemain();
		});

		this.colors = readColors(this.el);
		this.bindStage();
		this.observer = new ResizeObserver((entries) => {
			const rect = entries.at(0)?.contentRect;
			if (rect) this.resize(rect.width, rect.height);
		});
		this.observer.observe(this.canvas);
		this.update(true);
	}

	/** `animate` draws the real waveform in over the placeholder; otherwise it is simply there. */
	setPeaks(peaks: number[], animate: boolean): void {
		this.peaks = peaks;
		this.pooled = resamplePeaks(peaks, barCountFor(this.width));
		this.reveal = animate ? 0 : 1;
		this.revealVel = 0;
		this.schedule();
	}

	refreshColors(): void {
		this.colors = readColors(this.el);
		this.schedule();
	}

	/** Starts the frame loop if playback needs it. */
	sync(): void {
		if (!this.width) {
			const rect = this.canvas.getBoundingClientRect();
			this.resize(rect.width, rect.height);
		}
		this.schedule();
	}

	destroy(): void {
		this.destroyed = true;
		this.observer.disconnect();
		if (this.raf) this.el.win.cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	private bindStage(): void {
		const stage = this.stage;
		const ratioOf = (event: PointerEvent) => {
			const rect = this.canvas.getBoundingClientRect();
			return ratioAt(event.clientX, rect.left, rect.width);
		};
		stage.addEventListener('pointermove', (event) => {
			const ratio = ratioOf(event);
			this.hover = ratio;
			this.tipEl.setText(formatTime(ratio * this.hooks.getDuration()));
			this.tipEl.setCssProps({ '--onp-wave-tip-x': `${(ratio * this.width).toFixed(1)}px` });
			this.tipEl.addClass('is-visible');
			if (this.dragRatio !== null) this.scrubTo(ratio);
			this.schedule();
		});
		stage.addEventListener('pointerleave', () => {
			this.hover = null;
			this.tipEl.removeClass('is-visible');
			this.schedule();
		});
		stage.addEventListener('pointerdown', (event) => {
			stage.setPointerCapture(event.pointerId);
			stage.addClass('is-scrubbing');
			this.scrubTo(ratioOf(event));
		});
		const endScrub = () => {
			this.dragRatio = null;
			stage.removeClass('is-scrubbing');
			this.schedule();
		};
		stage.addEventListener('pointerup', endScrub);
		stage.addEventListener('pointercancel', endScrub);
		stage.addEventListener('keydown', (event) => {
			const jump = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : null;
			const delta = event.key === 'ArrowRight' ? SEEK_STEP_SECONDS : event.key === 'ArrowLeft' ? -SEEK_STEP_SECONDS : 0;
			if (jump === null && !delta) return;
			event.preventDefault();
			this.hooks.seekTo(jump ?? nudgeRatio(this.hooks.getTime(), this.hooks.getDuration(), delta));
			this.schedule();
		});
	}

	private scrubTo(ratio: number): void {
		this.dragRatio = ratio;
		this.hooks.seekTo(ratio);
		this.schedule();
	}

	private resize(width: number, height: number): void {
		if (width < 1 || height < 1) return;
		const dpr = this.el.win.devicePixelRatio || 1;
		this.width = width;
		this.height = height;
		this.canvas.width = Math.round(width * dpr);
		this.canvas.height = Math.round(height * dpr);
		this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		const meter = this.meterCanvas.getBoundingClientRect();
		this.meterCanvas.width = Math.round(meter.width * dpr);
		this.meterCanvas.height = Math.round(meter.height * dpr);
		this.meterCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (this.peaks) this.pooled = resamplePeaks(this.peaks, barCountFor(width));
		this.schedule();
	}

	private schedule(): void {
		if (this.destroyed || this.raf) return;
		this.raf = this.el.win.requestAnimationFrame((now) => this.frame(now));
	}

	private frame(now: number): void {
		this.raf = 0;
		if (this.destroyed || !this.canvas.isShown()) return;
		const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60;
		this.last = now;
		if (this.step(dt, now / 1000)) this.schedule();
		else this.last = 0;
	}

	/** Advances animation state and paints; returns whether another frame is needed. */
	private step(dt: number, t: number): boolean {
		const reduced = this.hooks.reducedMotion();
		const playing = this.hooks.isPlaying();
		let revealing = false;
		if (this.reveal < 1 || Math.abs(this.revealVel) > 0.001) {
			if (reduced) this.reveal = Math.min(1, this.reveal + dt / FADE_SECONDS);
			else [this.reveal, this.revealVel] = springStep(this.reveal, this.revealVel, 1, dt);
			revealing = Math.abs(1 - this.reveal) > 0.002 || Math.abs(this.revealVel) > 0.01;
			if (!revealing) [this.reveal, this.revealVel] = [1, 0];
		}

		const duration = this.hooks.getDuration();
		const time = this.dragRatio !== null ? this.dragRatio * duration : this.hooks.getTime();
		const progress = duration > 0 ? Math.min(time / duration, 1) : 0;

		const slot = Math.min(Math.floor(progress * this.pooled.length), this.pooled.length - 1);
		const target = playing && this.peaks ? (this.pooled[slot] ?? 0) : 0;
		this.level = meterStep(this.level, target, dt);
		this.hold = Math.max(this.level, this.hold - dt * METER_HOLD_FALL);

		this.paint(t, progress, reduced);
		this.update(false, time, duration);
		const shimmer = !this.peaks && !reduced;
		return playing || revealing || shimmer || this.level > 0.01 || this.hold > 0.05;
	}

	private paint(t: number, progress: number, reduced: boolean): void {
		if (!this.ctx || !this.width) return;
		const count = barCountFor(this.width);
		const heights = Array.from({ length: count }, (_, i) => {
			const soft = placeholderHeight(i, reduced ? 0 : t);
			const pooled = this.pooled[i];
			if (!this.peaks || pooled === undefined) return soft;
			const real = pooled;
			const local = reduced ? this.reveal : Math.min(Math.max(this.reveal * 1.6 - (i / count) * 0.6, 0), 1.08);
			return soft + (real - soft) * local;
		});
		drawWave(this.ctx, this.width, this.height, { heights, progress, hover: this.hover, alpha: 1 }, this.colors);
		if (this.meterCtx) {
			const meter = this.meterCanvas.getBoundingClientRect();
			drawMeter(this.meterCtx, meter.width, meter.height, this.level, this.hold, this.colors);
		}
	}

	private update(force: boolean, time = this.hooks.getTime(), duration = this.hooks.getDuration()): void {
		const elapsed = formatTime(time);
		const remain = duration > 0 ? (WaveformProgress.showRemaining ? `-${formatTime(Math.max(duration - time, 0))}` : formatTime(duration)) : '--:--';
		if (force || this.elapsedEl.textContent !== elapsed) this.elapsedEl.setText(elapsed);
		if (force || this.remainEl.textContent !== remain) this.remainEl.setText(remain);
		this.stage.setAttr('aria-valuemax', String(Math.floor(duration)));
		this.stage.setAttr('aria-valuenow', String(Math.floor(time)));
	}
}
