/**
 * Beat Detection Service
 *
 * Produces beat grids for BGM-aligned editing (alignCutsToBeats wiring).
 *
 * CURRENT IMPLEMENTATION (2026-04-17): Heuristic-only — computes beat grid
 * mathematically from a known BPM + duration. No audio analysis. Pure,
 * deterministic, zero external dependencies.
 *
 * Rationale per Rule A1 (never ship an untested model ID): audio-based
 * beat detection (Gemini audio analysis, Essentia.js WASM, server-side
 * aubio) is a known-feasible upgrade path but not yet verified against
 * our actual BGM outputs. This heuristic gets 80% of the value — all the
 * beat-sync architecture plumbing lands, and the detection algorithm can
 * be swapped behind the same interface in a future commit.
 *
 * MUSIC THEORY APPLIED (creative_production_knowledge.md §11):
 * - Most ad/social music is 4/4 time
 * - Beat interval = 60 / BPM seconds
 * - Downbeats (beat 1 of a 4-beat measure) are the primary sync anchor
 * - Phrase boundaries typically every 4 or 8 bars (16 or 32 beats)
 *
 * OUTPUT SHAPE is structurally compatible with alignCutsToBeats'
 * BeatInfo[] (scene-to-editron.ts:293) — Beat[] here has frame +
 * isDownbeat which is a superset.
 */

// ─── Types ───────────────────────────────────────────────────────

/**
 * Single beat event. Compatible with BeatInfo in scene-to-editron.ts
 * (structural typing — Beat values can be passed where BeatInfo[] is expected).
 */
export interface Beat {
  /** Beat position in project frames */
  frame: number;
  /** True if this is a downbeat (beat 1 of a 4-beat measure) */
  isDownbeat: boolean;
}

/**
 * Full beat grid for a BGM track + associated metadata.
 */
export interface BeatGrid {
  /** Tempo in beats per minute */
  bpm: number;
  /** All beats in the grid (includes downbeats, offbeats) */
  beats: Beat[];
  /** Frame positions of downbeats only — convenience for phrase-level snapping */
  downbeats: number[];
  /** Where measure 1 starts (usually 0 for generated BGM) */
  firstBeatOffsetFrames: number;
  /** How this grid was produced — enables future strategy upgrades */
  source: 'heuristic' | 'audio-analysis' | 'user-specified';
}

// ─── BPM Defaults (signal/mood only) ─────────────────────────────

const HIGH_ENERGY_BPM = 140;
const LOW_ENERGY_BPM = 85;
const MEASURED_SPEECH_BPM = 100;

/** Generic fallback when no signal matches */
const FALLBACK_BPM = 120;

/**
 * Resolve a sensible default BPM from explicit script BPM or mood/energy words.
 * Profile and content-type labels are accepted for API compatibility but ignored.
 */
export function inferBPMFromHints(hints: {
  mood?: string;
  profileId?: string;
  contentType?: string;
  scriptText?: string;
}): number {
  const haystack = [
    hints.mood || '',
    (hints.scriptText || '').substring(0, 2000),
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(high[- ]energy|energetic|intense|hype|fast|beat[- ]synced|rhythmic|rapid)\b/.test(haystack)) return HIGH_ENERGY_BPM;
  if (/\b(calm|slow|quiet|gentle|emotional|reflective|soft|nostalgic)\b/.test(haystack)) return LOW_ENERGY_BPM;
  if (/\b(measured|clear speech|steady|explaining|educational)\b/.test(haystack)) return MEASURED_SPEECH_BPM;
  return FALLBACK_BPM;
}

/**
 * Extract BPM from script text via regex — "140 BPM", "at 120 bpm", "~150bpm".
 * Returns first match or null if none.
 */
export function extractBPMFromScript(scriptText: string): number | null {
  if (!scriptText) return null;
  const match = scriptText.match(/(\d{2,3})\s*bpm\b/i);
  if (match) {
    const bpm = parseInt(match[1], 10);
    // Sanity bounds per creative doc §11 (40-200 BPM covers meditation to speedcore)
    if (bpm >= 40 && bpm <= 220) return bpm;
  }
  return null;
}

// ─── Grid Computation ───────────────────────────────────────────

/**
 * Compute a heuristic beat grid assuming 4/4 time + constant tempo.
 *
 * This is the baseline beat detector — accurate enough for BGM generated at
 * a known target BPM. Real BGM may drift ±2-3 BPM from the target, which
 * this approach doesn't catch. For tight sync on variable-tempo music,
 * swap in audio analysis (same return shape).
 */
export function computeHeuristicBeatGrid(opts: {
  bpm: number;
  durationFrames: number;
  fps?: number;
  firstBeatOffsetFrames?: number;
}): BeatGrid {
  const { bpm, durationFrames } = opts;
  const fps = opts.fps ?? 30;
  const firstBeatOffsetFrames = opts.firstBeatOffsetFrames ?? 0;

  if (bpm < 40 || bpm > 220) {
    throw new Error(`computeHeuristicBeatGrid: BPM out of bounds (${bpm}). Expected 40-220.`);
  }

  const beatIntervalFrames = (60 / bpm) * fps;
  const beats: Beat[] = [];
  const downbeats: number[] = [];

  let i = 0;
  while (true) {
    const frame = Math.round(firstBeatOffsetFrames + i * beatIntervalFrames);
    if (frame >= durationFrames) break;
    const isDownbeat = i % 4 === 0;
    beats.push({ frame, isDownbeat });
    if (isDownbeat) downbeats.push(frame);
    i++;
  }

  return {
    bpm,
    beats,
    downbeats,
    firstBeatOffsetFrames,
    source: 'heuristic',
  };
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Detect beats for a given audio asset, producing a full BeatGrid.
 *
 * CURRENT BEHAVIOR: returns a heuristic grid from the provided BPM (or an
 * inferred default). The audioUrl is accepted for interface-stability but
 * NOT currently analyzed — future commits will add audio analysis behind
 * this same signature.
 *
 * @param opts - Detection parameters (bpm optional but strongly preferred)
 * @returns BeatGrid — always returns a valid grid (never throws for missing bpm)
 */
export async function detectBeats(opts: {
  /** URL of the BGM audio file — accepted for future audio-analysis upgrade; ignored today */
  audioUrl?: string;
  /** Known or target BPM from script/model config; when provided, grid matches exactly */
  bpm?: number;
  /** Total project duration in frames that the grid should span */
  durationFrames: number;
  /** Frames per second of the project */
  fps?: number;
  /** Hints used to infer BPM when none is provided */
  hints?: {
    mood?: string;
    profileId?: string;
    contentType?: string;
    scriptText?: string;
  };
}): Promise<BeatGrid> {
  const fps = opts.fps ?? 30;

  let bpm = opts.bpm;
  if (!bpm) {
    // Try extracting from script text first (most specific)
    if (opts.hints?.scriptText) {
      const scriptBpm = extractBPMFromScript(opts.hints.scriptText);
      if (scriptBpm) bpm = scriptBpm;
    }
    // Then fall back to signal/mood default
    if (!bpm) {
      bpm = inferBPMFromHints(opts.hints || {});
    }
  }

  console.log(
    `[BeatDetection] Producing heuristic grid: bpm=${bpm}, durationFrames=${opts.durationFrames}, fps=${fps}`
  );

  return computeHeuristicBeatGrid({
    bpm,
    durationFrames: opts.durationFrames,
    fps,
  });
}
