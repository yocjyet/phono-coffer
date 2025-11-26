<script lang="ts">
	import { onMount } from 'svelte';
	import { getAudioContext } from '$lib/audio-context';
	import { logger } from '$lib/logger';
	import { m } from '$lib/paraglide/messages';

	let { src }: { src: string } = $props();

	const FREQ_OPTIONS = [2000, 5000, 8000, 12000, 20000] as const;

	let canvas: HTMLCanvasElement;
	let error = $state('');
	let loading = $state(false);
	let maxFreq: (typeof FREQ_OPTIONS)[number] = $state(8000); // Default to 5kHz for speech focus

	async function generateSpectrogram() {
		if (!src || !canvas) return;
		loading = true;
		error = '';

		let audioContext: AudioContext | null = null;

		try {
			logger.info('Generating spectrogram', { src, maxFreq });
			const response = await fetch(src);
			const arrayBuffer = await response.arrayBuffer();

			audioContext = getAudioContext();
			await audioContext.resume();

			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			const channelData = audioBuffer.getChannelData(0);
			const sampleRate = audioBuffer.sampleRate;

			// FFT parameters
			const fftSize = 2048;
			const hopSize = 256;

			const width = canvas.width;
			const height = canvas.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			ctx.fillStyle = 'black';
			ctx.fillRect(0, 0, width, height);

			// Simple FFT implementation
			const simpleFFT = (input: Float32Array) => {
				const n = input.length;
				const real = new Float32Array(input);
				const imag = new Float32Array(n).fill(0);

				// Bit reversal
				let j = 0;
				for (let i = 0; i < n - 1; i++) {
					if (i < j) {
						[real[i], real[j]] = [real[j], real[i]];
						[imag[i], imag[j]] = [imag[j], imag[i]];
					}
					let k = n / 2;
					while (k <= j) {
						j -= k;
						k /= 2;
					}
					j += k;
				}

				// Butterfly
				for (let size = 2; size <= n; size *= 2) {
					const half = size / 2;
					const angle = (-2 * Math.PI) / size;
					const w_real = Math.cos(angle);
					const w_imag = Math.sin(angle);

					for (let i = 0; i < n; i += size) {
						let wr = 1,
							wi = 0;
						for (let j = 0; j < half; j++) {
							const index = i + j;
							const match = index + half;

							const tr = wr * real[match] - wi * imag[match];
							const ti = wr * imag[match] + wi * real[match];

							real[match] = real[index] - tr;
							imag[match] = imag[index] - ti;
							real[index] += tr;
							imag[index] += ti;

							const next_wr = wr * w_real - wi * w_imag;
							wi = wr * w_imag + wi * w_real;
							wr = next_wr;
						}
					}
				}

				// Magnitude
				const magnitudes = new Float32Array(n / 2);
				for (let i = 0; i < n / 2; i++) {
					magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
				}
				return magnitudes;
			};

			const N = 256; // Small FFT for speed
			const step = 128;

			const maxCol = Math.ceil((channelData.length - N) / step);
			const colWidth = width / maxCol;

			// Calculate max bin based on maxFreq
			// Nyquist = sampleRate / 2
			// Bin width = sampleRate / N
			// But wait, our simpleFFT uses N=256, so bin width is sampleRate / 256.
			// e.g. 48000 / 256 = 187.5 Hz per bin.
			// If maxFreq is 5000, we need 5000 / 187.5 = 26.6 bins.
			// This resolution is quite low for N=256.
			// Maybe we should increase N if we want better frequency resolution?
			// But N=256 is fast. Let's stick with it for now or bump to 512 if needed.
			// Let's keep N=256 for performance as requested by "mini" nature, but 5000Hz is only ~26 bins.

			const binWidth = sampleRate / N;
			const maxBin = Math.min(Math.floor(maxFreq / binWidth), N / 2);

			for (let i = 0; i < maxCol; i++) {
				const offset = i * step;
				if (offset + N > channelData.length) break;

				const chunk = channelData.slice(offset, offset + N);
				// Windowing
				for (let k = 0; k < N; k++) {
					chunk[k] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (N - 1));
				}

				const mags = simpleFFT(chunk);

				// Draw column
				// We only draw up to maxBin
				for (let j = 0; j < maxBin; j++) {
					const mag = mags[j];
					// Log scale intensity
					const intensity = Math.min(255, Math.log10(mag + 1) * 100 * 20);

					// Heatmap color: Blue -> Red -> Yellow
					const r = intensity;
					const g = intensity > 128 ? (intensity - 128) * 2 : 0;
					const b = intensity > 200 ? (intensity - 200) * 5 : 0;

					ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

					// Draw pixel (upside down because canvas y=0 is top)
					// We need to map j (0 to maxBin) to canvas height (height to 0)

					const y = height - (j / maxBin) * height;
					const h = height / maxBin;

					// Draw slightly overlapping to avoid gaps
					ctx.fillRect(i * colWidth, y - h, colWidth + 0.5, h + 0.5);
				}
			}
			logger.info('Spectrogram generated successfully');
		} catch (e) {
			logger.error('Failed to generate spectrogram', { error: e });
			console.error(e);
			error = m.spectrogram_error();
		} finally {
			loading = false;
			// Do NOT close shared context
		}
	}

	$effect(() => {
		if (src && maxFreq) {
			generateSpectrogram();
		}
	});
</script>

<div class="group relative w-full overflow-hidden rounded-lg border border-gray-300 bg-black">
	<canvas bind:this={canvas} width="600" height="128" class="h-32 w-full"></canvas>

	<!-- Frequency Scale Indicators -->
	<div class="pointer-events-none absolute top-1 left-1 text-[10px] text-white/70">
		{maxFreq / 1000}k {m.spectrogram_hz_label()}
	</div>
	<div class="pointer-events-none absolute bottom-1 left-1 text-[10px] text-white/70">
		0 {m.spectrogram_hz_label()}
	</div>

	<!-- Controls (visible on hover) -->
	<div class="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100">
		<select
			bind:value={maxFreq}
			class="rounded border border-white/20 bg-black/50 px-1 py-0.5 text-xs text-white outline-none focus:border-white/50"
			aria-label={m.spectrogram_scale_label()}
		>
			{#each FREQ_OPTIONS as freq}
				<option value={freq}
					>{freq < 1000 ? freq : freq / 1000 + 'k'} {m.spectrogram_hz_label()}</option
				>
			{/each}
		</select>
	</div>

	{#if loading}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">
			{m.spectrogram_loading()}
		</div>
	{/if}
	{#if error}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-red-400">
			{error}
		</div>
	{/if}
</div>
