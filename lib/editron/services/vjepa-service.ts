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

export interface VjepaPrimitiveBox {
  /** Normalized top-left coordinates in edited/source frame space. */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

export interface VjepaTextBox extends VjepaPrimitiveBox {
  text?: string;
}

export interface VjepaPrimitivePresence {
  motionVector: boolean;
  mainSubject: boolean;
  textBoxes: boolean;
  textCoverage: boolean;
  objectCount: boolean;
  faceCount: boolean;
  negativeSpace: boolean;
}

export interface VjepaSegmentResult {
  startMs: number;
  endMs: number;
  visualSignificance: number;    // 0-1, embedding divergence from neighbors
  motionIntensity: number;       // 0-1, learned optical flow magnitude
  actionType: VjepaActionType;
  motionType: VjepaMotionType;
  faceEmotion: VjepaFaceEmotion | null;
  eyeContact: boolean | null;
  motionVectorX: number;         // -1..1, signed dominant visual movement
  motionVectorY: number;         // -1..1, signed dominant visual movement
  mainSubject: VjepaPrimitiveBox;
  mainSubjectX: number;
  mainSubjectY: number;
  mainSubjectWidth: number;
  mainSubjectHeight: number;
  textBoxes: VjepaTextBox[];
  textBoxCount: number;
  textCoverage: number;
  objectCount: number;
  faceCount: number;
  negativeSpaceTop: number;
  negativeSpaceRight: number;
  negativeSpaceBottom: number;
  negativeSpaceLeft: number;
  primitivePresence: VjepaPrimitivePresence;
}

export interface VjepaAnalysisResult {
  segments: VjepaSegmentResult[];
  modelVersion: string;
  processingTimeMs: number;
  frameSampleCount?: number;
  requestedSegmentCount?: number;
  analyzedSegmentCount?: number;
  droppedSegmentCount?: number;
  coverageRatio?: number;
  partial?: boolean;
  failedBatchCount?: number;
  failedBatchIndices?: number[];
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
  motion_vector_x?: number;
  motion_vector_y?: number;
  main_subject?: Partial<VjepaPrimitiveBox>;
  main_subject_x?: number;
  main_subject_y?: number;
  main_subject_width?: number;
  main_subject_height?: number;
  text_boxes?: Array<Partial<VjepaTextBox>>;
  text_box_count?: number;
  text_coverage?: number;
  object_count?: number;
  face_count?: number;
  negative_space_top?: number;
  negative_space_right?: number;
  negative_space_bottom?: number;
  negative_space_left?: number;
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

// Modal allows a request to run for 600s and V-JEPA encodes each segment sequentially. The old 90s client
// timeout aborted healthy short-video batches (live proof: one 5s/64-frame segment takes ~15s on a warm A10G),
// then retried while the abandoned Modal work could still be consuming GPU time. Keep a separate 300s request
// ceiling so a normal batch can finish while the 600s total deadline still reserves time for partial salvage.
// Tunable through env as before; the default must be calibrated further from production latency receipts.
const REQUEST_TIMEOUT_MS = readPositiveIntEnv('MODAL_VJEPA_REQUEST_TIMEOUT_MS', 300_000);
const BATCH_SIZE = readPositiveIntEnv('MODAL_VJEPA_BATCH_SIZE', 20);
const RETRY_BATCH_SIZE = readPositiveIntEnv('MODAL_VJEPA_RETRY_BATCH_SIZE', 5);
const TOTAL_TIMEOUT_MS = readPositiveIntEnv('MODAL_VJEPA_TOTAL_TIMEOUT_MS', 600_000);
const MIN_FRAME_SAMPLE_COUNT = 8;
const MAX_FRAME_SAMPLE_COUNT = 64;
const FRAME_SAMPLE_OVERRIDE = readOptionalIntEnv('MODAL_VJEPA_MAX_FRAMES_PER_SEGMENT');

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
    // Warmup completion is intentionally non-observable.
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
    // Batch segments to avoid timeout on long videos.
    // OLD: sent all segments (e.g. 196) in one request → 45s abort on anything > ~50.
    // FIX: send in chunks of BATCH_SIZE, concatenate results.
    const allResults: VjepaSegmentResult[] = [];
    const batches: VjepaSegmentInput[][] = [];
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      batches.push(segments.slice(i, i + BATCH_SIZE));
    }

    const frameSampleCount = chooseVjepaFrameSampleCount(segments.length);
    const batchStartMs = Date.now();
    const deadlineMs = batchStartMs + TOTAL_TIMEOUT_MS;
    const failedBatchIndices: number[] = [];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const mapped = await analyzeBatchWithFallback({
        videoUrl,
        batch,
        batchIndex: b,
        batchCount: batches.length,
        tokenId,
        tokenSecret,
        deadlineMs,
        frameSampleCount,
      });
      if (!mapped?.length) {
        failedBatchIndices.push(b);
        console.warn(
          `[VjepaService] Batch ${b + 1}/${batches.length}: no usable result - ` +
          'preserving successful V-JEPA batches if any',
        );
        continue;
      }

      allResults.push(...mapped);
    }

    if (!allResults.length) return null;

    const totalMs = Date.now() - batchStartMs;
    const droppedSegmentCount = Math.max(0, segments.length - allResults.length);
    const partial = droppedSegmentCount > 0 || failedBatchIndices.length > 0;
    if (partial) {
      console.warn(
        `[VjepaService] Partial V-JEPA coverage: dropped ${droppedSegmentCount}/${segments.length} segment(s); ` +
        `failed batch indices=${failedBatchIndices.join(',') || 'none'}`,
      );
    }

    return {
      segments: allResults,
      modelVersion: 'vjepa-2',
      processingTimeMs: totalMs,
      frameSampleCount,
      requestedSegmentCount: segments.length,
      analyzedSegmentCount: allResults.length,
      droppedSegmentCount,
      coverageRatio: segments.length > 0 ? allResults.length / segments.length : 0,
      partial,
      failedBatchCount: failedBatchIndices.length,
      failedBatchIndices,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VjepaService] Analysis failed: ${msg}`);
    return null;
  }
}

async function analyzeBatchWithFallback(args: {
  videoUrl: string;
  batch: VjepaSegmentInput[];
  batchIndex: number;
  batchCount: number;
  tokenId: string;
  tokenSecret: string;
  deadlineMs: number;
  frameSampleCount: number;
}): Promise<VjepaSegmentResult[] | null> {
  if (Date.now() >= args.deadlineMs) {
    console.error(`[VjepaService] Batch ${args.batchIndex + 1}/${args.batchCount} skipped: total V-JEPA deadline exceeded`);
    return null;
  }

  const primary = await fetchVjepaBatch(args);
  if (primary) return primary;

  if (args.batch.length <= RETRY_BATCH_SIZE) return null;

  console.warn(
    `[VjepaService] Batch ${args.batchIndex + 1}/${args.batchCount}: retrying as ` +
    `${Math.ceil(args.batch.length / RETRY_BATCH_SIZE)} smaller request(s)`,
  );

  const retryResults: VjepaSegmentResult[] = [];
  const retryBatches = chunkSegments(args.batch, RETRY_BATCH_SIZE);
  const failedRetryIndices: number[] = [];
  for (let i = 0; i < retryBatches.length; i++) {
    const retry = await fetchVjepaBatch({
      ...args,
      batch: retryBatches[i],
      batchIndex: i,
      batchCount: retryBatches.length,
    });
    if (!retry?.length) {
      failedRetryIndices.push(i);
      console.warn(
        `[VjepaService] Retry batch ${i + 1}/${retryBatches.length}: no usable result - continuing with other retry chunks`,
      );
      continue;
    }
    retryResults.push(...retry);
  }
  if (failedRetryIndices.length > 0 && retryResults.length > 0) {
    console.warn(
      `[VjepaService] Batch ${args.batchIndex + 1}/${args.batchCount}: partial retry success ` +
      `(${retryResults.length}/${args.batch.length} segment(s)); failed retry indices=${failedRetryIndices.join(',')}`,
    );
  }
  if (!retryResults.length) return null;
  return retryResults;
}

async function fetchVjepaBatch(args: {
  videoUrl: string;
  batch: VjepaSegmentInput[];
  batchIndex: number;
  batchCount: number;
  tokenId: string;
  tokenSecret: string;
  deadlineMs: number;
  frameSampleCount: number;
}): Promise<VjepaSegmentResult[] | null> {
  const remainingMs = args.deadlineMs - Date.now();
  if (remainingMs <= 1_000) {
    console.error(`[VjepaService] Batch ${args.batchIndex + 1}/${args.batchCount} skipped: no V-JEPA time budget remaining`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, remainingMs));

  try {
    const response = await fetch(MODAL_VJEPA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${args.tokenId}:${args.tokenSecret}`,
      },
      body: JSON.stringify({
        video_url: args.videoUrl,
        segments: args.batch.map(s => ({
          start_ms: s.startMs,
          end_ms: s.endMs,
        })),
        features: ['visual_significance', 'motion', 'action', 'face', 'gaze'],
        primitive_features: ['motion_vector', 'main_subject', 'text_boxes', 'text_coverage', 'object_count', 'face_count', 'negative_space'],
        max_frames_per_segment: args.frameSampleCount,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[VjepaService] Batch ${args.batchIndex + 1}/${args.batchCount} failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as ModalVjepaResponse;
    if (!data?.segments?.length) {
      console.warn(`[VjepaService] Batch ${args.batchIndex + 1}/${args.batchCount}: empty response`);
      return null;
    }

    return data.segments.map(normalizeModalVjepaSegment);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[VjepaService] Batch ${args.batchIndex + 1}/${args.batchCount} failed: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Format Converters ──────────────────────────────────────────────────────

/**
 * Adaptive V-JEPA frame sampling.
 *
 * Long videos create hundreds of visual segments; sampling 64 frames for every segment
 * pushes the Modal worker into its 600s ceiling. This keeps high fidelity for short
 * jobs and lowers the per-segment frame load only when segment count is high.
 *
 * INVENTED-needs-calibration: thresholds are based on real 2026-06 project telemetry
 * showing 180-236 segment runs at 4-10 minutes, including one partial timeout.
 */
export function chooseVjepaFrameSampleCount(segmentCount: number): number {
  if (FRAME_SAMPLE_OVERRIDE !== null) {
    return clampFrameSampleCount(FRAME_SAMPLE_OVERRIDE);
  }
  if (segmentCount >= 220) return 24;
  if (segmentCount >= 160) return 32;
  if (segmentCount >= 80) return 48;
  return 64;
}

function clampFrameSampleCount(value: number): number {
  return Math.max(MIN_FRAME_SAMPLE_COUNT, Math.min(MAX_FRAME_SAMPLE_COUNT, Math.floor(value)));
}

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

export function normalizeModalVjepaSegment(s: ModalVjepaSegment): VjepaSegmentResult {
  const primitivePresence: VjepaPrimitivePresence = {
    motionVector: isFiniteNumber(s.motion_vector_x) && isFiniteNumber(s.motion_vector_y),
    mainSubject: hasCompleteBox(s.main_subject) || (
      isFiniteNumber(s.main_subject_x) &&
      isFiniteNumber(s.main_subject_y) &&
      isFiniteNumber(s.main_subject_width) &&
      isFiniteNumber(s.main_subject_height)
    ),
    textBoxes: Array.isArray(s.text_boxes) || isFiniteNumber(s.text_box_count),
    textCoverage: isFiniteNumber(s.text_coverage),
    objectCount: isFiniteNumber(s.object_count),
    faceCount: isFiniteNumber(s.face_count),
    negativeSpace: (
      isFiniteNumber(s.negative_space_top) &&
      isFiniteNumber(s.negative_space_right) &&
      isFiniteNumber(s.negative_space_bottom) &&
      isFiniteNumber(s.negative_space_left)
    ),
  };
  const mainSubject = normalizeBox(s.main_subject, {
    x: s.main_subject_x,
    y: s.main_subject_y,
    width: s.main_subject_width,
    height: s.main_subject_height,
    confidence: s.main_subject?.confidence,
  });
  const textBoxes = Array.isArray(s.text_boxes)
    ? s.text_boxes
      .map(box => normalizeBox(box, { x: 0, y: 0, width: 0, height: 0, confidence: 0 }))
      .filter(box => box.width > 0 && box.height > 0)
    : [];

  return {
    startMs: s.start_ms,
    endMs: s.end_ms,
    visualSignificance: clampNumber(s.visual_significance, 0, 1, 0.5),
    motionIntensity: clampNumber(s.motion_intensity, 0, 1, 0),
    actionType: parseActionType(s.action_type),
    motionType: parseMotionType(s.motion_type),
    faceEmotion: parseFaceEmotion(s.face_emotion),
    eyeContact: s.eye_contact ?? null,
    motionVectorX: clampNumber(s.motion_vector_x, -1, 1, 0),
    motionVectorY: clampNumber(s.motion_vector_y, -1, 1, 0),
    mainSubject,
    mainSubjectX: mainSubject.x,
    mainSubjectY: mainSubject.y,
    mainSubjectWidth: mainSubject.width,
    mainSubjectHeight: mainSubject.height,
    textBoxes,
    textBoxCount: Math.max(0, Math.round(s.text_box_count ?? textBoxes.length)),
    textCoverage: clampNumber(s.text_coverage, 0, 1, textBoxes.reduce((sum, box) => sum + box.width * box.height, 0)),
    objectCount: Math.max(0, Math.round(s.object_count ?? (mainSubject.confidence && mainSubject.confidence > 0.25 ? 1 : 0))),
    faceCount: Math.max(0, Math.round(s.face_count ?? 0)),
    negativeSpaceTop: clampNumber(s.negative_space_top, 0, 1, mainSubject.y),
    negativeSpaceRight: clampNumber(s.negative_space_right, 0, 1, 1 - (mainSubject.x + mainSubject.width)),
    negativeSpaceBottom: clampNumber(s.negative_space_bottom, 0, 1, 1 - (mainSubject.y + mainSubject.height)),
    negativeSpaceLeft: clampNumber(s.negative_space_left, 0, 1, mainSubject.x),
    primitivePresence,
  };
}

function hasCompleteBox(box: Partial<VjepaPrimitiveBox> | undefined): boolean {
  return (
    !!box &&
    isFiniteNumber(box.x) &&
    isFiniteNumber(box.y) &&
    isFiniteNumber(box.width) &&
    isFiniteNumber(box.height)
  );
}

const DEFAULT_VISUAL_SEGMENT_MS = 5_000;
const DEFAULT_MAX_VISUAL_SEGMENTS = 360;

export function buildVjepaCoverageSegments(
  durationMs: unknown,
  fallbackSegments: VjepaSegmentInput[] = [],
  options: { segmentDurationMs?: number; maxSegments?: number } = {},
): VjepaSegmentInput[] {
  const fallbackDurationMs = fallbackSegments.reduce((max, segment) => {
    return Math.max(max, readPositiveMs(segment.endMs) ?? 0);
  }, 0);
  const resolvedDurationMs = readPositiveMs(durationMs) ?? fallbackDurationMs;
  if (!resolvedDurationMs) return fallbackSegments;

  const maxSegments = Math.max(1, Math.floor(options.maxSegments ?? DEFAULT_MAX_VISUAL_SEGMENTS));
  const desiredSegmentMs = Math.max(1_000, Math.floor(options.segmentDurationMs ?? DEFAULT_VISUAL_SEGMENT_MS));
  const segmentMs = Math.max(desiredSegmentMs, Math.ceil(resolvedDurationMs / maxSegments));
  const segments: VjepaSegmentInput[] = [];
  for (let startMs = 0; startMs < resolvedDurationMs; startMs += segmentMs) {
    segments.push({
      startMs,
      endMs: Math.min(resolvedDurationMs, startMs + segmentMs),
    });
  }
  return segments;
}

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

function normalizeBox(
  box: Partial<VjepaPrimitiveBox> | undefined,
  fallback?: Partial<VjepaPrimitiveBox>,
): VjepaPrimitiveBox {
  return {
    x: clampNumber(box?.x, 0, 1, clampNumber(fallback?.x, 0, 1, 0.25)),
    y: clampNumber(box?.y, 0, 1, clampNumber(fallback?.y, 0, 1, 0.15)),
    width: clampNumber(box?.width, 0, 1, clampNumber(fallback?.width, 0, 1, 0.5)),
    height: clampNumber(box?.height, 0, 1, clampNumber(fallback?.height, 0, 1, 0.7)),
    confidence: clampNumber(box?.confidence, 0, 1, clampNumber(fallback?.confidence, 0, 1, 0)),
  };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!isFiniteNumber(value)) return fallback;
  return clamp(value, min, max);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readPositiveMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalIntEnv(name: string): number | null {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function chunkSegments(segments: VjepaSegmentInput[], size: number): VjepaSegmentInput[][] {
  const safeSize = Math.max(1, Math.floor(size));
  const chunks: VjepaSegmentInput[][] = [];
  for (let i = 0; i < segments.length; i += safeSize) {
    chunks.push(segments.slice(i, i + safeSize));
  }
  return chunks;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
