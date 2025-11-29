<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import {
		parsePraatData,
		STANDARD_VOWELS,
		type ParsedResult,
		type VowelDefinition
	} from '$lib/vowel-plotter';
	import IconChartScatterPlot from '~icons/mdi/chart-scatter-plot';
	import IconContentPaste from '~icons/mdi/content-paste';

	let inputData = $state('');
	let result = $state<ParsedResult | null>(null);
	let error = $state('');

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

	// Chart dimensions
	const width = 600;
	const height = 400;
	const padding = 40;

	// Scales (inverted for F1 and F2 as is standard in phonetics)
	// F1 (y-axis): 200 - 900
	// F2 (x-axis): 500 - 2500
	const f1Min = 200;
	const f1Max = 900;
	const f2Min = 500;
	const f2Max = 2500;

	function scaleX(f2: number) {
		// Inverted x-axis: high F2 on left, low F2 on right
		return width - padding - ((f2 - f2Min) / (f2Max - f2Min)) * (width - 2 * padding);
	}

	function scaleY(f1: number) {
		// Inverted y-axis: low F1 on top, high F1 on bottom
		return padding + ((f1 - f1Min) / (f1Max - f1Min)) * (height - 2 * padding);
	}

	const trapeziumVowels = ['i', 'e', 'ɛ', 'a', 'ä', 'ɑ', 'ɔ', 'o', 'u', 'ɨ'];
	const trapeziumPoints = $derived(
		trapeziumVowels
			.map((ipa) => {
				const v = STANDARD_VOWELS.find((v) => v.ipa === ipa);
				return v ? `${scaleX(v.f2)},${scaleY(v.f1)}` : '';
			})
			.filter(Boolean)
			.join(' ')
	);

	const innerLines = [
		['e', 'ɘ', 'o'],
		['ɛ', 'ɜ', 'ɔ'],
		['ɨ', 'ə', 'ɐ', 'ä']
	];

	const innerLinePoints = $derived(
		innerLines.map((line) =>
			line
				.map((ipa) => {
					const v = STANDARD_VOWELS.find((v) => v.ipa === ipa);
					return v ? `${scaleX(v.f2)},${scaleY(v.f1)}` : '';
				})
				.filter(Boolean)
				.join(' ')
		)
	);
</script>

<div class="mx-auto max-w-4xl space-y-8 px-6 py-12">
	<div class="space-y-4">
		<div class="flex items-center gap-3">
			<div class="rounded-lg bg-blue-100 p-2 text-blue-600">
				<IconChartScatterPlot class="h-6 w-6" />
			</div>
			<h1 class="text-3xl font-bold text-gray-900">{m.vowel_plotter_home_title()}</h1>
		</div>
		<p class="text-gray-600">
			{m.vp_description()}
		</p>
	</div>

	<div class="grid gap-8 lg:grid-cols-2">
		<div class="space-y-4">
			<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
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
			<div class="relative w-full overflow-hidden rounded-xl bg-gray-50">
				<svg viewBox={`0 0 ${width} ${height}`} class="w-full">
					<!-- Grid lines -->
					{#each [200, 300, 400, 500, 600, 700, 800, 900] as f1}
						<line
							x1={padding}
							y1={scaleY(f1)}
							x2={width - padding}
							y2={scaleY(f1)}
							stroke="#e5e7eb"
							stroke-width="1"
							stroke-dasharray="4 4"
						/>
						<text
							x={padding - 5}
							y={scaleY(f1)}
							text-anchor="end"
							dominant-baseline="middle"
							class="fill-gray-400 text-[10px]">{f1}</text
						>
					{/each}
					{#each [500, 1000, 1500, 2000, 2500] as f2}
						<line
							x1={scaleX(f2)}
							y1={padding}
							x2={scaleX(f2)}
							y2={height - padding}
							stroke="#e5e7eb"
							stroke-width="1"
							stroke-dasharray="4 4"
						/>
						<text
							x={scaleX(f2)}
							y={height - padding + 15}
							text-anchor="middle"
							class="fill-gray-400 text-[10px]">{f2}</text
						>
					{/each}

					<!-- Axis Labels -->
					<text
						x={width / 2}
						y={height - 5}
						text-anchor="middle"
						class="fill-gray-500 text-xs font-semibold">{m.vp_axis_f2()}</text
					>
					<text
						x={10}
						y={height / 2}
						text-anchor="middle"
						transform={`rotate(-90, 10, ${height / 2})`}
						class="fill-gray-500 text-xs font-semibold">{m.vp_axis_f1()}</text
					>

					<!-- Vowel Trapezium -->
					<polygon
						points={trapeziumPoints}
						fill="none"
						stroke="#d1d5db"
						stroke-width="2"
						stroke-linejoin="round"
						class="opacity-50"
					/>

					<!-- Inner Vowel Lines -->
					{#each innerLinePoints as points}
						<polyline
							{points}
							fill="none"
							stroke="#d1d5db"
							stroke-width="1"
							stroke-linejoin="round"
							class="opacity-50"
						/>
					{/each}

					<!-- Standard Vowels -->
					{#each STANDARD_VOWELS as vowel}
						<circle cx={scaleX(vowel.f2)} cy={scaleY(vowel.f1)} r="4" class="fill-gray-300" />
						<text
							x={scaleX(vowel.f2)}
							y={scaleY(vowel.f1) - 8}
							text-anchor="middle"
							class="fill-gray-600 text-sm font-bold">{vowel.ipa}</text
						>
					{/each}

					<!-- User Result -->
					{#if result}
						<circle
							cx={scaleX(result.averages.f2)}
							cy={scaleY(result.averages.f1)}
							r="6"
							class="fill-blue-600"
						/>
						<circle
							cx={scaleX(result.averages.f2)}
							cy={scaleY(result.averages.f1)}
							r="10"
							class="animate-pulse fill-blue-600/30"
						/>
						<text
							x={scaleX(result.averages.f2)}
							y={scaleY(result.averages.f1) - 12}
							text-anchor="middle"
							class="fill-blue-600 text-sm font-bold">{m.vp_you_marker()}</text
						>
					{/if}
				</svg>
			</div>
		</div>
	</div>
</div>
