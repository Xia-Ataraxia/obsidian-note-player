import { App, Modal, Setting, TextComponent } from 'obsidian';
import { parseYoutubeUrl } from '../../utils/youtube';
import { showNotice } from '../notices';

export class YoutubeUrlModal extends Modal {
	private input: TextComponent | null = null;

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
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') this.submit();
				});
				this.registerPasteSubmit(text);
				text.inputEl.focus();
			});

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('Add').setCta().onClick(() => this.submit()))
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const value = this.input?.getValue().trim() ?? '';
		if (!parseYoutubeUrl(value)) {
			showNotice('invalid_youtube_url');
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
