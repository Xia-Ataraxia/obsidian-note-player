export function dedupe(values: string[]): string[] {
	const seen = new Set<string>();
	const deduped: string[] = [];

	for (const value of values) {
		if (seen.has(value)) continue;
		seen.add(value);
		deduped.push(value);
	}

	return deduped;
}

export function sanitizeFileName(input: string, fallback = 'New Playlist'): string {
	const trimmed = input.trim();
	if (!trimmed) {
		return fallback;
	}

	// `#` and `^` would turn the note's wikilink into a heading or block reference.
	return trimmed.replace(/[\\/:*?"<>|#^]/g, ' ').replace(/\s+/g, ' ').trim();
}
