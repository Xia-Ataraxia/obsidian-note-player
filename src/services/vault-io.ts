import { normalizePath, TFile, type App } from 'obsidian';
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

/** Resolves after the metadata cache has re-parsed the note, so the next read never sees the old frontmatter. */
export async function rewriteNote(app: App, path: string, transform: (existing: string) => string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		throw new Error(`File not found: ${path}`);
	}
	const existing = await app.vault.read(file);
	const next = transform(existing);
	if (next === existing) return;
	const parsed = nextMetadataChange(app, file);
	await app.vault.modify(file, next);
	await parsed;
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

export function collectNoteSnapshots(app: App): MarkdownNoteSnapshot[] {
	return app.vault.getMarkdownFiles().map((file) => ({
		path: file.path,
		basename: file.basename,
		frontmatter: app.metadataCache.getFileCache(file)?.frontmatter,
	}));
}
