<script lang="ts">
	import { onDestroy } from 'svelte';

	let { stream }: { stream: MediaStream | null } = $props();

	let canvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let source: MediaStreamAudioSourceNode | null = null;
	let animationId: number;

	const LENGTH_MULTIPLIER = 1;
	const FILL_COLOR = 'rgb(239, 68, 68)';

	function startVisualization() {
		if (!stream || !canvas) return;

		if (!audioContext) {
			audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		}

		if (audioContext.state === 'suspended') {
			audioContext.resume();
		}

		analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;
		source = audioContext.createMediaStreamSource(stream);
		source.connect(analyser);

		const bufferLength = analyser.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);
		const ctx = canvas.getContext('2d');

		if (!ctx) return;

		const draw = () => {
			if (!analyser) return;

			animationId = requestAnimationFrame(draw);

			analyser.getByteFrequencyData(dataArray);

			const width = canvas.width;
			const height = canvas.height;

			ctx.clearRect(0, 0, width, height);

			const barWidth = (width / bufferLength) * LENGTH_MULTIPLIER;
			let barHeight;
			let x = 0;

			// Use a mirrored design like Apple's voice memo
			// We'll draw from the center outwards or just center the bars vertically

			for (let i = 0; i < bufferLength; i++) {
				barHeight = dataArray[i] / 2; // Scale down a bit

				// Draw mirrored bars
				// Top half
				ctx.fillStyle = FILL_COLOR;

				// Center vertically
				const centerY = height / 2;

				// Draw top bar
				ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight / 2);

				// Draw bottom bar (mirrored)
				ctx.fillRect(x, centerY, barWidth, barHeight / 2);

				x += barWidth + 1;
			}
		};

		draw();
	}

	function stopVisualization() {
		if (animationId) {
			cancelAnimationFrame(animationId);
		}
		if (source) {
			source.disconnect();
			source = null;
		}
		if (analyser) {
			analyser.disconnect();
			analyser = null;
		}
		// Do not close AudioContext here as it might be expensive to recreate,
		// or we can close it if we want to be clean.
		// For now let's keep it open or let the browser handle it.
	}

	$effect(() => {
		if (stream) {
			startVisualization();
		} else {
			stopVisualization();
		}
	});

	onDestroy(() => {
		stopVisualization();
		if (audioContext) {
			audioContext.close();
		}
	});
</script>

<canvas bind:this={canvas} width="300" height="40" class="h-full w-full"></canvas>
