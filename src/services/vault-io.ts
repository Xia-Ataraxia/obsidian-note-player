import { normalizePath, TFile, TFolder, type App } from 'obsidian';
import type { CompanionBaseFile } from '../domain/base-files';
import type { MarkdownNoteSnapshot } from '../types/notes';

export async function ensureFolder(app: App, folderPath: string): Promise<void> {
	let current = '';
	for (const segment of folderPath.split('/').filter(Boolean)) {
		current = current ? `${current}/${segment}` : segment;
		if (!app.vault.getAbstractFileByPath(current)) {
			await app.vault.createFolder(current);
		}
	}
}

export function getAvailablePath(app: App, folder: string, baseName: string): string {
	let attempt = normalizePath(`${folder}/${baseName}.md`);
	let index = 2;

	while (app.vault.getAbstractFileByPath(attempt)) {
		attempt = normalizePath(`${folder}/${baseName} ${index}.md`);
		index += 1;
	}

	return attempt;
}

/** Resolves once the metadata cache has parsed a freshly written note, or after `timeoutMs`. */
export function waitForMetadata(app: App, file: TFile, timeoutMs = 2000): Promise<void> {
	if (app.metadataCache.getFileCache(file)?.frontmatter) return Promise.resolve();
	return nextMetadataChange(app, file, timeoutMs);
}

function nextMetadataChange(app: App, file: TFile, timeoutMs = 2000): Promise<void> {
	const { metadataCache } = app;
	return new Promise((resolve) => {
		const done = () => {
			window.clearTimeout(timer);
			metadataCache.offref(ref);
			resolve();
		};
		const ref = metadataCache.on('changed', (changed) => { if (changed.path === file.path) done(); });
		const timer = window.setTimeout(done, timeoutMs);
	});
}

/** Edits only the given frontmatter keys; resolves once the metadata cache has re-parsed the note. */
export async function updateFrontmatter(app: App, path: string, edit: (frontmatter: Record<string, unknown>) => void): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		throw new Error(`File not found: ${path}`);
	}
	const parsed = nextMetadataChange(app, file);
	let changed = false;
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		const before = JSON.stringify(frontmatter);
		edit(frontmatter);
		changed = JSON.stringify(frontmatter) !== before;
	});
	if (changed) await parsed;
}

export async function openNoteInTab(app: App, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		await app.workspace.getLeaf('tab').openFile(file);
	}
}

export async function writeBaseFiles(app: App, baseFiles: CompanionBaseFile[]): Promise<void> {
	for (const baseFile of baseFiles) {
		const filePath = normalizePath(baseFile.path);
		const existing = app.vault.getAbstractFileByPath(filePath);

		if (existing instanceof TFile) {
			await app.vault.modify(existing, baseFile.content);
			continue;
		}

		if (existing) {
			throw new Error(`Unable to write base file at ${filePath}`);
		}

		await ensureFolder(app, filePath.slice(0, Math.max(filePath.lastIndexOf('/'), 0)));
		await app.vault.create(filePath, baseFile.content);
	}
}

/** Walks the music folder's own children, never the whole vault. */
export function collectMusicFiles(app: App, musicFolder: string): TFile[] {
	const root = app.vault.getFolderByPath(normalizePath(musicFolder || app.fileManager.getNewFileParent('').path));
	const files: TFile[] = [];
	const visit = (folder: TFolder): void => {
		for (const child of folder.children) {
			if (child instanceof TFolder) visit(child);
			else if (child instanceof TFile && child.extension === 'md') files.push(child);
		}
	};
	if (root) visit(root);
	return files;
}

export function collectNoteSnapshots(app: App, musicFolder: string): MarkdownNoteSnapshot[] {
	return collectMusicFiles(app, musicFolder).map((file) => ({
		path: file.path,
		basename: file.basename,
		frontmatter: app.metadataCache.getFileCache(file)?.frontmatter,
	}));
}
