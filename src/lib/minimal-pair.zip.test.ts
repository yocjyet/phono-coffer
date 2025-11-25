import { describe, it, expect } from 'bun:test';
import JSZip from 'jszip';
import { parseReportZip, type ReportPayload, createId } from './minimal-pair';

describe('parseReportZip', () => {
	it('should correctly parse a valid report zip', async () => {
		const zip = new JSZip();
		const payload: ReportPayload = {
			generatedAt: new Date().toISOString(),
			locale: 'en',
			labels: [
				{ id: 'A', value: 'Apple' },
				{ id: 'B', value: 'Banana' }
			],
			settings: {
				recommendedRoundsPerLabel: 5,
				requestedRoundsPerLabel: 5,
				executedRoundsPerLabel: 5
			},
			totals: {
				perLabel: { A: 1, B: 1 },
				questions: 0,
				score: 0
			},
			recordings: [
				{ id: 'rec1', label: 'A', index: 1, filename: 'A-01.webm' },
				{ id: 'rec2', label: 'B', index: 1, filename: 'B-01.webm' }
			],
			reaction: {
				totalAnswered: 0,
				last: null,
				overall: null,
				correct: null,
				incorrect: null
			},
			confusion: {
				actual: [],
				guessed: [],
				counts: {}
			},
			tests: []
		};

		zip.file('report.json', JSON.stringify(payload));
		const recordingsFolder = zip.folder('recordings');
		recordingsFolder?.file('A-01.webm', 'mock audio content A');
		recordingsFolder?.file('B-01.webm', 'mock audio content B');

		const content = await zip.generateAsync({ type: 'arraybuffer' });

		// Mock URL.createObjectURL if needed
		if (typeof URL.createObjectURL !== 'function') {
			global.URL.createObjectURL = (blob: Blob) => `blob:${blob.size}`;
		}

		const result = await parseReportZip(content);

		expect(result).not.toBeNull();
		if (result) {
			expect(result.labels).toHaveLength(2);
			expect(result.labels[0].value).toBe('Apple');
			expect(result.recordings['A']).toHaveLength(1);
			expect(result.recordings['B']).toHaveLength(1);
			expect(result.recordings['A'][0].label).toBe('A');
			// We can't easily check blob content without reading it back, but existence is good.
		}
	});

	it('should return null for invalid zip', async () => {
		const blob = new Blob(['not a zip'], { type: 'application/zip' });
		const result = await parseReportZip(blob);
		expect(result).toBeNull();
	});
});
