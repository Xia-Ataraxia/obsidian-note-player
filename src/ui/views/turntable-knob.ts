import { dragLevel, knobAngle, lampDim } from '../../domain/knob';

const KEY_STEP = 0.05;

/** The slice of the volume model the knob drives; the view's volume port satisfies it. */
export interface KnobPort {
  getState(): { level: number; muted: boolean };
  setVolume(level: number): void;
  step(delta: number): void;
  wheel(event: { deltaY: number; deltaMode: number }): void;
  subscribe(listener: () => void): () => void;
}

interface KnobDrag {
  pointerId: number;
  startY: number;
  startLevel: number;
}

/** Knurled aluminium volume knob. Drag up or down, scroll over it, or use the arrow keys. */
export class VolumeKnob {
  private readonly el: HTMLElement;
  private readonly cap: HTMLElement;
  private drag: KnobDrag | null = null;
  private readonly unsubscribe: () => void;

  constructor(scene: HTMLElement, private readonly port: KnobPort) {
    this.el = scene.createDiv({
      cls: 'onp-knob',
      attr: { role: 'slider', tabindex: '0', 'aria-label': 'Volume', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    });
    this.el.createDiv({ cls: 'onp-knob-side' });
    this.cap = this.el.createDiv({ cls: 'onp-knob-cap' });
    this.cap.createDiv({ cls: 'onp-knob-grip' });
    this.cap.createDiv({ cls: 'onp-knob-mark' });
    this.el.addEventListener('pointerdown', (e) => this.grab(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.el.addEventListener(type, () => this.release());
    }
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.port.wheel(e);
    }, { passive: false });
    this.el.addEventListener('keydown', (e) => this.key(e));
    this.unsubscribe = port.subscribe(() => this.paint());
    this.paint();
  }

  destroy(): void {
    this.unsubscribe();
    this.el.remove();
  }

  private grab(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this.el.focus({ preventScroll: true });
    this.el.setPointerCapture(e.pointerId);
    this.drag = { pointerId: e.pointerId, startY: e.clientY, startLevel: this.port.getState().level };
    this.el.addClass('is-turning');
  }

  private move(e: PointerEvent): void {
    const drag = this.drag;
    if (drag && e.pointerId === drag.pointerId) this.port.setVolume(dragLevel(drag.startLevel, e.clientY - drag.startY));
  }

  private release(): void {
    this.drag = null;
    this.el.removeClass('is-turning');
  }

  private key(e: KeyboardEvent): void {
    const delta = { ArrowUp: KEY_STEP, ArrowRight: KEY_STEP, ArrowDown: -KEY_STEP, ArrowLeft: -KEY_STEP }[e.key];
    if (delta !== undefined) this.port.step(delta);
    else if (e.key === 'Home') this.port.setVolume(0);
    else if (e.key === 'End') this.port.setVolume(1);
    else return;
    e.preventDefault();
  }

  private paint(): void {
    const { level, muted } = this.port.getState();
    this.el.setCssProps({ '--onp-knob': `${knobAngle(muted ? 0 : level).toFixed(1)}deg` });
    this.el.setAttribute('aria-valuenow', String(Math.round((muted ? 0 : level) * 100)));
    this.el.closest('.onp-turntable')?.toggleClass('is-quiet', lampDim(level, muted));
  }
}
