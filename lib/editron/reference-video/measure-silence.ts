/**
 * R2: Silence measurement from decoded audio (the missing R2 signal).
 *
 * R2 spec: "Measure audio beats, downbeats, sections, onsets, energy, and
 * silence from decoded audio." Beats/downbeats/onsets/energy come from
 * beat-detection-service; sections come from Essentia (Modal). Silence is the
 * piece with no home — this module owns it, deterministically, from PCM:
 *
 *   1. Per-sample RMS over a hop window → energy curve.
 *   2. A window is SILENT when its RMS is below a noise floor derived from the
 *      file's RMS percentile (adaptive, not a fixed dBFS constant).
 *   3. Run-length merge silent windows into gaps; gaps shorter than a minimum
 *      are discarded.
 *
 * Pure + deterministic (R18N: no random, no hidden I/O). Thresholds are
 * explicit calibration knobs to be tuned like R0's cut floor — currently
 * marked INVENTED.
 */

export interface SilenceWindow {
  /** Wall-clock start of the silent region (ms, 0-based). */
  startMs: number;
  /** End of the silent region (ms). */
  endMs: number;
  /** Duration (ms). */
  durationMs: number;
  /** Peak RMS inside the window relative to the file's RMS (0..1). */
  relativeLevel: number;
}

export interface SilenceMeasurement {
  windows: SilenceWindow[];
  /** Total silent ms across all windows. */
  totalSilentMs: number;
  /** Fraction of the audio that is silent (0..1). */
  silentRatio: number;
  /** Duration analysed (ms). */
  durationMs: number;
  /** Version of the measurement contract. */
  version: typeof SILENCE_MEASUREMENT_VERSION;
}

export const SILENCE_MEASUREMENT_VERSION = 'editron-r2-silence-v1' as const;

/** Hop for the RMS energy curve (ms). ⚠️ INVENTED — 20ms is a common onset-analysis hop. */
export const DEFAULT_HOP_MS = 20;
/** Window for each RMS sample (ms). ⚠️ INVENTED — matches hop; fine for gaps ≥ minSilence. */
export const DEFAULT_WINDOW_MS = 20;
/** A silent run shorter than this (ms) is noise, not silence. ⚠️ CALIBRATED-BUT-UNVALIDATED —
 *  winner of a 28-setting grid over 20 real videos vs the ffmpeg silencedetect oracle
 *  (500ms beat 300/800ms), but oracle-aligned informative-video meanF1 is only 0.367 —
 *  directional, needs human/Qwen confirmation on real windows before it is trusted. */
export const DEFAULT_MIN_SILENCE_MS = 500;
/** A window is silent when its RMS < factor × file-median RMS. ⚠️ CALIBRATED-BUT-UNVALIDATED —
 *  grid winner (0.05 beat the 0.25 guess by a wide margin), but same caveat as the min-gap:
 *  windows land in the right region yet start-point alignment vs the oracle is unconfirmed. */
export const DEFAULT_SILENCE_RMS_FACTOR = 0.05;

export interface MeasureSilenceOptions {
  hopMs?: number;
  windowMs?: number;
  minSilenceMs?: number;
  /** Fraction of the file's median per-window RMS used as the noise floor. */
  silenceRmsFactor?: number;
}

/**
 * Measure silence windows from mono PCM.
 * `samples` are normalized floats in [-1, 1] at `sampleRate` Hz.
 */
export function measureSilence(
  samples: Float32Array,
  sampleRate: number,
  options: MeasureSilenceOptions = {},
): SilenceMeasurement {
  const hopMs = options.hopMs ?? DEFAULT_HOP_MS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const minSilenceMs = options.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS;
  const silenceRmsFactor = options.silenceRmsFactor ?? DEFAULT_SILENCE_RMS_FACTOR;

  if (!(samples instanceof Float32Array) || samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return {
      windows: [],
      totalSilentMs: 0,
      silentRatio: 0,
      durationMs: 0,
      version: SILENCE_MEASUREMENT_VERSION,
    };
  }

  const hopSamples = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  const windowSamples = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const durationMs = (samples.length / sampleRate) * 1000;

  // 1. Per-window RMS curve.
  const curve: { startMs: number; rms: number }[] = [];
  const rmsValues: number[] = [];
  for (let start = 0; start + windowSamples <= samples.length; start += hopSamples) {
    let sum = 0;
    for (let i = start; i < start + windowSamples; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / windowSamples);
    curve.push({ startMs: (start / sampleRate) * 1000, rms });
    rmsValues.push(rms);
  }
  if (curve.length === 0) {
    // Too short to window — treat as a single decision, honest not silent.
    return {
      windows: [],
      totalSilentMs: 0,
      silentRatio: 0,
      durationMs,
      version: SILENCE_MEASUREMENT_VERSION,
    };
  }

  // 2. Adaptive noise floor = factor × median per-window RMS. Median (not the
  //    percentile value itself) keeps the floor clearly BELOW content level, so
  //    quiet-vs-loud never sits on the exact boundary the way a raw percentile
  //    does. A floor of 0 marks a fully-silent file — its single run is still
  //    reported below.
  const sorted = [...rmsValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const floor = median * silenceRmsFactor;
  const maxRms = Math.max(...rmsValues);

  // 3. Merge silent runs.
  const runs: Array<{ startMs: number; endMs: number; rmsSum: number; count: number }> = [];
  let current: { startMs: number; endMs: number; rmsSum: number; count: number } | null = null;
  for (const point of curve) {
    if (point.rms <= floor && (floor > 0 || point.rms === 0)) {
      if (!current) {
        current = { startMs: point.startMs, endMs: point.startMs + windowMs, rmsSum: point.rms, count: 1 };
      } else {
        current.rmsSum += point.rms;
        current.count += 1;
        current.endMs = point.startMs + windowMs;
      }
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);

  // 4. Filter by minimum duration + cap to the actual file duration.
  const windows: SilenceWindow[] = runs
    .filter((run) => run.endMs - run.startMs >= minSilenceMs)
    .map((run) => ({
      startMs: round(run.startMs),
      endMs: round(Math.min(run.endMs, durationMs)),
      durationMs: round(Math.min(run.endMs, durationMs) - run.startMs),
      relativeLevel: maxRms > 0 ? round(run.rmsSum / run.count / maxRms) : 0,
    }))
    .filter((w) => w.durationMs >= minSilenceMs);

  const totalSilentMs = windows.reduce((sum, w) => sum + w.durationMs, 0);
  return {
    windows,
    totalSilentMs: round(totalSilentMs),
    silentRatio: durationMs > 0 ? round(totalSilentMs / durationMs) : 0,
    durationMs: round(durationMs),
    version: SILENCE_MEASUREMENT_VERSION,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
