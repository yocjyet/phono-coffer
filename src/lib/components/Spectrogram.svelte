<script lang="ts">
	import { onMount } from 'svelte';

	let { src }: { src: string } = $props();

	let canvas: HTMLCanvasElement;
	let error = $state('');
	let loading = $state(false);

	async function generateSpectrogram() {
		if (!src || !canvas) return;
		loading = true;
		error = '';

		let audioContext: AudioContext | null = null;

		try {
			const response = await fetch(src);
			const arrayBuffer = await response.arrayBuffer();
			audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			const channelData = audioBuffer.getChannelData(0);
			const sampleRate = audioBuffer.sampleRate;

			// FFT parameters
			const fftSize = 2048;
			const hopSize = 256; // Overlap
			const fft = new Float32Array(fftSize);

			const width = canvas.width;
			const height = canvas.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			ctx.fillStyle = 'black';
			ctx.fillRect(0, 0, width, height);

			const numColumns = Math.floor((channelData.length - fftSize) / hopSize);

			// We might need to scale the drawing to fit the canvas width
			// or just draw a portion. Let's try to fit it.
			// But for short recordings, it might be small.
			// Let's assume we want to fill the width.

			const pixelsPerColumn = width / numColumns;

			// Simple FFT implementation or use a library?
			// Since we can't easily add libraries, I'll use a very simple discrete Fourier transform
			// or just use the AnalyserNode in 'offline' mode?
			// Actually, OfflineAudioContext is perfect for this.

			const offlineCtx = new OfflineAudioContext(1, audioBuffer.length, sampleRate);
			const source = offlineCtx.createBufferSource();
			source.buffer = audioBuffer;

			const analyser = offlineCtx.createAnalyser();
			analyser.fftSize = fftSize;
			analyser.smoothingTimeConstant = 0;

			source.connect(analyser);
			source.start(0);

			// We need to step through time and capture frequency data.
			// OfflineAudioContext renders as fast as possible, but we can't easily "step" it
			// and pull analyser data at specific points without a ScriptProcessor (deprecated)
			// or AudioWorklet (complex to setup here).

			// Alternative: Just implement a basic windowed DFT/FFT in JS.
			// For a visual spectrogram, a simple implementation is enough.

			// Let's use a helper function for FFT if possible, or just a simple implementation.
			// Actually, let's try to use the AnalyserNode with a real AudioContext but
			// seek through the buffer? No, that's realtime.

			// Let's go with a manual JS FFT. It's slow but fine for short clips.
			// Wait, Web Audio API `AnalyserNode` is the standard way.
			// Maybe we can play it at high speed into an analyser? No.

			// Let's try a different approach:
			// Use `createScriptProcessor` (even if deprecated) with OfflineAudioContext?
			// Or just simple JS processing.

			// Let's use a very simple JS FFT.

			const getFrequencies = (data: Float32Array) => {
				// Hanning window
				const windowed = new Float32Array(data.length);
				for (let i = 0; i < data.length; i++) {
					windowed[i] = data[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (data.length - 1)));
				}

				// Real-only FFT (magnitude spectrum) - simplified O(N^2) DFT for code compactness?
				// N=2048 is too big for O(N^2).
				// Let's use a smaller FFT size for visual or implement Cooley-Tukey.

				// Actually, let's just use 512 size for performance.
				const N = 512;
				// ... implementing FFT is error prone.

				// Let's look for a simpler way.
				// Maybe just visualize the waveform amplitude (envelope) instead?
				// User asked for "spectrum view (spectrogram)".

				// Okay, let's use a pre-written simple FFT function.

				return new Float32Array(N / 2).fill(0); // Placeholder
			};

			// RE-EVALUATION: Writing a full FFT in a single file component is risky.
			// Is there a way to use AnalyserNode?
			// Yes, we can use `suspend` and `resume` on AudioContext?
			// Or just process chunks manually.

			// Let's try to use a minimal FFT implementation.

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
				for (let j = 0; j < mags.length; j++) {
					const mag = mags[j];
					// Log scale intensity
					const intensity = Math.min(255, Math.log10(mag + 1) * 100 * 20);

					// Heatmap color: Blue -> Red -> Yellow
					// Simple: just grayscale or single color opacity
					// Let's do a simple "fire" look
					const r = intensity;
					const g = intensity > 128 ? (intensity - 128) * 2 : 0;
					const b = intensity > 200 ? (intensity - 200) * 5 : 0;

					ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

					// Draw pixel (upside down because canvas y=0 is top)
					const y = height - (j / mags.length) * height;
					const h = height / mags.length;

					ctx.fillRect(i * colWidth, y - h, colWidth + 0.5, h + 0.5);
				}
			}
		} catch (e) {
			console.error(e);
			error = 'Failed to generate spectrogram';
		} finally {
			loading = false;
			if (audioContext && audioContext.state !== 'closed') {
				audioContext.close();
			}
		}
	}

	$effect(() => {
		if (src) {
			generateSpectrogram();
		}
	});
</script>

<div class="relative h-32 w-full overflow-hidden rounded-lg bg-black">
	<canvas bind:this={canvas} width="600" height="128" class="h-full w-full"></canvas>
	{#if loading}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">
			Generating...
		</div>
	{/if}
	{#if error}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-red-400">
			{error}
		</div>
	{/if}
</div>
