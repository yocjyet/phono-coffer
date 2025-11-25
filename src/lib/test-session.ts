import {
	type Label,
	type Recording,
	type TestItem,
	type RecordingsMap,
	type LabelDefinition,
	buildSampleSet,
	shuffle,
	createId,
	clampRounds
} from './minimal-pair';

export class TestSession {
	items: TestItem[] = [];
	currentIndex: number = 0;
	score: number = 0;
	active: boolean = false;
	complete: boolean = false;
	startTime: number | null = null;

	// Callbacks for side effects
	onPlayAudio?: (url: string) => void;

	constructor() {}

	start(recordings: RecordingsMap, labelOptions: LabelDefinition[], roundsPerLabel: number) {
		const perLabel = clampRounds(roundsPerLabel);
		const selections = labelOptions.flatMap((option) =>
			buildSampleSet(recordings, option.id, perLabel)
		);

		const queue: TestItem[] = shuffle(selections).map((sample) => ({
			id: createId(),
			sample,
			response: null,
			correct: null,
			lastPlayedAt: null,
			reactionTimeMs: null
		}));

		this.items = queue;
		this.currentIndex = 0;
		this.score = 0;
		this.active = true;
		this.complete = false;
		this.startTime = Date.now();
	}

	getCurrentItem(): TestItem | null {
		return this.items[this.currentIndex] || null;
	}

	playCurrent() {
		const current = this.getCurrentItem();
		if (current) {
			current.lastPlayedAt = Date.now();
			this.onPlayAudio?.(current.sample.url);
		}
	}

	submitGuess(label: Label): { correct: boolean; complete: boolean } | null {
		if (!this.active) return null;

		const current = this.getCurrentItem();
		if (!current || current.response) return null;

		const correct = current.sample.label === label;
		const reactionTimeMs =
			typeof current.lastPlayedAt === 'number' ? Date.now() - current.lastPlayedAt : null;

		const updated: TestItem = {
			...current,
			response: label,
			correct,
			reactionTimeMs
		};

		this.items[this.currentIndex] = updated;

		if (correct) {
			this.score += 1;
		}

		let complete = false;
		if (this.currentIndex >= this.items.length - 1) {
			this.active = false;
			this.complete = true;
			complete = true;
		} else {
			this.currentIndex += 1;
		}

		return { correct, complete };
	}

	getState() {
		return {
			items: this.items,
			currentIndex: this.currentIndex,
			score: this.score,
			active: this.active,
			complete: this.complete,
			currentSessionId: this.items.length
				? this.items[0].id
					? this.items[0].id.split('-')[0]
					: null
				: null // simplified ID logic or keep it managed externally
		};
	}

	reset() {
		this.items = [];
		this.currentIndex = 0;
		this.score = 0;
		this.active = false;
		this.complete = false;
		this.startTime = null;
	}
}
