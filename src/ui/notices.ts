import { Notice } from 'obsidian';
import { NOTICE_CATALOG, renderNotice, type NoticeId } from '../domain/notices';

export function showNotice(id: NoticeId, params?: Record<string, string | number>): void {
	new Notice(renderNotice(NOTICE_CATALOG[id].template, params));
}
