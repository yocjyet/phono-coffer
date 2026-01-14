<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { STANDARD_VOWELS, type VowelDefinition } from '$lib/vowel-plotter';

	let {
		width = 600,
		height = 400,
		highlightVowel = '',
		userVowels = [],
		userVowelSequences = [],
		selectedVowelIds = $bindable([]),
		standardVowels = STANDARD_VOWELS,
		showTrapezium = true,
		showInnerLines = true,
		drawBasicVowels = true,

		f1Domain = [200, 1200],
		f2Domain = [500, 3000],
		onChartClick
	}: {
		width?: number;
		height?: number;
		highlightVowel?: string;
		userVowels?: { id?: string; f1: number; f2: number; label?: string; color?: string }[];
		userVowelSequences?: { id: string; vowelIds: string[]; color?: string }[];
		selectedVowelIds?: string[];
		standardVowels?: VowelDefinition[];
		showTrapezium?: boolean;
		showInnerLines?: boolean;
		drawBasicVowels?: boolean;
		f1Domain?: [number, number];
		f2Domain?: [number, number];
		onChartClick?: (f1: number, f2: number) => void;
	} = $props();

	const padding = 40;

	// Dynamic Scales
	const f1Min = $derived(f1Domain[0]);
	const f1Max = $derived(f1Domain[1]);
	const f2Min = $derived(f2Domain[0]);
	const f2Max = $derived(f2Domain[1]);

	// Ticks Generation
	function getTicks(min: number, max: number, step: number) {
		const ticks = [];
		const start = Math.ceil(min / step) * step;
		for (let i = start; i <= max; i += step) {
			ticks.push(i);
		}
		return ticks;
	}

	const f1Ticks = $derived(getTicks(f1Min, f1Max, 100));
	const f2Ticks = $derived(getTicks(f2Min, f2Max, 500));

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

	// Sequence Lines (Segments)
	const sequenceSegments = $derived(
		userVowelSequences.flatMap((seq) => {
			const validVowels = seq.vowelIds
				.map((id) => userVowels.find((v) => v.id === id))
				.filter((v) => v !== undefined);

			const segments = [];
			for (let i = 0; i < validVowels.length - 1; i++) {
				const v1 = validVowels[i]!;
				const v2 = validVowels[i + 1]!;
				segments.push({
					x1: scaleX(v1.f2),
					y1: scaleY(v1.f1),
					x2: scaleX(v2.f2),
					y2: scaleY(v2.f1),
					color: seq.color
				});
			}
			return segments;
		})
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

	function handleVowelClick(event: MouseEvent, id?: string) {
		if (!id) return;
		event.stopPropagation();

		const index = selectedVowelIds.indexOf(id);
		if (index === -1) {
			selectedVowelIds.push(id);
		} else {
			selectedVowelIds.splice(index, 1);
		}
		// Trigger reactivity
		selectedVowelIds = [...selectedVowelIds];
	}
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-gray-50">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg viewBox={`0 0 ${width} ${height}`} class="w-full cursor-crosshair" onclick={handleClick}>
		<defs>
			<marker
				id="arrowhead"
				viewBox="0 0 10 10"
				refX="15"
				refY="5"
				markerWidth="6"
				markerHeight="6"
				orient="auto-start-reverse"
			>
				<path d="M 0 0 L 10 5 L 0 10 z" fill="#4b5563" />
			</marker>
		</defs>

		<!-- Grid lines -->
		{#each f1Ticks as f1}
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
		{#each f2Ticks as f2}
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

		<!-- User Vowel Sequences (Arrows) -->
		{#each sequenceSegments as seg}
			<line
				x1={seg.x1}
				y1={seg.y1}
				x2={seg.x2}
				y2={seg.y2}
				stroke={seg.color || '#4b5563'}
				stroke-width="2"
				marker-end="url(#arrowhead)"
			/>
		{/each}

		<!-- User Vowels List (Manual Input) -->
		{#each userVowels as vowel}
			{@const isSelected = vowel.id && selectedVowelIds.includes(vowel.id)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g onclick={(e) => handleVowelClick(e, vowel.id)} class="cursor-pointer">
				<circle
					cx={scaleX(vowel.f2)}
					cy={scaleY(vowel.f1)}
					r="12"
					class="animate-pulse"
					fill={vowel.color || '#16a34a'}
					fill-opacity="0.3"
				/>
				{#if isSelected}
					<circle
						cx={scaleX(vowel.f2)}
						cy={scaleY(vowel.f1)}
						r="10"
						class="fill-none stroke-blue-500 stroke-2 opacity-50"
					/>
				{/if}
				<circle
					cx={scaleX(vowel.f2)}
					cy={scaleY(vowel.f1)}
					r="6"
					class="transition-colors hover:stroke-black hover:stroke-2"
					fill={vowel.color || '#16a34a'}
				/>
				<text
					x={scaleX(vowel.f2)}
					y={scaleY(vowel.f1) - 12}
					text-anchor="middle"
					class="text-sm font-bold transition-colors select-none"
					fill={vowel.color || '#16a34a'}>{vowel.label || ''}</text
				>
			</g>
		{/each}
	</svg>
</div>
