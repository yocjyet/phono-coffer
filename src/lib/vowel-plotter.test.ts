import { describe, it, expect } from 'bun:test';
import { parsePraatData, findClosestVowel } from './vowel-plotter';

describe('Vowel Plotter Logic', () => {
  it('parses Praat data correctly', () => {
    const input = `Time_s   F1_Hz   F2_Hz   F3_Hz   F4_Hz
0.580465   564.537559   1596.781229   2332.062939   3454.391843
0.586715   570.852568   1628.878573   2299.797208   3472.212896
0.592965   594.937923   1659.422039   2234.782889   3503.414975`;

    const result = parsePraatData(input);
    expect(result).not.toBeNull();
    if (!result) return;

    // Expected averages:
    // F1: (564.537559 + 570.852568 + 594.937923) / 3 = 576.776016667
    // F2: (1596.781229 + 1628.878573 + 1659.422039) / 3 = 1628.360613667
    // F3: (2332.062939 + 2299.797208 + 2234.782889) / 3 = 2288.881012

    expect(result.averages.f1).toBeCloseTo(576.776, 2);
    expect(result.averages.f2).toBeCloseTo(1628.361, 2);
    expect(result.averages.f3).toBeCloseTo(2288.881, 2);
  });

  it('finds the closest vowel', () => {
    // Test case from user: F1 ~576, F2 ~1628
    // Closest standard vowels:
    // œ: 585, 1710
    // ɛ: 610, 1900
    // a: 850, 1610
    // 
    // Dist to œ: sqrt((585-576.8)^2 + (1710-1628.4)^2) = sqrt(67.24 + 6658.56) = 82.01
    // Dist to ɛ: sqrt((610-576.8)^2 + (1900-1628.4)^2) = sqrt(1102.24 + 73766.56) = 273.6
    // Dist to a: sqrt((850-576.8)^2 + (1610-1628.4)^2) = sqrt(74638.24 + 338.56) = 273.8

    // So it should be œ.

    const vowel = findClosestVowel(576.776, 1628.361);
    expect(vowel.ipa).toBe('œ');
  });

  it('handles empty input gracefully', () => {
    const result = parsePraatData('');
    expect(result).toBeNull();
  });

  it('handles malformed input gracefully', () => {
    const input = `Header
        garbage data
        more garbage`;
    const result = parsePraatData(input);
    expect(result).toBeNull();
  });
});
