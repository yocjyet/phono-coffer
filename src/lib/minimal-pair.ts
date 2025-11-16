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

function escapeMarkdownCell(value: string) {
	return value.replace(/\|/g, '\\|').replace(/\r?\n|\r/g, ' ').trim() || '-';
}

function createReportMarkdown(payload: ReportPayload) {
	const labelMap: Record<Label, string> = {
		A: payload.pair.A?.trim() || '詞語 A',
		B: payload.pair.B?.trim() || '詞語 B'
	};
	const accuracy =
		payload.totals.questions > 0
			? Math.round((payload.totals.score / payload.totals.questions) * 100)
			: 0;
	const incorrectCount = Math.max(payload.totals.questions - payload.totals.score, 0);
	const lines: string[] = [];

	lines.push('# 最小對測驗報告', '');
	lines.push(`- 產生時間：${payload.generatedAt}`);
	lines.push(`- 詞語 A：${labelMap.A}`);
	lines.push(`- 詞語 B：${labelMap.B}`, '');

	lines.push('## 測驗設定', '');
	lines.push(`- 建議輪次（每詞）：${payload.settings.recommendedRoundsPerLabel}`);
	lines.push(`- 要求輪次（每詞）：${payload.settings.requestedRoundsPerLabel}`);
	lines.push(`- 實際輪次（每詞）：${payload.settings.executedRoundsPerLabel}`, '');

	lines.push('## 測驗總結', '');
	lines.push(`- 詞語 A 錄音數：${payload.totals.recordingsA}`);
	lines.push(`- 詞語 B 錄音數：${payload.totals.recordingsB}`);
	lines.push(`- 題目總數：${payload.totals.questions}`);
	lines.push(`- 答對題數：${payload.totals.score}`);
	lines.push(`- 答錯題數：${incorrectCount}`);
	lines.push(`- 正確率：${accuracy}%`, '');

	lines.push('## 錄音列表', '');
	if (payload.recordings.length) {
		lines.push('| 標籤 | 詞語 | 錄音序號 | 檔名 |');
		lines.push('| --- | --- | --- | --- |');
		payload.recordings.forEach((rec) => {
			lines.push(
				`| ${rec.label} | ${escapeMarkdownCell(labelMap[rec.label])} | ${rec.index} | ${escapeMarkdownCell(rec.filename)} |`
			);
		});
		lines.push('');
	} else {
		lines.push('尚無錄音可列出。', '');
	}

	lines.push('## 測驗題目', '');
	if (payload.tests.length) {
		lines.push('| 題號 | 播放詞語 | 錄音檔 | 答案 | 判定 |');
		lines.push('| --- | --- | --- | --- | --- |');
		payload.tests.forEach((item) => {
			const played = escapeMarkdownCell(labelMap[item.playedLabel]);
			const recordingName = escapeMarkdownCell(item.recordingFilename ?? '（未附檔名）');
			const response =
				item.response === null
					? '未作答'
					: escapeMarkdownCell(labelMap[item.response]);
			const result =
				item.correct === null ? '未評分' : item.correct ? '正確' : '錯誤';
			lines.push(
				`| ${item.order} | ${played} | ${recordingName} | ${response} | ${result} |`
			);
		});
		lines.push('');
	} else {
		lines.push('尚未進行測驗。', '');
	}

	return `${lines.join('\n').trim()}\n`;
}

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
	zip.file('report.md', createReportMarkdown(payload));
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
