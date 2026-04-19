/**
 * Storyboard Service
 *
 * Generates storyboard images for scenes using fal.ai,
 * uploads results to GCS, and manages storyboard lifecycle.
 */

import { nanoid } from 'nanoid';
import { fal } from '@fal-ai/client';
import { uploadMedia } from '@/lib/editron/services/upload-service';
import { buildStoryboardPrompt, buildNegativePrompt } from './storyboard-prompt-builder';
import { saveStoryboard, updateStoryboardScene, updateSubShot, getStoryboard } from './storyboard-db';
import { scoreStoryboardConsistency } from './consistency-scoring-service';
import { falRetry } from './fal-retry';
import type {
  SceneDescriptor,
  StyleGuide,
  Storyboard,
  StoryboardScene,
} from './schemas/storyboard';

// Configure fal.ai if key exists
if (process.env.FAL_AI_API_KEY) {
  fal.config({ credentials: process.env.FAL_AI_API_KEY });
}

// Available image generation models
export const IMAGE_MODELS = {
  'flux-schnell': 'fal-ai/flux/schnell',
  'flux-dev': 'fal-ai/flux/dev',
  'flux-pro': 'fal-ai/flux-pro/v1.1',
  'imagen4': 'fal-ai/imagen4/preview',
  'seedream-v4': 'fal-ai/bytedance/seedream/v4/text-to-image',
  'seedream-v4.5': 'fal-ai/bytedance/seedream/v4.5/text-to-image',
  'recraft-v3': 'fal-ai/recraft-v3',
  'nano-banana': 'fal-ai/nano-banana',
  'nano-banana-2': 'fal-ai/nano-banana-2',
  'nano-banana-pro': 'fal-ai/nano-banana-pro',
  // UNI-1 uses Luma REST API (not fal.ai). Value is the Luma model ID.
  'uni-1': 'photon-1',
} as const;

export type ImageModelKey = keyof typeof IMAGE_MODELS;

export const IMAGE_MODEL_LABELS: Record<ImageModelKey, string> = {
  'flux-schnell': 'FLUX Schnell (Fast)',
  'flux-dev': 'FLUX Dev (Quality)',
  'flux-pro': 'FLUX Pro 1.1',
  'imagen4': 'Google Imagen 4',
  'seedream-v4': 'Seedream V4',
  'seedream-v4.5': 'Seedream V4.5',
  'recraft-v3': 'Recraft V3',
  'nano-banana': 'Nano Banana (Fast)',
  'nano-banana-2': 'Nano Banana 2 (Quality)',
  'nano-banana-pro': 'Nano Banana Pro (Best)',
  'uni-1': 'UNI-1 by Luma (Best Quality)',
};

// Default model for storyboard generation
const DEFAULT_MODEL = 'fal-ai/flux/schnell';

// OLD: Three separate Set objects encoding model capabilities.
// NEW: All capabilities captured in ImageModelConfig registry.
import {
  getImageModelConfig,
  buildImageInputFromConfig,
  generateWithLuma,
  isLumaAvailable,
  IMAGE_MODEL_REGISTRY,
  type ImageModelConfig,
} from './adapters/image-model-configs';

// Per-call timeout (ms) to prevent a single slow call from blocking everything
const FAL_CALL_TIMEOUT_MS = 60_000; // 60 seconds

// OLD: IP-adapter circuit breaker with module-level mutable state + 6 reference strategies.
// NEW: Reference capability is a config property. IP-adapter kept for flux-general only.
//      Circuit breaker removed — simple per-call error handling is sufficient.
let _ipAdapterConsecutiveFailures = 0;
const IP_ADAPTER_CIRCUIT_BREAKER_THRESHOLD = 2;

// OLD: generateWithNativeReference() with 4 strategy cases.
// REMOVED: Logic now inline in generateSceneImage() using config-driven approach.
// Kept Nano Banana image-to-image and IP-adapter inline, added Luma character_ref.

// OLD: buildModelInput() with 3 branches checking Set membership.
// NEW: Config-driven builder from adapters/image-model-configs.ts.
// Kept as a wrapper for backward compatibility with callers.
function buildModelInput(
  modelId: string,
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
): Record<string, any> {
  // Look up config by matching the fal.ai endpoint to a registry key
  const configEntry = Object.values(IMAGE_MODEL_REGISTRY).find(c => c.endpoint === modelId);
  if (configEntry) {
    return buildImageInputFromConfig(configEntry, prompt, negativePrompt, width, height);
  }
  // Fallback for unknown models: use flux-schnell format
  return buildImageInputFromConfig(getImageModelConfig('flux-schnell'), prompt, negativePrompt, width, height);
}

/**
 * Wrap a fal.ai subscribe call with a timeout.
 * Returns the result or throws if the call takes too long.
 */
async function falSubscribeWithTimeout(
  modelId: string,
  options: any,
  timeoutMs: number = FAL_CALL_TIMEOUT_MS,
): Promise<any> {
  // Bundle 4 Toyota A.fal.ai.1 fix: wrap in exponential-backoff retry.
  // 3 retries total for transient errors (429/5xx/network). Non-transient
  // bail immediately (Zod, 4xx, TypeError).
  return falRetry(
    () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      return Promise.race([
        fal.subscribe(modelId, options),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`fal.ai call timed out after ${timeoutMs / 1000}s (model: ${modelId})`)),
            timeoutMs,
          ),
        ),
      ]).finally(() => clearTimeout(timeout));
    },
    { maxRetries: 3, label: `image gen (${modelId})` },
  );
}

interface ReferenceImageInput {
  subjectId: string;
  imageUrl: string;
  weight?: number;
  /** Subject name for prompt enrichment */
  name?: string;
  /** Visual description of the subject for prompt enrichment when IP-adapter is unavailable */
  visualDescription?: string;
}

/**
 * Scene-type-aware cap on reference image count (Rule 19N domain-expert check).
 *
 * Background (2026-04-20): After commit `9be691ba` (S-13) enabled reference
 * image passthrough on the Nano Banana family, montage scenes degraded —
 * a "Generational Montage" across 5 different eras received 3 refs of the
 * grandmother/product/environment from unrelated scenes, so NB2 blended
 * the single grandmother identity into period-specific sub-shots it
 * shouldn't have appeared in. Observed in `proj_FRDtVSjoFvZr` Scene 1.
 *
 * Right rule per a real cinematographer: use refs only when subject
 * identity should persist across the shot. Skip them on content types
 * where identity is DELIBERATELY variable (montage) or absent (text-card).
 *
 * @param sceneType — from `SceneDescriptor.sceneType` (LLM parser sets it).
 * @returns max refs this scene may receive; 0 = skip refs entirely.
 */
function getMaxRefsForSceneType(sceneType?: string): number {
  switch (sceneType) {
    case 'montage':      return 0; // different subjects per beat — refs would homogenize
    case 'text-card':    return 0; // pure text render, refs are noise
    case 'logo-reveal':  return 1; // single brand asset IS the frame
    case 'talking-head': return 2; // character dominant, optional secondary
    case 'continuous':   return 3; // current behavior — full ref set
    default:             return 3; // unknown sceneType → safe default (= previous behavior)
  }
}

interface GenerateImageOptions {
  styleGuide?: StyleGuide;
  modelId?: string;
  aspectRatio?: string;
  sceneIndex?: number;
  totalScenes?: number;
  /** Reference images for IP-adapter consistency */
  referenceImages?: ReferenceImageInput[];
}

/**
 * Generate a single storyboard image for a scene.
 *
 * Strategy when reference images are provided:
 * 1. Try IP-adapter (flux/dev) with the reference image — best consistency
 * 2. If IP-adapter fails → fall back to user's chosen model (or default) with
 *    an enriched prompt describing the subject. Consistency is lower but the
 *    scene still gets an image.
 */
export async function generateStoryboardImage(
  scene: SceneDescriptor,
  userId: string,
  options: GenerateImageOptions = {},
): Promise<{ imageUrl: string; assetId: string; modelUsed: string; gcsPath: string; usedIpAdapter: boolean }> {
  const basePrompt = buildStoryboardPrompt(
    scene,
    options.styleGuide,
    options.sceneIndex,
    options.totalScenes,
  );
  const negativePrompt = buildNegativePrompt(options.styleGuide);

  // Determine dimensions from aspect ratio
  let width = 1280;
  let height = 720;
  if (options.aspectRatio === '9:16') {
    width = 720;
    height = 1280;
  } else if (options.aspectRatio === '1:1') {
    width = 1024;
    height = 1024;
  } else if (options.aspectRatio === '4:5') {
    width = 1080;
    height = 1350;
  }

  const hasReferences = options.referenceImages && options.referenceImages.length > 0;
  const fallbackModelId = options.modelId || DEFAULT_MODEL;

  // Build reference subject descriptions for prompt enrichment.
  // This reinforces IP-adapter consistency AND provides a textual fallback
  // when IP-adapter fails. Without this, fallback images have zero reference guidance.
  let refDescriptionSuffix = '';
  if (hasReferences) {
    const refDescs = options.referenceImages!
      .filter((r) => r.visualDescription || r.name)
      .map((r) => {
        if (r.visualDescription) return `${r.name || r.subjectId}: ${r.visualDescription}`;
        return `featuring ${r.name}`;
      });
    if (refDescs.length > 0) {
      refDescriptionSuffix = `. Key subjects: ${refDescs.join('; ')}`;
    }
  }

  // Enriched prompt includes reference subject descriptions
  const prompt = refDescriptionSuffix ? `${basePrompt}${refDescriptionSuffix}` : basePrompt;
  console.log(`[Storyboard] Scene ${options.sceneIndex} prompt (${prompt.length} chars): "${prompt.substring(0, 200)}..."`);

  // ─── Attempt 1: Config-driven reference image strategy ──────────
  // OLD: 6-strategy system (ip-adapter, image-to-image, reference-to-image, subject-reference, kontext, text-only)
  //      with 3-layer fallback chain and IP-adapter circuit breaker.
  // NEW: Look up model config → use its referenceCapability.
  //      UNI-1 (Luma): character_ref for face consistency (better than IP-adapter).
  //      Flux General: IP-adapter (kept, it works).
  //      Others: text descriptions in prompt.
  const modelConfig = Object.values(IMAGE_MODEL_REGISTRY).find(c => c.endpoint === (fallbackModelId || DEFAULT_MODEL))
    || getImageModelConfig('flux-schnell');

  // Rule 19N scene-type-aware ref cap — see getMaxRefsForSceneType above.
  const sceneTypeRefCap = getMaxRefsForSceneType((scene as any).sceneType);
  if (hasReferences && sceneTypeRefCap === 0) {
    console.log(
      `[Storyboard] Scene ${options.sceneIndex} (sceneType=${(scene as any).sceneType}): ` +
      `skipping ${options.referenceImages!.length} ref(s) — sceneType routes to text-only generation ` +
      `(avoids identity contamination on montage/text-card scenes)`,
    );
  }

  if (hasReferences && sceneTypeRefCap > 0 && modelConfig.referenceCapability !== 'text-only') {
    const rawRefs = options.referenceImages!;
    const refs = rawRefs.slice(0, sceneTypeRefCap);
    console.log(
      `[Storyboard] Scene ${options.sceneIndex} (sceneType=${(scene as any).sceneType || 'default'}): ` +
      `Using ${modelConfig.referenceCapability} with ${refs.length}/${rawRefs.length} ref(s) on ${modelConfig.key}`,
    );

    try {
      // ── Luma provider: UNI-1 with character_ref ──
      if (modelConfig.provider === 'luma' && isLumaAvailable()) {
        const aspectRatio = width > height ? '16:9' : height > width ? '9:16' : '1:1';
        const lumaResult = await generateWithLuma(prompt, {
          model: modelConfig.endpoint,
          aspectRatio,
          characterRefs: refs.map((r, i) => ({
            identity: r.name || r.subjectId || `identity${i}`,
            images: [r.imageUrl],
          })),
        });
        if (lumaResult.imageUrl) {
          const uploaded = await downloadAndUpload(lumaResult.imageUrl, userId, `luma-${modelConfig.endpoint}`);
          return { ...uploaded, usedReference: true, referenceCapability: modelConfig.referenceCapability } as any;
        }
      }

      // ── fal.ai IP-adapter: Flux General only ──
      if (modelConfig.referenceCapability === 'ip-adapter' && _ipAdapterConsecutiveFailures < IP_ADAPTER_CIRCUIT_BREAKER_THRESHOLD) {
        const ipAdapterModelId = 'fal-ai/flux-general';
        const ipAdapters = refs.slice(0, 3).map((ref, idx) => ({
          path: 'XLabs-AI/flux-ip-adapter',
          image_encoder_path: 'openai/clip-vit-large-patch14',
          image_url: ref.imageUrl,
          scale: idx === 0 ? Math.min((ref.weight ?? 0.65) + 0.15, 1.0) : Math.min((ref.weight ?? 0.4), 0.6),
        }));

        const result = await falSubscribeWithTimeout(ipAdapterModelId, {
          input: {
            prompt: `${prompt}. Maintain exact visual consistency with all reference subjects.`,
            ip_adapters: ipAdapters,
            image_size: { width, height },
            num_images: 1,
            enable_safety_checker: false,
            guidance_scale: 4.0,
            num_inference_steps: 28,
          },
          logs: false,
        }, 45_000);

        const data = result.data as any;
        const imageUrl = data?.images?.[0]?.url || data?.image?.url || data?.output?.url;
        if (imageUrl) {
          _ipAdapterConsecutiveFailures = 0;
          const uploaded = await downloadAndUpload(imageUrl, userId, ipAdapterModelId);
          return { ...uploaded, usedIpAdapter: true };
        }
        _ipAdapterConsecutiveFailures++;
      }

      // ── fal.ai image-to-image: legacy sub-path models ──
      // NOTE (2026-04-19): this branch is for any model whose config declares
      // `referenceCapability: 'image-to-image'` (appends /image-to-image to
      // the endpoint). The Nano Banana family used to be here but returned
      // 404 — fal.ai doesn't host that sub-path for NB. They're now on
      // `'inline-image-urls'` below. This branch is kept for any future model
      // that DOES host /image-to-image properly (Flux Kontext Dev routes
      // differently via its own 'image_url' single-ref param, not here).
      if (modelConfig.referenceCapability === 'image-to-image' && modelConfig.referenceConfig) {
        const editEndpoint = modelConfig.endpoint.replace(/\/?$/, '/image-to-image');
        const result = await falSubscribeWithTimeout(editEndpoint, {
          input: {
            prompt: `${prompt}. Maintain visual consistency with reference subjects.`,
            [modelConfig.referenceConfig.paramName]: refs.map(r => r.imageUrl).slice(0, modelConfig.referenceConfig.maxRefs),
            num_images: 1,
            resolution: '1K',
          },
          logs: false,
        }, 45_000);
        const data = result.data as any;
        const imageUrl = data?.images?.[0]?.url || data?.image?.url || null;
        if (imageUrl) {
          const uploaded = await downloadAndUpload(imageUrl, userId, modelConfig.endpoint);
          return { ...uploaded, usedReference: true } as any;
        }
      }

      // ── fal.ai inline image_urls: Nano Banana family ──
      // 2026-04-19 (Batch 3, pipeline_investigations.md "Nano Banana 2
      // reference images hardcoded to text-only"):
      //
      // NB, NB2, NB-Pro all accept reference images via the `image_urls`
      // array parameter on their STANDARD endpoint (no sub-path). Previous
      // code appended /image-to-image which 404s on fal.ai for this family,
      // so the fallback flipped them to 'text-only' — which meant scene
      // images got ZERO reference context, only text descriptions. User-
      // observable quality drift: approved ref subjects (Happy Meal,
      // Golden Arches) didn't visually match the scene images NB2 generated
      // from text alone.
      //
      // This branch uses the standard endpoint + passes refs through the
      // configured paramName (image_urls). staticParams (e.g., resolution)
      // from the model config are merged so tier-specific knobs still apply.
      if (modelConfig.referenceCapability === 'inline-image-urls' && modelConfig.referenceConfig) {
        const result = await falSubscribeWithTimeout(modelConfig.endpoint, {
          input: {
            prompt: `${prompt}. Maintain visual consistency with reference subjects.`,
            [modelConfig.referenceConfig.paramName]: refs
              .map(r => r.imageUrl)
              .slice(0, modelConfig.referenceConfig.maxRefs),
            num_images: 1,
            ...(modelConfig.staticParams || {}),
          },
          logs: false,
        }, 60_000);
        const data = result.data as any;
        const imageUrl = data?.images?.[0]?.url || data?.image?.url || null;
        if (imageUrl) {
          const uploaded = await downloadAndUpload(imageUrl, userId, modelConfig.endpoint);
          return { ...uploaded, usedReference: true, referenceCapability: 'inline-image-urls' } as any;
        }
        // If no imageUrl came back, fall through to standard-gen-without-refs
        // (line ~307 "Attempt 2"). Logged warning so it's auditable.
        console.warn(`[Storyboard] Scene ${options.sceneIndex}: inline-image-urls call to ${modelConfig.endpoint} returned no imageUrl, falling through to text-only generation`);
      }
    } catch (refErr: any) {
      if (modelConfig.referenceCapability === 'ip-adapter') _ipAdapterConsecutiveFailures++;
      console.warn(`[Storyboard] Scene ${options.sceneIndex}: ${modelConfig.referenceCapability} FAILED (${refErr.message}), falling through to standard generation`);
    }
  } else if (hasReferences) {
    console.log(`[Storyboard] Scene ${options.sceneIndex}: Model ${modelConfig.key} uses text-only references — descriptions in prompt`);
  }

  // ─── Attempt 2: Standard generation (user's model or default) ───────
  // For Luma provider without references, generate without character_ref
  if (modelConfig.provider === 'luma' && isLumaAvailable()) {
    try {
      const aspectRatio = width > height ? '16:9' : height > width ? '9:16' : '1:1';
      const lumaResult = await generateWithLuma(prompt, {
        model: modelConfig.endpoint,
        aspectRatio,
      });
      if (lumaResult.imageUrl) {
        const uploaded = await downloadAndUpload(lumaResult.imageUrl, userId, `luma-${modelConfig.endpoint}`);
        return { ...uploaded, usedIpAdapter: false };
      }
    } catch (lumaErr: any) {
      console.warn(`[Storyboard] Scene ${options.sceneIndex}: Luma generation FAILED (${lumaErr.message}), falling back to fal.ai`);
    }
  }

  const modelId = fallbackModelId;
  console.log(`[Storyboard] Scene ${options.sceneIndex}: model=${modelId}, ${width}x${height}`);

  const input = buildModelInput(modelId, prompt, negativePrompt, width, height);
  const result = await falSubscribeWithTimeout(modelId, {
    input,
    logs: false,
  });

  const data = result.data as any;
  const imageUrl = data?.images?.[0]?.url || data?.image?.url || data?.output?.url;
  if (!imageUrl) {
    console.error(`[Storyboard] Scene ${options.sceneIndex}: No image in response. Keys:`, Object.keys(data || {}));
    throw new Error(`No image generated from fal.ai (model: ${modelId})`);
  }

  const uploaded = await downloadAndUpload(imageUrl, userId, modelId);
  return { ...uploaded, usedIpAdapter: false };
}

/**
 * Download a generated image from fal.ai and upload to GCS.
 */
async function downloadAndUpload(
  imageUrl: string,
  userId: string,
  modelUsed: string,
): Promise<{ imageUrl: string; assetId: string; modelUsed: string; gcsPath: string; usedIpAdapter?: boolean }> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to download generated image');
  const buffer = Buffer.from(await response.arrayBuffer());

  const assetId = `storyboard_${nanoid(12)}`;
  const filename = `${assetId}.png`;

  // Pass assetId as customAssetId so R2 uses the same key.
  // This ensures the overlay's assetId matches the R2 object key,
  // so the Worker URL /asset/{assetId} resolves correctly.
  const uploadResult = await uploadMedia(buffer, userId, filename, 'image/png', { customAssetId: assetId });

  return {
    imageUrl: uploadResult.signedUrl,
    gcsPath: uploadResult.gcsPath!,
    assetId: uploadResult.assetId, // Use R2's assetId (same as customAssetId)
    modelUsed,
  };
}

/**
 * Generate a full storyboard for all scenes.
 *
 * Concurrency: 3 for fast models, 2 when IP-adapter scenes are present.
 * Retry: 1 retry per scene (total 2 attempts) to stay within timeout.
 */
export async function generateFullStoryboard(
  scenes: SceneDescriptor[],
  options: {
    userId: string;
    styleGuide?: StyleGuide;
    modelId?: string;
    projectId?: string;
    sourceScriptId?: string;
    title?: string;
    aspectRatio?: string;
    overallMusicPrompt?: string;
    /** Map of sceneIndex → reference images for IP-adapter consistency */
    referenceImageMap?: Record<number, ReferenceImageInput[]>;
    /** Approved reference subjects to persist on the storyboard for later regeneration */
    approvedReferences?: Array<{
      subjectId: string;
      name: string;
      category?: string;
      visualDescription?: string;
      imageUrl: string;
      scenesAppearingIn: number[];
    }>;
    refSetId?: string;
    /** Run Gemini Vision consistency check after generation (default: true) */
    checkConsistency?: boolean;
    /** Consistency threshold — scenes below this score are flagged (default: 0.6) */
    consistencyThreshold?: number;
    /** Global edit directions from the LLM parser (stored on storyboard for finalize) */
    globalEditDirections?: any;
  },
): Promise<Storyboard> {
  const storyboardId = `sb_${nanoid(12)}`;
  const totalScenes = scenes.length;
  const functionStartTime = Date.now();
  // Vercel has a 300s timeout. Reserve 15s for DB writes + response serialization.
  const MAX_BUDGET_MS = 280_000; // 280s safe budget out of 300s

  // Reset IP-adapter circuit breaker for each new storyboard generation
  _ipAdapterConsecutiveFailures = 0;

  // Initialize storyboard — persist approved references so regeneration can use them
  const storyboard: Storyboard = {
    storyboardId,
    projectId: options.projectId,
    userId: options.userId,
    sourceScriptId: options.sourceScriptId,
    title: options.title,
    styleGuide: options.styleGuide,
    overallMusicPrompt: options.overallMusicPrompt,
    refSetId: options.refSetId,
    approvedReferences: options.approvedReferences,
    globalEditDirections: options.globalEditDirections,
    scenes: scenes.map((s) => ({
      sceneIndex: s.sceneIndex,
      descriptor: s,
      status: 'pending' as const,
      generationHistory: [],
    })),
    status: 'generating',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveStoryboard(storyboard);

  // Determine concurrency: higher when we're NOT using IP-adapter
  // Increased from 2/3 to 4/6 to handle 15-20 scene storyboards within 300s Vercel timeout.
  // fal.ai handles parallel requests well — each image gen takes ~25-35s.
  const hasAnyRefs = options.referenceImageMap && Object.keys(options.referenceImageMap).length > 0;
  const CONCURRENCY = hasAnyRefs ? 4 : 6;
  let completed = 0;
  let errors = 0;

  // Only 1 retry (total 2 attempts) — IP-adapter is slow, more retries risk timeout
  const MAX_RETRIES = 1;

  console.log(`[Storyboard] Starting: ${totalScenes} scenes, concurrency=${CONCURRENCY}, hasRefs=${!!hasAnyRefs}, model=${options.modelId || DEFAULT_MODEL}`);

  // Track first scene's image URL for cross-scene style consistency (FIX 8)
  let styleAnchorImageUrl: string | null = null;

  const generateForScene = async (sbScene: StoryboardScene) => {
    let lastError: any;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: retry ${attempt}/${MAX_RETRIES}`);
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }

        sbScene.status = 'generating';
        await updateStoryboardScene(storyboardId, sbScene.sceneIndex, {
          status: 'generating',
        });

        // Look up reference images for this scene from the referenceImageMap
        let sceneRefs = options.referenceImageMap?.[sbScene.sceneIndex];

        // FIX 8: Cross-scene consistency — if this scene has no IP-adapter refs
        // and we have a style anchor from scene 0, pass it as a low-weight style reference
        if ((!sceneRefs || sceneRefs.length === 0) && styleAnchorImageUrl && sbScene.sceneIndex > 0) {
          sceneRefs = [{
            subjectId: '__style_anchor__',
            imageUrl: styleAnchorImageUrl,
            weight: 0.3,
          }];
          console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: Using scene 0 as style anchor (weight 0.3)`);
        }

        // ─── A3.2 FIX: Montage-first image generation ──────────────────
        // For montage scenes where ALL sub-shots have independentGeneration=true,
        // the parent scene image is NEVER used in the final video — finalize
        // iterates sub-shots directly. Generating a parent image wastes ~20-25s
        // of the 280s Vercel budget, causing sub-shot generation to be skipped
        // due to budget exhaustion → all sub-shots share one image → repeated footage.
        //
        // OLD approach: generate parent first, then attempt sub-shots with remaining budget.
        // NEW approach: skip parent entirely, spend budget on sub-shots directly.
        // Use first successful sub-shot image as scene.imageUrl for posterUrl/UI fallback.
        const allSubShots = sbScene.descriptor.subShots || [];
        const indepSubShotsForMontage = allSubShots
          .map((sub, idx) => ({ sub, idx }))
          .filter(({ sub }) => sub.independentGeneration && sub.visualDescription);
        // Full-montage = ALL sub-shots are independent (no shared-clip sub-shots)
        const isFullMontage = allSubShots.length > 0
          && indepSubShotsForMontage.length === allSubShots.length;

        let montageHandledSubShots = false;

        if (isFullMontage) {
          console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: FULL MONTAGE (${indepSubShotsForMontage.length} independent sub-shots) — skipping parent image, generating sub-shots directly`);

          // Generate sub-shot images in parallel using Flux Schnell (fastest, ~12-15s)
          const INNER_CONCURRENCY = 3;
          let firstSuccessResult: { imageUrl: string; assetId: string; gcsPath: string; modelUsed: string; usedIpAdapter?: boolean } | null = null;

          const runSubShot = async ({ sub, idx }: typeof indepSubShotsForMontage[number]) => {
            // Budget check per sub-shot
            const nowBudgetMs = MAX_BUDGET_MS - (Date.now() - functionStartTime);
            if (nowBudgetMs < 30_000) {
              console.warn(`[Storyboard] Scene ${sbScene.sceneIndex} sub ${idx}: skipped (budget exhausted, ${Math.round(nowBudgetMs / 1000)}s left)`);
              return;
            }
            const subStart = Date.now();
            try {
              const subDescriptor: SceneDescriptor = {
                ...sbScene.descriptor,
                visualDescription: sub.visualDescription!,
                imageQualityTokens: sub.imageQualityTokens || sbScene.descriptor.imageQualityTokens,
                videoQualityTokens: sub.videoQualityTokens || sbScene.descriptor.videoQualityTokens,
                videoMotionPrompt: sub.videoMotionPrompt || sbScene.descriptor.videoMotionPrompt,
              };

              const subResult = await generateStoryboardImage(
                subDescriptor,
                options.userId,
                {
                  styleGuide: options.styleGuide,
                  // Force Flux Schnell for sub-shots — fastest model (~12-15s),
                  // and we want visual variety not style consistency here.
                  modelId: DEFAULT_MODEL,
                  aspectRatio: options.aspectRatio,
                  sceneIndex: sbScene.sceneIndex,
                  totalScenes,
                  referenceImages: undefined, // No IP-adapter — sub-shots must look DIFFERENT
                },
              );

              await updateSubShot(storyboardId, sbScene.sceneIndex, idx, {
                imageUrl: subResult.imageUrl,
                imageAssetId: subResult.assetId,
              });
              sub.imageUrl = subResult.imageUrl;
              sub.imageAssetId = subResult.assetId;

              // Capture first success as parent fallback
              if (!firstSuccessResult) {
                firstSuccessResult = subResult;
              }

              const subElapsed = ((Date.now() - subStart) / 1000).toFixed(1);
              console.log(`[Storyboard] Scene ${sbScene.sceneIndex} sub ${idx}: image OK in ${subElapsed}s (${subResult.assetId})`);
            } catch (subErr: any) {
              console.warn(`[Storyboard] Scene ${sbScene.sceneIndex} sub ${idx}: FAILED (${subErr.message})`);
            }
          };

          // Sliding-window concurrency runner (same pattern as existing Phase A3.2)
          const queue = [...indepSubShotsForMontage];
          const inFlight: Promise<void>[] = [];
          while (queue.length > 0 || inFlight.length > 0) {
            while (inFlight.length < INNER_CONCURRENCY && queue.length > 0) {
              const item = queue.shift()!;
              const p = runSubShot(item).then(() => {
                inFlight.splice(inFlight.indexOf(p), 1);
              });
              inFlight.push(p);
            }
            if (inFlight.length > 0) {
              await Promise.race(inFlight);
            }
          }

          montageHandledSubShots = true;

          // TS control-flow can't see assignments inside async callbacks — it
          // narrows firstSuccessResult to `never` after the initial `null` assignment.
          // Cast to the declared type to work around this.
          const resolvedFirst = firstSuccessResult as { imageUrl: string; assetId: string; gcsPath: string; modelUsed: string } | null;
          if (resolvedFirst) {
            // Use first sub-shot image as scene-level posterUrl fallback
            sbScene.imageAssetId = resolvedFirst.assetId;
            sbScene.imageUrl = resolvedFirst.imageUrl;
            (sbScene as any).imageGcsPath = resolvedFirst.gcsPath;
            sbScene.status = 'generated';
            sbScene.generationHistory.push({
              assetId: resolvedFirst.assetId,
              imageUrl: resolvedFirst.imageUrl,
              timestamp: new Date(),
              modelUsed: resolvedFirst.modelUsed,
            } as any);

            await updateStoryboardScene(storyboardId, sbScene.sceneIndex, {
              imageAssetId: resolvedFirst.assetId,
              imageUrl: resolvedFirst.imageUrl,
              imageGcsPath: resolvedFirst.gcsPath,
              status: 'generated',
              generationHistory: sbScene.generationHistory,
            });

            completed++;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: MONTAGE COMPLETE in ${elapsed}s — ${indepSubShotsForMontage.filter(({ sub }) => sub.imageUrl).length}/${indepSubShotsForMontage.length} sub-shots have distinct images`);
          } else {
            // ALL sub-shots failed — fall back to generating a parent image
            console.warn(`[Storyboard] Scene ${sbScene.sceneIndex}: ALL sub-shot images failed — falling back to parent image generation`);
            montageHandledSubShots = false; // Allow Phase A3.2 to retry
            // Fall through to standard parent image generation below
          }
        }

        // ─── Standard path: generate parent image ─────────────────────
        // For non-montage scenes OR montage scenes where all sub-shots failed
        if (!isFullMontage || !montageHandledSubShots) {
          const result = await generateStoryboardImage(
            sbScene.descriptor,
            options.userId,
            {
              styleGuide: options.styleGuide,
              modelId: options.modelId,
              aspectRatio: options.aspectRatio,
              sceneIndex: sbScene.sceneIndex,
              totalScenes,
              referenceImages: sceneRefs,
            },
          );

          // FIX 8: Capture scene 0's image as style anchor for subsequent scenes
          if (sbScene.sceneIndex === 0 && result.imageUrl) {
            styleAnchorImageUrl = result.imageUrl;
            console.log(`[Storyboard] Scene 0 captured as style anchor for cross-scene consistency`);
          }

          sbScene.imageAssetId = result.assetId;
          sbScene.imageUrl = result.imageUrl;
          (sbScene as any).imageGcsPath = result.gcsPath;
          sbScene.status = 'generated';
          sbScene.generationHistory.push({
            assetId: result.assetId,
            imageUrl: result.imageUrl,
            timestamp: new Date(),
            modelUsed: result.modelUsed,
          } as any);

          await updateStoryboardScene(storyboardId, sbScene.sceneIndex, {
            imageAssetId: result.assetId,
            imageUrl: result.imageUrl,
            imageGcsPath: result.gcsPath,
            status: 'generated',
            generationHistory: sbScene.generationHistory,
          });

          completed++;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: SUCCESS in ${elapsed}s (model: ${result.modelUsed}, ipAdapter: ${result.usedIpAdapter})`);
        }

        // ─── Phase A3.2: Per-sub-shot image generation (fallback path) ────
        // This runs for NON-full-montage scenes that still have some independent
        // sub-shots (e.g., a continuous scene with 1-2 independent inserts).
        // Full-montage scenes are handled above via montage-first path and skip this.
        //
        // NOTE: No reference images passed — we WANT visual variety here (different
        // era/subject/setting per sub-shot). IP-adapter would defeat the point.
        // Failure is non-fatal: video worker already has fallback to parent image.
        //
        // The !sub.imageUrl filter also prevents re-generation of sub-shots that
        // already got images from the montage-first path above.
        const indepSubShots = montageHandledSubShots ? [] : (sbScene.descriptor.subShots || [])
          .map((sub, idx) => ({ sub, idx }))
          .filter(({ sub }) => sub.independentGeneration && !sub.imageUrl && sub.visualDescription);

        if (indepSubShots.length > 0) {
          // Budget check — Flux Schnell is ~12-15s per call. With inner concurrency 3,
          // a 5-sub-shot scene needs ~2 rounds = ~30s. Lowered from 90s to 45s
          // (was too conservative, caused routine skipping on 3+ scene scripts).
          const budgetRemainingMs = MAX_BUDGET_MS - (Date.now() - functionStartTime);
          const MIN_BUDGET_FOR_SUBSHOTS_MS = 45_000;

          if (budgetRemainingMs < MIN_BUDGET_FOR_SUBSHOTS_MS) {
            console.warn(
              `[Storyboard] Scene ${sbScene.sceneIndex}: SKIPPING ${indepSubShots.length} per-sub-shot images — only ${Math.round(budgetRemainingMs / 1000)}s remaining (need ${MIN_BUDGET_FOR_SUBSHOTS_MS / 1000}s). Video worker will fall back to parent image.`,
            );
          } else {
            console.log(`[Storyboard] Scene ${sbScene.sceneIndex}: generating ${indepSubShots.length} per-sub-shot images in parallel (budget ${Math.round(budgetRemainingMs / 1000)}s)`);

            // Inner concurrency cap — parallelism within a single scene. Kept low (3)
            // because the OUTER scene loop already runs up to 6 scenes in parallel,
            // so total fal.ai concurrent requests = outer * inner = 18 max.
            const INNER_CONCURRENCY = 3;

            const runOne = async ({ sub, idx }: typeof indepSubShots[number]) => {
              // Re-check budget per sub-shot — if time already ran out, bail quietly.
              const nowBudgetMs = MAX_BUDGET_MS - (Date.now() - functionStartTime);
              if (nowBudgetMs < 30_000) {
                console.warn(`[Storyboard] Scene ${sbScene.sceneIndex} sub ${idx}: skipped (budget exhausted mid-batch, ${Math.round(nowBudgetMs / 1000)}s left)`);
                return;
              }
              const subStart = Date.now();
              try {
                const subDescriptor: SceneDescriptor = {
                  ...sbScene.descriptor,
                  visualDescription: sub.visualDescription!,
                  imageQualityTokens: sub.imageQualityTokens || sbScene.descriptor.imageQualityTokens,
                  videoQualityTokens: sub.videoQualityTokens || sbScene.descriptor.videoQualityTokens,
                  videoMotionPrompt: sub.videoMotionPrompt || sbScene.descriptor.videoMotionPrompt,
                };

                const subResult = await generateStoryboardImage(
                  subDescriptor,
                  options.userId,
                  {
                    styleGuide: options.styleGuide,
                    // Force Flux Schnell for sub-shots — fastest model, and we want
                    // visual variety (each sub-shot is a different subject/era).
                    modelId: DEFAULT_MODEL,
                    aspectRatio: options.aspectRatio,
                    sceneIndex: sbScene.sceneIndex,
                    totalScenes,
                    // Intentionally NO referenceImages — sub-shots must look DIFFERENT
                    // from each other (that's the point of the montage).
                    referenceImages: undefined,
                  },
                );

                // Persist to storyboard doc via dedicated sub-shot updater
                await updateSubShot(storyboardId, sbScene.sceneIndex, idx, {
                  imageUrl: subResult.imageUrl,
                  imageAssetId: subResult.assetId,
                });

                // Update in-memory mirror so later logic (consistency scoring, etc.) sees it
                sub.imageUrl = subResult.imageUrl;
                sub.imageAssetId = subResult.assetId;

                const subElapsed = ((Date.now() - subStart) / 1000).toFixed(1);
                console.log(`[Storyboard] Scene ${sbScene.sceneIndex} sub ${idx}: image OK in ${subElapsed}s (${subResult.assetId})`);
              } catch (subErr: any) {
                console.warn(`[Storyboard] Scene ${sbScene.sceneIndex} sub ${idx}: per-sub-shot image gen FAILED (non-fatal, video worker will fall back to parent image): ${subErr.message}`);
                // Don't throw — parent image is already persisted, scene counts as generated
              }
            };

            // Simple sliding-window concurrency runner
            const queue = [...indepSubShots];
            const inFlight: Promise<void>[] = [];
            while (queue.length > 0 || inFlight.length > 0) {
              while (inFlight.length < INNER_CONCURRENCY && queue.length > 0) {
                const item = queue.shift()!;
                const p = runOne(item).then(() => {
                  inFlight.splice(inFlight.indexOf(p), 1);
                });
                inFlight.push(p);
              }
              if (inFlight.length > 0) {
                await Promise.race(inFlight);
              }
            }
          }
        }

        return; // Success — exit retry loop
      } catch (err: any) {
        lastError = err;
        console.error(`[Storyboard] Scene ${sbScene.sceneIndex} attempt ${attempt + 1} failed (${((Date.now() - startTime) / 1000).toFixed(1)}s):`, err.message || err);
      }
    }

    // All retries exhausted
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Storyboard] Scene ${sbScene.sceneIndex} FAILED after ${MAX_RETRIES + 1} attempts (${elapsed}s):`, lastError?.message);
    sbScene.status = 'pending';
    errors++;
  };

  // FIX 8: Run scene 0 first to capture style anchor, then remaining scenes concurrently
  const allScenes = [...storyboard.scenes];
  const scene0 = allScenes.find((s) => s.sceneIndex === 0);
  const remainingScenes = allScenes.filter((s) => s.sceneIndex !== 0);

  // Generate scene 0 first (style anchor)
  if (scene0) {
    await generateForScene(scene0);
  }

  // Run remaining scenes with concurrency limit
  const queue = [...remainingScenes];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (running.length < CONCURRENCY && queue.length > 0) {
      const scene = queue.shift()!;
      const p = generateForScene(scene).then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  // ─── Consistency Check ───────────────────────────────────────────
  // After all scenes are generated, run Gemini Vision consistency scoring.
  // Flagged scenes are auto-regenerated once with stronger style anchoring.
  // SKIP if we've used too much time — better to return images than 504.
  const elapsedMs = Date.now() - functionStartTime;
  const remainingMs = MAX_BUDGET_MS - elapsedMs;
  const hasEnoughTimeForConsistency = remainingMs > 90_000; // Need at least 90s for scoring + regen

  if (!hasEnoughTimeForConsistency) {
    console.log(`[Storyboard] Skipping consistency check — only ${(remainingMs / 1000).toFixed(0)}s remaining (need 90s). Elapsed: ${(elapsedMs / 1000).toFixed(0)}s`);
  }

  if (options.checkConsistency !== false && completed >= 2 && hasEnoughTimeForConsistency) {
    try {
      const threshold = options.consistencyThreshold ?? 0.6;
      console.log(`[Storyboard] Running consistency check (threshold=${threshold})`);

      const report = await scoreStoryboardConsistency(storyboard, threshold);
      storyboard.consistencyReport = report;

      // Auto-regenerate flagged scenes (max 1 retry per scene)
      if (report.flaggedScenes.length > 0) {
        console.log(`[Storyboard] Consistency: ${report.flaggedScenes.length} scene(s) flagged — regenerating with stronger anchoring`);

        for (const flaggedIndex of report.flaggedScenes) {
          // Time budget check — stop regen if running low
          const regenRemaining = MAX_BUDGET_MS - (Date.now() - functionStartTime);
          if (regenRemaining < 45_000) {
            console.log(`[Storyboard] Stopping consistency regen — only ${(regenRemaining / 1000).toFixed(0)}s remaining`);
            break;
          }

          const flaggedScene = storyboard.scenes.find((s) => s.sceneIndex === flaggedIndex);
          if (!flaggedScene) continue;

          try {
            // Build reference images with stronger style anchor weight (0.5 instead of 0.3)
            let consistencyRefs = options.referenceImageMap?.[flaggedIndex];

            // If no IP-adapter refs, use style anchor with higher weight
            if ((!consistencyRefs || consistencyRefs.length === 0) && styleAnchorImageUrl) {
              consistencyRefs = [{
                subjectId: '__style_anchor__',
                imageUrl: styleAnchorImageUrl,
                weight: 0.5, // stronger than normal 0.3
              }];
            }

            // Find adjacent scenes for context
            const prevScene = storyboard.scenes.find((s) => s.sceneIndex === flaggedIndex - 1 && s.imageUrl);
            const nextScene = storyboard.scenes.find((s) => s.sceneIndex === flaggedIndex + 1 && s.imageUrl);

            // Build an enriched descriptor that explicitly instructs matching adjacent scenes
            const enrichedDescriptor = { ...flaggedScene.descriptor };
            const matchInstructions: string[] = [];
            if (prevScene) matchInstructions.push(`Match the lighting, color palette, and art style of the previous scene.`);
            if (nextScene) matchInstructions.push(`Ensure visual continuity with the following scene.`);
            if (matchInstructions.length > 0) {
              enrichedDescriptor.visualDescription = `[CONSISTENCY FIX: ${matchInstructions.join(' ')}] ${enrichedDescriptor.visualDescription}`;
            }

            console.log(`[Storyboard] Consistency regen: scene ${flaggedIndex} (score=${report.sceneScores.find(s => s.sceneIndex === flaggedIndex)?.overallScore})`);

            const result = await generateStoryboardImage(
              enrichedDescriptor,
              options.userId,
              {
                styleGuide: options.styleGuide,
                modelId: options.modelId,
                aspectRatio: options.aspectRatio,
                sceneIndex: flaggedIndex,
                totalScenes,
                referenceImages: consistencyRefs,
              },
            );

            flaggedScene.imageAssetId = result.assetId;
            flaggedScene.imageUrl = result.imageUrl;
            (flaggedScene as any).imageGcsPath = result.gcsPath;
            flaggedScene.status = 'generated';
            flaggedScene.generationHistory.push({
              assetId: result.assetId,
              imageUrl: result.imageUrl,
              timestamp: new Date(),
              feedback: 'Auto-regenerated for consistency',
              modelUsed: result.modelUsed,
            } as any);

            await updateStoryboardScene(storyboardId, flaggedIndex, {
              imageAssetId: result.assetId,
              imageUrl: result.imageUrl,
              imageGcsPath: result.gcsPath,
              status: 'generated',
              generationHistory: flaggedScene.generationHistory,
            });

            console.log(`[Storyboard] Consistency regen: scene ${flaggedIndex} SUCCESS`);
          } catch (regenErr: any) {
            console.error(`[Storyboard] Consistency regen: scene ${flaggedIndex} FAILED:`, regenErr.message);
            // Keep the original image — don't mark as error
          }
        }
      }
    } catch (consistencyErr: any) {
      console.error('[Storyboard] Consistency check failed (non-fatal):', consistencyErr.message);
      // Consistency check failure is non-fatal — storyboard is still usable
    }
  }

  // Update final status
  storyboard.status = errors === 0 ? 'ready' : completed > 0 ? 'partial' : 'error';
  storyboard.updatedAt = new Date();
  await saveStoryboard(storyboard);

  console.log(`[Storyboard] Complete: ${completed} succeeded, ${errors} failed out of ${totalScenes}`);

  return storyboard;
}

/**
 * Regenerate a single scene's image with optional feedback.
 */
export async function regenerateScene(
  storyboardId: string,
  sceneIndex: number,
  userId: string,
  options: {
    feedback?: string;
    modelId?: string;
    styleGuide?: StyleGuide;
    aspectRatio?: string;
  } = {},
): Promise<StoryboardScene> {
  const storyboard = await getStoryboard(storyboardId, userId);
  if (!storyboard) throw new Error('Storyboard not found');

  const scene = storyboard.scenes.find((s) => s.sceneIndex === sceneIndex);
  if (!scene) throw new Error(`Scene ${sceneIndex} not found`);

  // Build enhanced descriptor with feedback using REPLACE/EDIT dual-mode logic
  const descriptor = { ...scene.descriptor };
  const feedback = options.feedback?.trim() || '';

  // Detect whether user wants to REPLACE the subject entirely or EDIT the existing image
  const REPLACE_SIGNALS = /\b(change\s+to|replace\s+with|make\s+it\s+a\b|switch\s+to|instead\s+of|not\s+a\b|don'?t\s+want|remove\s+the|get\s+rid\s+of|completely\s+different|something\s+else|use\s+a\s+different|swap\s+(it|out|for))\b/i;
  const isReplaceMode = feedback ? REPLACE_SIGNALS.test(feedback) : false;

  if (feedback) {
    if (isReplaceMode) {
      // REPLACE MODE: feedback describes a fundamentally new subject — make it the primary description
      console.log(`[Storyboard] regenerateScene ${sceneIndex}: REPLACE mode — "${feedback.substring(0, 80)}"`);
      descriptor.visualDescription = `${feedback}. Scene context: ${descriptor.mood} mood, ${descriptor.title}`;
    } else {
      // EDIT MODE: feedback is a tweak — prefix it before the original description
      console.log(`[Storyboard] regenerateScene ${sceneIndex}: EDIT mode — "${feedback.substring(0, 80)}"`);
      descriptor.visualDescription = `[APPLY THESE CHANGES: ${feedback}] — Original scene: ${descriptor.visualDescription}`;
    }
  }

  const totalScenes = storyboard.scenes.length;

  // Look up approved reference images for this scene (for IP-adapter consistency)
  const sceneRefs = storyboard.approvedReferences
    ?.filter((ref) => ref.scenesAppearingIn.includes(sceneIndex))
    .map((ref) => ({
      subjectId: ref.subjectId,
      imageUrl: ref.imageUrl,
      weight: 0.6,
      name: ref.name,
      visualDescription: ref.visualDescription,
    }));

  const result = await generateStoryboardImage(descriptor, userId, {
    styleGuide: options.styleGuide || storyboard.styleGuide,
    modelId: options.modelId,
    aspectRatio: options.aspectRatio,
    sceneIndex,
    totalScenes,
    referenceImages: sceneRefs && sceneRefs.length > 0 ? sceneRefs : undefined,
  });

  scene.imageAssetId = result.assetId;
  scene.imageUrl = result.imageUrl;
  scene.status = 'generated';
  scene.generationHistory.push({
    assetId: result.assetId,
    imageUrl: result.imageUrl,
    timestamp: new Date(),
    feedback: options.feedback,
    modelUsed: result.modelUsed,
  } as any);

  await updateStoryboardScene(storyboardId, sceneIndex, {
    imageAssetId: result.assetId,
    imageUrl: result.imageUrl,
    status: 'generated',
    generationHistory: scene.generationHistory,
  });

  return scene;
}
