import { App, ButtonComponent, Modal, Setting, TextComponent } from 'obsidian';
import { parseYoutubeUrl } from '../../utils/youtube';

/** Typing stays calm; a still-invalid value turns red after this pause. */
const IDLE_ERROR_MS = 600;

export class YoutubeUrlModal extends Modal {
	private input: TextComponent | null = null;
	private addButton: ButtonComponent | null = null;
	private hintEl: HTMLElement | null = null;
	private idleTimer: number | null = null;

	constructor(
		app: App,
		private readonly onSubmit: (value: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		new Setting(contentEl).setHeading().setName('Add YouTube URL to playlist');

		new Setting(contentEl)
			.setName('YouTube URL')
			.setDesc('Paste a video or playlist link. It is added right away.')
			.addText((text) => {
				this.input = text;
				text.setPlaceholder('Paste a YouTube URL');
				text.onChange(() => this.refresh());
				text.inputEl.addEventListener('blur', () => this.flagInvalid(false));
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') this.submit();
				});
				this.registerPasteSubmit(text);
				text.inputEl.focus();
			});

		this.hintEl = contentEl.createDiv({ cls: 'onp-url-hint' });
		this.hintEl.setAttr('role', 'status');

		new Setting(contentEl)
			.addButton((button) => {
				this.addButton = button;
				button.setButtonText('Add').setCta().onClick(() => this.submit());
			})
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()));
		this.refresh();
	}

	/** Add stays off until the text is a YouTube link; a non-empty miss explains itself inline. */
	private refresh(): void {
		const value = this.input?.getValue().trim() ?? '';
		const valid = parseYoutubeUrl(value) !== null;
		this.addButton?.setDisabled(!valid);
		this.hintEl?.setText(value && !valid ? 'Not a YouTube video or playlist URL.' : '');
		this.hintEl?.toggleClass('is-visible', value !== '' && !valid);
		this.clearIdle();
		this.hintEl?.removeClass('is-error');
		if (value && !valid) this.idleTimer = window.setTimeout(() => this.flagInvalid(false), IDLE_ERROR_MS);
	}

	private clearIdle(): void {
		if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}

	/** Muted while typing; red once the user leaves the field or presses Enter on a miss. */
	private flagInvalid(pulse: boolean): void {
		const hint = this.hintEl;
		if (!hint?.hasClass('is-visible')) {
			if (pulse && hint) hint.setText('Paste a YouTube video or playlist URL.');
			if (!pulse) return;
			hint?.addClass('is-visible');
		}
		hint?.addClass('is-error');
		if (!pulse) return;
		hint?.removeClass('is-pulse');
		void hint?.offsetWidth;
		hint?.addClass('is-pulse');
		hint?.addEventListener('animationend', () => hint.removeClass('is-pulse'), { once: true });
	}

	onClose(): void {
		this.clearIdle();
		this.contentEl.empty();
	}

	private submit(): void {
		const value = this.input?.getValue().trim() ?? '';
		if (!parseYoutubeUrl(value)) {
			this.flagInvalid(true);
			return;
		}
		this.close();
		this.onSubmit(value);
	}

	/** Cmd+V of a YouTube URL submits at once; the user's own paste needs no clipboard permission. */
	private registerPasteSubmit(text: TextComponent): void {
		text.inputEl.addEventListener('paste', (event) => {
			const pasted = event.clipboardData?.getData('text').trim() ?? '';
			if (!parseYoutubeUrl(pasted)) return;
			event.preventDefault();
			text.setValue(pasted);
			this.submit();
		});
	}
}
