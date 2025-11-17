<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}

<footer class="py-4 text-center text-sm text-gray-500">
	<a href="/" class="hover:underline" aria-label="Home">PhonoCoffer 韻匣</a> © 2025
	<a href="https://yocjyet.dev" class="text-blue-500 hover:underline" target="_blank">yocjyet.dev</a
	>
</footer>
