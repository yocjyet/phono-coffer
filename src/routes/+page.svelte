<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import {
		buildSampleSet,
		clampRounds,
		createId,
		createReportZip,
		createReportFilename,
		DEFAULT_ROUNDS_PER_LABEL,
		MAX_ROUNDS_PER_LABEL,
		MIN_RECORDINGS_FOR_TEST,
		MIN_ROUNDS_PER_LABEL,
		RECOMMENDED_RECORDINGS,
		shuffle,
		type Label,
		type Recording,
		type RecordingsMap,
		type TestItem,
		formatDuration
	} from '$lib/minimal-pair';

	type CompletedTest = {
		id: string;
		items: TestItem[];
		score: number;
		totalRounds: number;
		executedRoundsPerLabel: number;
		requestedRoundsPerLabel: number;
		accuracy: number;
		createdAt: string;
		exported: boolean;
		pair: { A: string; B: string };
	};

	const LABEL_KEYS: Label[] = ['A', 'B'];

	let pairA = $state('');
	let pairB = $state('');

	let recordings = $state<RecordingsMap>({ A: [], B: [] });
	let recordError = $state('');
	let testError = $state('');

	let stream = $state<MediaStream | null>(null);
	let mediaRecorder = $state<MediaRecorder | null>(null);
	let audioChunks = $state<Blob[]>([]);
	let recordingTarget = $state<Label | null>(null);
	let isRecording = $state<Label | null>(null);
	let recordingTimer = $state(0);
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	let testItems = $state<TestItem[]>([]);
	let currentTestIndex = $state(0);
	let score = $state(0);
	let testActive = $state(false);
	let testComplete = $state(false);
	let currentSessionId = $state<string | null>(null);
	let completedTests = $state<CompletedTest[]>([]);
	let currentPairSnapshot = $state<{ A: string; B: string } | null>(null);
	let currentAudio: HTMLAudioElement | null = null;
	let roundsPerLabel = $state(DEFAULT_ROUNDS_PER_LABEL);
	let lastUsedRoundsPerLabel = $state(DEFAULT_ROUNDS_PER_LABEL);
	let exporting = $state(false);
	let exportError = $state('');
	let exportMessage = $state('');
	let hideChoices = $state(false);
	let hideChoicesTimeout: ReturnType<typeof setTimeout> | null = null;
	let autoPlayNext = $state(true);

	const objectUrls: string[] = [];

	let labelA = $derived(pairA.trim() || '詞語 A');
	let labelB = $derived(pairB.trim() || '詞語 B');
	let readyForTest = $derived(
		recordings.A.length >= MIN_RECORDINGS_FOR_TEST && recordings.B.length >= MIN_RECORDINGS_FOR_TEST
	);
	let normalizedRounds = $derived(clampRounds(roundsPerLabel));
	let totalRounds = $derived(testItems.length || normalizedRounds * 2);
	let progressText = $derived(
		testActive && testItems.length ? `第 ${currentTestIndex + 1} / ${testItems.length} 題` : ''
	);
	let accuracy = $derived(
		testComplete && testItems.length ? Math.round((score / testItems.length) * 100) : 0
	);
	let timerDisplay = $derived(isRecording ? formatDuration(recordingTimer) : '00:00');
	let hasRecordings = $derived(recordings.A.length + recordings.B.length > 0);
	let hasUnexportedTests = $derived(completedTests.some((test) => !test.exported));
	let canExport = $derived(hasRecordings && completedTests.length > 0);

	async function ensureRecorder() {
		if (!browser) {
			recordError = '錄音只能在瀏覽器環境執行。';
			return false;
		}
		if (!navigator.mediaDevices?.getUserMedia) {
			recordError = '此瀏覽器不支援麥克風錄音。';
			return false;
		}
		if (!stream) {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		}
		if (!mediaRecorder) {
			mediaRecorder = new MediaRecorder(stream);
			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					audioChunks.push(event.data);
				}
			};
			mediaRecorder.onstop = () => {
				finalizeRecording();
			};
		}
		return true;
	}

	function finalizeRecording() {
		stopTimer();
		if (!recordingTarget || audioChunks.length === 0) {
			audioChunks = [];
			isRecording = null;
			recordingTarget = null;
			return;
		}

		const blob = new Blob(audioChunks, { type: 'audio/webm' });
		const url = URL.createObjectURL(blob);
		objectUrls.push(url);

		const newRecording: Recording = {
			id: createId(),
			label: recordingTarget,
			blob,
			url,
			index: recordings[recordingTarget].length + 1
		};

		recordings = {
			...recordings,
			[recordingTarget]: [...recordings[recordingTarget], newRecording]
		};

		audioChunks = [];
		isRecording = null;
		recordingTarget = null;
	}

	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	function removeRecording(label: Label, id: string) {
		const updated = recordings[label].filter((rec) => {
			if (rec.id === id) {
				URL.revokeObjectURL(rec.url);
				const idx = objectUrls.indexOf(rec.url);
				if (idx !== -1) {
					objectUrls.splice(idx, 1);
				}
			}
			return rec.id !== id;
		});

		recordings = {
			...recordings,
			[label]: updated.map((rec, idx) => ({
				...rec,
				index: idx + 1
			}))
		};
	}

	async function startRecording(label: Label) {
		recordError = '';
		if (!pairA.trim() || !pairB.trim()) {
			recordError = '請先輸入兩個最小對詞語。';
			return;
		}
		if (isRecording) {
			recordError = '正在錄音，請先停止目前錄音。';
			return;
		}
		try {
			const ok = await ensureRecorder();
			if (!ok || !mediaRecorder) return;
			audioChunks = [];
			recordingTarget = label;
			recordingTimer = 0;
			stopTimer();
			timerInterval = setInterval(() => {
				recordingTimer += 100;
			}, 100);
			mediaRecorder.start();
			isRecording = label;
		} catch (err) {
			recordError = `無法啟動錄音：${(err as Error).message}`;
		}
	}

	function stopRecording() {
		if (mediaRecorder && mediaRecorder.state === 'recording') {
			mediaRecorder.stop();
		}
		stopTimer();
	}

	function startTest() {
		testError = '';
		if (!readyForTest) {
			testError = `每個詞語至少需要 ${MIN_RECORDINGS_FOR_TEST} 筆錄音才可測驗。`;
			return;
		}
		if (browser && hasUnexportedTests) {
			const proceed = window.confirm(
				'先前已有尚未匯出的測驗結果，開始新的測驗將覆蓋目前答題進度。要繼續嗎？'
			);
			if (!proceed) {
				return;
			}
		}
		hideChoices = false;
		clearHideChoicesTimer();
		const perLabel = normalizedRounds;
		lastUsedRoundsPerLabel = perLabel;
		currentPairSnapshot = { A: labelA, B: labelB };

		const selections = [
			...buildSampleSet(recordings, 'A', perLabel),
			...buildSampleSet(recordings, 'B', perLabel)
		];

		const queue = shuffle(selections).map((sample) => ({
			id: createId(),
			sample,
			response: null,
			correct: null
		}));

		testItems = queue;
		currentTestIndex = 0;
		score = 0;
		testActive = queue.length > 0;
		testComplete = false;
		currentSessionId = queue.length ? createId() : null;
	}

	function playCurrentSample() {
		const current = testItems[currentTestIndex];
		if (!current) return;
		currentAudio?.pause();
		currentAudio = new Audio(current.sample.url);
		currentAudio.play();
	}

	function submitGuess(label: Label) {
		if (!testActive) return;
		const current = testItems[currentTestIndex];
		if (!current || current.response) return;

		const correct = current.sample.label === label;
		const updated: TestItem = { ...current, response: label, correct };
		testItems = testItems.map((item, index) => (index === currentTestIndex ? updated : item));

		if (correct) {
			score += 1;
		}

		if (currentTestIndex >= testItems.length - 1) {
			testActive = false;
			testComplete = true;
			archiveCompletedTestSession();
		} else {
			currentTestIndex += 1;
			if (autoPlayNext) {
				playCurrentSample();
			}
		}
		triggerChoiceTransition();
	}

	function resetAll() {
		recordings = { A: [], B: [] };
		recordError = '';
		testError = '';
		testItems = [];
		currentTestIndex = 0;
		score = 0;
		testActive = false;
		testComplete = false;
		currentSessionId = null;
		isRecording = null;
		recordingTarget = null;
		audioChunks = [];
		recordingTimer = 0;
		stopTimer();
		lastUsedRoundsPerLabel = normalizedRounds;
		objectUrls.forEach((url) => URL.revokeObjectURL(url));
		objectUrls.length = 0;
		exportError = '';
		exportMessage = '';
		hideChoices = false;
		clearHideChoicesTimer();
		completedTests = [];
		currentPairSnapshot = null;
	}

	onDestroy(() => {
		currentAudio?.pause();
		objectUrls.forEach((url) => URL.revokeObjectURL(url));
		stream?.getTracks().forEach((track) => track.stop());
		stopTimer();
		clearHideChoicesTimer();
	});

	function triggerChoiceTransition() {
		hideChoices = true;
		clearHideChoicesTimer();
		hideChoicesTimeout = setTimeout(() => {
			hideChoices = false;
			hideChoicesTimeout = null;
		}, 400);
	}

	function clearHideChoicesTimer() {
		if (hideChoicesTimeout) {
			clearTimeout(hideChoicesTimeout);
			hideChoicesTimeout = null;
		}
	}

	function archiveCompletedTestSession() {
		if (!currentSessionId || !testItems.length || !currentPairSnapshot) return;
		const alreadySaved = completedTests.some((session) => session.id === currentSessionId);
		if (alreadySaved) return;
		const total = testItems.length;
		const executedRoundsPerLabel = total / 2;
		const snapshot: CompletedTest = {
			id: currentSessionId,
			items: testItems.map((item) => ({ ...item })),
			score,
			totalRounds: total,
			executedRoundsPerLabel,
			requestedRoundsPerLabel: lastUsedRoundsPerLabel,
			accuracy: total ? Math.round((score / total) * 100) : 0,
			createdAt: new Date().toISOString(),
			exported: false,
			pair: currentPairSnapshot
		};
		completedTests = [...completedTests, snapshot];
		currentSessionId = null;
		currentPairSnapshot = null;
	}

	function markSessionExported(sessionId: string) {
		completedTests = completedTests.map((session) =>
			session.id === sessionId ? { ...session, exported: true } : session
		);
	}

	async function exportReport(sessionId?: string) {
		exportError = '';
		exportMessage = '';
		const target = (() => {
			if (!completedTests.length) return null;
			if (sessionId) {
				return completedTests.find((session) => session.id === sessionId) ?? null;
			}
			const pending = [...completedTests].reverse().find((session) => !session.exported);
			return pending ?? completedTests[completedTests.length - 1];
		})();
		if (!target) {
			exportError = '尚未有可匯出的測驗結果。';
			return;
		}
		exporting = true;
		try {
			const { blob } = await createReportZip({
				recordings,
				testItems: target.items,
				pair: target.pair,
				requestedRoundsPerLabel: target.requestedRoundsPerLabel,
				executedRoundsPerLabel: target.executedRoundsPerLabel,
				score: target.score
			});
			const exportTimestamp = new Date(target.createdAt).getTime();
			const filename = createReportFilename(target.pair, exportTimestamp);
			downloadBlob(blob, filename);
			markSessionExported(target.id);
			exportMessage = '報告已下載。';
		} catch (err) {
			exportError = `匯出失敗：${(err as Error).message}`;
		} finally {
			exporting = false;
		}
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.style.display = 'none';
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	}

	function terminateSession() {
		if (!browser) return;
		const confirmed = window.confirm('終止後會清除所有錄音與測驗結果，確定要結束嗎？');
		if (!confirmed) return;
		stopRecording();
		currentAudio?.pause();
		currentAudio = null;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		mediaRecorder = null;
		resetAll();
	}
</script>

<div class="space-y-8 p-6">
	<h1 class="text-3xl font-bold">最小對自測系統</h1>

	<section class="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
		<h2 class="text-xl font-semibold">1. 輸入最小對詞語</h2>
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="space-y-2 font-medium">
				<span>詞語 A</span>
				<input
					type="text"
					placeholder="例如：ship"
					bind:value={pairA}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</label>
			<label class="space-y-2 font-medium">
				<span>詞語 B</span>
				<input
					type="text"
					placeholder="例如：sheep"
					bind:value={pairB}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</label>
		</div>
		<p class="text-sm text-gray-600">建議輸入完整詞語或音標，方便測試時辨識。</p>
	</section>

	<section class="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
		<h2 class="text-xl font-semibold">2. 錄音（建議每個詞語 10 次）</h2>
		{#if recordError}
			<p class="font-semibold text-red-600">{recordError}</p>
		{/if}
		<div class="grid gap-4 lg:grid-cols-2">
			{#each LABEL_KEYS as key}
				{@const labelText = key === 'A' ? labelA : labelB}
				{@const items = recordings[key]}
				{@const isActive = isRecording === key}
				{@const pairValue = key === 'A' ? pairA : pairB}
				<div
					class={`rounded-2xl border bg-gray-50 p-4 shadow-sm transition ${
						isActive ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
					}`}
				>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">{labelText}</h3>
						<span class="text-sm text-gray-600"
							>已錄 {items.length} / 建議 {RECOMMENDED_RECORDINGS}</span
						>
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							onclick={() => startRecording(key as Label)}
							disabled={!pairValue.trim() || (isRecording && !isActive)}
							class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							開始錄音
						</button>
						<button
							onclick={stopRecording}
							disabled={!isActive}
							class="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white enabled:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
						>
							停止
						</button>
					</div>
					{#if isActive}
						<p class="text-sm font-semibold text-blue-700">正在錄 {labelText} ⋯⋯ {timerDisplay}</p>
					{/if}
					<ul class="space-y-3">
						{#each items as rec}
							<li class="flex items-center gap-3 text-sm">
								<div class="flex flex-1 flex-col gap-1">
									<span class="font-medium">第 {rec.index} 次</span>
									<audio controls src={rec.url} class="w-full"></audio>
								</div>
								<button
									onclick={() => removeRecording(key as Label, rec.id)}
									class="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white enabled:hover:bg-red-700"
								>
									重錄
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
		<button
			onclick={resetAll}
			class="rounded-lg bg-gray-800 px-4 py-2 font-semibold text-white hover:bg-gray-900"
		>
			重新開始
		</button>
	</section>

	<section class="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
		<h2 class="text-xl font-semibold">3. 隨機播放測驗（每個詞語 5 題）</h2>
		<p class="text-sm text-gray-600">建議每個詞語至少 10 筆錄音，最低只需各 1 筆即可啟動測驗。</p>
		<div class="space-y-3">
			<label class="space-y-2 font-medium">
				<span>每個詞語測驗次數（預設 5）</span>
				<input
					type="number"
					min={MIN_ROUNDS_PER_LABEL}
					max={MAX_ROUNDS_PER_LABEL}
					bind:value={roundsPerLabel}
					class="w-32 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</label>
			<p class="text-sm text-gray-600">
				目前將進行 {normalizedRounds * 2} 題。 若錄音不足，系統會隨機重複樣本以保持 A/B 題數平衡。
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-4">
			<label class="inline-flex items-center gap-2 font-medium">
				<input
					type="checkbox"
					bind:checked={autoPlayNext}
					class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span>答題後自動播放下一題</span>
			</label>
		</div>
		{#if testError}
			<p class="font-semibold text-red-600">{testError}</p>
		{/if}
		{#if !testActive}
			<button
				onclick={startTest}
				disabled={!readyForTest}
				class="w-full rounded-xl bg-blue-600 px-4 py-3 text-lg font-semibold text-white enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				開始測驗
			</button>
		{/if}

		{#if testActive}
			<div class="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
				<div class="flex items-center justify-between">
					<p class="text-base font-semibold text-gray-800">{progressText}</p>

					<button
						onclick={terminateSession}
						class="w-fit rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
					>
						終止本次測驗
					</button>
				</div>
				<button
					onclick={playCurrentSample}
					class="w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
				>
					播放題目
				</button>
				<div
					class={`flex transform gap-3 transition ${hideChoices ? 'pointer-events-none scale-95 opacity-0' : 'opacity-100'}`}
				>
					<button
						class="choice flex-1 rounded-xl bg-blue-600 px-4 py-3 text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						onclick={() => submitGuess('A')}
						disabled={testItems[currentTestIndex]?.response !== null}
					>
						{labelA}
					</button>
					<button
						class="choice flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-lg font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
						onclick={() => submitGuess('B')}
						disabled={testItems[currentTestIndex]?.response !== null}
					>
						{labelB}
					</button>
				</div>
			</div>
		{/if}

		{#if testComplete}
			<div class="space-y-3 rounded-xl border border-gray-200 p-4">
				<p class="text-lg font-semibold">
					成績：{score} / {totalRounds}（{accuracy}%）
				</p>
				<ol class="space-y-2 text-sm text-gray-700">
					{#each testItems as item, index}
						<li class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
							<span>
								題目 {index + 1}：正解 {item.sample.label === 'A' ? labelA : labelB}， 你的答案
								{item.response ? (item.response === 'A' ? labelA : labelB) : '未作答'}
							</span>
							<span class={item.correct ? 'text-green-600' : 'text-red-600'}>
								{item.correct ? '✔' : '✘'}
							</span>
						</li>
					{/each}
				</ol>
			</div>
		{/if}

		<div class="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
			<div class="space-y-2">
				<button
					onclick={() => exportReport()}
					disabled={!canExport || exporting}
					class="w-full rounded-lg bg-gray-800 px-4 py-2 font-semibold text-white enabled:hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{exporting ? '匯出中⋯⋯' : '匯出最新測驗（ZIP）'}
				</button>
				<p class="text-sm text-gray-600">
					報告包含 report.json 與所有錄音（recordings/*.webm）。可隨時匯出任一已完成測驗。
				</p>
			</div>
			{#if !completedTests.length}
				<p class="text-sm text-gray-500">尚未有可匯出的測驗紀錄。</p>
			{:else}
				<div class="space-y-3">
					<h3 class="text-base font-semibold">已完成測驗</h3>
					<ul class="space-y-2">
						{#each [...completedTests].slice().reverse() as session}
							<li
								class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<p class="text-sm font-semibold">{session.pair.A} / {session.pair.B}</p>
									<p class="text-xs text-gray-600">
										{new Date(session.createdAt).toLocaleString()} · {session.score} / {session.totalRounds}（{session.accuracy}%）
									</p>
								</div>
								<div class="flex items-center gap-2">
									{#if session.exported}
										<span class="text-xs font-semibold text-green-600">已匯出</span>
									{/if}
									<button
										onclick={() => exportReport(session.id)}
										disabled={exporting}
										class="rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white enabled:hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
									>
										匯出
									</button>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if exportError}
				<p class="text-sm font-semibold text-red-600">{exportError}</p>
			{/if}
			{#if exportMessage}
				<p class="text-sm font-semibold text-green-600">{exportMessage}</p>
			{/if}
		</div>
	</section>
</div>
