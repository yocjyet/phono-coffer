import JSZip from 'jszip';

export type Label = 'A' | 'B';

export type Recording = {
	id: string;
	label: Label;
	url: string;
	blob: Blob;
	index: number;
	mimeType: string;
};

export type TestItem = {
	id: string;
	sample: Recording;
	response: Label | null;
	correct: boolean | null;
};

export type RecordingsMap = Record<Label, Recording[]>;

export const RECOMMENDED_RECORDINGS = 10;
export const MIN_RECORDINGS_FOR_TEST = 1;
export const DEFAULT_ROUNDS_PER_LABEL = 5;
export const MIN_ROUNDS_PER_LABEL = 1;
export const MAX_ROUNDS_PER_LABEL = 10;

export function createId() {
	if (typeof crypto?.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return Math.random().toString(36).slice(2);
}

export function formatDuration(ms: number) {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60)
		.toString()
		.padStart(2, '0');
	const seconds = (totalSeconds % 60).toString().padStart(2, '0');
	return `${minutes}:${seconds}`;
}

export function clampRounds(value: number) {
	const numeric = Number(value);
	if (Number.isNaN(numeric)) return DEFAULT_ROUNDS_PER_LABEL;
	return Math.max(MIN_ROUNDS_PER_LABEL, Math.min(MAX_ROUNDS_PER_LABEL, Math.floor(numeric)));
}

export function pickRandom<T>(items: T[], count: number) {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy.slice(0, count);
}

export function shuffle<T>(items: T[]) {
	const arr = [...items];
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

export function buildSampleSet(recordings: RecordingsMap, label: Label, count: number) {
	const available = recordings[label];
	if (!available?.length) return [];
	if (available.length >= count) {
		return pickRandom(available, count);
	}
	const base = shuffle(available);
	const result = [...base];
	while (result.length < count) {
		const random = available[Math.floor(Math.random() * available.length)];
		result.push(random);
	}
	return shuffle(result).slice(0, count);
}

export type ReportRecordingEntry = {
	id: string;
	label: Label;
	index: number;
	filename: string;
};

export type ReportTestItem = {
	order: number;
	playedLabel: Label;
	recordingId: string;
	recordingFilename: string | null;
	response: Label | null;
	correct: boolean | null;
};

export type ReportPayload = {
	generatedAt: string;
	pair: { A: string; B: string };
	settings: {
		recommendedRoundsPerLabel: number;
		requestedRoundsPerLabel: number;
		executedRoundsPerLabel: number;
	};
	totals: {
		recordingsA: number;
		recordingsB: number;
		questions: number;
		score: number;
	};
	recordings: ReportRecordingEntry[];
	tests: ReportTestItem[];
};

function extensionFromMimeType(mimeType: string) {
	const base = mimeType.split(';')[0]?.trim().toLowerCase();
	switch (base) {
		case 'audio/mp4':
		case 'audio/mp4a':
			return 'm4a';
		case 'audio/aac':
			return 'aac';
		case 'audio/mpeg':
			return 'mp3';
		case 'audio/ogg':
			return 'ogg';
		case 'audio/wav':
			return 'wav';
		case 'audio/webm':
		default:
			return 'webm';
	}
}

export async function createReportZip(params: {
	recordings: RecordingsMap;
	testItems: TestItem[];
	pair: { A: string; B: string };
	requestedRoundsPerLabel: number;
	executedRoundsPerLabel: number;
	score: number;
}) {
	const { recordings, testItems, pair, requestedRoundsPerLabel, executedRoundsPerLabel, score } =
		params;
	const zip = new JSZip();
	const recordingsFolder = zip.folder('recordings');
	const flattened = [...recordings.A, ...recordings.B];
	const recordingEntries: ReportRecordingEntry[] = flattened.map((rec) => {
		const extension = extensionFromMimeType(rec.mimeType);
		const filename = `${rec.label}-${rec.index.toString().padStart(2, '0')}.${extension}`;
		recordingsFolder?.file(filename, rec.blob);
		return {
			id: rec.id,
			label: rec.label,
			index: rec.index,
			filename
		};
	});

	const tests: ReportTestItem[] = testItems.map((item, idx) => {
		const linked = recordingEntries.find((rec) => rec.id === item.sample.id);
		return {
			order: idx + 1,
			playedLabel: item.sample.label,
			recordingId: item.sample.id,
			recordingFilename: linked?.filename ?? null,
			response: item.response,
			correct: item.correct
		};
	});

	const payload: ReportPayload = {
		generatedAt: new Date().toISOString(),
		pair,
		settings: {
			recommendedRoundsPerLabel: DEFAULT_ROUNDS_PER_LABEL,
			requestedRoundsPerLabel,
			executedRoundsPerLabel
		},
		totals: {
			recordingsA: recordings.A.length,
			recordingsB: recordings.B.length,
			questions: testItems.length,
			score
		},
		recordings: recordingEntries,
		tests
	};

	zip.file('report.json', JSON.stringify(payload, null, 2));
	const blob = await zip.generateAsync({ type: 'blob' });
	return {
		blob,
		payload
	};
}

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function sanitizeFilenamePart(input: string) {
	const stripped = input.replace(CONTROL_CHARS, '').trim();
	if (!stripped) return 'untitled';
	return stripped.replace(INVALID_FILENAME_CHARS, '-');
}

export function createReportFilename(pair: { A: string; B: string }, timestamp = Date.now()) {
	const safeA = sanitizeFilenamePart(pair.A || '詞語A');
	const safeB = sanitizeFilenamePart(pair.B || '詞語B');
	return `minimal-pair-test_${safeA}_${safeB}_${timestamp}.zip`;
}
