export type VowelDefinition = {
  ipa: string;
  f1: number;
  f2: number;
  f3?: number; // Some vowels might not have F3 specified in the user's list, but good to have type support
};

export const STANDARD_VOWELS: VowelDefinition[] = [
  { ipa: 'i', f1: 240, f2: 2400 },
  { ipa: 'y', f1: 235, f2: 2100 },
  { ipa: 'e', f1: 390, f2: 2300 },
  { ipa: 'ø', f1: 370, f2: 1900 },
  { ipa: 'ɛ', f1: 610, f2: 1900 },
  { ipa: 'œ', f1: 585, f2: 1710 },
  { ipa: 'a', f1: 850, f2: 1610 },
  { ipa: 'ɶ', f1: 820, f2: 1530 },
  { ipa: 'ɑ', f1: 750, f2: 940 },
  { ipa: 'ɒ', f1: 700, f2: 760 },
  { ipa: 'ʌ', f1: 600, f2: 1170 },
  { ipa: 'ɔ', f1: 500, f2: 700 },
  { ipa: 'ɤ', f1: 460, f2: 1310 },
  { ipa: 'o', f1: 360, f2: 640 },
  { ipa: 'ɯ', f1: 300, f2: 1390 },
  { ipa: 'u', f1: 250, f2: 595 },
  { ipa: 'ɨ', f1: 340, f2: 1600 },
  { ipa: 'ɘ', f1: 360, f2: 1400 },
  { ipa: 'ɜ', f1: 480, f2: 1200 },
  { ipa: 'ä', f1: 510, f2: 1000 },
  { ipa: 'ə', f1: 500, f2: 1500 },
  { ipa: 'ɐ', f1: 600, f2: 1350 },
];

export type FormantData = {
  time: number;
  f1: number;
  f2: number;
  f3: number;
  f4?: number;
};

export type ParsedResult = {
  averages: {
    f1: number;
    f2: number;
    f3: number;
  };
  closestVowel: VowelDefinition;
  dataPoints?: FormantData[];
};

export function parsePraatData(input: string): ParsedResult | null {
  const lines = input.trim().split('\n');
  const dataPoints: FormantData[] = [];

  // Skip header if present (starts with Time_s or similar non-numeric)
  const startIndex = lines[0].trim().match(/^[a-zA-Z]/) ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length >= 3) {
      const time = parseFloat(parts[0]);
      const f1 = parseFloat(parts[1]);
      const f2 = parseFloat(parts[2]);
      const f3 = parseFloat(parts[3]); // Might be NaN if not present, but usually present in Praat listing
      const f4 = parseFloat(parts[4]);

      if (!isNaN(time) && !isNaN(f1) && !isNaN(f2)) {
        dataPoints.push({
          time,
          f1,
          f2,
          f3: isNaN(f3) ? 0 : f3,
          f4: isNaN(f4) ? undefined : f4
        });
      }
    }
  }

  if (dataPoints.length === 0) {
    return null;
  }

  const totalF1 = dataPoints.reduce((sum, p) => sum + p.f1, 0);
  const totalF2 = dataPoints.reduce((sum, p) => sum + p.f2, 0);
  const totalF3 = dataPoints.reduce((sum, p) => sum + p.f3, 0);

  const avgF1 = totalF1 / dataPoints.length;
  const avgF2 = totalF2 / dataPoints.length;
  const avgF3 = totalF3 / dataPoints.length;

  const closestVowel = findClosestVowel(avgF1, avgF2);

  return {
    averages: {
      f1: avgF1,
      f2: avgF2,
      f3: avgF3
    },
    closestVowel,
    dataPoints
  };
}

export function findClosestVowel(
  f1: number,
  f2: number,
  vowels: VowelDefinition[] = STANDARD_VOWELS
): VowelDefinition {
  let minDistance = Infinity;
  let closest = vowels[0];

  for (const vowel of vowels) {
    // Euclidean distance in F1-F2 space
    // Often F2 difference is perceptually less significant per Hz than F1, 
    // but for simple closest match, Euclidean is a standard starting point.
    // Bark scale would be better but Hz is requested/provided.
    const dist = Math.sqrt(Math.pow(vowel.f1 - f1, 2) + Math.pow(vowel.f2 - f2, 2));
    if (dist < minDistance) {
      minDistance = dist;
      closest = vowel;
    }
  }

  return closest;
}
