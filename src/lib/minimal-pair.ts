import JSZip from 'jszip';

export type Label = string;

export type LabelDefinition = {
	id: Label;
	value: string;
};

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
	reactionTimeMs?: number | null;
	lastPlayedAt?: number | null;
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

export type ReactionStats = {
	totalAnswered: number;
	last: number | null;
	overall: number | null;
	correct: number | null;
	incorrect: number | null;
};

function isTimed(item: TestItem): item is TestItem & { reactionTimeMs: number } {
	return typeof item.reactionTimeMs === 'number' && Number.isFinite(item.reactionTimeMs);
}

export function summarizeReactionTimes(items: TestItem[]): ReactionStats {
	const answered = items.filter((item) => item.response !== null);
	const timed = answered.filter(isTimed);
	const average = (list: typeof timed) => {
		if (!list.length) return null;
		const total = list.reduce((sum, entry) => sum + entry.reactionTimeMs, 0);
		return total / list.length;
	};
	return {
		totalAnswered: answered.length,
		last: timed.length ? timed[timed.length - 1].reactionTimeMs : null,
		overall: average(timed),
		correct: average(timed.filter((entry) => entry.correct)),
		incorrect: average(timed.filter((entry) => entry.correct === false))
	};
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
	const available = recordings[label] ?? [];
	if (!available.length) return [];
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
	reactionTimeMs: number | null;
};

export type LabelsSnapshot = LabelDefinition[];

export type ReportPayload = {
	generatedAt: string;
	labels: LabelsSnapshot;
	settings: {
		recommendedRoundsPerLabel: number;
		requestedRoundsPerLabel: number;
		executedRoundsPerLabel: number;
	};
	totals: {
		perLabel: Record<Label, number>;
		questions: number;
		score: number;
	};
	recordings: ReportRecordingEntry[];
	reaction: ReactionStats;
	tests: ReportTestItem[];
};

function escapeMarkdownCell(value: string) {
	return value.replace(/\|/g, '\\|').replace(/\r?\n|\r/g, ' ').trim() || '-';
}

function formatReactionValue(ms: number | null) {
	if (ms === null || Number.isNaN(ms)) {
		return '—';
	}
	return `${(ms / 1000).toFixed(2)}s`;
}

function createReportMarkdown(payload: ReportPayload) {
	const fallbackLabels =
		payload.labels.length > 0
			? payload.labels
			: [
					{ id: 'A', value: '詞語 A' },
					{ id: 'B', value: '詞語 B' }
				];
	const labelMap = fallbackLabels.reduce<Record<Label, string>>((acc, entry, index) => {
		const fallback = `詞語 ${String.fromCharCode(65 + index)}`;
		acc[entry.id] = entry.value?.trim() || fallback;
		return acc;
	}, {});
	const accuracy =
		payload.totals.questions > 0
			? Math.round((payload.totals.score / payload.totals.questions) * 100)
			: 0;
	const incorrectCount = Math.max(payload.totals.questions - payload.totals.score, 0);
	const lines: string[] = [];

	lines.push('# 最小對測驗報告', '');
	lines.push(`- 產生時間：${payload.generatedAt}`, '');

	lines.push('## 詞語列表', '');
	if (Object.keys(labelMap).length) {
		lines.push('| 標籤 | 詞語 | 錄音數 |');
		lines.push('| --- | --- | --- |');
		Object.keys(labelMap).forEach((key) => {
			const count = payload.totals.perLabel[key] ?? 0;
			lines.push(`| ${key} | ${escapeMarkdownCell(labelMap[key])} | ${count} |`);
		});
		lines.push('');
	} else {
		lines.push('尚未設定詞語。', '');
	}

	lines.push('## 測驗設定', '');
	lines.push(`- 建議輪次（每詞）：${payload.settings.recommendedRoundsPerLabel}`);
	lines.push(`- 要求輪次（每詞）：${payload.settings.requestedRoundsPerLabel}`);
	lines.push(`- 實際輪次（每詞）：${payload.settings.executedRoundsPerLabel}`, '');

	lines.push('## 測驗總結', '');
	lines.push(`- 題目總數：${payload.totals.questions}`);
	lines.push(`- 答對題數：${payload.totals.score}`);
	lines.push(`- 答錯題數：${incorrectCount}`);
	lines.push(`- 正確率：${accuracy}%`, '');

	lines.push('## 反應時間統計', '');
	if (payload.reaction.totalAnswered) {
		lines.push(`- 最近一次：${formatReactionValue(payload.reaction.last)}`);
		lines.push(`- 平均（全部）：${formatReactionValue(payload.reaction.overall)}`);
		lines.push(`- 平均（答對）：${formatReactionValue(payload.reaction.correct)}`);
		lines.push(`- 平均（答錯）：${formatReactionValue(payload.reaction.incorrect)}`, '');
	} else {
		lines.push('尚無反應時間資料。', '');
	}

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
		lines.push('| 題號 | 播放詞語 | 錄音檔 | 答案 | 判定 | 反應時間 |');
		lines.push('| --- | --- | --- | --- | --- | --- |');
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
				`| ${item.order} | ${played} | ${recordingName} | ${response} | ${result} | ${formatReactionValue(item.reactionTimeMs)} |`
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
	labels: LabelsSnapshot;
	requestedRoundsPerLabel: number;
	executedRoundsPerLabel: number;
	score: number;
}) {
	const { recordings, testItems, labels, requestedRoundsPerLabel, executedRoundsPerLabel, score } =
		params;
	const zip = new JSZip();
	const recordingsFolder = zip.folder('recordings');
	const labelOrder = [
		...labels.map((label) => label.id),
		...Object.keys(recordings).filter((key) => !labels.some((label) => label.id === key))
	];
	const flattened = labelOrder.flatMap((label) => recordings[label] ?? []);
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
			correct: item.correct,
			reactionTimeMs:
				typeof item.reactionTimeMs === 'number' && Number.isFinite(item.reactionTimeMs)
					? item.reactionTimeMs
					: null
		};
	});

	const reaction = summarizeReactionTimes(testItems);

	const payload: ReportPayload = {
		generatedAt: new Date().toISOString(),
		labels,
		settings: {
			recommendedRoundsPerLabel: DEFAULT_ROUNDS_PER_LABEL,
			requestedRoundsPerLabel,
			executedRoundsPerLabel
		},
		totals: {
			perLabel: labelOrder.reduce<Record<Label, number>>((acc, label) => {
				acc[label] = recordings[label]?.length ?? 0;
				return acc;
			}, {}),
			questions: testItems.length,
			score
		},
		recordings: recordingEntries,
		reaction,
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

export function createReportFilename(labels: LabelsSnapshot, timestamp = Date.now()) {
	const safeNames = (labels.length
		? labels
		: [
				{ id: 'A', value: '詞語A' },
				{ id: 'B', value: '詞語B' }
			]
	)
		.map((label) => sanitizeFilenamePart(label.value || label.id))
		.filter(Boolean);
	const labelSegment = safeNames.slice(0, 4).join('_') || 'labels';
	return `minimal-pair-test_${labelSegment}_${timestamp}.zip`;
}
