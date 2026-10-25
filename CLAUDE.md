# Note Player

Obsidian plugin (`note-player`): plays YouTube-linked music notes via locally cached yt-dlp audio. Root `AGENTS.md` rules apply.

## Commands
`bun run dev` (watch to `dist/`), `bun run ci` (build, typecheck, lint, test). Required PR check: `ci / report`. Releases are CI-only.

## Architecture
- `src/domain/`, `src/types/`, `src/utils/`: pure, no `obsidian` imports (lint-enforced). yt-dlp output parsing lives in `domain/ytdlp.ts`.
- `src/services/`: I/O (`audio-cache.ts` spawns yt-dlp; `vault-io.ts` vault reads/writes).
- `src/ui/`: commands, settings (`getSettingDefinitions`), notices, player wiring (`player-setup.ts`).
- `src/ui/views/`: `NotePlayerView` orchestrates; `queue-list`, `view-menus`, `view-parts` render pieces.
- `src/main.ts`: lifecycle and wiring only; keep it under 500 LOC.

## Gotchas
- Never change manifest `id`.
- Audio cache lives in `<manifest.dir>/audio-cache`; `adoptLegacyCache` moves files from the old `plugins/obsidian-note-player` dir.
- The view re-renders everything on each state change; `playerHostEl` is detached before `playerPanel.empty()` and re-attached. Never call `playerSurface.clear()` unconditionally in render (loops).
- Requires yt-dlp on the user's machine (desktop only).
- `minAppVersion` 1.13.0 is required by declarative settings.
