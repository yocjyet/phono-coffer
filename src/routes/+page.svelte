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
	let canExport = $derived(hasRecordings && testItems.length > 0);

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
		hideChoices = false;
		clearHideChoicesTimer();
		const perLabel = normalizedRounds;
		lastUsedRoundsPerLabel = perLabel;

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

	async function exportReport() {
		exportError = '';
		exportMessage = '';
		if (!canExport) {
			exportError = '請先完成錄音並啟動至少一次測驗。';
			return;
		}
		exporting = true;
		try {
			const { blob } = await createReportZip({
				recordings,
				testItems,
				pair: { A: labelA, B: labelB },
				requestedRoundsPerLabel: normalizedRounds,
				executedRoundsPerLabel: testItems.length ? testItems.length / 2 : lastUsedRoundsPerLabel,
				score
			});
			const filename = createReportFilename({ A: labelA, B: labelB });
			downloadBlob(blob, filename);
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
</script>

<div class="page">
	<h1>最小對自測系統</h1>

	<section>
		<h2>1. 輸入最小對詞語</h2>
		<div class="pair-inputs">
			<label>
				<span>詞語 A</span>
				<input type="text" placeholder="例如：ship" bind:value={pairA} />
			</label>
			<label>
				<span>詞語 B</span>
				<input type="text" placeholder="例如：sheep" bind:value={pairB} />
			</label>
		</div>
		<p class="hint">建議輸入完整詞語或音標，方便測試時辨識。</p>
	</section>

	<section>
		<h2>2. 錄音（建議每個詞語 10 次）</h2>
		{#if recordError}
			<p class="error">{recordError}</p>
		{/if}
		<div class="record-grid">
			<div class={`record-card ${isRecording === 'A' ? 'active' : ''}`}>
				<h3>{labelA}</h3>
				<p>已錄 {recordings.A.length} 次（建議 ≧ {RECOMMENDED_RECORDINGS} 次）</p>
				<div class="record-actions">
					<button
						onclick={() => startRecording('A')}
						disabled={!pairA.trim() || (isRecording && isRecording !== 'A')}
					>
						開始錄音
					</button>
					<button onclick={stopRecording} disabled={isRecording !== 'A'}>停止</button>
				</div>
				{#if isRecording === 'A'}
					<p class="recording-indicator">正在錄 {labelA} ⋯⋯ {timerDisplay}</p>
				{/if}
				<ul>
					{#each recordings.A as rec}
						<li class="take-row">
							<div class="take-body">
								<span>第 {rec.index} 次</span>
								<audio controls src={rec.url}></audio>
							</div>
							<button class="delete" onclick={() => removeRecording('A', rec.id)}>重錄</button>
						</li>
					{/each}
				</ul>
			</div>
			<div class={`record-card ${isRecording === 'B' ? 'active' : ''}`}>
				<h3>{labelB}</h3>
				<p>已錄 {recordings.B.length} 次（建議 ≧ {RECOMMENDED_RECORDINGS} 次）</p>
				<div class="record-actions">
					<button
						onclick={() => startRecording('B')}
						disabled={!pairB.trim() || (isRecording && isRecording !== 'B')}
					>
						開始錄音
					</button>
					<button onclick={stopRecording} disabled={isRecording !== 'B'}>停止</button>
				</div>
				{#if isRecording === 'B'}
					<p class="recording-indicator">正在錄 {labelB} ⋯⋯ {timerDisplay}</p>
				{/if}
				<ul>
					{#each recordings.B as rec}
						<li class="take-row">
							<div class="take-body">
								<span>第 {rec.index} 次</span>
								<audio controls src={rec.url}></audio>
							</div>
							<button class="delete" onclick={() => removeRecording('B', rec.id)}>重錄</button>
						</li>
					{/each}
				</ul>
			</div>
		</div>
		<button class="secondary" onclick={resetAll}>重新開始</button>
	</section>

	<section>
		<h2>3. 隨機播放測驗（每個詞語 5 題）</h2>
		<p class="hint">建議每個詞語至少 10 筆錄音，最低只需各 1 筆即可啟動測驗。</p>
		<div class="rounds-control">
			<label>
				<span>每個詞語測驗次數（預設 5）</span>
				<input
					type="number"
					min={MIN_ROUNDS_PER_LABEL}
					max={MAX_ROUNDS_PER_LABEL}
					bind:value={roundsPerLabel}
				/>
			</label>
			<p class="hint">
				目前將進行 {normalizedRounds * 2} 題。 若錄音不足，系統會隨機重複樣本以保持 A/B 題數平衡。
			</p>
		</div>
		<div class="options-row">
			<label class="option-line">
				<input type="checkbox" bind:checked={autoPlayNext} />
				<span>答題後自動播放下一題</span>
			</label>
		</div>
		{#if testError}
			<p class="error">{testError}</p>
		{/if}
		<button class="primary" onclick={startTest} disabled={!readyForTest}>開始測驗</button>

		{#if testActive}
			<div class="test-panel">
				<p class="progress">{progressText}</p>
				<button class="play" onclick={playCurrentSample}>播放題目</button>
				<div class="guess-buttons" class:collapsed={hideChoices}>
					<button
						class="choice"
						onclick={() => submitGuess('A')}
						disabled={testItems[currentTestIndex]?.response !== null}
					>
						{labelA}
					</button>
					<button
						class="choice"
						onclick={() => submitGuess('B')}
						disabled={testItems[currentTestIndex]?.response !== null}
					>
						{labelB}
					</button>
				</div>
			</div>
		{/if}

		{#if testComplete}
			<div class="results">
				<p>
					成績：{score} / {totalRounds}（{accuracy}%）
				</p>
				<ol>
					{#each testItems as item, index}
						<li>
							題目 {index + 1}：正解 {item.sample.label === 'A' ? labelA : labelB}， 你的答案 {item.response
								? item.response === 'A'
									? labelA
									: labelB
								: '未作答'}
							<span class={item.correct ? 'correct' : 'incorrect'}>
								{item.correct ? '✔' : '✘'}
							</span>
						</li>
					{/each}
				</ol>
			</div>
		{/if}

		<div class="export-panel">
			<button class="secondary" onclick={exportReport} disabled={!canExport || exporting}>
				{exporting ? '匯出中⋯⋯' : '匯出報告（ZIP）'}
			</button>
			<p class="hint">
				報告包含 report.json 與所有錄音（recordings/*.webm）。需至少執行一次測驗才可匯出。
			</p>
			{#if exportError}
				<p class="error small">{exportError}</p>
			{/if}
			{#if exportMessage}
				<p class="success">{exportMessage}</p>
			{/if}
		</div>
	</section>
</div>

<style>
	.page {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	h1 {
		font-size: 1.75rem;
		font-weight: 700;
	}

	section {
		border: 1px solid #ddd;
		border-radius: 0.75rem;
		padding: 1.25rem;
		background: #fff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	.pair-inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-weight: 500;
	}

	input {
		border: 1px solid #ccc;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		font-size: 1rem;
	}

	.hint {
		font-size: 0.9rem;
		color: #555;
		margin-top: 0.5rem;
	}

	.record-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
	}

	.record-card {
		border: 1px solid #eee;
		border-radius: 0.75rem;
		padding: 1rem;
		background: #fafafa;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.record-actions {
		display: flex;
		gap: 0.5rem;
	}

	button {
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem 0.9rem;
		font-weight: 600;
		background: #0f62fe;
		color: #fff;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			filter 0.15s ease;
	}

	button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 10px rgba(15, 98, 254, 0.25);
		filter: brightness(1.05);
	}

	button:active:not(:disabled) {
		transform: translateY(0);
		box-shadow: 0 2px 4px rgba(15, 98, 254, 0.3);
	}

	.record-card.active {
		border-color: #0f62fe;
		box-shadow: 0 0 0 2px rgba(15, 98, 254, 0.2);
	}

	.recording-indicator {
		font-weight: 600;
		color: #0f62fe;
	}

	.delete {
		background: #c62828;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button.primary {
		padding: 0.9rem 1.5rem;
		font-size: 1.05rem;
	}

	.secondary {
		background: #555;
	}

	.export-panel {
		margin-top: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.rounds-control {
		margin: 1rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.rounds-control input {
		max-width: 120px;
	}

	.options-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin: 0.75rem 0 0.5rem;
	}

	.option-line {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
	}

	.option-line input[type='checkbox'] {
		width: 1.25rem;
		height: 1.25rem;
		accent-color: #0f62fe;
	}

	ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.take-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.take-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	audio {
		width: 100%;
	}

	.error {
		color: #d82c0d;
		font-weight: 600;
	}

	.error.small {
		font-size: 0.9rem;
	}

	.success {
		color: #24a148;
		font-weight: 600;
	}

	.test-panel {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.progress {
		font-weight: 600;
	}

	.play {
		background: #24a148;
	}

	.guess-buttons {
		display: flex;
		gap: 0.5rem;
		transition:
			opacity 0.2s ease,
			transform 0.2s ease;
	}

	.guess-buttons.collapsed {
		opacity: 0;
		transform: scale(0.95);
		pointer-events: none;
	}

	.guess-buttons .choice {
		flex: 1;
		font-size: 1.15rem;
		padding: 1rem;
		min-height: 3.5rem;
	}

	.results {
		margin-top: 1rem;
		border-top: 1px solid #eee;
		padding-top: 1rem;
	}

	.results ol {
		margin-top: 0.75rem;
		padding-left: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.correct {
		color: #2e7d32;
		margin-left: 0.25rem;
	}

	.incorrect {
		color: #c62828;
		margin-left: 0.25rem;
	}
</style>
