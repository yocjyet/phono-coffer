<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { STANDARD_VOWELS, type VowelDefinition } from '$lib/vowel-plotter';

	let {
		width = 600,
		height = 400,
		highlightVowel = '',
		userVowels = [],
		standardVowels = STANDARD_VOWELS,
		showTrapezium = true,
		showInnerLines = true,
		drawBasicVowels = true,
		onChartClick
	}: {
		width?: number;
		height?: number;
		highlightVowel?: string;
		userVowels?: { f1: number; f2: number; label?: string; color?: string }[];
		standardVowels?: VowelDefinition[];
		showTrapezium?: boolean;
		showInnerLines?: boolean;
		drawBasicVowels?: boolean;
		onChartClick?: (f1: number, f2: number) => void;
	} = $props();

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
				const v = standardVowels.find((v) => v.ipa === ipa);
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
					const v = standardVowels.find((v) => v.ipa === ipa);
					return v ? `${scaleX(v.f2)},${scaleY(v.f1)}` : '';
				})
				.filter(Boolean)
				.join(' ')
		)
	);

	// Inverse Scales
	function invertScaleX(x: number) {
		const innerWidth = width - 2 * padding;
		// x = width - padding - ratio * innerWidth
		// ratio * innerWidth = width - padding - x
		// ratio = (width - padding - x) / innerWidth
		const ratio = (width - padding - x) / innerWidth;
		return f2Min + ratio * (f2Max - f2Min);
	}

	function invertScaleY(y: number) {
		const innerHeight = height - 2 * padding;
		// y = padding + ratio * innerHeight
		const ratio = (y - padding) / innerHeight;
		return f1Min + ratio * (f1Max - f1Min);
	}

	function handleClick(event: MouseEvent) {
		if (!onChartClick) return;
		const svg = event.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();

		// Calculate x, y relative to the SVG viewBox
		// Taking into account that the SVG might be scaled via CSS
		const scaleX = width / rect.width;
		const scaleY = height / rect.height;

		const clickX = (event.clientX - rect.left) * scaleX;
		const clickY = (event.clientY - rect.top) * scaleY;

		const f1 = Math.round(invertScaleY(clickY));
		const f2 = Math.round(invertScaleX(clickX));

		// Clamp values to domain
		const clampedF1 = Math.max(f1Min, Math.min(f1Max, f1));
		const clampedF2 = Math.max(f2Min, Math.min(f2Max, f2));

		onChartClick(clampedF1, clampedF2);
	}
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-gray-50">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg viewBox={`0 0 ${width} ${height}`} class="w-full cursor-crosshair" onclick={handleClick}>
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
		{#if showTrapezium}
			<polygon
				points={trapeziumPoints}
				fill="none"
				stroke="#d1d5db"
				stroke-width="2"
				stroke-linejoin="round"
				class="opacity-50"
			/>

			<!-- Inner Vowel Lines -->
			{#if showInnerLines}
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
			{/if}
		{/if}

		// Standard Vowels
		{#if drawBasicVowels}
			{#each standardVowels as vowel}
				{@const isHighlighted = vowel.ipa === highlightVowel}
				<circle
					cx={scaleX(vowel.f2)}
					cy={scaleY(vowel.f1)}
					r={isHighlighted ? 8 : 4}
					class={isHighlighted ? 'animate-pulse fill-red-500' : 'fill-gray-300'}
				/>
				<text
					x={scaleX(vowel.f2)}
					y={scaleY(vowel.f1) - (isHighlighted ? 12 : 8)}
					text-anchor="middle"
					class="{isHighlighted ? 'fill-red-600 text-lg' : 'fill-gray-600 text-sm'} font-bold"
					>{vowel.ipa}</text
				>
			{/each}
		{/if}

		<!-- User Vowels List (Manual Input) -->
		{#each userVowels as vowel}
			<circle
				cx={scaleX(vowel.f2)}
				cy={scaleY(vowel.f1)}
				r="12"
				class="animate-pulse"
				fill={vowel.color || '#16a34a'}
				fill-opacity="0.3"
			/>
			<circle
				cx={scaleX(vowel.f2)}
				cy={scaleY(vowel.f1)}
				r="6"
				class="transition-colors"
				fill={vowel.color || '#16a34a'}
			/>
			<text
				x={scaleX(vowel.f2)}
				y={scaleY(vowel.f1) - 12}
				text-anchor="middle"
				class="text-sm font-bold transition-colors"
				fill={vowel.color || '#16a34a'}>{vowel.label || ''}</text
			>
		{/each}
	</svg>
</div>
