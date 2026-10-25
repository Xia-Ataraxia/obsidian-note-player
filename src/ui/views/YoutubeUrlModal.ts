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
			.setDesc('A video or playlist link. The note is created from YouTube metadata.')
			.addText((text) => {
				this.input = text;
				text.setPlaceholder('Paste a link');
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') this.submit();
				});
				text.inputEl.focus();
				void this.prefillFromClipboard(text);
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

	private async prefillFromClipboard(text: TextComponent): Promise<void> {
		try {
			const clip = (await navigator.clipboard.readText()).trim();
			if (parseYoutubeUrl(clip) && !text.getValue()) {
				text.setValue(clip);
				text.inputEl.select();
			}
		} catch {
			// clipboard access denied; leave the field empty
		}
	}
}
