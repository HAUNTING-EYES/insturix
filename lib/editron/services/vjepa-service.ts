/**
 * V-JEPA Service — Visual Significance via Meta V-JEPA 2 (TRIBE v2 Phase 2)
 *
 * Calls Modal web endpoint running V-JEPA 2 to extract visual features from video.
 * Replaces heuristic visual signals with learned representations.
 *
 * V-JEPA 2 capabilities leveraged:
 *   - Visual significance: embedding divergence between adjacent segments (0-1)
 *   - Motion intensity: learned optical flow features (replaces RMS heuristic)
 *   - Action type: semantic action recognition (39.7 recall@5 on Epic-Kitchens)
 *   - Motion type: subject vs camera motion discrimination
 *   - Face emotion: temporal emotional dynamics from video features
 *   - Eye contact: temporal gaze tracking
 *
 * Deployment: Modal serverless GPU endpoint (requires deployment before functional).
 * Until deployed, analyzeVideoWithVjepa() returns null and pipeline continues without it.
 *
 * Consumer: moment-weight-service.ts (integrateVjepaScores — 30% of Phase 2 weight)
 *           signal-registry.ts (enriches NEEDS_INFRA visual signals)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VjepaSegmentInput {
  startMs: number;
  endMs: number;
}

export type VjepaActionType =
  | 'talking' | 'walking' | 'gesturing' | 'demonstrating'
  | 'eating' | 'writing' | 'still' | 'interacting_with_object' | 'other';

export type VjepaMotionType = 'subject_moving' | 'camera_moving' | 'both' | 'static';

export type VjepaFaceEmotion =
  | 'happy' | 'sad' | 'angry' | 'surprised'
  | 'fearful' | 'disgusted' | 'neutral' | 'contempt';

export interface VjepaSegmentResult {
  startMs: number;
  endMs: number;
  visualSignificance: number;    // 0-1, embedding divergence from neighbors
  motionIntensity: number;       // 0-1, learned optical flow magnitude
  actionType: VjepaActionType;
  motionType: VjepaMotionType;
  faceEmotion: VjepaFaceEmotion | null;
  eyeContact: boolean | null;
}

export interface VjepaAnalysisResult {
  segments: VjepaSegmentResult[];
  modelVersion: string;
  processingTimeMs: number;
}

// ─── Modal Response Shape (snake_case from endpoint) ────────────────────────

interface ModalVjepaSegment {
  start_ms: number;
  end_ms: number;
  visual_significance: number;
  motion_intensity: number;
  action_type?: string;
  motion_type?: string;
  face_emotion?: string;
  eye_contact?: boolean;
}

interface ModalVjepaResponse {
  segments: ModalVjepaSegment[];
  model_version?: string;
  processing_time_ms?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MODAL_VJEPA_ENDPOINT = process.env.MODAL_VJEPA_ENDPOINT
  || 'https://jainnimit728--vjepa-2-visual-vjepaanalyzer-analyze.modal.run';

const VALID_ACTION_TYPES: Set<string> = new Set([
  'talking', 'walking', 'gesturing', 'demonstrating',
  'eating', 'writing', 'still', 'interacting_with_object', 'other',
]);

const VALID_MOTION_TYPES: Set<string> = new Set([
  'subject_moving', 'camera_moving', 'both', 'static',
]);

const VALID_FACE_EMOTIONS: Set<string> = new Set([
  'happy', 'sad', 'angry', 'surprised',
  'fearful', 'disgusted', 'neutral', 'contempt',
]);

const REQUEST_TIMEOUT_MS = 45_000; // 45s — Modal warm container responds in ~10-20s.
                                   // Cold start takes 60-90s → will timeout and return null.
                                   // Use warmupVjepa() during upload to pre-warm the container.

// ─── Warmup ────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget warmup ping to Modal. Wakes the container if cold.
 * Call this when the user initiates an upload — by the time the worker
 * reaches Step 3.5 (~150s later), the container will be warm.
 * Returns immediately (does not await the response).
 */
export function warmupVjepa(): void {
  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) return;

  // Send a minimal request that forces container creation but does minimal work.
  // Empty segments array → Modal returns immediately after model load.
  fetch(MODAL_VJEPA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${tokenId}:${tokenSecret}`,
    },
    body: JSON.stringify({ video_url: '', segments: [] }),
    signal: AbortSignal.timeout(90_000), // 90s for cold start warmup
  }).then(() => {
    console.log('[VjepaService] Warmup: container ready');
  }).catch(() => {
    // Non-fatal — container may still warm up from the actual request later
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Analyze video segments with V-JEPA 2 for visual significance and features.
 *
 * Returns null if the endpoint is unavailable or analysis fails.
 * Pipeline continues without V-JEPA data — moment weights fall back to
 * gemini-only (Phase 0) or gemini+thompson (Phase 1).
 */
export async function analyzeVideoWithVjepa(
  videoUrl: string,
  segments: VjepaSegmentInput[],
): Promise<VjepaAnalysisResult | null> {
  if (!videoUrl || segments.length === 0) return null;

  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    console.warn('[VjepaService] MODAL_TOKEN_ID/SECRET not set — skipping V-JEPA analysis');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(MODAL_VJEPA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${tokenId}:${tokenSecret}`,
      },
      body: JSON.stringify({
        video_url: videoUrl,
        segments: segments.map(s => ({
          start_ms: s.startMs,
          end_ms: s.endMs,
        })),
        features: ['visual_significance', 'motion', 'action', 'face', 'gaze'],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[VjepaService] Modal returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as ModalVjepaResponse;
    if (!data?.segments?.length) {
      console.warn('[VjepaService] Empty response from Modal');
      return null;
    }

    const mapped: VjepaSegmentResult[] = data.segments.map(s => ({
      startMs: s.start_ms,
      endMs: s.end_ms,
      visualSignificance: clamp(s.visual_significance, 0, 1),
      motionIntensity: clamp(s.motion_intensity, 0, 1),
      actionType: parseActionType(s.action_type),
      motionType: parseMotionType(s.motion_type),
      faceEmotion: parseFaceEmotion(s.face_emotion),
      eyeContact: s.eye_contact ?? null,
    }));

    console.log(
      `[VjepaService] Analyzed ${mapped.length} segments ` +
      `(avg significance: ${(mapped.reduce((sum, r) => sum + r.visualSignificance, 0) / mapped.length).toFixed(2)})`,
    );

    return {
      segments: mapped,
      modelVersion: data.model_version ?? 'vjepa-2',
      processingTimeMs: data.processing_time_ms ?? 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VjepaService] Analysis failed: ${msg}`);
    return null;
  }
}

// ─── Format Converters ──────────────────────────────────────────────────────

/**
 * Convert to the format expected by moment-weight-service.ts integrateVjepaScores().
 */
export function toVjepaWeightFormat(
  result: VjepaAnalysisResult,
): Array<{ startMs: number; endMs: number; significance: number }> {
  return result.segments.map(s => ({
    startMs: s.startMs,
    endMs: s.endMs,
    significance: s.visualSignificance,
  }));
}

/**
 * Convert to a lookup map keyed by "startMs-endMs" for signal enrichment.
 * Used by signal-registry to replace NEEDS_INFRA visual signals with real data.
 */
export function toSignalEnrichment(
  result: VjepaAnalysisResult,
): Map<string, VjepaSegmentResult> {
  const map = new Map<string, VjepaSegmentResult>();
  for (const seg of result.segments) {
    map.set(`${seg.startMs}-${seg.endMs}`, seg);
  }
  return map;
}

// ─── Parsers ────────────────────────────────────────────────────────────────

function parseActionType(v: string | undefined): VjepaActionType {
  if (v && VALID_ACTION_TYPES.has(v)) return v as VjepaActionType;
  return 'other';
}

function parseMotionType(v: string | undefined): VjepaMotionType {
  if (v && VALID_MOTION_TYPES.has(v)) return v as VjepaMotionType;
  return 'static';
}

function parseFaceEmotion(v: string | undefined): VjepaFaceEmotion | null {
  if (v && VALID_FACE_EMOTIONS.has(v)) return v as VjepaFaceEmotion;
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
