<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import {
		parsePraatData,
		STANDARD_VOWELS,
		type ParsedResult,
		type VowelDefinition
	} from '$lib/vowel-plotter';
	import { vowelProfiles } from '$lib/stores/vowel-profiles';
	import IconChartScatterPlot from '~icons/mdi/chart-scatter-plot';
	import IconContentPaste from '~icons/mdi/content-paste';
	import IconMicrophone from '~icons/mdi/microphone';
	import IconPlus from '~icons/mdi/plus';
	import IconDownload from '~icons/mdi/download';
	import IconUpload from '~icons/mdi/upload';
	import IconDelete from '~icons/mdi/delete';
	import IconPencil from '~icons/mdi/pencil';
	import VowelChart from '$lib/components/VowelChart.svelte';
	import VowelRecorder from '$lib/components/VowelRecorder.svelte';
	import { findClosestVowel } from '$lib/vowel-plotter';

	let inputData = $state('');
	let result = $state<ParsedResult | null>(null);
	let error = $state('');
	let selectedProfileId = $state('standard');
	let inputMode = $state<'praat' | 'mic'>('mic');

	const activeVowels = $derived(
		selectedProfileId === 'standard'
			? STANDARD_VOWELS
			: $vowelProfiles.find((p) => p.id === selectedProfileId)?.vowels || STANDARD_VOWELS
	);

	function handleAnalyze() {
		error = '';
		result = null;
		if (!inputData.trim()) return;

		try {
			const parsed = parsePraatData(inputData);
			if (!parsed) {
				error = m.vp_error_parse();
				return;
			}
			result = parsed;
		} catch (e) {
			error = m.vp_error_generic();
			console.error(e);
		}
	}

	let drawTrapezium = $state(true);

	function handleExportProfile() {
		const profile = $vowelProfiles.find((p) => p.id === selectedProfileId);
		if (!profile) return;
		const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${profile.name.replace(/\s+/g, '_')}_vowel_profile.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleImportProfile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			if (vowelProfiles.importProfile(text)) {
				// Select the newly imported profile (last one)
				const profiles = $vowelProfiles;
				selectedProfileId = profiles[profiles.length - 1].id;
			}
		};
		reader.readAsText(file);
	}

	function handleDeleteProfile() {
		if (confirm('Are you sure you want to delete this profile?')) {
			vowelProfiles.remove(selectedProfileId);
			selectedProfileId = 'standard';
		}
	}

	function handleVoiceResult(f1: number, f2: number) {
		const closest = findClosestVowel(f1, f2, activeVowels);
		result = {
			averages: { f1, f2, f3: 0 }, // F3 is not estimated by our simple LPC
			closestVowel: closest
		};
	}
</script>

<div class="mx-auto max-w-4xl space-y-8 px-6 py-12">
	<div class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-blue-100 p-2 text-blue-600">
					<IconChartScatterPlot class="h-6 w-6" />
				</div>
				<h1 class="text-3xl font-bold text-gray-900">{m.vowel_plotter_home_title()}</h1>
			</div>
			<div class="flex items-center gap-2">
				<select
					bind:value={selectedProfileId}
					class="rounded-lg border-gray-300 text-sm font-semibold text-gray-700 focus:border-blue-500 focus:ring-blue-500"
				>
					<option value="standard">Standard IPA</option>
					{#each $vowelProfiles as profile}
						<option value={profile.id}>{profile.name}</option>
					{/each}
				</select>
				{#if selectedProfileId !== 'standard'}
					<button
						onclick={handleExportProfile}
						class="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
						title="Export Profile"
					>
						<IconDownload />
					</button>
					<a
						href="/vowel-plotter/profile/{selectedProfileId}"
						class="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
						title={m.wizard_edit_manual()}
					>
						<IconPencil />
					</a>
					<button
						onclick={handleDeleteProfile}
						class="rounded-lg border border-gray-300 p-2 text-red-600 hover:bg-red-50"
						title="Delete Profile"
					>
						<IconDelete />
					</button>
				{/if}
				<label
					class="cursor-pointer rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
					title="Import Profile"
				>
					<input type="file" accept=".json" class="hidden" onchange={handleImportProfile} />
					<IconUpload />
				</label>
				<a
					href="/vowel-plotter/wizard"
					class="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
				>
					<IconPlus />
					{m.vp_add_profile()}
				</a>
			</div>
		</div>
		<p class="text-gray-600">
			{m.vp_description()}
		</p>
	</div>

	<div class="grid gap-8 lg:grid-cols-2">
		<div class="space-y-4">
			<div class="flex gap-2 border-b border-gray-200">
				<button
					onclick={() => (inputMode = 'mic')}
					class="px-4 py-2 text-sm font-semibold transition-colors {inputMode === 'mic'
						? 'border-b-2 border-blue-600 text-blue-600'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					{m.vp_tab_mic()}
				</button>
				<button
					onclick={() => (inputMode = 'praat')}
					class="px-4 py-2 text-sm font-semibold transition-colors {inputMode === 'praat'
						? 'border-b-2 border-blue-600 text-blue-600'
						: 'text-gray-500 hover:text-gray-700'}"
				>
					{m.vp_tab_praat()}
				</button>
			</div>

			<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				{#if inputMode === 'praat'}
					<label for="praat-data" class="mb-2 block text-sm font-semibold text-gray-700">
						{m.vp_input_label()}
					</label>
					<textarea
						id="praat-data"
						bind:value={inputData}
						placeholder="Time_s   F1_Hz   F2_Hz   F3_Hz   F4_Hz&#10;0.580465   564.537559   1596.781229   2332.062939   3454.391843..."
						class="h-64 w-full rounded-xl border-gray-300 font-mono text-sm focus:border-blue-500 focus:ring-blue-500"
					></textarea>
					<div class="mt-4 flex justify-end">
						<button
							onclick={handleAnalyze}
							class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
						>
							<IconContentPaste class="h-4 w-4" />
							{m.vp_analyze_button()}
						</button>
					</div>
				{:else}
					<VowelRecorder onAccept={handleVoiceResult} autoConfirm={true} />
				{/if}
				{#if error}
					<p class="mt-2 text-sm text-red-600">{error}</p>
				{/if}
			</div>

			{#if result}
				<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<h3 class="text-lg font-semibold text-gray-900">{m.vp_results_title()}</h3>
					<div class="mt-4 grid grid-cols-2 gap-4">
						<div class="rounded-xl bg-gray-50 p-4">
							<p class="text-xs font-medium text-gray-500 uppercase">{m.vp_closest_vowel()}</p>
							<p class="mt-1 text-3xl font-bold text-blue-600">{result.closestVowel.ipa}</p>
						</div>
						<div class="space-y-2">
							<div class="flex justify-between border-b border-gray-100 pb-1">
								<span class="text-sm text-gray-600">{m.vp_avg_f1()}</span>
								<span class="font-mono text-sm font-semibold text-gray-900"
									>{result.averages.f1.toFixed(1)} Hz</span
								>
							</div>
							<div class="flex justify-between border-b border-gray-100 pb-1">
								<span class="text-sm text-gray-600">{m.vp_avg_f2()}</span>
								<span class="font-mono text-sm font-semibold text-gray-900"
									>{result.averages.f2.toFixed(1)} Hz</span
								>
							</div>
							<div class="flex justify-between">
								<span class="text-sm text-gray-600">{m.vp_avg_f3()}</span>
								<span class="font-mono text-sm font-semibold text-gray-900"
									>{result.averages.f3.toFixed(1)} Hz</span
								>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
			<h3 class="mb-4 text-lg font-semibold text-gray-900">{m.vp_chart_title()}</h3>
			<label
				for="draw-trapezium"
				class="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-700"
			>
				<input type="checkbox" id="draw-trapezium" bind:checked={drawTrapezium} />
				{m.vp_draw_trapezium()}
			</label>
			<VowelChart
				standardVowels={activeVowels}
				userVowel={result ? result.averages : null}
				showTrapezium={drawTrapezium}
			/>
		</div>
	</div>
</div>
