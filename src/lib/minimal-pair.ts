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

export const RECOMMENDED_RECORDINGS = 2;
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

export const UNANSWERED_GUESS = '__unanswered__';

export type ConfusionMatrix = {
	actual: Label[];
	guessed: (Label | typeof UNANSWERED_GUESS)[];
	counts: Record<Label, Record<Label | typeof UNANSWERED_GUESS, number>>;
};

type ReportStrings = {
	valueSeparator: string;
	title: string;
	generatedAtLabel: string;
	wordsTitle: string;
	wordsHeaders: { label: string; word: string; recordings: string };
	wordsEmpty: string;
	settingsTitle: string;
	settingsRecommended: string;
	settingsRequested: string;
	settingsExecuted: string;
	summaryTitle: string;
	summaryQuestions: string;
	summaryCorrect: string;
	summaryIncorrect: string;
	summaryAccuracy: string;
	reactionTitle: string;
	reactionLast: string;
	reactionOverall: string;
	reactionCorrect: string;
	reactionIncorrect: string;
	reactionEmpty: string;
	confusionTitle: string;
	confusionHeader: string;
	confusionEmpty: string;
	confusionUnanswered: string;
	recordingsTitle: string;
	recordingsHeaders: { label: string; word: string; index: string; filename: string };
	recordingsEmpty: string;
	testsTitle: string;
	testsHeaders: {
		order: string;
		played: string;
		recording: string;
		answer: string;
		result: string;
		reaction: string;
	};
	testsEmpty: string;
	recordingFilenameMissing: string;
	unanswered: string;
	resultCorrect: string;
	resultIncorrect: string;
	resultPending: string;
};

type ReportLocale = 'zh-hant' | 'en' | 'zh-hans' | 'ja';

const REPORT_STRINGS: Record<ReportLocale, ReportStrings> = {
	en: {
		valueSeparator: ': ',
		title: 'Minimal Pair Test Report',
		generatedAtLabel: 'Generated at',
		wordsTitle: 'Word list',
		wordsHeaders: { label: 'Label', word: 'Word', recordings: 'Recordings' },
		wordsEmpty: 'No words configured yet.',
		settingsTitle: 'Test settings',
		settingsRecommended: 'Recommended rounds per label',
		settingsRequested: 'Requested rounds per label',
		settingsExecuted: 'Executed rounds per label',
		summaryTitle: 'Test summary',
		summaryQuestions: 'Total questions',
		summaryCorrect: 'Correct answers',
		summaryIncorrect: 'Incorrect answers',
		summaryAccuracy: 'Accuracy',
		reactionTitle: 'Reaction time stats',
		reactionLast: 'Last response',
		reactionOverall: 'Average (overall)',
		reactionCorrect: 'Average (correct)',
		reactionIncorrect: 'Average (incorrect)',
		reactionEmpty: 'No reaction time data yet.',
		confusionTitle: 'Error cross-tab',
		confusionHeader: 'Actual \\\\ Predicted',
		confusionEmpty: 'No confusion data yet.',
		confusionUnanswered: 'Unanswered',
		recordingsTitle: 'Recording list',
		recordingsHeaders: { label: 'Label', word: 'Word', index: 'Recording #', filename: 'Filename' },
		recordingsEmpty: 'No recordings available.',
		testsTitle: 'Test questions',
		testsHeaders: {
			order: 'Question #',
			played: 'Prompted word',
			recording: 'Recording file',
			answer: 'Answer',
			result: 'Result',
			reaction: 'Reaction time'
		},
		testsEmpty: 'No tests recorded yet.',
		recordingFilenameMissing: '(no filename)',
		unanswered: 'Unanswered',
		resultCorrect: 'Correct',
		resultIncorrect: 'Incorrect',
		resultPending: 'Not graded'
	},
	'zh-hant': {
		valueSeparator: '：',
		title: '最小對測驗報告',
		generatedAtLabel: '產生時間',
		wordsTitle: '詞語列表',
		wordsHeaders: { label: '標籤', word: '詞語', recordings: '錄音數' },
		wordsEmpty: '尚未設定詞語。',
		settingsTitle: '測驗設定',
		settingsRecommended: '建議輪次（每詞）',
		settingsRequested: '要求輪次（每詞）',
		settingsExecuted: '實際輪次（每詞）',
		summaryTitle: '測驗總結',
		summaryQuestions: '題目總數',
		summaryCorrect: '答對題數',
		summaryIncorrect: '答錯題數',
		summaryAccuracy: '正確率',
		reactionTitle: '反應時間統計',
		reactionLast: '最近一次',
		reactionOverall: '平均（全部）',
		reactionCorrect: '平均（答對）',
		reactionIncorrect: '平均（答錯）',
		reactionEmpty: '尚無反應時間資料。',
		confusionTitle: '錯誤交叉表',
		confusionHeader: '實際 \\\\ 預測',
		confusionEmpty: '尚無交叉表資料。',
		confusionUnanswered: '未作答',
		recordingsTitle: '錄音列表',
		recordingsHeaders: { label: '標籤', word: '詞語', index: '錄音序號', filename: '檔名' },
		recordingsEmpty: '尚無錄音可列出。',
		testsTitle: '測驗題目',
		testsHeaders: {
			order: '題號',
			played: '播放詞語',
			recording: '錄音檔',
			answer: '答案',
			result: '判定',
			reaction: '反應時間'
		},
		testsEmpty: '尚未進行測驗。',
		recordingFilenameMissing: '（未附檔名）',
		unanswered: '未作答',
		resultCorrect: '正確',
		resultIncorrect: '錯誤',
		resultPending: '未評分'
	},
	'zh-hans': {
		valueSeparator: '：',
		title: '最小对测验报告',
		generatedAtLabel: '生成时间',
		wordsTitle: '词语列表',
		wordsHeaders: { label: '标签', word: '词语', recordings: '录音数' },
		wordsEmpty: '尚未设置词语。',
		settingsTitle: '测验设置',
		settingsRecommended: '建议轮次（每词）',
		settingsRequested: '要求轮次（每词）',
		settingsExecuted: '实际轮次（每词）',
		summaryTitle: '测验总结',
		summaryQuestions: '题目总数',
		summaryCorrect: '答对题数',
		summaryIncorrect: '答错题数',
		summaryAccuracy: '正确率',
		reactionTitle: '反应时间统计',
		reactionLast: '最近一次',
		reactionOverall: '平均（全部）',
		reactionCorrect: '平均（答对）',
		reactionIncorrect: '平均（答错）',
		reactionEmpty: '暂无反应时间数据。',
		confusionTitle: '错误交叉表',
		confusionHeader: '实际 \\\\ 预测',
		confusionEmpty: '暂无交叉表数据。',
		confusionUnanswered: '未作答',
		recordingsTitle: '录音列表',
		recordingsHeaders: { label: '标签', word: '词语', index: '录音序号', filename: '文件名' },
		recordingsEmpty: '暂无录音可列出。',
		testsTitle: '测验题目',
		testsHeaders: {
			order: '题号',
			played: '播放词语',
			recording: '录音文件',
			answer: '答案',
			result: '判定',
			reaction: '反应时间'
		},
		testsEmpty: '尚未进行测验。',
		recordingFilenameMissing: '（无文件名）',
		unanswered: '未作答',
		resultCorrect: '正确',
		resultIncorrect: '错误',
		resultPending: '未评分'
	},
	ja: {
		valueSeparator: '：',
		title: '最小対テストレポート',
		generatedAtLabel: '生成日時',
		wordsTitle: '語彙リスト',
		wordsHeaders: { label: 'ラベル', word: '語', recordings: '録音数' },
		wordsEmpty: '語彙がまだ設定されていません。',
		settingsTitle: 'テスト設定',
		settingsRecommended: '推奨ラウンド（語ごと）',
		settingsRequested: '指定ラウンド（語ごと）',
		settingsExecuted: '実行ラウンド（語ごと）',
		summaryTitle: 'テストサマリー',
		summaryQuestions: '総問題数',
		summaryCorrect: '正答数',
		summaryIncorrect: '誤答数',
		summaryAccuracy: '正答率',
		reactionTitle: '反応時間統計',
		reactionLast: '直近の回答',
		reactionOverall: '平均（全体）',
		reactionCorrect: '平均（正答）',
		reactionIncorrect: '平均（誤答）',
		reactionEmpty: '反応時間データがありません。',
		confusionTitle: '誤りクロステーブル',
		confusionHeader: '実際 \\\\ 予測',
		confusionEmpty: 'クロステーブルのデータがありません。',
		confusionUnanswered: '無回答',
		recordingsTitle: '録音一覧',
		recordingsHeaders: { label: 'ラベル', word: '語', index: '録音番号', filename: 'ファイル名' },
		recordingsEmpty: '録音データがありません。',
		testsTitle: '出題一覧',
		testsHeaders: {
			order: '問題番号',
			played: '提示語',
			recording: '録音ファイル',
			answer: '回答',
			result: '判定',
			reaction: '反応時間'
		},
		testsEmpty: 'テストはまだ行われていません。',
		recordingFilenameMissing: '（ファイル名なし）',
		unanswered: '無回答',
		resultCorrect: '正解',
		resultIncorrect: '不正解',
		resultPending: '未判定'
	}
};

function getReportStrings(locale?: string): ReportStrings {
	if (locale && locale in REPORT_STRINGS) {
		return REPORT_STRINGS[locale as ReportLocale];
	}
	return REPORT_STRINGS.en;
}

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

export function buildConfusionMatrix(items: TestItem[], labelOrder: Label[]): ConfusionMatrix {
	const baseOrder = labelOrder.length
		? [...labelOrder]
		: Array.from(new Set(items.map((item) => item.sample.label)));
	const actualSet = new Set(baseOrder);
	items.forEach((item) => actualSet.add(item.sample.label));
	const actual = [
		...baseOrder,
		...Array.from(actualSet).filter((label) => !baseOrder.includes(label))
	];
	const guessSet = new Set<Label | typeof UNANSWERED_GUESS>(baseOrder);
	items.forEach((item) => {
		if (item.response) {
			guessSet.add(item.response);
		}
	});
	guessSet.add(UNANSWERED_GUESS);
	const guessed = [
		...baseOrder,
		...Array.from(guessSet).filter(
			(label): label is Label =>
				typeof label === 'string' && label !== UNANSWERED_GUESS && !baseOrder.includes(label)
		),
		UNANSWERED_GUESS
	];
	const counts: ConfusionMatrix['counts'] = {};
	const ensureRow = (label: Label) => {
		if (!counts[label]) {
			counts[label] = {} as Record<Label | typeof UNANSWERED_GUESS, number>;
			guessed.forEach((guess) => {
				counts[label][guess] = 0;
			});
		}
	};
	actual.forEach((label) => ensureRow(label));
	items.forEach((item) => {
		const actualLabel = item.sample.label;
		ensureRow(actualLabel);
		const guessKey = (item.response ?? UNANSWERED_GUESS) as Label | typeof UNANSWERED_GUESS;
		if (!(guessKey in counts[actualLabel])) {
			counts[actualLabel][guessKey] = 0;
		}
		counts[actualLabel][guessKey] += 1;
	});
	return {
		actual,
		guessed,
		counts
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
	locale: string;
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
	confusion: ConfusionMatrix;
	tests: ReportTestItem[];
};

function escapeMarkdownCell(value: string) {
	return (
		value
			.replace(/\|/g, '\\|')
			.replace(/\r?\n|\r/g, ' ')
			.trim() || '-'
	);
}

function formatReactionValue(ms: number | null) {
	if (ms === null || Number.isNaN(ms)) {
		return '—';
	}
	return `${(ms / 1000).toFixed(2)}s`;
}

function createReportMarkdown(payload: ReportPayload) {
	const strings = getReportStrings(payload.locale);
	const valueLine = (label: string, value: string | number) =>
		`${label}${strings.valueSeparator}${value}`;
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

	lines.push(`# ${strings.title}`, '');
	lines.push(`- ${valueLine(strings.generatedAtLabel, payload.generatedAt)}`, '');

	lines.push(`## ${strings.wordsTitle}`, '');
	if (Object.keys(labelMap).length) {
		lines.push(
			`| ${strings.wordsHeaders.label} | ${strings.wordsHeaders.word} | ${strings.wordsHeaders.recordings} |`
		);
		lines.push('| --- | --- | --- |');
		Object.keys(labelMap).forEach((key) => {
			const count = payload.totals.perLabel[key] ?? 0;
			lines.push(`| ${key} | ${escapeMarkdownCell(labelMap[key])} | ${count} |`);
		});
		lines.push('');
	} else {
		lines.push(strings.wordsEmpty, '');
	}

	lines.push(`## ${strings.settingsTitle}`, '');
	lines.push(
		`- ${valueLine(strings.settingsRecommended, payload.settings.recommendedRoundsPerLabel)}`
	);
	lines.push(`- ${valueLine(strings.settingsRequested, payload.settings.requestedRoundsPerLabel)}`);
	lines.push(
		`- ${valueLine(strings.settingsExecuted, payload.settings.executedRoundsPerLabel)}`,
		''
	);

	lines.push(`## ${strings.summaryTitle}`, '');
	lines.push(`- ${valueLine(strings.summaryQuestions, payload.totals.questions)}`);
	lines.push(`- ${valueLine(strings.summaryCorrect, payload.totals.score)}`);
	lines.push(`- ${valueLine(strings.summaryIncorrect, incorrectCount)}`);
	lines.push(`- ${valueLine(strings.summaryAccuracy, `${accuracy}%`)}`, '');

	lines.push(`## ${strings.reactionTitle}`, '');
	if (payload.reaction.totalAnswered) {
		lines.push(`- ${valueLine(strings.reactionLast, formatReactionValue(payload.reaction.last))}`);
		lines.push(
			`- ${valueLine(strings.reactionOverall, formatReactionValue(payload.reaction.overall))}`
		);
		lines.push(
			`- ${valueLine(strings.reactionCorrect, formatReactionValue(payload.reaction.correct))}`
		);
		lines.push(
			`- ${valueLine(strings.reactionIncorrect, formatReactionValue(payload.reaction.incorrect))}`,
			''
		);
	} else {
		lines.push(strings.reactionEmpty, '');
	}

	lines.push(`## ${strings.confusionTitle}`, '');
	if (payload.confusion.actual.length && payload.confusion.guessed.length) {
		const headerCells = payload.confusion.guessed.map((guess) =>
			guess === UNANSWERED_GUESS
				? strings.confusionUnanswered
				: escapeMarkdownCell(labelMap[guess] ?? guess)
		);
		lines.push(`| ${strings.confusionHeader} | ${headerCells.join(' | ')} |`);
		lines.push(`| --- | ${headerCells.map(() => '---').join(' | ')} |`);
		payload.confusion.actual.forEach((actualLabel) => {
			const row = payload.confusion.guessed.map((guess) => {
				const count = payload.confusion.counts[actualLabel]?.[guess] ?? 0;
				return count.toString();
			});
			const actualName = escapeMarkdownCell(labelMap[actualLabel] ?? actualLabel);
			lines.push(`| ${actualName} | ${row.join(' | ')} |`);
		});
		lines.push('');
	} else {
		lines.push(strings.confusionEmpty, '');
	}

	lines.push(`## ${strings.recordingsTitle}`, '');
	if (payload.recordings.length) {
		lines.push(
			`| ${strings.recordingsHeaders.label} | ${strings.recordingsHeaders.word} | ${strings.recordingsHeaders.index} | ${strings.recordingsHeaders.filename} |`
		);
		lines.push('| --- | --- | --- | --- |');
		payload.recordings.forEach((rec) => {
			lines.push(
				`| ${rec.label} | ${escapeMarkdownCell(labelMap[rec.label])} | ${rec.index} | ${escapeMarkdownCell(rec.filename)} |`
			);
		});
		lines.push('');
	} else {
		lines.push(strings.recordingsEmpty, '');
	}

	lines.push(`## ${strings.testsTitle}`, '');
	if (payload.tests.length) {
		lines.push(
			`| ${strings.testsHeaders.order} | ${strings.testsHeaders.played} | ${strings.testsHeaders.recording} | ${strings.testsHeaders.answer} | ${strings.testsHeaders.result} | ${strings.testsHeaders.reaction} |`
		);
		lines.push('| --- | --- | --- | --- | --- | --- |');
		payload.tests.forEach((item) => {
			const played = escapeMarkdownCell(labelMap[item.playedLabel]);
			const recordingName = escapeMarkdownCell(
				item.recordingFilename ?? strings.recordingFilenameMissing
			);
			const response =
				item.response === null ? strings.unanswered : escapeMarkdownCell(labelMap[item.response]);
			const result =
				item.correct === null
					? strings.resultPending
					: item.correct
						? strings.resultCorrect
						: strings.resultIncorrect;
			lines.push(
				`| ${item.order} | ${played} | ${recordingName} | ${response} | ${result} | ${formatReactionValue(item.reactionTimeMs)} |`
			);
		});
		lines.push('');
	} else {
		lines.push(strings.testsEmpty, '');
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
	locale?: string;
}) {
	const {
		recordings,
		testItems,
		labels,
		requestedRoundsPerLabel,
		executedRoundsPerLabel,
		score,
		locale
	} = params;
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
	const confusion = buildConfusionMatrix(
		testItems,
		labels.map((label) => label.id)
	);

	const resolvedLocale = locale ?? 'en';

	const payload: ReportPayload = {
		generatedAt: new Date().toISOString(),
		locale: resolvedLocale,
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
		confusion,
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
	const safeNames = (
		labels.length
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

export async function parseReportZip(file: File | Blob | ArrayBuffer): Promise<{
	labels: LabelDefinition[];
	recordings: RecordingsMap;
} | null> {
	try {
		const zip = await JSZip.loadAsync(file);
		const reportFile = zip.file('report.json');
		if (!reportFile) return null;

		const reportText = await reportFile.async('text');
		const payload = JSON.parse(reportText) as ReportPayload;

		const newRecordings: RecordingsMap = {};
		const labels = payload.labels || [];

		// Initialize buckets
		labels.forEach((l) => {
			newRecordings[l.id] = [];
		});

		// Process recordings
		if (payload.recordings && Array.isArray(payload.recordings)) {
			for (const rec of payload.recordings) {
				const zipEntry = zip.file(`recordings/${rec.filename}`);
				if (zipEntry) {
					const blob = await zipEntry.async('blob');
					const url = URL.createObjectURL(blob);
					const mimeType = blob.type || 'audio/webm'; // Fallback

					if (!newRecordings[rec.label]) {
						newRecordings[rec.label] = [];
					}

					newRecordings[rec.label].push({
						id: createId(), // Generate new ID to avoid conflicts
						label: rec.label,
						url,
						blob,
						index: rec.index,
						mimeType
					});
				}
			}
		}

		return {
			labels,
			recordings: newRecordings
		};
	} catch (err) {
		console.error('Failed to parse report zip:', err);
		return null;
	}
}
