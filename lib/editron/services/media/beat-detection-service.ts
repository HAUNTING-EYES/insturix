/**
 * Beat Detection Service
 *
 * Multi-band spectral flux onset detection + BPM estimation via autocorrelation.
 * Isomorphic: runs in browser (Web Audio API) and Node.js (node-web-audio-api polyfill).
 *
 * Algorithm overview:
 * 1. Decode audio → mono PCM samples
 * 2. Split into 3 frequency bands (low/mid/high) via FFT
 * 3. Compute spectral flux per band → weighted sum
 * 4. Adaptive threshold peak-picking → onset timestamps
 * 5. Autocorrelation of onset density → BPM estimate (40-240 range)
 * 6. Quantize onsets to beat grid → mark downbeats
 * 7. Detect energy peaks → snap to nearest beat (beat-locked)
 */

import type {
  Beat,
  BeatAnalysis,
  BeatDetectionOptions,
} from './types';

// ─── Defaults ────────────────────────────────────────────────────
const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_HOP_SIZE = 512;
const DEFAULT_MIN_BPM = 40;
const DEFAULT_MAX_BPM = 240;
const DEFAULT_TIME_SIGNATURE = 4;
const DEFAULT_TOP_ENERGY_PEAKS = 20;
const DEFAULT_ENERGY_SNAP_TOLERANCE_MS = 50;

// Multi-band weights: low band (kick/bass) weighted heaviest
const BAND_WEIGHTS = { low: 0.5, mid: 0.3, high: 0.2 };
// Band frequency boundaries (Hz)
const BAND_LOW_MAX = 300;
const BAND_MID_MAX = 4000;

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Analyze an AudioBuffer for beats, tempo, and energy peaks.
 * Works with both browser AudioBuffer and node-web-audio-api AudioBuffer.
 */
export async function analyzeBeatsFull(
  audioBuffer: { sampleRate: number; length: number; numberOfChannels: number; getChannelData: (ch: number) => Float32Array; duration: number },
  options: BeatDetectionOptions = {},
): Promise<BeatAnalysis> {
  const samples = extractMono(audioBuffer);
  const sampleRate = Number(audioBuffer?.sampleRate);
  if (!samples || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return emptyBeatAnalysis(audioBuffer, options);
  }
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;
  const hopSize = options.hopSize ?? DEFAULT_HOP_SIZE;
  const minBPM = options.minBPM ?? DEFAULT_MIN_BPM;
  const maxBPM = options.maxBPM ?? DEFAULT_MAX_BPM;
  const timeSignature = options.timeSignature ?? DEFAULT_TIME_SIGNATURE;
  const topEnergyPeaks = options.topEnergyPeaks ?? DEFAULT_TOP_ENERGY_PEAKS;
  const energySnapMs = options.energySnapToleranceMs ?? DEFAULT_ENERGY_SNAP_TOLERANCE_MS;

  // Step 0: PCM was validated and mixed before analysis.
  const durationMs = (samples.length / sampleRate) * 1000;

  // Step 1: Multi-band spectral flux
  const fluxCurve = computeMultiBandSpectralFlux(samples, sampleRate, fftSize, hopSize);

  // Step 2: Peak-pick onsets
  const rawOnsets = pickOnsets(fluxCurve);

  // Step 3: Estimate BPM
  const { bpm, confidence: bpmConfidence } = estimateBPM(rawOnsets, durationMs, minBPM, maxBPM);

  // Step 4: Quantize to beat grid
  const beats = quantizeToGrid(rawOnsets, bpm, timeSignature, durationMs);

  // Step 5: Detect energy peaks (beat-locked)
  const rawPeaks = detectEnergyPeaks(samples, sampleRate, topEnergyPeaks);
  const energyPeaks = beatLockPeaks(rawPeaks, beats, energySnapMs);

  return {
    beats,
    bpm,
    bpmConfidence,
    durationMs,
    timeSignatureNumerator: timeSignature,
    energyPeaks,
    rawOnsets,
  };
}

/**
 * Re-quantize raw onsets to a new BPM grid (for manual override).
 * Keeps the same onset data but rebuilds the beat grid at the new tempo.
 */
export function requantizeBeats(
  rawOnsets: { timeMs: number; strength: number }[],
  newBpm: number,
  timeSignature: number = DEFAULT_TIME_SIGNATURE,
  durationMs: number,
): Beat[] {
  return quantizeToGrid(rawOnsets, newBpm, timeSignature, durationMs);
}

/**
 * Convert BeatAnalysis to timeline frames for a specific audio overlay.
 */
export function beatAnalysisToFrames(
  analysis: BeatAnalysis,
  fps: number,
  audioStartOffsetMs: number = 0,
): {
  beatFrames: { frame: number; strength: number; isDownbeat: boolean }[];
  energyPeakFrames: { frame: number; magnitude: number }[];
} {
  const beatFrames = analysis.beats.map((b) => ({
    frame: Math.round(((b.timeMs + audioStartOffsetMs) / 1000) * fps),
    strength: b.strength,
    isDownbeat: b.isDownbeat,
  }));

  const energyPeakFrames = analysis.energyPeaks.map((p) => ({
    frame: Math.round(((p.timeMs + audioStartOffsetMs) / 1000) * fps),
    magnitude: p.magnitude,
  }));

  return { beatFrames, energyPeakFrames };
}

// ─── Internal: Audio Processing ──────────────────────────────────

function emptyBeatAnalysis(
  audioBuffer: Partial<{ sampleRate: number; length: number; duration: number }> | null | undefined,
  options: BeatDetectionOptions,
): BeatAnalysis {
  const explicitDuration = Number(audioBuffer?.duration);
  const sampleRate = Number(audioBuffer?.sampleRate);
  const length = Number(audioBuffer?.length);
  const durationMs = Number.isFinite(explicitDuration) && explicitDuration > 0
    ? explicitDuration * 1000
    : Number.isFinite(sampleRate) && sampleRate > 0 && Number.isFinite(length) && length > 0
      ? (length / sampleRate) * 1000
      : 0;
  return {
    beats: [],
    bpm: 0,
    bpmConfidence: 0,
    durationMs,
    timeSignatureNumerator: options.timeSignature ?? DEFAULT_TIME_SIGNATURE,
    energyPeaks: [],
    rawOnsets: [],
  };
}

function extractMono(
  audioBuffer: { numberOfChannels: number; getChannelData: (ch: number) => Float32Array; length: number } | null | undefined,
): Float32Array | null {
  if (
    !audioBuffer
    || typeof audioBuffer.getChannelData !== 'function'
    || !Number.isInteger(audioBuffer.numberOfChannels)
    || audioBuffer.numberOfChannels < 1
    || !Number.isFinite(audioBuffer.length)
    || audioBuffer.length <= 0
  ) {
    return null;
  }
  try {
    const ch0 = audioBuffer.getChannelData(0);
    if (!(ch0 instanceof Float32Array) || ch0.length === 0) return null;
    if (audioBuffer.numberOfChannels === 1) {
      return ch0.subarray(0, Math.min(audioBuffer.length, ch0.length));
    }
    const ch1 = audioBuffer.getChannelData(1);
    if (!(ch1 instanceof Float32Array) || ch1.length === 0) return null;
    const length = Math.min(audioBuffer.length, ch0.length, ch1.length);
    if (length <= 0) return null;
    const mono = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      mono[i] = (ch0[i] + ch1[i]) * 0.5;
    }
    return mono;
  } catch {
    return null;
  }
}

// ─── Step 1: Multi-Band Spectral Flux ────────────────────────────

/**
 * Compute spectral flux split across low/mid/high bands.
 * Low (20-300Hz): kick/bass — weighted heaviest for music-sync cutting.
 * Mid (300-4000Hz): snare/vocals/melody.
 * High (4000Hz+): hi-hats/cymbals.
 */
function computeMultiBandSpectralFlux(
  samples: Float32Array,
  sampleRate: number,
  fftSize: number,
  hopSize: number,
): { timeMs: number; flux: number }[] {
  const halfFFT = fftSize / 2;
  const hzPerBin = sampleRate / fftSize;
  const lowMaxBin = Math.floor(BAND_LOW_MAX / hzPerBin);
  const midMaxBin = Math.floor(BAND_MID_MAX / hzPerBin);

  // Hann window
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  const result: { timeMs: number; flux: number }[] = [];
  let prevMagnitudes: Float32Array | null = null;

  const numFrames = Math.floor((samples.length - fftSize) / hopSize) + 1;

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hopSize;
    const timeMs = (offset / sampleRate) * 1000;

    // Apply window and compute FFT
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      real[i] = (samples[offset + i] || 0) * window[i];
    }
    fftInPlace(real, imag);

    // Compute magnitude spectrum (only positive frequencies)
    const magnitudes = new Float32Array(halfFFT);
    for (let i = 0; i < halfFFT; i++) {
      magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    if (prevMagnitudes) {
      // Half-wave rectified spectral flux per band
      let lowFlux = 0;
      let midFlux = 0;
      let highFlux = 0;

      for (let i = 1; i < halfFFT; i++) {
        const diff = Math.max(0, magnitudes[i] - prevMagnitudes[i]);
        if (i <= lowMaxBin) {
          lowFlux += diff;
        } else if (i <= midMaxBin) {
          midFlux += diff;
        } else {
          highFlux += diff;
        }
      }

      // Weighted sum across bands
      const weightedFlux =
        lowFlux * BAND_WEIGHTS.low +
        midFlux * BAND_WEIGHTS.mid +
        highFlux * BAND_WEIGHTS.high;

      result.push({ timeMs, flux: weightedFlux });
    }

    prevMagnitudes = magnitudes;
  }

  return result;
}

// ─── Step 2: Onset Detection ─────────────────────────────────────

/**
 * Adaptive threshold peak-picking from spectral flux curve.
 * Uses local median + constant offset as threshold.
 */
function pickOnsets(
  fluxCurve: { timeMs: number; flux: number }[],
  windowSize: number = 8,
): { timeMs: number; strength: number }[] {
  if (fluxCurve.length === 0) return [];

  const onsets: { timeMs: number; strength: number }[] = [];

  // Compute global statistics for normalization
  const fluxValues = fluxCurve.map((f) => f.flux);
  const maxFlux = Math.max(...fluxValues);
  if (maxFlux === 0) return [];

  // Adaptive threshold: local median + offset
  const offset = 0.1 * maxFlux; // 10% of max as base offset

  for (let i = 1; i < fluxCurve.length - 1; i++) {
    // Local window around current frame
    const start = Math.max(0, i - windowSize);
    const end = Math.min(fluxCurve.length, i + windowSize + 1);
    const localSlice = fluxValues.slice(start, end).sort((a, b) => a - b);
    const localMedian = localSlice[Math.floor(localSlice.length / 2)];

    const threshold = localMedian + offset;
    const current = fluxCurve[i].flux;

    // Peak detection: above threshold AND local maximum
    if (
      current > threshold &&
      current > fluxCurve[i - 1].flux &&
      current > fluxCurve[i + 1].flux
    ) {
      onsets.push({
        timeMs: fluxCurve[i].timeMs,
        strength: Math.min(current / maxFlux, 1.0),
      });
    }
  }

  return onsets;
}

// ─── Step 3: BPM Estimation ──────────────────────────────────────

/**
 * Estimate BPM via autocorrelation of onset density.
 * Range: 40-240 BPM. Octave error correction with confidence-weighted voting.
 */
function estimateBPM(
  onsets: { timeMs: number }[],
  durationMs: number,
  minBPM: number = DEFAULT_MIN_BPM,
  maxBPM: number = DEFAULT_MAX_BPM,
): { bpm: number; confidence: number } {
  if (onsets.length < 4) {
    return { bpm: 120, confidence: 0 };
  }

  // Build onset density histogram at 10ms resolution
  const resolution = 10; // ms
  const histLen = Math.ceil(durationMs / resolution);
  const histogram = new Float32Array(histLen);
  for (const onset of onsets) {
    const bin = Math.floor(onset.timeMs / resolution);
    if (bin >= 0 && bin < histLen) {
      histogram[bin] = 1;
    }
  }

  // Autocorrelation for lags in BPM range
  const minLag = Math.floor(60000 / (maxBPM * resolution)); // maxBPM → shortest lag
  const maxLag = Math.ceil(60000 / (minBPM * resolution));   // minBPM → longest lag
  const clampedMaxLag = Math.min(maxLag, histLen - 1);

  let bestLag = minLag;
  let bestCorr = -Infinity;
  let meanCorr = 0;
  let corrCount = 0;

  for (let lag = minLag; lag <= clampedMaxLag; lag++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < histLen - lag; i++) {
      corr += histogram[i] * histogram[i + lag];
      count++;
    }
    if (count > 0) corr /= count;

    meanCorr += corr;
    corrCount++;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  meanCorr = corrCount > 0 ? meanCorr / corrCount : 0;
  const rawBpm = 60000 / (bestLag * resolution);

  // Octave error correction: check half and double BPM
  // Prefer the candidate that falls in the 80-160 "sweet spot" range
  const candidates = [rawBpm, rawBpm / 2, rawBpm * 2].filter(
    (b) => b >= minBPM && b <= maxBPM,
  );

  let finalBpm = rawBpm;
  if (candidates.length > 1) {
    // Check autocorrelation at each candidate's lag
    const candidateScores = candidates.map((bpm) => {
      const lag = Math.round(60000 / (bpm * resolution));
      let corr = 0;
      let count = 0;
      for (let i = 0; i < histLen - lag; i++) {
        corr += histogram[i] * histogram[i + lag];
        count++;
      }
      corr = count > 0 ? corr / count : 0;
      // Prefer 80-160 range with a small bonus
      const rangeBonus = bpm >= 80 && bpm <= 160 ? 1.15 : 1.0;
      return { bpm, score: corr * rangeBonus };
    });
    candidateScores.sort((a, b) => b.score - a.score);
    finalBpm = candidateScores[0].bpm;
  }

  // Confidence: peak-to-mean ratio, clamped to 0..1
  const confidence = meanCorr > 0 ? Math.min(bestCorr / (meanCorr * 3), 1.0) : 0;

  return {
    bpm: Math.round(finalBpm * 10) / 10, // 1 decimal place
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ─── Step 4: Beat Grid Quantization ──────────────────────────────

/**
 * Quantize onsets to an ideal beat grid.
 * Finds the phase offset that maximizes onset-grid alignment,
 * then marks every Nth beat as a downbeat.
 */
function quantizeToGrid(
  onsets: { timeMs: number; strength: number }[],
  bpm: number,
  timeSignature: number,
  durationMs: number,
): Beat[] {
  if (bpm <= 0 || onsets.length === 0) return [];

  const beatIntervalMs = 60000 / bpm;
  const totalBeats = Math.floor(durationMs / beatIntervalMs);

  // Find best phase offset by testing 20 offsets within one beat interval
  const phaseSteps = 20;
  let bestPhase = 0;
  let bestScore = -Infinity;

  for (let p = 0; p < phaseSteps; p++) {
    const phase = (p / phaseSteps) * beatIntervalMs;
    let score = 0;
    for (const onset of onsets) {
      const distToBeat = Math.abs(
        ((onset.timeMs - phase) % beatIntervalMs + beatIntervalMs) % beatIntervalMs,
      );
      const normalizedDist = Math.min(distToBeat, beatIntervalMs - distToBeat);
      // Score: closer to a grid beat → higher score, weighted by onset strength
      score += onset.strength * (1 - normalizedDist / (beatIntervalMs / 2));
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }

  // Build beat grid at the optimal phase
  const beats: Beat[] = [];
  for (let i = 0; i < totalBeats; i++) {
    const beatTime = bestPhase + i * beatIntervalMs;
    if (beatTime < 0 || beatTime > durationMs) continue;

    // Find the nearest onset to this beat and use its strength
    let nearestStrength = 0.3; // default for grid beats without a close onset
    let minDist = Infinity;
    for (const onset of onsets) {
      const dist = Math.abs(onset.timeMs - beatTime);
      if (dist < minDist) {
        minDist = dist;
        nearestStrength = onset.strength;
      }
    }
    // If nearest onset is more than half a beat away, use low default strength
    if (minDist > beatIntervalMs / 2) {
      nearestStrength = 0.2;
    }

    beats.push({
      timeMs: Math.round(beatTime * 10) / 10,
      strength: nearestStrength,
      isDownbeat: i % timeSignature === 0,
    });
  }

  return beats;
}

// ─── Step 5: Energy Peak Detection ───────────────────────────────

/**
 * Detect absolute amplitude maxima in the audio.
 * Returns the top N peaks sorted by magnitude.
 */
function detectEnergyPeaks(
  samples: Float32Array,
  sampleRate: number,
  topN: number,
): { timeMs: number; magnitude: number }[] {
  // Compute RMS energy in 50ms windows
  const windowSamples = Math.floor(sampleRate * 0.05);
  const hop = Math.floor(windowSamples / 2);
  const energyCurve: { timeMs: number; energy: number }[] = [];

  for (let i = 0; i + windowSamples <= samples.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < windowSamples; j++) {
      sum += samples[i + j] * samples[i + j];
    }
    const rms = Math.sqrt(sum / windowSamples);
    energyCurve.push({
      timeMs: (i / sampleRate) * 1000,
      energy: rms,
    });
  }

  if (energyCurve.length === 0) return [];

  // Find local maxima
  const maxEnergy = Math.max(...energyCurve.map((e) => e.energy));
  const peaks: { timeMs: number; magnitude: number }[] = [];

  for (let i = 1; i < energyCurve.length - 1; i++) {
    if (
      energyCurve[i].energy > energyCurve[i - 1].energy &&
      energyCurve[i].energy > energyCurve[i + 1].energy &&
      energyCurve[i].energy > maxEnergy * 0.3 // at least 30% of max
    ) {
      peaks.push({
        timeMs: energyCurve[i].timeMs,
        magnitude: maxEnergy > 0 ? energyCurve[i].energy / maxEnergy : 0,
      });
    }
  }

  // Sort by magnitude descending, take topN
  peaks.sort((a, b) => b.magnitude - a.magnitude);
  return peaks.slice(0, topN);
}

/**
 * Beat-lock energy peaks: snap each peak to nearest beat within tolerance.
 * Peaks without a beat within tolerance are DISCARDED (no unquantized cuts).
 */
function beatLockPeaks(
  peaks: { timeMs: number; magnitude: number }[],
  beats: Beat[],
  toleranceMs: number,
): { timeMs: number; magnitude: number }[] {
  if (beats.length === 0) return [];

  const locked: { timeMs: number; magnitude: number }[] = [];
  for (const peak of peaks) {
    let nearestBeatTime = beats[0].timeMs;
    let minDist = Infinity;
    for (const beat of beats) {
      const dist = Math.abs(peak.timeMs - beat.timeMs);
      if (dist < minDist) {
        minDist = dist;
        nearestBeatTime = beat.timeMs;
      }
    }
    if (minDist <= toleranceMs) {
      locked.push({ timeMs: nearestBeatTime, magnitude: peak.magnitude });
    }
    // Else: discard — no unquantized cuts
  }

  // Deduplicate (multiple peaks may snap to the same beat)
  const seen = new Set<number>();
  return locked.filter((p) => {
    if (seen.has(p.timeMs)) return false;
    seen.add(p.timeMs);
    return true;
  });
}

// ─── FFT Implementation ──────────────────────────────────────────

/**
 * In-place Cooley-Tukey radix-2 FFT.
 * Operates on real[] and imag[] arrays of length N (must be power of 2).
 */
function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // FFT butterfly
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angleStep = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < halfSize; k++) {
        const angle = angleStep * k;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const idx1 = i + k;
        const idx2 = i + k + halfSize;
        const tReal = cosA * real[idx2] - sinA * imag[idx2];
        const tImag = sinA * real[idx2] + cosA * imag[idx2];
        real[idx2] = real[idx1] - tReal;
        imag[idx2] = imag[idx1] - tImag;
        real[idx1] += tReal;
        imag[idx1] += tImag;
      }
    }
  }
}
