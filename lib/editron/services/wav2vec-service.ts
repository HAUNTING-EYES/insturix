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

import {
  isModalProxyEndpointV1,
  modalProxyAuthHeadersV1,
  readModalProxyAuthV1,
  type ModalProxyAuthEnvironmentV1,
} from './modal-proxy-auth-v1';

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

export const EDITRON_MODAL_WAV2VEC_ENDPOINT_ENV_V1 = 'MODAL_WAV2VEC_ENDPOINT' as const;

const DEFAULT_MODAL_WAV2VEC_ENDPOINT =
  'https://jainnimit728--wav2vec-vocal-wav2vecanalyzer-analyze.modal.run';

const VALID_VALENCES: Set<string> = new Set(['positive', 'negative', 'neutral', 'mixed']);

const REQUEST_TIMEOUT_MS = 270_000;

export type Wav2VecFetchV1 = typeof fetch;

export interface AnalyzeAudioWithWav2VecOptionsV1 {
  /** Injected for focused tests; defaults to global fetch. */
  fetchImpl?: Wav2VecFetchV1;
}

/** Resolves only a trusted HTTPS Modal endpoint for dedicated proxy credentials. */
function wav2VecEndpointV1(
  environment: ModalProxyAuthEnvironmentV1 = process.env,
): string | null {
  const configured = environment[EDITRON_MODAL_WAV2VEC_ENDPOINT_ENV_V1]?.trim();
  const endpoint = configured || DEFAULT_MODAL_WAV2VEC_ENDPOINT;
  return isModalProxyEndpointV1(endpoint) ? endpoint : null;
}

export function isWav2VecConfiguredV1(
  environment: ModalProxyAuthEnvironmentV1 = process.env,
): boolean {
  return Boolean(wav2VecEndpointV1(environment) && readModalProxyAuthV1(environment));
}

// ─── Warmup ────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget warmup ping to Modal. Wakes the container if cold.
 * Call alongside warmupVjepa() during upload — both run in parallel.
 */
export function warmupWav2Vec(): void {
  const endpoint = wav2VecEndpointV1();
  const proxyAuth = readModalProxyAuthV1();
  if (!endpoint || !proxyAuth) return;

  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...modalProxyAuthHeadersV1(proxyAuth),
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
  options: AnalyzeAudioWithWav2VecOptionsV1 = {},
): Promise<Wav2VecAnalysisResult | null> {
  if (!audioUrl || segments.length === 0) return null;

  const endpoint = wav2VecEndpointV1();
  const proxyAuth = readModalProxyAuthV1();
  if (!endpoint || !proxyAuth) {
    console.warn('[Wav2VecService] No trusted Modal endpoint or dedicated proxy credentials');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    // Modal owns internal GPU batching so this source is downloaded and decoded once.
    console.log(`[Wav2VecService] Dispatching ${segments.length} segments in one source analysis`);
    const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...modalProxyAuthHeadersV1(proxyAuth),
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

    if (!response.ok) {
      console.error(`[Wav2VecService] Source analysis failed: ${response.status}`);
      return null;
    }

    const data = parseModalWav2VecResponseV1(await response.json());
    if (!data || data.segments.length === 0) {
      console.warn('[Wav2VecService] Source analysis returned no valid segments');
      return null;
    }

    const results: Wav2VecSegmentResult[] = data.segments.map(s => ({
      startMs: s.start_ms,
      endMs: s.end_ms,
      emotionIntensity: clamp(s.emotion_intensity, 0, 1),
      emotionalValence: parseValence(s.emotional_valence),
      energy: clamp(s.energy, 0, 1),
      pitchVariability: clamp(s.pitch_variability, 0, 1),
      stressDetected: s.stress_detected ?? false,
      fillerConfidence: clamp(s.filler_confidence, 0, 1),
    }));

    const totalMs = Date.now() - startedAt;
    console.log(
      `[Wav2VecService] ${results.length}/${segments.length} segments analyzed in ${totalMs}ms ` +
      `(avg emotion: ${(results.reduce((sum, r) => sum + r.emotionIntensity, 0) / results.length).toFixed(2)}, ` +
      `valence: ${countValences(results)})`,
    );

    return {
      segments: results,
      modelVersion: data.model_version || 'wav2vec-2.0',
      processingTimeMs: data.processing_time_ms ?? totalMs,
    };
  } catch {
    console.error('[Wav2VecService] Analysis request failed');
    return null;
  } finally {
    clearTimeout(timeout);
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

function parseModalWav2VecResponseV1(value: unknown): ModalWav2VecResponse | null {
  if (!isRecord(value)
    || !Array.isArray(value.segments)
    || !value.segments.every(isModalWav2VecSegment)
    || (value.model_version !== undefined && typeof value.model_version !== 'string')
    || (value.processing_time_ms !== undefined && !isFiniteNumber(value.processing_time_ms))) {
    return null;
  }

  return {
    segments: value.segments,
    model_version: typeof value.model_version === 'string' ? value.model_version : undefined,
    processing_time_ms: value.processing_time_ms,
  };
}

function isModalWav2VecSegment(value: unknown): value is ModalWav2VecSegment {
  return isRecord(value)
    && isFiniteNumber(value.start_ms)
    && isFiniteNumber(value.end_ms)
    && isFiniteNumber(value.emotion_intensity)
    && typeof value.emotional_valence === 'string'
    && isFiniteNumber(value.energy)
    && isFiniteNumber(value.pitch_variability)
    && typeof value.stress_detected === 'boolean'
    && isFiniteNumber(value.filler_confidence);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
