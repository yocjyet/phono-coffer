import { describe, it, expect } from 'bun:test';
import { TestSession } from './test-session';
import { type Recording, type Label, buildSampleSet } from './minimal-pair';

// Mock data
const mockRecording = (label: Label, id: string): Recording => ({
	id,
	label,
	url: `blob:${id}`,
	blob: new Blob([]),
	index: 0,
	mimeType: 'audio/webm'
});

describe('TestSession', () => {
	it('should correctly score a perfect game using TestSession', () => {
		const session = new TestSession();
		const recordings = {
			A: [mockRecording('A', 'a1'), mockRecording('A', 'a2')],
			B: [mockRecording('B', 'b1'), mockRecording('B', 'b2')]
		};
		const labelOptions = [
			{ id: 'A', value: '' },
			{ id: 'B', value: '' }
		];

		session.start(recordings, labelOptions, 5);

		expect(session.items.length).toBe(10);
		expect(session.active).toBe(true);

		let completed = false;
		while (!completed) {
			const current = session.getCurrentItem();
			expect(current).not.toBeNull();
			if (!current) break;

			// Guess correctly
			const result = session.submitGuess(current.sample.label);
			expect(result?.correct).toBe(true);

			if (result?.complete) {
				completed = true;
			} else {
				session.playCurrent();
			}
		}

		expect(session.score).toBe(10);
		expect(session.complete).toBe(true);
		expect(session.active).toBe(false);
	});

	it('should handle incorrect guesses', () => {
		const session = new TestSession();
		const recordings = {
			A: [mockRecording('A', 'a1')],
			B: [mockRecording('B', 'b1')]
		};
		const labelOptions = [
			{ id: 'A', value: '' },
			{ id: 'B', value: '' }
		];

		session.start(recordings, labelOptions, 1); // 2 items total

		// First item: guess wrong
		let current = session.getCurrentItem()!;
		const wrongLabel = current.sample.label === 'A' ? 'B' : 'A';
		session.submitGuess(wrongLabel);

		// Second item: guess right
		session.playCurrent();
		current = session.getCurrentItem()!;
		session.submitGuess(current.sample.label);

		expect(session.score).toBe(1);
	});

	it('should always return samples with the correct label (stress test)', () => {
		const recordings = {
			A: [mockRecording('A', 'a1')],
			B: [mockRecording('B', 'b1')]
		};

		for (let i = 0; i < 100; i++) {
			const samplesA = buildSampleSet(recordings, 'A', 5);
			expect(samplesA.every((r) => r.label === 'A')).toBe(true);

			const samplesB = buildSampleSet(recordings, 'B', 5);
			expect(samplesB.every((r) => r.label === 'B')).toBe(true);
		}
	});
});
