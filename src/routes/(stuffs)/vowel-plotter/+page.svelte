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
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let inputData = $state('');
	let result = $state<ParsedResult | null>(null);
	let error = $state('');
	let selectedProfileId = $state('standard');
	let inputMode = $state<'praat' | 'mic'>('mic');
	let showProfileModal = $state(false);
	let dontShowAgain = $state(false);

	// Manual Input State
	let manualVowels = $state<{ id: string; label: string; f1: number; f2: number; color: string }[]>(
		[]
	);

	let vowelSequences = $state<{ id: string; vowelIds: string[]; color?: string }[]>([]);
	let selectedVowelIds = $state<string[]>([]);

	function addManualVowel(f1 = 500, f2 = 1500, label = '', color = '#16a34a') {
		manualVowels.push({
			id: crypto.randomUUID(),
			label,
			f1,
			f2,
			color
		});
	}

	function handleChartClick(f1: number, f2: number) {
		addManualVowel(f1, f2);
	}

	function removeManualVowel(id: string) {
		manualVowels = manualVowels.filter((v) => v.id !== id);
		// Also remove any sequences containing this vowel
		vowelSequences = vowelSequences.filter((seq) => !seq.vowelIds.includes(id));
		selectedVowelIds = selectedVowelIds.filter((vId) => vId !== id);
	}

	function groupVowels() {
		if (selectedVowelIds.length < 2) return;

		vowelSequences.push({
			id: crypto.randomUUID(),
			vowelIds: [...selectedVowelIds],
			color: '#4b5563'
		});

		selectedVowelIds = [];
	}

	function removeSequence(id: string) {
		vowelSequences = vowelSequences.filter((s) => s.id !== id);
	}

	const allSequencedVowelIds = $derived(vowelSequences.flatMap((s) => s.vowelIds));

	const unassignedVowels = $derived(
		manualVowels.filter((v) => !allSequencedVowelIds.includes(v.id))
	);

	function handleDragStart(event: DragEvent, vowelId: string) {
		if (event.dataTransfer) {
			event.dataTransfer.setData('text/plain', vowelId);
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDrop(
		event: DragEvent,
		targetType: 'list' | 'sequence' | 'vowel',
		targetId?: string
	) {
		event.preventDefault();
		event.stopPropagation(); // Prevent bubbling to parent drop zones

		const sourceId = event.dataTransfer?.getData('text/plain');
		if (!sourceId || sourceId === targetId) return;

		// 1. Remove from previous location (sequence)
		// We do this first to "pick it up". If it was unassigned, this step does nothing.
		let wasInSequence = false;
		vowelSequences = vowelSequences
			.map((seq) => {
				if (seq.vowelIds.includes(sourceId)) {
					wasInSequence = true;
					return {
						...seq,
						vowelIds: seq.vowelIds.filter((id) => id !== sourceId)
					};
				}
				return seq;
			})
			.filter((seq) => seq.vowelIds.length > 0); // Cleanup empty sequences

		// 2. Add to new location
		if (targetType === 'list') {
			// Dropped on main list (ungrouping) -> Already removed from sequence, so done.
		} else if (targetType === 'sequence' && targetId) {
			// Add to existing sequence
			const seqIndex = vowelSequences.findIndex((s) => s.id === targetId);
			if (seqIndex !== -1) {
				vowelSequences[seqIndex].vowelIds.push(sourceId);
			}
		} else if (targetType === 'vowel' && targetId) {
			// Create new sequence (Merge)
			// Check if target is already in a sequence?
			// The UI only exposes "unassigned" vowels as drop targets for merging in this specific list loop
			// If target is unassigned, we create a new sequence.
			vowelSequences.push({
				id: crypto.randomUUID(),
				vowelIds: [targetId, sourceId],
				color: '#4b5563'
			});
		}

		// 3. Cleanup: If dragging out left a sequence with < 2 vowels?
		// User requirement "group any vowels". We'll stick to lenient "1+ is a sequence" for now
		// to avoid surprising behavior where a box disappears when you drag one out.
		// But usually we might want to cleanup... let's leave it flexible.
	}

	onMount(() => {
		const remembered = localStorage.getItem('vp_profile_choice_remembered');
		if (!remembered && inputMode === 'mic') {
			showProfileModal = true;
		}
	});

	function handleCreateProfile() {
		if (dontShowAgain) {
			localStorage.setItem('vp_profile_choice_remembered', 'true');
		}
		goto('/vowel-plotter/wizard');
	}

	function handleUseExisting() {
		if (dontShowAgain) {
			localStorage.setItem('vp_profile_choice_remembered', 'true');
		}
		showProfileModal = false;
	}

	function handleResetChoice() {
		localStorage.removeItem('vp_profile_choice_remembered');
		showProfileModal = true;
	}

	// Watch inputMode change to show modal if not remembered
	$effect(() => {
		if (inputMode === 'mic') {
			const remembered = localStorage.getItem('vp_profile_choice_remembered');
			if (!remembered) {
				showProfileModal = true;
			}
		}
	});

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
			addManualVowel(
				parsed.averages.f1,
				parsed.averages.f2,
				parsed.closestVowel?.ipa || '',
				'#2563eb'
			);
		} catch (e) {
			error = m.vp_error_generic();
			console.error(e);
		}
	}

	let drawTrapezium = $state(true);
	let drawBasicVowels = $state(true);

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
		addManualVowel(f1, f2, closest?.ipa || '', '#2563eb');
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
				{#if browser && localStorage.getItem('vp_profile_choice_remembered')}
					<button
						onclick={handleResetChoice}
						class="text-xs text-gray-400 underline hover:text-gray-600"
					>
						{m.vp_profile_reset_choice()}
					</button>
				{/if}
			</div>
		</div>
		<p class="text-gray-600">
			{m.vp_description()}
		</p>
	</div>

	<div class="grid gap-8 lg:grid-cols-2">
		<div class="space-y-6">
			<!-- Manual Input List (Always Visible) -->
			<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<h3 class="mb-4 text-lg font-semibold text-gray-900">{m.vp_manual_list_title()}</h3>
				<div class="space-y-4">
					<div class="flex gap-2">
						<button
							onclick={() => addManualVowel()}
							class="w-full rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
						>
							<IconPlus class="mr-2 inline-block h-4 w-4" />
							{m.vp_manual_add()}
						</button>
						{#if selectedVowelIds.length >= 2}
							<button
								onclick={groupVowels}
								class="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-2 font-semibold whitespace-nowrap text-gray-600 hover:bg-gray-50"
							>
								Group Selected
							</button>
						{/if}
					</div>

					<!-- Drop Zone for Ungrouping (Main List Area) -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						ondragover={(e) => e.preventDefault()}
						ondrop={(e) => handleDrop(e, 'list')}
						class="min-h-[100px] space-y-4 rounded-xl border-2 border-dashed border-transparent transition-colors {vowelSequences.length >
						0
							? 'hover:border-blue-200 hover:bg-blue-50/50'
							: ''}"
					>
						{#if manualVowels.length > 0}
							<div class="space-y-2">
								<!-- Render Sequences First -->
								{#each vowelSequences as seq}
									<div
										class="rounded-xl border border-gray-200 bg-gray-50 p-3"
										ondragover={(e) => e.preventDefault()}
										ondrop={(e) => handleDrop(e, 'sequence', seq.id)}
									>
										<div class="mb-2 flex items-center justify-between">
											<span
												class="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase"
											>
												{m.vp_sequences_title()}
												<span class="font-normal text-gray-400 normal-case">
													{m.vp_drag_ungroup()}
												</span>
											</span>
											<button
												onclick={() => removeSequence(seq.id)}
												class="rounded-lg p-1 text-red-600 hover:bg-red-100"
												title={m.vp_dissolve_sequence()}
											>
												<IconDelete class="h-4 w-4" />
											</button>
										</div>
										<div class="space-y-2">
											{#each seq.vowelIds as vid}
												{@const vowel = manualVowels.find((mv) => mv.id === vid)}
												{#if vowel}
													{@const isSelected = selectedVowelIds.includes(vowel.id)}
													<div
														draggable="true"
														ondragstart={(e) => handleDragStart(e, vowel.id)}
														onclick={() => {
															if (isSelected) {
																selectedVowelIds = selectedVowelIds.filter((id) => id !== vowel.id);
															} else {
																selectedVowelIds = [...selectedVowelIds, vowel.id];
															}
														}}
														class="flex items-center gap-2 rounded-lg border {isSelected
															? 'border-blue-500 bg-blue-50'
															: 'border-transparent bg-white shadow-sm hover:border-gray-300'} cursor-move p-2 transition-all"
													>
														<!-- Drag Handle / Grip Indicator -->
														<div class="cursor-grab text-gray-400">⋮⋮</div>

														<input
															type="text"
															bind:value={vowel.label}
															onclick={(e) => e.stopPropagation()}
															placeholder={m.vp_manual_label()}
															class="w-full min-w-0 flex-1 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
														/>

														<div
															class="flex items-center gap-1"
															onclick={(e) => e.stopPropagation()}
														>
															<span class="text-xs text-gray-500">F1</span>
															<input
																type="number"
																bind:value={vowel.f1}
																class="w-20 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
															/>
														</div>
														<div
															class="flex items-center gap-1"
															onclick={(e) => e.stopPropagation()}
														>
															<span class="text-xs text-gray-500">F2</span>
															<input
																type="number"
																bind:value={vowel.f2}
																class="w-20 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
															/>
														</div>
														<button
															class="overflow-hidden rounded-lg border border-gray-300 p-0"
															title={m.vp_manual_color()}
															onclick={(e) => e.stopPropagation()}
														>
															<input
																type="color"
																bind:value={vowel.color}
																class="h-8 w-8 cursor-pointer border-none p-0"
															/>
														</button>
														<button
															onclick={(e) => {
																e.stopPropagation();
																removeManualVowel(vowel.id);
															}}
															class="rounded-lg p-2 text-red-600 hover:bg-red-100"
															title={m.vp_manual_remove()}
														>
															<IconDelete class="h-4 w-4" />
														</button>
													</div>
												{/if}
											{/each}
										</div>
									</div>
								{/each}

								<!-- Render Unassigned Vowels -->
								{#each unassignedVowels as vowel}
									{@const isSelected = selectedVowelIds.includes(vowel.id)}
									<div
										draggable="true"
										ondragstart={(e) => handleDragStart(e, vowel.id)}
										ondragover={(e) => e.preventDefault()}
										ondrop={(e) => handleDrop(e, 'vowel', vowel.id)}
										class="flex items-center gap-2 rounded-lg border {isSelected
											? 'border-blue-500 bg-blue-50'
											: 'border-gray-100 bg-gray-50'} cursor-pointer p-2 transition-colors"
										onclick={() => {
											if (isSelected) {
												selectedVowelIds = selectedVowelIds.filter((id) => id !== vowel.id);
											} else {
												selectedVowelIds = [...selectedVowelIds, vowel.id];
											}
										}}
									>
										<!-- Drag Handle / Grip Indicator for unassigned too -->
										<div class="cursor-grab text-gray-400">⋮⋮</div>
										<input
											type="text"
											bind:value={vowel.label}
											onclick={(e) => e.stopPropagation()}
											placeholder={m.vp_manual_label()}
											class="w-full min-w-0 flex-1 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
										/>
										<div class="flex items-center gap-1">
											<span class="text-xs text-gray-500">F1</span>
											<input
												type="number"
												bind:value={vowel.f1}
												class="w-20 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
											/>
										</div>
										<div class="flex items-center gap-1">
											<span class="text-xs text-gray-500">F2</span>
											<input
												type="number"
												bind:value={vowel.f2}
												class="w-20 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
											/>
										</div>
										<button
											class="overflow-hidden rounded-lg border border-gray-300 p-0"
											title={m.vp_manual_color()}
										>
											<input
												type="color"
												bind:value={vowel.color}
												class="h-8 w-8 cursor-pointer border-none p-0"
											/>
										</button>
										<button
											onclick={() => removeManualVowel(vowel.id)}
											class="rounded-lg p-2 text-red-600 hover:bg-red-100"
											title={m.vp_manual_remove()}
										>
											<IconDelete class="h-4 w-4" />
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Input Tabs -->
			<div>
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

				<div class="rounded-b-2xl border-x border-b border-gray-200 bg-white p-6 shadow-sm">
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
			<label
				for="hide-basic-vowels"
				class="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-700"
			>
				<input type="checkbox" id="hide-basic-vowels" bind:checked={drawBasicVowels} />
				{m.vp_draw_basic_vowels()}
			</label>
			<VowelChart
				standardVowels={activeVowels}
				userVowels={manualVowels}
				userVowelSequences={vowelSequences}
				bind:selectedVowelIds
				showTrapezium={drawTrapezium}
				{drawBasicVowels}
				onChartClick={handleChartClick}
			/>
		</div>
	</div>
</div>

{#if showProfileModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div class="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
			<h2 class="text-xl font-bold text-gray-900">{m.vp_profile_modal_title()}</h2>
			<p class="mt-2 text-gray-600">
				{m.vp_profile_modal_desc()}
			</p>

			<div class="mt-6 flex flex-col gap-3">
				<button
					onclick={handleCreateProfile}
					class="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
				>
					<IconPlus />
					{m.vp_profile_modal_create()}
				</button>
				<button
					onclick={handleUseExisting}
					class="w-full rounded-xl border border-gray-300 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-50"
				>
					{m.vp_profile_modal_existing()}
				</button>
			</div>

			<div class="mt-4 flex items-center justify-center">
				<label class="flex items-center gap-2 text-sm text-gray-500">
					<input type="checkbox" bind:checked={dontShowAgain} class="rounded border-gray-300" />
					{m.vp_profile_modal_remember()}
				</label>
			</div>
		</div>
	</div>
{/if}
