<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import minimalPairsShot from '$lib/assets/screenshots/minimal-pairs.png';

	type UpcomingTool = {
		title: string;
		description: string;
		eta: string;
		highlights: string[];
	};
	const upcomingTools: UpcomingTool[] = [
		// {
		// 	title: 'Accent Drills',
		// 	description: 'Adaptive articulation reps with AI feedback and smart pacing nudges.',
		// 	eta: 'Beta Q1',
		// 	highlights: ['Shadowing coach', 'Stress pattern tracker', 'Homework exports']
		// },
		// {
		// 	title: 'Phoneme Bingo',
		// 	description: 'Live classroom game that rewards quick identification of minimal contrasts.',
		// 	eta: 'Spring',
		// 	highlights: ['Live host mode', 'Audio-only tiles', 'Instant leaderboards']
		// },
		// {
		// 	title: 'Instructor Dashboard',
		// 	description: 'Cohort-wide visibility into completion, accuracy, and audio samples.',
		// 	eta: 'Summer',
		// 	highlights: ['Progress funnels', 'Flag critical attempts', 'Shareable reports']
		// },
		// {
		// 	title: 'Progress Analytics',
		// 	description: 'Longitudinal analytics across drills, tests, and assignments.',
		// 	eta: 'Fall',
		// 	highlights: ['Pronunciation KPIs', 'Trend alerts', 'Export to LMS']
		// }
	];

	import IconTranslate from '~icons/mdi/translate-variant';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';

	type Locale = (typeof locales)[number];
</script>

<svelte:head>
	<title>PhonoCoffer 韻匣</title>
</svelte:head>

<header class="flex items-center justify-between px-6 py-4 text-sm text-gray-500">
	<p class="text-sm font-semibold tracking-wide text-blue-600 uppercase">PhonoCoffer 韻匣</p>
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

<div class="bg-linear-to-b from-gray-50 to-white">
	<div class="mx-auto max-w-6xl space-y-12 px-6 py-14">
		<section
			class="grid items-center gap-8 rounded-3xl border border-gray-200 bg-white/80 p-8 shadow-sm md:grid-cols-2"
		>
			<div class="space-y-4">
				<h1 class="text-3xl font-bold text-gray-900">{m.home_hero_title()}</h1>
				<p class="text-gray-600">{m.home_hero_description()}</p>
				<div class="flex flex-wrap gap-3">
					<a
						href="/minimal-pair"
						class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
					>
						<span>{m.home_primary_cta()}</span>
					</a>
					<a
						href="#tools"
						class="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-blue-500 hover:text-blue-600"
					>
						<span>{m.home_secondary_cta()}</span>
					</a>
				</div>
			</div>
			<a href="/minimal-pair" class="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
				<img src={minimalPairsShot} alt={m.home_screenshot_alt()} class="block w-full" />
			</a>
		</section>

		<section
			id="tools"
			class="rounded-3xl border border-blue-100 bg-linear-to-b from-white to-blue-50/50 p-8 shadow-sm"
		>
			<div class="mx-auto max-w-3xl text-center">
				<p class="text-xs font-semibold tracking-[0.2em] text-blue-500 uppercase">
					{m.home_roadmap_label()}
				</p>
				<h2 class="mt-2 text-2xl font-bold text-gray-900">{m.home_roadmap_title()}</h2>
				<p class="mt-3 text-sm text-gray-600">{m.home_roadmap_description()}</p>
			</div>
			<div class="mt-8 grid gap-6 md:grid-cols-2">
				{#each upcomingTools as tool}
					<article
						class="rounded-2xl border border-white/60 bg-white p-5 shadow-xs shadow-gray-100"
					>
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-lg font-semibold text-gray-900">{tool.title}</h3>
							<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
								{tool.eta}
							</span>
						</div>
						<p class="mt-2 text-sm text-gray-600">{tool.description}</p>
						<ul class="mt-4 space-y-2 text-sm text-gray-700">
							{#each tool.highlights as highlight}
								<li class="flex items-start gap-2">
									<span class="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
									<span>{highlight}</span>
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		</section>
	</div>
</div>
