<script lang="ts">
	let { children } = $props();
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import IconTranslate from '~icons/mdi/translate-variant';

	type Locale = (typeof locales)[number];
</script>

<header class="flex items-center justify-between px-6 py-4 text-sm text-gray-500">
	<a href="/" class="text-sm font-semibold tracking-wide text-blue-600 uppercase"
		>PhonoCoffer 韻匣</a
	>

	<label
		class="flex flex-col gap-1 text-sm font-semibold text-gray-700 sm:flex-row sm:items-center sm:gap-3"
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
