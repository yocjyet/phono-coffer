# Team Agents

# Svelte

You **MUST** use the Svelte 5 API unless explicitly tasked to write Svelte 4 syntax. If you don't know about the API yet, below is the most important information about it. Other syntax not explicitly listed like `{#if ...}` blocks stay the same, so you can reuse your Svelte 4 knowledge for these.

- to mark something a state you use the `$state` rune, e.g. instead of `let count = 0` you do `let count = $state(0)`
- to mark something as a derivation you use the `$derived` rune, e.g. instead of `$: double = count * 2` you do `const double = $derived(count * 2)`
- to create a side effect you use the `$effect` rune, e.g. instead of `$: console.log(double)`you do`$effect(() => console.log(double))`
- to create component props you use the `$props` rune, e.g. instead of `export let foo = true; export let bar;` you do `let { foo = true, bar } = $props();`
- when listening to dom events do not use colons as part of the event name anymore, e.g. instead of `<button on:click={...} />` you do `<button onclick={...} />`
