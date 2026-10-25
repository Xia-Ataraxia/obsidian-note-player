export type PlaybackSource = 'cached' | 'stream' | 'download';

/** Skipping a streamed track early should not leave a full download running. */
export const KEEP_SAVING_AFTER_S = 10;

export function chooseSource(cached: boolean, streamUrl: string | null): PlaybackSource {
	if (cached) return 'cached';
	return streamUrl ? 'stream' : 'download';
}

export function shouldKeepSaving(listenedSeconds: number): boolean {
	return listenedSeconds >= KEEP_SAVING_AFTER_S;
}
