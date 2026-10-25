import type { App } from 'obsidian';
import { buildCompanionBaseFiles } from '../domain/base-files';
import type { NotePlayerSettings } from '../types/settings';
import { showNotice } from '../ui/notices';
import { openNoteInTab, writeBaseFiles } from './vault-io';

export async function writeCompanionBaseFiles(app: App, settings: NotePlayerSettings, shouldNotify: boolean): Promise<void> {
  const baseFiles = buildCompanionBaseFiles(settings.playlistFolder, settings);

  await writeBaseFiles(app, baseFiles);

  if (shouldNotify) {
    const firstFile = baseFiles[0]?.path ?? '';
    const folder = firstFile.includes('/') ? firstFile.slice(0, firstFile.lastIndexOf('/')) : '/';
    showNotice('bases_refreshed', {
      count: baseFiles.length,
      folder: folder || '/',
    });
  }
}

export async function openCompanionBase(app: App, settings: NotePlayerSettings, fileName: string): Promise<void> {
  const match = buildCompanionBaseFiles(settings.playlistFolder, settings).find((file) =>
    file.path === fileName || file.path.endsWith(`/${fileName}`),
  );
  const filePath = match?.path ?? fileName;
  if (!app.vault.getAbstractFileByPath(filePath)) {
    await writeCompanionBaseFiles(app, settings, false);
  }
  if (!app.vault.getAbstractFileByPath(filePath)) {
    throw new Error(`Base file not found: ${filePath}`);
  }

  await openNoteInTab(app, filePath);
}
