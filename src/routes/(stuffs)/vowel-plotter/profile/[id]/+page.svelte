<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { vowelProfiles } from '$lib/stores/vowel-profiles';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { VowelDefinition } from '$lib/vowel-plotter';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import IconMicrophone from '~icons/mdi/microphone';
	import IconContentSave from '~icons/mdi/content-save';
	import IconDelete from '~icons/mdi/delete';
	import VowelRecorder from '$lib/components/VowelRecorder.svelte';
	import VowelChart from '$lib/components/VowelChart.svelte';

	let profileId = $state('');
	let profileName = $state('');
	let vowels = $state<VowelDefinition[]>([]);
	let recordingVowel = $state<VowelDefinition | null>(null);
	let error = $state('');

	onMount(() => {
		profileId = page.params.id ?? '';
		const profile = $vowelProfiles.find((p) => p.id === profileId);
		if (profile) {
			profileName = profile.name;
			// Deep copy to avoid mutating store directly until save
			vowels = JSON.parse(JSON.stringify(profile.vowels));
		} else {
			error = m.editor_not_found();
		}
	});

	function handleSave() {
		if (!profileId || !profileName) return;
		vowelProfiles.update(profileId, {
			name: profileName,
			vowels: vowels
		});
		goto('/vowel-plotter');
	}

	function handleDelete() {
		if (confirm('Are you sure you want to delete this profile?')) {
			vowelProfiles.remove(profileId);
			goto('/vowel-plotter');
		}
	}

	function handleRecordingComplete(f1: number, f2: number) {
		if (recordingVowel) {
			const index = vowels.findIndex((v) => v.ipa === recordingVowel!.ipa);
			if (index !== -1) {
				vowels[index].f1 = f1;
				vowels[index].f2 = f2;
			}
			recordingVowel = null;
		}
	}
</script>

<div class="mx-auto max-w-4xl px-6 py-12">
	{#if error}
		<div class="rounded-xl bg-red-50 p-4 text-red-700">
			{error}
			<a href="/vowel-plotter" class="ml-2 underline">Go back</a>
		</div>
	{:else}
		<div class="mb-8 flex items-center justify-between">
			<div class="flex items-center gap-4">
				<a
					href="/vowel-plotter"
					class="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
				>
					<IconArrowLeft class="h-6 w-6" />
				</a>
				<h1 class="text-2xl font-bold text-gray-900">{m.editor_title()}</h1>
			</div>
			<div class="flex gap-2">
				<button
					onclick={handleDelete}
					class="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
				>
					<IconDelete />
					{m.wizard_discard_btn()}
				</button>
				<button
					onclick={handleSave}
					class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
				>
					<IconContentSave />
					{m.wizard_save_btn()}
				</button>
			</div>
		</div>

		<div class="space-y-8">
			<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
				<label for="profile-name" class="block text-sm font-medium text-gray-700"
					>{m.wizard_name_label()}</label
				>
				<input
					type="text"
					id="profile-name"
					bind:value={profileName}
					class="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
				/>
			</div>

			<div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
								>{m.wizard_vowel_col()}</th
							>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
								>{m.wizard_f1_col()}</th
							>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
								>{m.wizard_f2_col()}</th
							>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
								>Actions</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each vowels as vowel}
							<tr>
								<td class="px-6 py-4 text-sm font-bold text-gray-900">/{vowel.ipa}/</td>
								<td class="px-6 py-4">
									<input
										type="number"
										bind:value={vowel.f1}
										class="w-24 rounded border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500"
									/>
								</td>
								<td class="px-6 py-4">
									<input
										type="number"
										bind:value={vowel.f2}
										class="w-24 rounded border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500"
									/>
								</td>
								<td class="px-6 py-4">
									<button
										onclick={() => (recordingVowel = vowel)}
										class="inline-flex items-center gap-1 rounded text-blue-600 hover:text-blue-800"
									>
										<IconMicrophone class="h-4 w-4" />
										{m.wizard_rerecord()}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	{#if recordingVowel}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		>
			<div class="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
				<div class="mb-6 flex justify-center">
					<VowelChart
						width={400}
						height={300}
						highlightVowel={recordingVowel.ipa}
						showTrapezium={true}
					/>
				</div>
				<VowelRecorder
					targetVowel={recordingVowel}
					onAccept={handleRecordingComplete}
					onCancel={() => (recordingVowel = null)}
					autoConfirm={true}
				/>
			</div>
		</div>
	{/if}
</div>
