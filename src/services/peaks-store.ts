import { computePeaks, parsePeaks, serializePeaks } from '../domain/peaks';
import { shareInFlight } from '../utils/in-flight';

/** Decoded at a low rate: enough for a 1000-bucket envelope, a fraction of the memory. */
const DECODE_RATE = 11025;

export interface PeaksAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	readBinary(path: string): Promise<ArrayBuffer>;
}

/** Peak envelopes cached beside the audio (`<id>.peaks.json`); decoded once, then instant. */
export class PeaksStore {
	private readonly memo = new Map<string, number[]>();
	private readonly pending = new Map<string, Promise<number[] | null>>();

	constructor(
		private readonly adapter: PeaksAdapter,
		private readonly cacheDir: string,
		private readonly audioPath: (videoId: string) => string,
	) {}

	peek(videoId: string): number[] | null {
		return this.memo.get(videoId) ?? null;
	}

	/** Stored peaks, else decoded from the cached audio file; null when neither is available. Never throws. */
	ensure(videoId: string): Promise<number[] | null> {
		const known = this.peek(videoId);
		if (known) return Promise.resolve(known);
		return shareInFlight(this.pending, videoId, async () => {
			try {
				const peaks = (await this.readStored(videoId)) ?? (await this.decode(videoId));
				if (peaks) this.memo.set(videoId, peaks);
				return peaks;
			} catch (e) {
				console.debug('[note-player] peaks unavailable', e);
				return null;
			}
		});
	}

	private jsonPath(videoId: string): string {
		return `${this.cacheDir}/${videoId}.peaks.json`;
	}

	private async readStored(videoId: string): Promise<number[] | null> {
		const path = this.jsonPath(videoId);
		return (await this.adapter.exists(path)) ? parsePeaks(await this.adapter.read(path)) : null;
	}

	private async decode(videoId: string): Promise<number[] | null> {
		const path = this.audioPath(videoId);
		if (!(await this.adapter.exists(path))) return null;
		const context = new OfflineAudioContext(2, 1, DECODE_RATE);
		const buffer = await context.decodeAudioData(await this.adapter.readBinary(path));
		const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
		const peaks = computePeaks(channels);
		if (peaks.length > 0) await this.adapter.write(this.jsonPath(videoId), serializePeaks(peaks));
		return peaks.length > 0 ? peaks : null;
	}
}
