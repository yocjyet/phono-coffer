<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { estimateFormants } from '$lib/audio-analysis';
	import IconMicrophone from '~icons/mdi/microphone';
	import IconStop from '~icons/mdi/stop';
	import IconCheck from '~icons/mdi/check';
	import IconRefresh from '~icons/mdi/refresh';
	import VowelChart from '$lib/components/VowelChart.svelte';
	import type { VowelDefinition } from '$lib/vowel-plotter';

	let {
		targetVowel,
		onAccept,
		onCancel
	}: {
		targetVowel: VowelDefinition;
		onAccept: (f1: number, f2: number) => void;
		onCancel?: () => void;
	} = $props();

	let isRecording = $state(false);
	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];
	let currentAnalysis = $state<{ f1: number; f2: number } | null>(null);
	let error = $state('');
	let processing = $state(false);

	async function startRecording() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(stream);
			audioChunks = [];

			mediaRecorder.ondataavailable = (event) => {
				audioChunks.push(event.data);
			};

			mediaRecorder.onstop = async () => {
				const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
				await analyzeAudio(audioBlob);
				stream.getTracks().forEach((track) => track.stop());
			};

			mediaRecorder.start();
			isRecording = true;
			error = '';
		} catch (e) {
			console.error('Error starting recording:', e);
			error = m.vp_error_parse();
		}
	}

	function stopRecording() {
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
			isRecording = false;
		}
	}

	async function analyzeAudio(blob: Blob) {
		processing = true;
		try {
			const arrayBuffer = await blob.arrayBuffer();
			const audioContext = new AudioContext();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			const formants = await estimateFormants(audioBuffer);
			currentAnalysis = formants;
		} catch (e) {
			console.error('Analysis failed:', e);
			error = m.vp_error_generic();
		} finally {
			processing = false;
		}
	}

	function handleAccept() {
		if (currentAnalysis) {
			onAccept(currentAnalysis.f1, currentAnalysis.f2);
			currentAnalysis = null;
		}
	}
</script>

<div class="space-y-8 text-center">
	<div>
		<p class="text-sm tracking-wide text-gray-500 uppercase">{m.wizard_recording_vowel()}</p>
		<h2 class="mt-2 text-6xl font-bold text-gray-900">/{targetVowel.ipa}/</h2>
	</div>

	<div class="mx-auto max-w-md">
		<VowelChart
			width={400}
			height={300}
			highlightVowel={targetVowel.ipa}
			userVowel={currentAnalysis}
			showTrapezium={true}
		/>
	</div>

	<div class="flex justify-center">
		{#if !isRecording && !currentAnalysis && !processing}
			<button
				onclick={startRecording}
				class="flex h-24 w-24 flex-col items-center justify-center gap-2 rounded-full bg-red-100 text-red-600 transition hover:bg-red-200"
			>
				<IconMicrophone class="h-8 w-8" />
				<span class="text-xs font-semibold">{m.wizard_record_btn()}</span>
			</button>
		{:else if isRecording}
			<button
				onclick={stopRecording}
				class="flex h-24 w-24 animate-pulse flex-col items-center justify-center gap-2 rounded-full bg-red-600 text-white"
			>
				<IconStop class="h-8 w-8" />
				<span class="text-xs font-semibold">{m.wizard_stop_btn()}</span>
			</button>
		{:else if processing}
			<div class="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
				></div>
			</div>
		{:else if currentAnalysis}
			<div class="space-y-4">
				<div class="grid grid-cols-2 gap-4 text-left">
					<div class="rounded-lg bg-gray-50 p-3">
						<p class="text-xs text-gray-500">{m.wizard_detected_f1()}</p>
						<p class="font-mono text-xl font-bold text-gray-900">
							{currentAnalysis.f1.toFixed(0)} Hz
						</p>
					</div>
					<div class="rounded-lg bg-gray-50 p-3">
						<p class="text-xs text-gray-500">{m.wizard_detected_f2()}</p>
						<p class="font-mono text-xl font-bold text-gray-900">
							{currentAnalysis.f2.toFixed(0)} Hz
						</p>
					</div>
				</div>
				<div class="flex justify-center gap-3">
					<button
						onclick={() => {
							currentAnalysis = null;
						}}
						class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
					>
						<IconRefresh />
						{m.wizard_retry_btn()}
					</button>
					<button
						onclick={handleAccept}
						class="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
					>
						<IconCheck />
						{m.wizard_accept_btn()}
					</button>
				</div>
			</div>
		{/if}
	</div>

	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}

	{#if onCancel}
		<button onclick={onCancel} class="text-sm text-gray-500 underline hover:text-gray-700">
			Cancel
		</button>
	{/if}
</div>
