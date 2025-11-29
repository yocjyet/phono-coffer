<script lang="ts">
	let { children } = $props();
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import IconTranslate from '~icons/mdi/translate-variant';
	import { page } from '$app/state';

	type Locale = (typeof locales)[number];
</script>

<svelte:head>
	<title>{page.data.metadata?.title || 'Untitled'} | PhonoCoffer 韻匣</title>
</svelte:head>

<header
	class="relative flex flex-col gap-4 border-b border-gray-100 bg-white/80 py-4 pr-28 pl-6 text-sm text-gray-500 shadow-sm"
>
	<div class="flex flex-col gap-2">
		<a href="/" class="text-sm font-semibold tracking-wide text-blue-600 uppercase"
			>PhonoCoffer 韻匣</a
		>
		<div class="flex items-center gap-4">
			<h1 class="text-2xl font-bold text-black">{page.data.metadata.title}</h1>
			{#if page.url.pathname !== '/vowel-plotter'}
				<a href="/vowel-plotter" class="text-sm font-semibold text-gray-500 hover:text-blue-600">
					{m.vowel_plotter_home_title()}
				</a>
			{/if}
		</div>
	</div>

	<label
		class="absolute top-4 right-6 flex h-full items-center gap-3 text-sm font-semibold text-gray-700"
	>
		<span class="flex items-center gap-2">
			<IconTranslate class="h-4 w-4 text-blue-600" aria-hidden="true" />
			{m.language_label()}
		</span>
		<select
			value={getLocale()}
			onchange={(event) => setLocale(event.currentTarget.value as Locale)}
			class="rounded-lg border border-gray-300 py-2 pr-8 pl-3 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		>
			{#each locales as locale}
				<option value={locale}
					>{new Intl.DisplayNames([locale], { type: 'language' }).of(locale)}</option
				>
			{/each}
		</select>
	</label>
</header>

{@render children?.()}
