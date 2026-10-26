const PROGRESS_PATTERN = /\[download\]\s+([\d.]+)%/;

export function parseYtdlpProgress(line: string): number | null {
	const match = PROGRESS_PATTERN.exec(line);
	return match ? parseFloat(match[1]!) : null;
}

export function parseYtdlpError(stderr: string): string {
	if (/Video unavailable/i.test(stderr)) return 'This video is unavailable or has been removed.';
	if (/Sign in|\bage\b/i.test(stderr)) return 'This video requires age verification.';
	if (/geo|country/i.test(stderr)) return 'This video is not available in your region.';
	if (/private/i.test(stderr)) return 'This video is private.';
	if (/Network|Unable to connect|Connection/i.test(stderr)) return 'Network error — check your connection.';
	return stderr.slice(-100) || 'Unknown error.';
}

/** Obsidian's PATH often lacks user bins, so probe the usual install spots too. */
export function ytdlpCandidates(home: string, pathEnv: string): string[] {
	const dirs = [
		...pathEnv.split(':').filter(Boolean),
		`${home}/.local/bin`,
		`${home}/.local/pipx/venvs/yt-dlp/bin`,
		'/opt/homebrew/bin',
		'/usr/local/bin',
		'/usr/bin',
	];
	return [...new Set(dirs)].map((dir) => `${dir}/yt-dlp`);
}

const STREAM_EXPIRY_MARGIN_MS = 60_000;

/** googlevideo URLs carry `expire=<unix seconds>`; null when absent. */
export function streamUrlExpiry(url: string): number | null {
	const match = /[?&]expire=(\d+)/.exec(url);
	return match ? Number(match[1]) * 1000 : null;
}

export function isStreamUrlFresh(url: string, nowMs: number): boolean {
	const expiry = streamUrlExpiry(url);
	return expiry === null || expiry - STREAM_EXPIRY_MARGIN_MS > nowMs;
}

export interface StreamInfo {
	url: string;
	title: string;
	author: string;
}

export const STREAM_PRINT_ARGS = ['--print', '%(title|)s', '--print', '%(uploader|)s', '--print', 'urls'];

/** Output of STREAM_PRINT_ARGS: title, uploader, then the stream URL. */
export function parseStreamOutput(stdout: string): StreamInfo | null {
	const [title = '', author = '', url = ''] = stdout.split('\n').map((line) => line.trim());
	return url ? { url, title, author } : null;
}
