
/**
 * Estimates formants (F1, F2) from an AudioBuffer using Linear Predictive Coding (LPC).
 */
export async function estimateFormants(audioBuffer: AudioBuffer): Promise<{ f1: number; f2: number }> {
  const targetSampleRate = 11025; // Downsample to ~11kHz to focus on < 5.5kHz range
  const channelData = audioBuffer.getChannelData(0);
  const originalSampleRate = audioBuffer.sampleRate;

  // 1. Downsample
  const resampled = downsample(channelData, originalSampleRate, targetSampleRate);

  // 2. Pre-emphasis
  const preemphasized = preEmphasis(resampled);

  // 3. Frame signal (25ms window, 10ms step)
  const frameSize = Math.floor(0.025 * targetSampleRate);
  const stepSize = Math.floor(0.01 * targetSampleRate);
  const frames = frameSignal(preemphasized, frameSize, stepSize);

  // 4. Process frames
  const f1Candidates: number[] = [];
  const f2Candidates: number[] = [];

  // LPC Order: usually sampleRate / 1000 + 2 (rule of thumb)
  // For 11025Hz, order ~13. Let's use 14.
  const lpcOrder = 14;

  for (const frame of frames) {
    // Apply Hamming window
    applyHammingWindow(frame);

    // Calculate LPC coefficients (Levinson-Durbin)
    const lpcCoeffs = levinsonDurbin(frame, lpcOrder);

    // Find roots of the polynomial
    const roots = findRoots(lpcCoeffs);

    // Convert roots to formants
    const formants = getFormantsFromRoots(roots, targetSampleRate);

    if (formants.length >= 2) {
      f1Candidates.push(formants[0]);
      f2Candidates.push(formants[1]);
    }
  }

  // 5. Aggregate results (Median)
  // Filter out outliers or silence frames first?
  // For now, simple median of all found formants.
  if (f1Candidates.length === 0 || f2Candidates.length === 0) {
    throw new Error('No formants detected');
  }

  return {
    f1: median(f1Candidates),
    f2: median(f2Candidates)
  };
}

function downsample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const newLength = Math.round(input.length / ratio);
  const output = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const index = Math.floor(i * ratio);
    output[i] = input[index]; // Nearest neighbor for simplicity (could use linear interp)
  }
  return output;
}

function preEmphasis(input: Float32Array, coeff = 0.97): Float32Array {
  const output = new Float32Array(input.length);
  output[0] = input[0];
  for (let i = 1; i < input.length; i++) {
    output[i] = input[i] - coeff * input[i - 1];
  }
  return output;
}

function frameSignal(input: Float32Array, frameSize: number, stepSize: number): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let i = 0; i + frameSize <= input.length; i += stepSize) {
    frames.push(input.slice(i, i + frameSize));
  }
  return frames;
}

function applyHammingWindow(frame: Float32Array) {
  for (let i = 0; i < frame.length; i++) {
    frame[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1));
  }
}

// Levinson-Durbin Recursion
function levinsonDurbin(frame: Float32Array, order: number): number[] {
  // Autocorrelation
  const r = new Float32Array(order + 1);
  for (let i = 0; i <= order; i++) {
    let sum = 0;
    for (let j = 0; j < frame.length - i; j++) {
      sum += frame[j] * frame[j + i];
    }
    r[i] = sum;
  }

  // Recursion
  const a = new Float32Array(order + 1);
  const e = new Float32Array(order + 1);
  // Temporary array for updates
  const nextA = new Float32Array(order + 1);

  a[0] = 1;
  e[0] = r[0];

  for (let k = 1; k <= order; k++) {
    let sum = 0;
    for (let j = 1; j < k; j++) {
      sum += a[j] * r[k - j];
    }
    const reflection = -(r[k] + sum) / e[k - 1];

    nextA[k] = reflection;
    for (let j = 1; j < k; j++) {
      nextA[j] = a[j] + reflection * a[k - j];
    }
    // Update a
    for (let j = 1; j <= k; j++) {
      a[j] = nextA[j];
    }

    e[k] = e[k - 1] * (1 - reflection * reflection);
  }

  return Array.from(a);
}

// Root finding using Bairstow's method or similar is complex.
// Alternative: Companion matrix eigenvalues.
// Since we don't have a matrix library, let's use a simplified Laguerre's method or similar for polynomials.
// Actually, for JS, maybe we can use a library-free implementation of Jenkins-Traub or similar?
// Given the constraints and complexity, let's use a simplified approach:
// Evaluate the polynomial on the unit circle (Z-transform) to find peaks? No, that's FFT.
// We need the roots to get bandwidths.
// Let's implement a simple root finder for polynomials with real coefficients (Durand-Kerner method).

function findRoots(coeffs: number[]): { real: number; imag: number }[] {
  // coeffs is [1, a1, a2, ... an]
  // We want roots of z^n + a1*z^(n-1) + ... + an = 0
  const n = coeffs.length - 1;
  const roots: { real: number; imag: number }[] = [];

  // Initial guess: evenly spaced on unit circle
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    roots.push({ real: Math.cos(angle), imag: Math.sin(angle) }); // Start with radius 1? Maybe 0.5 to be safe inside unit circle
    // Actually Durand-Kerner works best with complex initial guesses.
    roots[i].real *= 0.4 + 0.1 * i / n; // Perturb slightly
    roots[i].imag *= 0.4 + 0.1 * i / n;
  }

  const maxIter = 50;
  const tolerance = 1e-6;

  for (let iter = 0; iter < maxIter; iter++) {
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      const z = roots[i];

      // Evaluate P(z)
      let pReal = coeffs[0];
      let pImag = 0;
      // Horner's method
      for (let k = 1; k <= n; k++) {
        // Multiply by z
        const tempReal = pReal * z.real - pImag * z.imag;
        const tempImag = pReal * z.imag + pImag * z.real;
        pReal = tempReal + coeffs[k];
        pImag = tempImag;
      }

      // Evaluate product term: product(z - root[j]) for j != i
      let prodReal = 1;
      let prodImag = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const diffReal = z.real - roots[j].real;
        const diffImag = z.imag - roots[j].imag;

        const tempReal = prodReal * diffReal - prodImag * diffImag;
        const tempImag = prodReal * diffImag + prodImag * diffReal;
        prodReal = tempReal;
        prodImag = tempImag;
      }

      // Delta = P(z) / Product
      // Complex division: (a+bi)/(c+di) = ((ac+bd) + (bc-ad)i) / (c^2+d^2)
      const denom = prodReal * prodReal + prodImag * prodImag;
      if (denom < 1e-12) continue; // Avoid division by zero

      const deltaReal = (pReal * prodReal + pImag * prodImag) / denom;
      const deltaImag = (pImag * prodReal - pReal * prodImag) / denom;

      roots[i].real -= deltaReal;
      roots[i].imag -= deltaImag;

      const diff = Math.sqrt(deltaReal * deltaReal + deltaImag * deltaImag);
      if (diff > maxDiff) maxDiff = diff;
    }
    if (maxDiff < tolerance) break;
  }

  return roots;
}

function getFormantsFromRoots(
  roots: { real: number; imag: number }[],
  sampleRate: number
): number[] {
  const candidates: { freq: number; bw: number }[] = [];

  for (const root of roots) {
    if (root.imag < 0) continue; // Only positive frequencies (conjugate pairs)

    const r = Math.sqrt(root.real * root.real + root.imag * root.imag);
    const theta = Math.atan2(root.imag, root.real);

    const freq = (theta * sampleRate) / (2 * Math.PI);
    const bw = (-Math.log(r) * sampleRate) / Math.PI;

    if (freq > 200 && freq < 5000 && bw < 400) {
      candidates.push({ freq, bw });
    }
  }

  candidates.sort((a, b) => a.freq - b.freq);
  return candidates.map((c) => c.freq);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
