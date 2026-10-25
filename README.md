# Note Player

Play YouTube audio from playlists that are plain Obsidian notes. Each track is a Markdown note, each playlist is a note listing tracks, and a turntable-style player plays them without leaving your vault.

![License: MIT](https://img.shields.io/badge/license-MIT-green) ![Desktop only](https://img.shields.io/badge/platform-desktop--only-gray)

## Features

- Playlists and tracks are notes with frontmatter, so they work with links, properties, and Bases.
- Add a track from a YouTube URL; the note is created with the title, channel, and thumbnail.
- Audio is downloaded once with yt-dlp and cached locally for instant playback.
- Play local audio files from your vault.
- Turntable now-playing card with optional needle and crackle sounds.
- Queue, repeat-one, autoplay, and a persistent selection between sessions.
- Companion `Music.base` and `Playlists.base` views.

## Requirements

Desktop only (Obsidian 1.13.0 or later). Downloading audio needs two command-line tools on your `PATH`:

- [yt-dlp](https://github.com/yt-dlp/yt-dlp), for downloading and for expanding playlist links
- [ffmpeg](https://ffmpeg.org), which yt-dlp uses to convert audio to MP3 or WAV

```bash
brew install yt-dlp ffmpeg   # macOS; use your package manager elsewhere
```

## Installation

From the Community plugins browser, search for **Note Player**, then install and enable it.

Manual: download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Xia-Ataraxia/obsidian-note-player/releases/latest), copy them into `<vault>/<config folder>/plugins/note-player/`, then enable the plugin.

## Usage

### Add a track by YouTube URL

Copy a YouTube link, then do any one of these:

- Run the command **Add YouTube URL to playlist** and paste it into the modal.
- Click the link button in the player toolbar.
- Paste straight into the player view.

The track note is created in the **Music folder** setting (or Obsidian's default location for new notes) and appended to the selected playlist. If no playlist exists, one named `Inbox` is created. A video that is already in the library reuses its note. A YouTube playlist link adds every video in it, using yt-dlp.

### Playlist notes

A playlist is a note with `type: playlist` and a `tracks` property listing links to track notes. A track note has `type: music` and a YouTube URL in the `youtube` or `url` property. Property names and note types are configurable in settings.

### Player

Open it from the ribbon icon or the **Open player view** command. Other commands:

- **Refresh music library**
- **Load active playlist note into player**
- **Add active note to selected playlist**
- **Create or refresh companion bases files**

### Turntable

The now-playing card shows a spinning record with a tonearm. Starting playback lowers the needle with a synthesized drop and vinyl crackle; pausing lifts it with a soft tick. The sounds are generated with Web Audio (no audio files are bundled) and follow the player volume. Turn them off with **Turntable sounds** in settings. With reduced motion enabled the record stays still.

## Settings

Playlist folder, music folder, property mapping for URL, thumbnail, and artist, playlist schema (track list, description, cover, note types), audio format (MP3 or WAV), autoplay, open on startup, and **Turntable sounds**.

## Network use and storage

- Adding a track sends its video URL to `youtube.com/oembed` (through Obsidian's `requestUrl`) to read the title, channel, and thumbnail. No API key is used.
- Thumbnails load from `img.youtube.com`.
- Audio downloads and playlist expansion run yt-dlp on your machine, which contacts YouTube.
- Nothing else is contacted, and there is no telemetry.
- Downloaded audio is cached in `<vault>/<config folder>/plugins/note-player/audio-cache`. Delete the folder to clear it.

## Troubleshooting

- **yt-dlp not found:** confirm `yt-dlp --version` works in a terminal and that its folder is on your `PATH`.
- **Audio not playing:** confirm ffmpeg is installed and the video is publicly accessible, then run **Refresh music library**.
- **Playlist missing:** check that the note's `type` matches the playlist note type in settings.

## Development

```bash
bun install
bun run dev    # watch build into dist/
bun run ci     # build, typecheck, lint, test
```

Releases are cut by CI only.

## License

MIT. See [LICENSE](LICENSE). Author: [Beomsu Koh](https://beromkoh.medium.com).
