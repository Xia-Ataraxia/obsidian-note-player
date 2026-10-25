import {
	AbstractInputSuggest,
	App,
	Plugin,
	PluginSettingTab,
	type Setting,
	type SettingDefinitionItem,
} from 'obsidian';
import { DEFAULT_PROPERTY_MAPPING } from '../domain/config';
import { parsePropertyList } from '../utils/property-list';
import type { AudioFormat } from '../types/audio';
import type { NotePlayerSettings } from '../types/settings';

interface SettingsHost extends Plugin {
	settings: NotePlayerSettings;
	saveSettings(): Promise<void>;
	refresh(showNotice?: boolean): Promise<void>;
	refreshCompanionBases(): Promise<void>;
}

type ListKey = 'musicUrlProperties' | 'musicThumbnailProperties' | 'musicArtistProperties';
type TextKey =
	| 'playlistFolder'
	| 'playlistTrackProperty'
	| 'playlistDescriptionProperty'
	| 'playlistCoverProperty'
	| 'musicNoteType'
	| 'playlistNoteType';

const LIST_KEYS: readonly string[] = ['musicUrlProperties', 'musicThumbnailProperties', 'musicArtistProperties'];
const NO_REFRESH_KEYS: readonly string[] = ['audioFormat', 'autoOpenOnStartup', 'musicFolder', 'turntableSounds'];
const AUDIO_FORMAT_OPTIONS: Record<AudioFormat, string> = { mp3: 'MP3', wav: 'WAV', opus: 'OPUS', aac: 'AAC' };

function collectVaultProperties(app: App): string[] {
	const properties = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.frontmatter) {
			for (const key of Object.keys(cache.frontmatter)) {
				if (key !== 'position') properties.add(key);
			}
		}
	}
	return [...properties].sort();
}

class PropertySuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		private readonly inputEl: HTMLInputElement,
		private readonly list: boolean,
	) {
		super(app, inputEl);
	}

	getSuggestions(query: string): string[] {
		const token = (this.list ? query.split(',').pop() ?? '' : query).trim().toLowerCase();
		return collectVaultProperties(this.app).filter((p) => p.toLowerCase().includes(token));
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		if (this.list) {
			const parts = this.inputEl.value.split(',');
			parts[parts.length - 1] = ' ' + value;
			this.inputEl.value = parts.join(',').replace(/^,\s*/, '');
		} else {
			this.inputEl.value = value;
		}
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
	}
}

export class NotePlayerSettingsTab extends PluginSettingTab {
	constructor(app: App, private readonly host: SettingsHost) {
		super(app, host);
	}

	getControlValue(key: string): unknown {
		const value: unknown = this.host.settings[key as keyof NotePlayerSettings];
		return LIST_KEYS.includes(key) && Array.isArray(value) ? value.join(', ') : value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const next = LIST_KEYS.includes(key) ? parsePropertyList(String(value)) : typeof value === 'string' ? value.trim() : value;
		Object.assign(this.host.settings, { [key]: next });
		await this.host.saveSettings();
		if (!NO_REFRESH_KEYS.includes(key)) await this.host.refresh();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Playlist folder',
				desc: 'Vault folder where new playlist notes are created.',
				control: { type: 'folder', key: 'playlistFolder', placeholder: '90. System/playlists' },
			},
			{
				name: 'Music folder',
				desc: 'Vault folder for notes created from pasted YouTube URLs. Leave empty to use the default location for new notes.',
				control: { type: 'folder', key: 'musicFolder', placeholder: 'Default location' },
			},
			{
				type: 'group',
				heading: 'Music note mapping',
				items: [
					this.propertyRow('URL properties', 'Comma-separated priority order for the YouTube URL property.', 'musicUrlProperties'),
					this.propertyRow('Thumbnail properties', 'Comma-separated priority order for music-note artwork lookup.', 'musicThumbnailProperties'),
					this.propertyRow('Artist properties', 'Comma-separated priority order for artist or author metadata.', 'musicArtistProperties'),
				],
			},
			{
				type: 'group',
				heading: 'Playlist note schema',
				items: [
					this.propertyRow('Track list property', 'Frontmatter key that stores the ordered track refs for each playlist note.', 'playlistTrackProperty'),
					this.propertyRow('Description property', 'Frontmatter key used for playlist description text.', 'playlistDescriptionProperty'),
					this.propertyRow('Cover property', 'Frontmatter key used for playlist cover artwork.', 'playlistCoverProperty'),
					{
						name: 'Music note type',
						desc: 'The frontmatter type value used to identify music notes.',
						control: { type: 'text', key: 'musicNoteType', placeholder: DEFAULT_PROPERTY_MAPPING.musicNoteType },
					},
					{
						name: 'Playlist note type',
						desc: 'The frontmatter type value used to identify playlist notes.',
						control: { type: 'text', key: 'playlistNoteType', placeholder: DEFAULT_PROPERTY_MAPPING.playlistNoteType },
					},
				],
			},
			{
				type: 'group',
				heading: 'Companion bases',
				items: [
					{
						name: 'Refresh companion bases files',
						desc: 'Rewrite music.base and playlists.base beside your playlist folder to match the current mapping. The first property of each music-note mapping list becomes its bases column.',
						render: (setting) => {
							setting.addButton((button) =>
								button.setButtonText('Refresh bases').onClick(() => {
									void this.host.refreshCompanionBases();
								}),
							);
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Playback',
				items: [
					{
						name: 'Audio format',
						desc: 'The format used when downloading audio via yt-dlp.',
						control: { type: 'dropdown', key: 'audioFormat', options: AUDIO_FORMAT_OPTIONS },
					},
					{
						name: 'Autoplay next track',
						desc: 'Advance to the next queued track when the player reports the current track ended.',
						control: { type: 'toggle', key: 'autoplayEnabled' },
					},
					{
						name: 'Turntable sounds',
						desc: 'Play a synthesized needle drop, lift, and vinyl crackle with the turntable animation.',
						control: { type: 'toggle', key: 'turntableSounds' },
					},
					{
						name: 'Open on startup',
						desc: 'Open the playlist view automatically when Obsidian finishes loading.',
						control: { type: 'toggle', key: 'autoOpenOnStartup' },
					},
				],
			},
		];
	}

	private propertyRow(name: string, desc: string, key: ListKey | TextKey) {
		const list = LIST_KEYS.includes(key);
		const placeholder = list ? DEFAULT_PROPERTY_MAPPING[key as ListKey].join(', ') : DEFAULT_PROPERTY_MAPPING[key as keyof typeof DEFAULT_PROPERTY_MAPPING];
		return {
			name,
			desc,
			render: (setting: Setting) => {
				setting.addText((text) => {
					text
						.setPlaceholder(String(placeholder))
						.setValue(String(this.getControlValue(key)))
						.onChange((value) => { void this.setControlValue(key, value); });
					new PropertySuggest(this.app, text.inputEl, list);
				});
			},
		};
	}
}
