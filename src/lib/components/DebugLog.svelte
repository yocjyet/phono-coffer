<script lang="ts">
	import { logger, type LogEntry } from '$lib/logger';
	import { fade, slide } from 'svelte/transition';

	let visible = $state(false);
	let logs = $state<LogEntry[]>([]);

	logger.subscribe((value) => {
		logs = value;
	});

	function toggle() {
		visible = !visible;
	}

	function formatTime(timestamp: number) {
		return new Date(timestamp).toLocaleTimeString(undefined, {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3
		});
	}

	function getLevelColor(level: string) {
		switch (level) {
			case 'info':
				return 'text-blue-600';
			case 'warn':
				return 'text-yellow-600';
			case 'error':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	}
</script>

<div class="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
	<button
		onclick={toggle}
		class="rounded-full bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none"
	>
		{visible ? 'Hide Logs' : 'Show Logs'}
		{#if logs.length > 0}
			<span class="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
				{logs.length}
			</span>
		{/if}
	</button>

	{#if visible}
		<div
			transition:slide={{ axis: 'y' }}
			class="max-h-96 w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:w-[500px]"
		>
			<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
				<h3 class="text-sm font-semibold text-gray-700">Debug Logs</h3>
				<button
					onclick={() => logger.clear()}
					class="text-xs font-medium text-gray-500 hover:text-red-600"
				>
					Clear
				</button>
			</div>
			<div class="h-full max-h-[350px] overflow-y-auto p-4">
				{#if logs.length === 0}
					<p class="text-center text-sm text-gray-400">No logs yet</p>
				{:else}
					<ul class="space-y-2">
						{#each [...logs].reverse() as log (log.id)}
							<li
								class="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50/50 p-2 text-xs"
							>
								<div class="flex items-center justify-between gap-2">
									<span class="font-mono text-gray-400">{formatTime(log.timestamp)}</span>
									<span class={`font-bold uppercase ${getLevelColor(log.level)}`}>{log.level}</span>
								</div>
								<p class="font-mono wrap-break-word text-gray-800">{log.message}</p>
								{#if log.data}
									<pre
										class="mt-1 overflow-x-auto rounded bg-gray-100 p-1 text-[10px] text-gray-600">
										{JSON.stringify(log.data, null, 2)}
									</pre>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</div>
