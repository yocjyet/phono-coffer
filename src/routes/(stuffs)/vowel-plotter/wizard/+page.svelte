<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { STANDARD_VOWELS, type VowelDefinition } from '$lib/vowel-plotter';
	import { estimateFormants } from '$lib/audio-analysis';
	import { vowelProfiles } from '$lib/stores/vowel-profiles';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import IconRefresh from '~icons/mdi/refresh';
	import IconArrowRight from '~icons/mdi/arrow-right';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconPencil from '~icons/mdi/pencil';
	import IconPlay from '~icons/mdi/play';
	import IconCheck from '~icons/mdi/check';
	import VowelRecorder from '$lib/components/VowelRecorder.svelte';
	import VowelChart from '$lib/components/VowelChart.svelte';
	import { fade, fly } from 'svelte/transition';

	let step = $state(0); // 0: Name, 1..N: Vowels, N+1: Review
	let profileName = $state('');
	let recordings = $state<Record<string, { f1: number; f2: number; url?: string }>>({});

	const vowelsToRecord = STANDARD_VOWELS; // Record all standard vowels

	let editingProfileId = $state<string | null>(null);

	onMount(() => {
		const id = $page.url.searchParams.get('profileId');
		if (id) {
			const profile = $vowelProfiles.find((p) => p.id === id);
			if (profile) {
				editingProfileId = id;
				profileName = profile.name;
				// Populate recordings
				profile.vowels.forEach((v) => {
					recordings[v.ipa] = { f1: v.f1, f2: v.f2 };
				});
				// Jump to review step
				step = vowelsToRecord.length + 1;
			}
		}
	});

	function handleRecordingComplete(f1: number, f2: number, url?: string) {
		const vowel = vowelsToRecord[step - 1];
		recordings[vowel.ipa] = { f1, f2, url };

		// If we are re-recording (i.e., we jumped back from review), check if we should go back to review
		// Simple heuristic: if we have recordings for all vowels, go to review (step = N + 1)
		// Otherwise, go to next step
		const allRecorded = vowelsToRecord.every((v) => recordings[v.ipa]);
		if (allRecorded) {
			step = vowelsToRecord.length + 1;
		} else {
			nextStep();
		}
	}

	function nextStep() {
		if (step === 0 && !profileName.trim()) {
			profileName = `Profile ${new Date().toLocaleDateString()}`;
		}
		step++;
	}

	function prevStep() {
		if (step > 1) {
			step--;
		} else {
			step = 0;
		}
	}

	function jumpToStep(s: number) {
		// Allow jumping to any step if we are past the name step (step 0)
		// or if we are at step 0 and have a name (or auto-generate one)
		if (step === 0 && s > 0) {
			if (!profileName.trim()) {
				profileName = `Profile ${new Date().toLocaleDateString()}`;
			}
		}
		step = s;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			// Prevent default if it's a form submission to avoid reload, though we don't have a form tag
			// But mostly we want to trigger next step
			// Only trigger if not on review step (which has Save button)
			if (step <= vowelsToRecord.length) {
				nextStep();
			}
		}
	}

	function playRecording(ipa: string) {
		const rec = recordings[ipa];
		if (rec && rec.url) {
			const audio = new Audio(rec.url);
			audio.play();
		}
	}

	function saveProfile() {
		if (!profileName) return;

		const newVowels: VowelDefinition[] = vowelsToRecord.map((v) => ({
			ipa: v.ipa,
			f1: recordings[v.ipa]?.f1 || v.f1, // Fallback to standard if missing (shouldn't happen if flow enforced)
			f2: recordings[v.ipa]?.f2 || v.f2
		}));

		if (editingProfileId) {
			vowelProfiles.update(editingProfileId, {
				name: profileName,
				vowels: newVowels
			});
		} else {
			vowelProfiles.add({
				name: profileName,
				vowels: newVowels
			});
		}

		goto('/vowel-plotter');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-2xl px-6 py-12">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-gray-900">{m.wizard_title()}</h1>
		<div class="mt-2 h-2 w-full rounded-full bg-gray-100">
			<div
				class="h-2 rounded-full bg-blue-600 transition-all duration-300"
				style="width: {(step / (vowelsToRecord.length + 1)) * 100}%"
			></div>
		</div>
	</div>

	<div class="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
		{#if step === 0}
			<div class="space-y-6">
				<div>
					<label for="profile-name" class="block text-sm font-medium text-gray-700"
						>{m.wizard_name_label()}</label
					>
					<input
						type="text"
						id="profile-name"
						bind:value={profileName}
						placeholder={m.wizard_name_placeholder()}
						class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					/>
				</div>
				<div class="flex justify-end">
					<button
						onclick={nextStep}
						class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
					>
						{m.wizard_next()}
						<IconArrowRight />
					</button>
				</div>
			</div>
		{:else if step <= vowelsToRecord.length}
			{@const vowel = vowelsToRecord[step - 1]}
			{@const recordedVowels = Object.entries(recordings).map(([ipa, data]) => ({
				f1: data.f1,
				f2: data.f2,
				label: ipa
			}))}
			<div class="mb-6 flex items-center justify-center gap-2">
				{#each vowelsToRecord as v, i}
					<button
						onclick={() => jumpToStep(i + 1)}
						class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors hover:bg-gray-200 {step ===
						i + 1
							? 'bg-blue-600 text-white hover:bg-blue-700'
							: recordings[v.ipa]
								? 'bg-green-100 text-green-700'
								: 'bg-gray-100 text-gray-400'}"
					>
						{v.ipa}
					</button>
				{/each}
			</div>

			<div class="mb-8 flex justify-center">
				<div class="w-full max-w-md">
					<VowelChart
						width={400}
						height={300}
						highlightVowel={vowel.ipa}
						userVowels={recordedVowels}
						showTrapezium={true}
					/>
				</div>
			</div>

			{#key step}
				<div in:fly={{ x: 20, duration: 300, delay: 300 }} out:fly={{ x: -20, duration: 300 }}>
					<VowelRecorder
						targetVowel={vowel}
						onAccept={handleRecordingComplete}
						autoConfirm={true}
					/>
				</div>
			{/key}

			<div class="mt-8 flex items-center justify-between">
				<button
					onclick={prevStep}
					class="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
				>
					<IconArrowLeft />
					{m.wizard_prev()}
				</button>

				<div class="flex gap-2">
					{#if recordings[vowel.ipa]?.url}
						<button
							onclick={() => playRecording(vowel.ipa)}
							class="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
						>
							<IconPlay />
							{m.wizard_play()}
						</button>
					{/if}
					<button
						onclick={nextStep}
						class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
					>
						{m.wizard_next()}
						<IconArrowRight />
					</button>
				</div>
			</div>
		{:else}
			<div class="space-y-6">
				<h2 class="text-xl font-bold text-gray-900">
					{m.wizard_review_title({ name: profileName })}
				</h2>
				<div class="overflow-hidden rounded-xl border border-gray-200">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
									>{m.wizard_vowel_col()}</th
								>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
									>{m.wizard_f1_col()}</th
								>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
									>{m.wizard_f2_col()}</th
								>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
									>Actions</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each vowelsToRecord as vowel, i}
								<tr>
									<td class="px-4 py-2 text-sm font-bold text-gray-900">/{vowel.ipa}/</td>
									<td class="px-4 py-2 text-sm text-gray-600">
										<input
											type="number"
											value={recordings[vowel.ipa]?.f1.toFixed(0)}
											onchange={(e) => {
												const val = parseFloat(e.currentTarget.value);
												if (!isNaN(val) && recordings[vowel.ipa]) {
													recordings[vowel.ipa].f1 = val;
												}
											}}
											class="w-24 rounded border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500"
										/>
									</td>
									<td class="px-4 py-2 text-sm text-gray-600">
										<input
											type="number"
											value={recordings[vowel.ipa]?.f2.toFixed(0)}
											onchange={(e) => {
												const val = parseFloat(e.currentTarget.value);
												if (!isNaN(val) && recordings[vowel.ipa]) {
													recordings[vowel.ipa].f2 = val;
												}
											}}
											class="w-24 rounded border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500"
										/>
									</td>
									<td class="px-4 py-2 text-sm">
										<button
											onclick={() => {
												step = i + 1;
											}}
											class="inline-flex items-center gap-1 rounded text-blue-600 hover:text-blue-800"
										>
											<IconRefresh class="h-4 w-4" />
											{m.wizard_rerecord()}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="flex justify-end gap-3">
					<button
						onclick={() => {
							step = 0;
							recordings = {};
						}}
						class="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
					>
						{m.wizard_discard_btn()}
					</button>
					<button
						onclick={saveProfile}
						class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
					>
						{m.wizard_save_btn()}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
