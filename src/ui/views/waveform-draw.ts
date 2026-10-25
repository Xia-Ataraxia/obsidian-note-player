const BAR_WIDTH = 2;
const BAR_STEP = 3.5;
const SEGMENTS = 10;
/** Red is reserved for true clipping so a calm card never flashes an alarm. */
const CLIP_LEVEL = 0.98;

export interface WaveColors {
	played: string;
	rest: string;
	playhead: string;
	ghost: string;
	warn: string;
	clip: string;
}

export interface WaveFrame {
	heights: number[];
	progress: number;
	hover: number | null;
	alpha: number;
}

export function barCountFor(width: number): number {
	return Math.max(1, Math.floor(width / BAR_STEP));
}

/** Theme variables resolve at draw time; call again on `css-change`. */
export function readColors(el: HTMLElement): WaveColors {
	const style = el.win.getComputedStyle(el);
	const read = (name: string) => style.getPropertyValue(name).trim();
	return {
		played: read('--interactive-accent'),
		rest: read('--text-muted'),
		playhead: read('--text-normal'),
		ghost: read('--text-muted'),
		warn: read('--color-yellow'),
		clip: read('--color-red'),
	};
}

export function drawWave(ctx: CanvasRenderingContext2D, width: number, height: number, frame: WaveFrame, colors: WaveColors): void {
	ctx.clearRect(0, 0, width, height);
	const mid = height / 2;
	const count = frame.heights.length;
	const offset = (width - (count * BAR_STEP - (BAR_STEP - BAR_WIDTH))) / 2;
	ctx.globalAlpha = frame.alpha;
	for (let i = 0; i < count; i++) {
		const x = offset + i * BAR_STEP;
		const half = Math.max(1.5, Math.min(1, frame.heights[i] ?? 0) * (mid - 1));
		const played = (x + BAR_WIDTH / 2) / width <= frame.progress;
		ctx.globalAlpha = frame.alpha * (played ? 1 : 0.4);
		ctx.fillStyle = played ? colors.played : colors.rest;
		ctx.beginPath();
		ctx.roundRect(x, mid - half, BAR_WIDTH, half * 2, 1);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
	if (frame.hover !== null) line(ctx, frame.hover * width, height, 1, colors.ghost, 0.7);
	line(ctx, frame.progress * width, height, 1.5, colors.playhead, 1);
}

function line(ctx: CanvasRenderingContext2D, x: number, height: number, thickness: number, color: string, alpha: number): void {
	ctx.globalAlpha = alpha;
	ctx.fillStyle = color;
	ctx.fillRect(Math.max(x - thickness / 2, 0), 0, thickness, height);
	ctx.globalAlpha = 1;
}

/** Segmented console ladder: accent, then yellow, then red near the top. */
export function drawMeter(ctx: CanvasRenderingContext2D, width: number, height: number, level: number, hold: number, colors: WaveColors): void {
	ctx.clearRect(0, 0, width, height);
	const pitch = width / SEGMENTS;
	for (let i = 0; i < SEGMENTS; i++) {
		const clip = i === SEGMENTS - 1;
		const lit = clip ? level > CLIP_LEVEL : (i + 0.5) / SEGMENTS <= level;
		const isHold = Math.min(Math.floor(hold * SEGMENTS), clip ? SEGMENTS - 1 : SEGMENTS - 2) === i && hold > 0.05 && (!clip || hold > CLIP_LEVEL);
		ctx.globalAlpha = lit || isHold ? 1 : 0.22;
		ctx.fillStyle = clip ? colors.clip : i >= SEGMENTS - 3 ? colors.warn : colors.played;
		ctx.beginPath();
		ctx.roundRect(i * pitch, 0, pitch - 1.5, height, 1);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}
