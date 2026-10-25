const PROGRESS_PATTERN = /\[download\]\s+([\d.]+)%/;

export function parseYtdlpProgress(line: string): number | null {
	const match = PROGRESS_PATTERN.exec(line);
	return match ? parseFloat(match[1]!) : null;
}

export function parseYtdlpError(stderr: string): string {
	if (/Video unavailable/i.test(stderr)) return 'This video is unavailable or has been removed.';
	if (/Sign in|age/i.test(stderr)) return 'This video requires age verification.';
	if (/geo|country/i.test(stderr)) return 'This video is not available in your region.';
	if (/private/i.test(stderr)) return 'This video is private.';
	if (/Network|Unable to connect|Connection/i.test(stderr)) return 'Network error — check your connection.';
	return stderr.slice(-100) || 'Unknown error.';
}
