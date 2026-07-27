/**
 * generateAvatarShot — ONE model-agnostic door for every avatar body/scene shot.
 *
 * The caller describes WHAT it wants (which person's reference images, optional
 * finished audio, motion/camera direction, duration, resolution) — never WHICH
 * model. The router reads capabilities.ts, picks the best AVAILABLE body/scene
 * model whose ceilings satisfy the spec, and dispatches to that model's adapter.
 *
 * 2.5-readiness: Seedance 2.0 reference-to-video is today's implementation. When
 * Seedance 2.5's API lands, the whole job is: add ONE adapter file, register it in
 * ADAPTERS, and flip `available: true` in capabilities.ts. The router then
 * auto-prefers 2.5 wherever its ceilings win. There is NO 2.5-specific logic
 * anywhere else — if you write `if (model === 'seedance-2.5')` outside its adapter,
 * stop.
 *
 * Voice is NOT this file's concern: video models can't clone a voice. The cloned
 * voice comes from Chatterbox; the mouth is synced downstream by the relip service.
 * A body/scene shot with `hasNativeAudio: true` must have its audio replaced before
 * relip (native audio is never the user's voice).
 */

import { MODEL_CAPABILITIES, type ModelCapability } from '@/lib/shared/capabilities';

export interface AvatarShotSpec {
  /** Canonical reference set for the character (identity conditioning). */
  avatarImageRefs: string[];
  /** Finished cloned-voice audio (from Chatterbox), for the downstream relip step. */
  audioRef?: string;
  /** Model-agnostic motion + camera direction. */
  motionPrompt?: string;
  durationSec: number;
  resolution: string; // '480p' | '720p' | '1080p' | '4K'
  aspectRatio?: string;
  /**
   * The shot depicts a real person's likeness (an avatar). Defaults to true, which
   * excludes models that reject real faces (e.g. Seedance). Set false only for
   * object/invented-character shots.
   */
  requiresRealPerson?: boolean;
}

export interface AvatarShotResult {
  videoUrl: string;
  modelUsed: string;
  durationSec: number;
  /** true = the video carries model-generated audio (NOT the user's voice); replace before relip. */
  hasNativeAudio: boolean;
}

export interface AvatarShotDeps {
  /** Injectable fal submit; defaults to the real fal queue. */
  submit?: (modelId: string, input: Record<string, unknown>) => Promise<{ requestId: string }>;
  /** Injectable fal poll; defaults to the real fal queue. */
  poll?: (modelId: string, requestId: string) => Promise<{ done: boolean; videoUrl?: string; failed?: boolean; error?: string }>;
  /** Seedance is geo-restricted (B2B outside US) and needs an end_user_id. */
  endUserId?: string;
}

export interface AvatarShotAdapter {
  model: string;
  generate(spec: AvatarShotSpec, deps?: AvatarShotDeps): Promise<AvatarShotResult>;
}

const RESOLUTION_RANK: Record<string, number> = { '480p': 1, '720p': 2, '1080p': 3, '4k': 4, '4K': 4 };

function resolutionRank(res: string): number {
  return RESOLUTION_RANK[res] ?? RESOLUTION_RANK[res?.toLowerCase()] ?? 0;
}

function maxResolutionRank(resolutions: string[]): number {
  return resolutions.reduce((max, r) => Math.max(max, resolutionRank(r)), 0);
}

/**
 * Pick the best available body/scene model for a spec. Higher ceilings win
 * (more reference images = better identity hold, then longer duration), so a
 * newly-available seedance-2.5 auto-outranks 2.0 for shots that need it — no code
 * change beyond flipping `available` in capabilities.ts.
 */
export function selectAvatarShotModel(
  spec: AvatarShotSpec,
  capabilities: Record<string, ModelCapability> = MODEL_CAPABILITIES,
): ModelCapability | null {
  const requiresRealPerson = spec.requiresRealPerson ?? true;
  const candidates = Object.values(capabilities)
    .filter((m) => m.role === 'body_scene' && m.available)
    .filter((m) => spec.durationSec <= m.maxDurationSec)
    .filter((m) => resolutionRank(spec.resolution) <= maxResolutionRank(m.resolutions))
    // Avatar shots need a real likeness — exclude models that reject real faces.
    .filter((m) => !requiresRealPerson || m.acceptsRealFaces !== false);

  // A model uses up to its maxRefImages; more capacity = better identity anchoring.
  candidates.sort((a, b) => b.maxRefImages - a.maxRefImages || b.maxDurationSec - a.maxDurationSec);
  return candidates[0] ?? null;
}

/** Pure: map a shot spec to Seedance 2.0 reference-to-video input. */
export function buildSeedanceR2vInput(spec: AvatarShotSpec, endUserId?: string): Record<string, unknown> {
  const refs = spec.avatarImageRefs.slice(0, 9); // r2v caps at 9 reference images
  const refTokens = refs.map((_, i) => `@Image${i + 1}`).join(', ');
  const prompt = [
    spec.motionPrompt?.trim() || 'The person from the reference images speaks to camera with natural motion.',
    refs.length ? `Keep the exact facial identity and appearance of ${refTokens} consistent throughout — do not alter the face.` : '',
    // Native audio is discarded and replaced by the cloned voice at relip time.
    'Instrumental ambient only, no vocals, no speech in the generated audio.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    prompt,
    image_urls: refs, // verified param name (fal r2v page 2026-07-10); referenced as @Image1.. in the prompt
    duration: String(Math.min(Math.max(Math.round(spec.durationSec), 4), 15)),
    resolution: normalizeSeedanceResolution(spec.resolution),
    aspect_ratio: spec.aspectRatio || 'auto',
    ...(endUserId ? { end_user_id: endUserId } : {}), // geo-restriction: B2B outside US
  };
}

function normalizeSeedanceResolution(res: string): string {
  const rank = resolutionRank(res);
  if (rank >= 4) return '4k'; // r2v accepts up to 4k (fal page 2026-07-10)
  if (rank === 3) return '1080p';
  if (rank === 1) return '480p';
  return '720p';
}

const seedance20Adapter: AvatarShotAdapter = {
  model: 'seedance-2.0-r2v',
  async generate(spec, deps = {}) {
    const model = MODEL_CAPABILITIES['seedance-2.0-r2v'];
    const modelId = model.falModelId;
    if (!modelId) throw new Error('seedance-2.0-r2v has no fal model id.');

    const input = buildSeedanceR2vInput(spec, deps.endUserId);
    const submit = deps.submit ?? defaultFalSubmit;
    const poll = deps.poll ?? defaultFalPoll;

    const { requestId } = await submit(modelId, input);
    for (let i = 0; i < 180; i++) {
      const status = await poll(modelId, requestId);
      if (status.failed) throw new Error(`Seedance 2.0 r2v failed: ${status.error ?? 'unknown error'}`);
      if (status.done) {
        if (!status.videoUrl) throw new Error('Seedance 2.0 r2v completed without a video URL.');
        return {
          videoUrl: status.videoUrl,
          modelUsed: 'seedance-2.0-r2v',
          durationSec: Math.min(Math.max(Math.round(spec.durationSec), 4), 15),
          hasNativeAudio: true,
        };
      }
      await sleep(5000);
    }
    throw new Error('Seedance 2.0 r2v timed out.');
  },
};

/** Pure: map a shot spec to Kling 2.6 i2v input. Duration snaps to Kling's 5s or 10s. */
export function buildKlingI2vInput(spec: AvatarShotSpec): { input: Record<string, unknown>; durationSec: number } {
  const durationSec = spec.durationSec <= 5 ? 5 : 10;
  const input = {
    start_image_url: spec.avatarImageRefs[0],
    prompt:
      spec.motionPrompt?.trim() ||
      'The person speaks to the camera with natural gestures and subtle body movement, warm expression. Keep the facial identity consistent, no face morphing.',
    duration: String(durationSec),
    negative_prompt: 'face morphing, identity drift between frames, distortion',
  };
  return { input, durationSec };
}

// Kling 2.6 image-to-video — the real-person body engine (accepts real faces; adds
// gesture/camera motion but NOT lip-sync, so a relip pass follows).
const klingI2vAdapter: AvatarShotAdapter = {
  model: 'kling-2.6-i2v',
  async generate(spec, deps = {}) {
    const modelId = MODEL_CAPABILITIES['kling-2.6-i2v'].falModelId;
    if (!modelId) throw new Error('kling-2.6-i2v has no fal model id.');
    if (!spec.avatarImageRefs.length) throw new Error('kling-2.6-i2v needs a start image.');
    const { input, durationSec } = buildKlingI2vInput(spec);
    const submit = deps.submit ?? defaultFalSubmit;
    const poll = deps.poll ?? defaultFalPoll;

    const { requestId } = await submit(modelId, input);
    for (let i = 0; i < 180; i++) {
      const status = await poll(modelId, requestId);
      if (status.failed) throw new Error(`Kling 2.6 i2v failed: ${status.error ?? 'unknown error'}`);
      if (status.done) {
        if (!status.videoUrl) throw new Error('Kling 2.6 i2v completed without a video URL.');
        return { videoUrl: status.videoUrl, modelUsed: 'kling-2.6-i2v', durationSec, hasNativeAudio: false };
      }
      await sleep(5000);
    }
    throw new Error('Kling 2.6 i2v timed out.');
  },
};

/**
 * Adapter registry. Adding a model = adding ONE entry here + a capabilities row.
 * Seedance 2.5 (when it lands): import its adapter and add `'seedance-2.5': seedance25Adapter`.
 */
const ADAPTERS: Record<string, AvatarShotAdapter> = {
  'kling-2.6-i2v': klingI2vAdapter, // real-person default
  'seedance-2.0-r2v': seedance20Adapter, // objects / invented characters only
};

export async function generateAvatarShot(spec: AvatarShotSpec, deps?: AvatarShotDeps): Promise<AvatarShotResult> {
  const model = selectAvatarShotModel(spec);
  if (!model) {
    throw new Error(
      `No available avatar-shot model satisfies this spec (duration=${spec.durationSec}s, refs=${spec.avatarImageRefs.length}, resolution=${spec.resolution}). ` +
        'Reduce duration/refs/resolution, or wait for a higher-ceiling model (e.g. seedance-2.5) to become available.',
    );
  }
  const adapter = ADAPTERS[model.name];
  if (!adapter) {
    throw new Error(`Model ${model.name} is marked available in capabilities.ts but has no adapter wired in generate-avatar-shot.ts.`);
  }
  return adapter.generate(spec, deps);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function defaultFalSubmit(modelId: string, input: Record<string, unknown>): Promise<{ requestId: string }> {
  const { fal } = await import('@fal-ai/client');
  const credentials = process.env.FAL_AI_API_KEY?.trim() || process.env.FAL_KEY?.trim();
  if (!credentials) throw new Error('FAL_AI_API_KEY or FAL_KEY is required for Seedance.');
  fal.config({ credentials });
  const handle = await fal.queue.submit(modelId, { input });
  const requestId = (handle as { request_id?: string; requestId?: string }).request_id
    ?? (handle as { requestId?: string }).requestId;
  if (!requestId) throw new Error(`Seedance queue (${modelId}) returned no request id.`);
  return { requestId };
}

async function defaultFalPoll(
  modelId: string,
  requestId: string,
): Promise<{ done: boolean; videoUrl?: string; failed?: boolean; error?: string }> {
  const { fal } = await import('@fal-ai/client');
  const status = await fal.queue.status(modelId, { requestId, logs: false });
  const s = String((status as { status?: string }).status ?? '').toUpperCase();
  if (s === 'FAILED' || s === 'ERROR') return { done: false, failed: true, error: JSON.stringify(status).slice(0, 300) };
  if (s !== 'COMPLETED') return { done: false };
  const result = await fal.queue.result(modelId, { requestId });
  const data = result as { data?: { video?: { url?: string }; video_url?: string }; video?: { url?: string } };
  const videoUrl = data?.data?.video?.url ?? data?.data?.video_url ?? data?.video?.url;
  return { done: true, videoUrl };
}
