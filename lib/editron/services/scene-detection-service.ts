/**
 * Scene / Cut Detection Service — ffmpeg via Modal for deterministic hard-cut detection.
 *
 * Mirrors music-analysis-service.ts:
 *   - Modal serverless CPU endpoint running ffmpeg scene detection
 *   - Fire-and-forget warmup
 *   - Returns null on failure (consumer keeps the LLM's cut estimate + logs loudly)
 *
 * WHY: Gemini fabricates cut timing (measured F1 0.66, a ~1 Hz grid on fast edits), and the
 * reference analyzer runs on Vercel serverless where ffmpeg is off the hot path. So cut cadence —
 * an OBJECTIVE signal — is measured on a worker, not hallucinated. See detect-cuts-ffmpeg.ts for the
 * same parser used locally in eval; this is the deployed production path.
 *
 * Consumer: reference-content-extractor.ts (overrides EditDNA.cutRhythm + pacing with real cuts).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SceneCut {
  tMs: number;
  /** Raw ffmpeg scene score (0..1) — magnitude of the visual change; absent if the worker omitted it. */
  sceneScore?: number;
}

export interface SceneDetectionResult {
  cuts: SceneCut[];
  durationMs: number;
  sceneThreshold: number;
  processingTimeMs: number;
}

/** Deterministic cut-rhythm override for EditDNA, derived from real cuts. */
export interface CutRhythmOverride {
  avgCutsPerMinute: number;
  avgClipDuration: number;
  pacingOverall: 'slow' | 'medium' | 'fast';
}

// ─── Modal response shape (snake_case) ──────────────────────────────────────

interface ModalSceneCut {
  t_ms: number;
  scene_score?: number;
}

interface ModalSceneResponse {
  cuts?: ModalSceneCut[];
  duration_ms?: number;
  scene_threshold?: number;
  processing_time_ms?: number;
  error?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MODAL_SCENE_ENDPOINT = process.env.MODAL_SCENE_DETECTION_ENDPOINT
  || 'https://jainnimit728--scene-detection-ffmpeg-scenedetector-detect.modal.run';

const COLD_TIMEOUT_MS = 90_000;

// Cut-density → pacing buckets. Mirror derive-edit-dna.ts CUTS_SLOW/CUTS_FAST so the deterministic
// path and the fingerprint path agree. ⚠️ INVENTED (no CRG node) — keep the two in sync if calibrated.
const CUTS_SLOW = 8; // cuts/minute
const CUTS_FAST = 20;

export type FetchImpl = typeof fetch;

export interface DetectScenesOptions {
  sceneThreshold?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchImpl;
}

// ─── Warmup ─────────────────────────────────────────────────────────────────

export function warmupSceneDetection(): void {
  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) return;

  fetch(MODAL_SCENE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${tokenId}:${tokenSecret}` },
    body: JSON.stringify({ video_url: '' }),
    signal: AbortSignal.timeout(COLD_TIMEOUT_MS),
  })
    .then(() => console.log('[SceneDetection] Warmup: container ready'))
    .catch(() => { /* non-fatal */ });
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Detect hard cuts in a video via ffmpeg on Modal. Returns null when the endpoint is missing,
 * unauthenticated, unreachable, or errors — the caller degrades to the LLM's cut estimate and logs.
 */
export async function detectScenesRemote(
  videoUrl: string,
  opts: DetectScenesOptions = {},
): Promise<SceneDetectionResult | null> {
  if (!videoUrl) return null;

  const tokenId = process.env.MODAL_TOKEN_ID;
  const tokenSecret = process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    console.warn('[SceneDetection] No Modal credentials — skipping deterministic cut detection');
    return null;
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const body: Record<string, unknown> = { video_url: videoUrl };
  if (opts.sceneThreshold !== undefined) body.scene_threshold = opts.sceneThreshold;

  try {
    console.log(`[SceneDetection] Calling Modal ffmpeg endpoint for ${videoUrl.substring(0, 60)}...`);
    const response = await fetchImpl(MODAL_SCENE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Token ${tokenId}:${tokenSecret}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COLD_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[SceneDetection] Modal returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as ModalSceneResponse;
    if (data.error) {
      console.warn(`[SceneDetection] Worker reported error: ${data.error}`);
      return null;
    }

    const cuts: SceneCut[] = (data.cuts ?? [])
      .filter((c): c is ModalSceneCut => typeof c?.t_ms === 'number' && Number.isFinite(c.t_ms))
      .map((c) => (typeof c.scene_score === 'number' ? { tMs: c.t_ms, sceneScore: c.scene_score } : { tMs: c.t_ms }));

    const result: SceneDetectionResult = {
      cuts,
      durationMs: typeof data.duration_ms === 'number' ? data.duration_ms : 0,
      sceneThreshold: typeof data.scene_threshold === 'number' ? data.scene_threshold : 0,
      processingTimeMs: typeof data.processing_time_ms === 'number' ? data.processing_time_ms : 0,
    };
    console.log(`[SceneDetection] Done: ${result.cuts.length} cuts, duration=${result.durationMs}ms`);
    return result;
  } catch (err: unknown) {
    console.warn(`[SceneDetection] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ─── Cut-rhythm derivation (pure) ────────────────────────────────────────────

/**
 * Deterministic cuts → EditDNA cut-rhythm override. avgClipDuration counts N cuts as N+1 clips.
 * Returns null when the detection is unusable (no duration) so the caller keeps the LLM estimate.
 */
export function cutDetectionToCutRhythm(result: SceneDetectionResult): CutRhythmOverride | null {
  if (result.durationMs <= 0) return null;
  const durationMin = result.durationMs / 60_000;
  const cutCount = result.cuts.length;
  const avgCutsPerMinute = cutCount / durationMin;
  const avgClipDuration = result.durationMs / 1000 / (cutCount + 1);
  const pacingOverall: CutRhythmOverride['pacingOverall'] =
    avgCutsPerMinute < CUTS_SLOW ? 'slow' : avgCutsPerMinute > CUTS_FAST ? 'fast' : 'medium';
  return { avgCutsPerMinute, avgClipDuration, pacingOverall };
}
