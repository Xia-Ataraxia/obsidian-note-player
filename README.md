# Note Player

**Your notes are your playlist.** Turn any Obsidian note into a music playlist—add YouTube links, play them as audio inside your vault, and keep your music library where your knowledge lives.

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE) [![Release](https://img.shields.io/github/v/release/Xia-Ataraxia/obsidian-note-player)](https://github.com/Xia-Ataraxia/obsidian-note-player/releases/latest) ![Desktop Only](https://img.shields.io/badge/platform-desktop--only-gray)

## Features

Most music players live in isolation. Obsidian Note Player bridges the gap: your playlists are just Markdown notes. Add YouTube URLs, organize them with your thoughts and metadata, and play them without leaving your vault. It's a minimal, focused audio experience powered by yt-dlp and local caching—no embedded videos, no distractions, just your music.

- **Turn notes into playlists** — Use Obsidian's native embed syntax (`![]()`) to add YouTube URLs
- **Minimal audio player** — Pure audio-focused interface, not a video embed
- **Local audio caching** — Downloaded audio is cached locally via yt-dlp for instant playback
- **Local file support** — Play audio files stored in your vault or elsewhere
- **Note-backed library** — Your music lives in Markdown alongside your knowledge
- **Persistent queue** — Your current selection survives between sessions
- **Companion Bases** — Auto-generate Music and Playlist database views for organization
- **Flexible schema** — Customize frontmatter properties for URLs, artist, cover art, and more

## Installation

### Requirements

**Desktop only.** Obsidian Note Player requires:

- **Obsidian** 0.15.0 or later
- **yt-dlp** installed on your system — for downloading audio from YouTube

Install yt-dlp:
```bash
# macOS (via Homebrew)
brew install yt-dlp

# Linux (via apt)
sudo apt install yt-dlp

# Windows (via Chocolatey)
choco install yt-dlp

# Or via pip (any platform)
pip install yt-dlp
```


### From Community Plugin Browser (Coming Soon)

Obsidian Note Player is in review for the community plugin store. For now, use BRAT or manual installation.

### From BRAT (Beta Releases for Obsidian)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Go to **Settings > BRAT > Add a beta plugin**
3. Paste: `https://github.com/Xia-Ataraxia/obsidian-note-player`
4. Click **Add plugin**
5. Enable **Obsidian Note Player** in **Settings > Community Plugins**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Xia-Ataraxia/obsidian-note-player/releases/latest)
2. Create `.obsidian/plugins/note-player/` in your vault root
3. Copy the three files into that directory
4. Restart Obsidian or reload plugins
5. Enable **Obsidian Note Player** in **Settings > Community Plugins**

## Usage

### Create a Playlist Note

A playlist note is a regular Markdown file with YouTube URLs embedded using Obsidian's syntax:

```markdown
---
type: playlist
tracks:
  - youtube-url-1
  - youtube-url-2
---

# My Favorite Songs

![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
![](https://www.youtube.com/watch?v=9bZkp7q19f0)
```

The plugin scans notes for embeds and automatically builds your library. Each note can be a playlist, or notes with YouTube URLs become individual tracks in your music library.

**Customize with frontmatter:**
```yaml
---
type: playlist
cover: https://example.com/cover.jpg
description: A curated collection of favorites
tracks:
  - youtube-url-1
  - youtube-url-2
---
```

### Open the Player

1. Click the **play icon** in the Obsidian ribbon (left sidebar)
2. Or use the command: **Open Note Player**

The player panel opens in a sidebar tab. Your library appears automatically.

### Add a Track from a YouTube URL

Copy a YouTube link and either run **Add YouTube URL to playlist**, click the link button in the player toolbar, or paste straight into the player view. The note is created in the **Music folder** (or Obsidian's default location for new notes) with the title and channel from YouTube, then appended to the selected playlist. A playlist is created (`Inbox`) when none exists. Duplicate videos reuse the existing note. Playlist links add every video (requires yt-dlp).

### Turntable

The now-playing card shows a spinning record with a tonearm. Starting playback lowers the needle with a synthesized drop and vinyl crackle; pausing lifts it with a soft tick. Sounds are generated locally with Web Audio (no audio files) and follow the player volume. Disable them with **Turntable sounds** in settings. With reduced motion enabled the record stays still; sounds are unaffected.

### Player Controls

- **Play/Pause** — Click the play button or press spacebar
- **Next/Previous** — Click arrow buttons or use arrow keys
- **Seek** — Click the progress bar or drag the slider
- **Queue** — Click any track in the queue to play it
- **Repeat** — Toggle repeat modes: Off, Repeat One
- **Autoplay** — Continue to next track automatically

### Player Commands

Use Obsidian's command palette (`Cmd/Ctrl + P`) for quick actions:

- **Open Note Player** — Show the player panel
- **Refresh music library** — Rescan all notes for YouTube links
- **Load active playlist note** — Load the currently viewed note as a playlist
- **Add YouTube URL to playlist** — Create a music note from a link and add it
- **Add active note to selected playlist** — Add the current note's URLs to a playlist
- **Create or refresh companion Bases** — Generate database views

### Organize with Companion Bases

The plugin can generate **Music.base** and **Playlists.base** files—Obsidian database views that let you browse, sort, and organize your music library.

Run: **Create or refresh companion Bases** from the command palette.

Two files appear in your playlist folder:
- **Music.base** — All music tracks with artist, thumbnail, and properties
- **Playlists.base** — All playlists with track count and metadata

### Configuration

Open **Settings > Obsidian Note Player** to customize:

#### Folder Structure

**Playlist folder** — Where new playlists are created (default: empty = vault root).

**Music folder** — Where notes created from YouTube URLs are saved (default: empty = Obsidian's default location for new notes).

#### Music Note Mapping

Define which frontmatter properties the plugin reads:

- **URL properties** — Priority-ordered properties to find YouTube URLs (default: `youtube`, `url`)
- **Thumbnail properties** — Where to look for cover artwork (default: `thumbnail`, `cover`)
- **Artist properties** — Where to find artist/author metadata (default: `artist`, `author`)

#### Playlist Schema

Customize the frontmatter structure used in playlist notes:

- **Track list property** — Frontmatter key storing ordered track references (default: `tracks`)
- **Description property** — For playlist descriptions (default: `description`)
- **Cover property** — For playlist cover images (default: `cover`)
- **Music note type** — Frontmatter `type` value for music notes (default: `music`)
- **Playlist note type** — Frontmatter `type` value for playlists (default: `playlist`)

#### Playback

- **Auto-open on startup** — Open the player when Obsidian launches
- **Audio format** — Choose between MP3 and WAV for cached files
- **Repeat mode** — Default repeat behavior (Off or Repeat One)
- **Autoplay** — Automatically play next track when current track ends
- **Turntable sounds** — Needle drop, lift, and crackle sounds (default: on)

### Troubleshooting

#### "yt-dlp not found" error

The plugin cannot find `yt-dlp` on your system. Make sure it's installed and in your PATH:

```bash
# Test if yt-dlp is installed
which yt-dlp
# or
yt-dlp --version
```

If not installed, see the [Requirements](#requirements) section.

#### Audio not playing

- Ensure yt-dlp is installed and working
- Check that YouTube URLs are valid and publicly accessible
- Try **Refresh music library** from the command palette
- Enable **Debug mode** in settings and check the console for errors

#### Playlist not appearing

- Verify the note contains valid YouTube URLs with Obsidian's embed syntax: `![](url)`
- Check frontmatter `type: playlist` matches your settings
- Run **Refresh music library** to force a rescan

#### Permission errors on audio cache

Ensure the plugin has write access to your vault directory. On some systems, the audio cache folder may need explicit permissions:

```bash
chmod -R u+w .obsidian/plugins/note-player/
```

### Privacy

Obsidian Note Player stores downloaded audio locally on your device. No audio is sent to external servers beyond YouTube for the initial download via yt-dlp.

#### Network use

- When you add a track by URL, the video URL is sent to `youtube.com/oembed` to read its title, channel, and thumbnail. No API key is used.
- Thumbnails are loaded from `img.youtube.com`.
- Playlist links and audio downloads run through yt-dlp, which contacts YouTube.
- Nothing else is contacted.

## Development

```bash
git clone https://github.com/Xia-Ataraxia/obsidian-note-player.git
cd obsidian-note-player
bun install
bun run dev         # watch build into dist/
bun run ci          # build + typecheck + lint + test
```

For manual install, copy `dist/main.js`, `manifest.json`, and `styles.css` into `<vault>/<config dir>/plugins/note-player/`.

Releases are cut by CI only.

Issues and pull requests are welcome on [GitHub](https://github.com/Xia-Ataraxia/obsidian-note-player).

## License

MIT — See [LICENSE](LICENSE) for details.

Author: [Beomsu Koh](https://beromkoh.medium.com)
