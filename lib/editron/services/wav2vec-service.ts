/**
 * Wav2Vec Service — Vocal Emotion via Meta Wav2Vec 2.0 (TRIBE v2 Phase 2)
 *
 * Calls Modal web endpoint running Wav2Vec 2.0 to extract vocal prosodic
 * features from audio. Replaces transcript-only sentiment with voice-based emotion.
 *
 * Wav2Vec capabilities leveraged:
 *   - Emotion intensity: vocal arousal / stress level (0-1)
 *   - Emotional valence: positive/negative/neutral/mixed from VOICE not text
 *   - Speech energy: semantic energy embedding (replaces RMS heuristic)
 *   - Pitch variability: prosodic variation for contour analysis
 *   - Stress detection: word-level emphasis from vocal prosody
 *   - Filler classification: higher accuracy than regex-based detection
 *
 * Deployment: Modal serverless GPU endpoint (requires deployment before functional).
 * Until deployed, analyzeAudioWithWav2Vec() returns null and pipeline continues without it.
 *
 * Consumer: moment-weight-service.ts (integrateWav2vecScores — 20% of Phase 2 weight)
 *           signal-registry.ts (enriches NEEDS_INFRA speech signals)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type EmotionalValence = 'positive' | 'negative' | 'neutral' | 'mixed';

export interface Wav2VecSegmentInput {
  startMs: number;
  endMs: number;
}

export interface Wav2VecSegmentResult {
  startMs: number;
  endMs: number;
  emotionIntensity: number;       // 0-1, overall vocal arousal level
  emotionalValence: EmotionalValence;
  energy: number;                 // 0-1, semantic speech energy (replaces RMS amplitude)
  pitchVariability: number;       // 0-1, prosodic variation within segment
  stressDetected: boolean;        // word-level vocal stress present
  fillerConfidence: number;       // 0-1, probability segment contains filler words
}

export interface Wav2VecAnalysisResult {
  segments: Wav2VecSegmentResult[];
  modelVersion: string;
  processingTimeMs: number;
}

// ─── Modal Response Shape (snake_case from endpoint) ────────────────────────

interface ModalWav2VecSegment {
  start_ms: number;
  end_ms: number;
  emotion_intensity: number;
  emotional_valence: string;
  energy: number;
  pitch_variability: number;
  stress_detected: boolean;
  filler_confidence: number;
}

interface ModalWav2VecResponse {
  segments: ModalWav2VecSegment[];
  model_version?: string;
  processing_time_ms?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MODAL_WAV2VEC_ENDPOINT = process.env.MODAL_WAV2VEC_ENDPOINT
  || 'https://jainnimit728--wav2vec-vocal-wav2vecanalyzer-analyze.modal.run';

const VALID_VALENCES: Set<string> = new Set(['positive', 'negative', 'neutral', 'mixed']);

const COLD_TIMEOUT_MS = 120_000; // 120s for batch 1 — Modal cold start (60-90s) + large file download
const WARM_TIMEOUT_MS = 90_000;  // 90s for batch 2+ — Modal re-downloads audio each batch for long videos
const BATCH_SIZE = 20;           // Reduced from 30 — smaller batches are more reliable on Modal

// ─── Warmup ────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget warmup ping to Modal. Wakes the container if cold.
 * Call alongside warmupVjepa() during upload — both run in parallel.
 */
export function warmupWav2Vec(): void {
  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) return;

  fetch(MODAL_WAV2VEC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${tokenId}:${tokenSecret}`,
    },
    body: JSON.stringify({ audio_url: '', segments: [] }),
    signal: AbortSignal.timeout(90_000),
  }).then(() => {
    console.log('[Wav2VecService] Warmup: container ready');
  }).catch(() => {
    // Non-fatal
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Analyze audio segments with Wav2Vec 2.0 for vocal emotion and prosodic features.
 *
 * Returns null if the endpoint is unavailable or analysis fails.
 * Pipeline continues without Wav2Vec data — moment weights use
 * transcript-only sentiment (Phase 0) or default 0.5 (neutral).
 */
export async function analyzeAudioWithWav2Vec(
  audioUrl: string,
  segments: Wav2VecSegmentInput[],
): Promise<Wav2VecAnalysisResult | null> {
  if (!audioUrl || segments.length === 0) return null;

  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    console.warn('[Wav2VecService] MODAL_TOKEN_ID/SECRET not set — skipping Wav2Vec analysis');
    return null;
  }

  try {
    // Batch segments to avoid timeout on long videos.
    // OLD: sent all segments in one request → 45s abort on anything > ~50 segments.
    // FIX: send in chunks of BATCH_SIZE, concatenate results.
    const allResults: Wav2VecSegmentResult[] = [];
    const batches: Wav2VecSegmentInput[][] = [];
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      batches.push(segments.slice(i, i + BATCH_SIZE));
    }
    const batchStartMs = Date.now();

    console.log(`[Wav2VecService] ${segments.length} segments → ${batches.length} batch(es) of ≤${BATCH_SIZE}`);
    let lastResponseMs = Date.now();
    // ⚠️ INVENTED — 30s gap threshold. If >30s between batches, Modal container
    // likely cold-restarted. Re-use cold timeout instead of warm. Needs calibration.
    const GAP_COLD_RESTART_MS = 30_000;

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const controller = new AbortController();
      const timeSinceLastResponse = Date.now() - lastResponseMs;
      const batchTimeout = (b === 0 || timeSinceLastResponse > GAP_COLD_RESTART_MS)
        ? COLD_TIMEOUT_MS : WARM_TIMEOUT_MS;
      const timeout = setTimeout(() => controller.abort(), batchTimeout);

      const response = await fetch(MODAL_WAV2VEC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${tokenId}:${tokenSecret}`,
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          segments: batch.map(s => ({
            start_ms: s.startMs,
            end_ms: s.endMs,
          })),
          features: ['emotion', 'energy', 'pitch', 'stress', 'filler'],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[Wav2VecService] Batch ${b + 1}/${batches.length} failed: ${response.status} ${response.statusText}`);
        return null;
      }

      lastResponseMs = Date.now();
      const data = (await response.json()) as ModalWav2VecResponse;
      if (!data?.segments?.length) {
        console.warn(`[Wav2VecService] Batch ${b + 1}/${batches.length}: empty response — continuing with partial results`);
        continue;
      }

      const mapped: Wav2VecSegmentResult[] = data.segments.map(s => ({
        startMs: s.start_ms,
        endMs: s.end_ms,
        emotionIntensity: clamp(s.emotion_intensity, 0, 1),
        emotionalValence: parseValence(s.emotional_valence),
        energy: clamp(s.energy, 0, 1),
        pitchVariability: clamp(s.pitch_variability, 0, 1),
        stressDetected: s.stress_detected ?? false,
        fillerConfidence: clamp(s.filler_confidence, 0, 1),
      }));

      allResults.push(...mapped);
      console.log(`[Wav2VecService] Batch ${b + 1}/${batches.length}: ${mapped.length} segments analyzed`);
    }

    const totalMs = Date.now() - batchStartMs;
    console.log(
      `[Wav2VecService] All ${allResults.length} segments analyzed in ${totalMs}ms ` +
      `(avg emotion: ${(allResults.reduce((sum, r) => sum + r.emotionIntensity, 0) / allResults.length).toFixed(2)}, ` +
      `valence: ${countValences(allResults)})`,
    );

    return {
      segments: allResults,
      modelVersion: 'wav2vec-2.0',
      processingTimeMs: totalMs,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Wav2VecService] Analysis failed: ${msg}`);
    return null;
  }
}

// ─── Format Converters ──────────────────────────────────────────────────────

/**
 * Convert to the format expected by moment-weight-service.ts integrateWav2vecScores().
 */
export function toWav2VecWeightFormat(
  result: Wav2VecAnalysisResult,
): Array<{ startMs: number; endMs: number; emotionIntensity: number }> {
  return result.segments.map(s => ({
    startMs: s.startMs,
    endMs: s.endMs,
    emotionIntensity: s.emotionIntensity,
  }));
}

/**
 * Convert to a lookup map keyed by "startMs-endMs" for signal enrichment.
 * Used by signal-registry to replace NEEDS_INFRA speech signals with real data.
 */
export function toSignalEnrichment(
  result: Wav2VecAnalysisResult,
): Map<string, Wav2VecSegmentResult> {
  const map = new Map<string, Wav2VecSegmentResult>();
  for (const seg of result.segments) {
    map.set(`${seg.startMs}-${seg.endMs}`, seg);
  }
  return map;
}

// ─── Parsers ────────────────────────────────────────────────────────────────

function parseValence(v: string): EmotionalValence {
  if (VALID_VALENCES.has(v)) return v as EmotionalValence;
  return 'neutral';
}

function countValences(segments: Wav2VecSegmentResult[]): string {
  const counts: Record<string, number> = {};
  for (const s of segments) {
    counts[s.emotionalValence] = (counts[s.emotionalValence] || 0) + 1;
  }
  return Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
