<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
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

	type Locale = (typeof locales)[number];

	const localeNames: Record<Locale, string> = {
		'zh-hant': '繁體中文',
		en: 'English',
		'zh-hans': '简体中文',
		ja: '日本語'
	};

	const localeList = locales as readonly Locale[];

	const initialLocale = (() => {
		let fallback = localeList[0];
		try {
			const resolved = getLocale() as Locale;
			if (localeList.includes(resolved)) {
				fallback = resolved;
			}
		} catch {
			/* no-op, fallback already set */
		}
		return fallback;
	})();

	let activeLocale = $state<Locale>(initialLocale);

	function switchLocale(locale: Locale) {
		if (locale === activeLocale) return;
		setLocale(locale, { reload: false });
		activeLocale = locale;
	}

	const RECORDER_MIME_CANDIDATES = [
		'audio/webm;codecs=opus',
		'audio/webm',
		'audio/ogg;codecs=opus',
		'audio/ogg',
		'audio/mp4;codecs=mp4a.40.2',
		'audio/mp4',
		'audio/aac'
	];

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
	let recorderMimeType = $state<string | null>(null);

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

	let labelA = $derived(pairA.trim() || m.label_word_a());
	let labelB = $derived(pairB.trim() || m.label_word_b());
	let readyForTest = $derived(
		recordings.A.length >= MIN_RECORDINGS_FOR_TEST && recordings.B.length >= MIN_RECORDINGS_FOR_TEST
	);
	let normalizedRounds = $derived(clampRounds(roundsPerLabel));
	let totalRounds = $derived(testItems.length || normalizedRounds * 2);
	let progressText = $derived(
		testActive && testItems.length
			? m.progress_label(
					{ current: currentTestIndex + 1, total: testItems.length },
					{ locale: activeLocale }
				)
			: ''
	);
	let accuracy = $derived(
		testComplete && testItems.length ? Math.round((score / testItems.length) * 100) : 0
	);
	let correctAnswers = $derived(score);
	let incorrectAnswers = $derived(Math.max(totalRounds - score, 0));
	let timerDisplay = $derived(isRecording ? formatDuration(recordingTimer) : '00:00');
	let hasRecordings = $derived(recordings.A.length + recordings.B.length > 0);
	let hasUnexportedTests = $derived(completedTests.some((test) => !test.exported));
	let canExport = $derived(hasRecordings && completedTests.length > 0);

	function detectSupportedMimeType() {
		if (
			typeof MediaRecorder === 'undefined' ||
			typeof MediaRecorder.isTypeSupported !== 'function'
		) {
			return null;
		}
		for (const type of RECORDER_MIME_CANDIDATES) {
			if (MediaRecorder.isTypeSupported(type)) {
				return type;
			}
		}
		return null;
	}

	async function ensureRecorder() {
		if (!browser) {
			recordError = m.error_browser_only();
			return false;
		}
		if (!navigator.mediaDevices?.getUserMedia) {
			recordError = m.error_no_media();
			return false;
		}
		if (!stream) {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		}
		if (!mediaRecorder) {
			if (!recorderMimeType) {
				recorderMimeType = detectSupportedMimeType();
			}
			const options = recorderMimeType ? { mimeType: recorderMimeType } : undefined;
			try {
				mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
			} catch (err) {
				recordError = m.error_unsupported_format(
					{ message: (err as Error).message },
					{ locale: activeLocale }
				);
				return false;
			}
			if (mediaRecorder.mimeType) {
				recorderMimeType = mediaRecorder.mimeType;
			}
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

		const fallbackType = audioChunks[0]?.type || 'audio/webm';
		const mimeType = recorderMimeType ?? fallbackType;
		const blob = new Blob(audioChunks, { type: mimeType });
		const url = URL.createObjectURL(blob);
		objectUrls.push(url);

		const newRecording: Recording = {
			id: createId(),
			label: recordingTarget,
			blob,
			url,
			index: recordings[recordingTarget].length + 1,
			mimeType
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
			recordError = m.error_missing_pairs();
			return;
		}
		if (isRecording) {
			recordError = m.error_active_recording();
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
			recordError = m.error_start_recording(
				{ message: (err as Error).message },
				{ locale: activeLocale }
			);
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
			testError = m.error_min_recordings(
				{ min: MIN_RECORDINGS_FOR_TEST },
				{ locale: activeLocale }
			);
			return;
		}
		if (browser && hasUnexportedTests) {
			const proceed = window.confirm(m.confirm_new_test());
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

	function confirmReset() {
		if (!browser) {
			resetAll();
			return;
		}
		const confirmed = window.confirm(m.confirm_reset());
		if (confirmed) {
			resetAll();
		}
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
			exportError = m.no_export_records();
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
			exportMessage = m.export_success();
		} catch (err) {
			exportError = m.export_failure({ message: (err as Error).message });
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
		const confirmed = window.confirm(m.confirm_terminate());
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

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<div class="space-y-8 p-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<h1 class="text-3xl font-bold">{m.app_title()}</h1>
		<label
			class="flex flex-col gap-1 text-sm font-semibold text-gray-700 sm:flex-row sm:items-center sm:gap-3"
		>
			<span>{m.language_label()}</span>
			<select
				value={activeLocale}
				onchange={(event) =>
					switchLocale((event.currentTarget as HTMLSelectElement).value as Locale)}
				class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			>
				{#each localeList as locale}
					<option value={locale}>{localeNames[locale]}</option>
				{/each}
			</select>
		</label>
	</div>

	<section class="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
		<h2 class="text-xl font-semibold">{m.step_input_title()}</h2>
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="space-y-2 font-medium">
				<span>{m.label_word_a()}</span>
				<input
					type="text"
					placeholder={m.placeholder_word_a()}
					bind:value={pairA}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</label>
			<label class="space-y-2 font-medium">
				<span>{m.label_word_b()}</span>
				<input
					type="text"
					placeholder={m.placeholder_word_b()}
					bind:value={pairB}
					class="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</label>
		</div>
		<p class="text-sm text-gray-600">{m.step_input_hint()}</p>
	</section>

	<section class="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
		<h2 class="text-xl font-semibold">{m.step_record_title()}</h2>
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
						<span class="text-sm text-gray-600">
							{m.recordings_summary(
								{ count: items.length, recommended: RECOMMENDED_RECORDINGS },
								{ locale: activeLocale }
							)}
						</span>
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							onclick={() => startRecording(key as Label)}
							disabled={!pairValue.trim() || (isRecording && !isActive)}
							class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{m.start_recording()}
						</button>
						<button
							onclick={stopRecording}
							disabled={!isActive}
							class="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white enabled:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{m.stop_recording()}
						</button>
					</div>
					{#if isActive}
						<p class="text-sm font-semibold text-blue-700">
							{m.recording_status(
								{ label: labelText, timer: timerDisplay },
								{ locale: activeLocale }
							)}
						</p>
					{/if}
					<ul class="space-y-3">
						{#each items as rec}
							<li class="flex items-center gap-3 text-sm">
								<div class="flex flex-1 flex-col gap-1">
									<span class="font-medium">
										{m.recording_iteration({ index: rec.index })}
									</span>
									<audio controls src={rec.url} class="w-full"></audio>
								</div>
								<button
									onclick={() => removeRecording(key as Label, rec.id)}
									class="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white enabled:hover:bg-red-700"
								>
									{m.re_record()}
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
		<button
			onclick={() => confirmReset()}
			class="rounded-lg bg-gray-800 px-4 py-2 font-semibold text-white hover:bg-gray-900"
		>
			{m.clear_recordings()}
		</button>
	</section>

	<section class="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
		<h2 class="text-xl font-semibold">{m.step_test_title()}</h2>
		<p class="text-sm text-gray-600">{m.step_test_hint()}</p>
		<div class="space-y-3">
			<label class="space-y-2 font-medium">
				<span>{m.rounds_label()}</span>
				<input
					type="number"
					min={MIN_ROUNDS_PER_LABEL}
					max={MAX_ROUNDS_PER_LABEL}
					bind:value={roundsPerLabel}
					class="w-32 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</label>
			<p class="text-sm text-gray-600">
				{m.rounds_summary({ total: normalizedRounds * 2 })}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-4">
			<label class="inline-flex items-center gap-2 font-medium">
				<input
					type="checkbox"
					bind:checked={autoPlayNext}
					class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span>{m.auto_play_label()}</span>
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
				{m.start_test()}
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
						{m.terminate_test()}
					</button>
				</div>
				<button
					onclick={playCurrentSample}
					class="w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
				>
					{m.play_prompt()}
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
					{m.score_summary({ score, total: totalRounds, accuracy })}
				</p>
				<p class="text-sm text-gray-700">
					{m.correct_wrong_summary(
						{ correct: correctAnswers, incorrect: incorrectAnswers },
						{ locale: activeLocale }
					)}
				</p>
				<ol class="space-y-2 text-sm text-gray-700">
					{#each testItems as item, index}
						{@const correctLabel = item.sample.label === 'A' ? labelA : labelB}
						{@const answerLabel = item.response
							? item.response === 'A'
								? labelA
								: labelB
							: m.unanswered()}
						<li class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
							<span>
								{m.question_feedback(
									{ index: index + 1, correct: correctLabel, answer: answerLabel },
									{ locale: activeLocale }
								)}
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
					{exporting ? m.export_btn_loading() : m.export_btn_ready()}
				</button>
				<p class="text-sm text-gray-600">
					{m.export_info()}
				</p>
			</div>
			{#if !completedTests.length}
				<p class="text-sm text-gray-500">{m.no_export_records()}</p>
			{:else}
				<div class="space-y-3">
					<h3 class="text-base font-semibold">
						{m.completed_tests_title()}
					</h3>
					<ul class="space-y-2">
						{#each [...completedTests].slice().reverse() as session}
							<li
								class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<p class="text-sm font-semibold">{session.pair.A} / {session.pair.B}</p>
									<p class="text-xs text-gray-600">
										{m.session_meta(
											{
												timestamp: new Date(session.createdAt).toLocaleString(),
												score: session.score,
												total: session.totalRounds,
												accuracy: session.accuracy
											},
											{ locale: activeLocale }
										)}
									</p>
									<p class="text-xs text-gray-600">
										{m.correct_wrong_summary(
											{
												correct: session.score,
												incorrect: Math.max(session.totalRounds - session.score, 0)
											},
											{ locale: activeLocale }
										)}
									</p>
								</div>
								<div class="flex items-center gap-2">
									{#if session.exported}
										<span class="text-xs font-semibold text-green-600">
											{m.exported_badge()}
										</span>
									{/if}
									<button
										onclick={() => exportReport(session.id)}
										disabled={exporting}
										class="rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white enabled:hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{m.export_button()}
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
