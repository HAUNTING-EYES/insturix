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

const REQUEST_TIMEOUT_MS = 60_000;

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(MODAL_WAV2VEC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${tokenId}:${tokenSecret}`,
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        segments: segments.map(s => ({
          start_ms: s.startMs,
          end_ms: s.endMs,
        })),
        features: ['emotion', 'energy', 'pitch', 'stress', 'filler'],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[Wav2VecService] Modal returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as ModalWav2VecResponse;
    if (!data?.segments?.length) {
      console.warn('[Wav2VecService] Empty response from Modal');
      return null;
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

    console.log(
      `[Wav2VecService] Analyzed ${mapped.length} segments ` +
      `(avg emotion: ${(mapped.reduce((sum, r) => sum + r.emotionIntensity, 0) / mapped.length).toFixed(2)}, ` +
      `valence: ${countValences(mapped)})`,
    );

    return {
      segments: mapped,
      modelVersion: data.model_version ?? 'wav2vec-2.0',
      processingTimeMs: data.processing_time_ms ?? 0,
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
