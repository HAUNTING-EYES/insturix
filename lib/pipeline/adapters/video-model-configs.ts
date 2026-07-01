/**
 * Video Model Config Registry
 *
 * Replaces the 12-case switch in buildFalVideoInput() with a data-driven approach.
 * Each model's quirks (duration enums, param names, aspect ratio formats) are captured
 * in a config object. One generic builder reads any config.
 *
 * To add a new model: add a config entry to VIDEO_MODEL_REGISTRY. Done.
 * No switch cases, no duplicated logic, no 50-line functions per model.
 */

// ─── Types ───────────────────────────────────────────────────────

export interface VideoModelConfig {
  /** Unique key used in UI dropdown and API payload */
  key: string;
  /** Human-readable label for UI dropdown */
  label: string;
  /** Sort order for dropdown (lower = higher in list) */
  sortOrder: number;
  /** fal.ai endpoint IDs */
  endpoints: {
    textToVideo?: string;
    imageToVideo: string;
  };
  /** Duration parameter handling — each model has different format */
  duration: {
    /** Parameter name sent to the API */
    paramName: string;
    /** Minimum seconds the model accepts */
    min: number;
    /** Maximum seconds the model accepts */
    max: number;
    /**
     * Snap requested duration to what the model actually supports.
     * Returns the API-ready value (string enum, integer, or frame count).
     * Also used to calculate what the model will ACTUALLY produce.
     */
    snap: (requested: number) => string | number;
    /** What the model actually generates in seconds (for timeline calculation) */
    actualSeconds: (requested: number) => number;
  };
  /** Aspect ratio handling */
  aspectRatio: {
    paramName: string;
    /** Supported values. If requested ratio not in list, use fallback. */
    supported: string[];
    fallback: string;
  };
  /** Resolution parameter (optional — some models don't accept it) */
  resolution?: {
    paramName: string;
    default: string;
  };
  /** Parameter name for the input image URL */
  imageUrlParam: string;
  /** Parameter name for end-frame image (scene chaining). Null = not supported. */
  endImageParam: string | null;
  /** Parameter name for reference images (IP-adapter style). Null = not supported. */
  referenceParam: string | null;
  /** Max reference images accepted */
  maxReferenceImages?: number;
  /** Native audio generation support */
  nativeAudio?: {
    /** Toggle param sent to fal.ai when the model documents one. Omitted for fixed native-audio models. */
    paramName?: string;
    default: boolean;
  };
  /** Static params always sent to this model */
  staticParams: Record<string, any>;
  /** Whether this model accepts negative_prompt */
  supportsNegativePrompt: boolean;
  /** Model-specific negative prompt additions */
  negativePromptSuffix?: string;
  /** Prompt tuning guidance (for LLM prompt refinement) */
  promptTuning?: string;
}

// ─── Registry ────────────────────────────────────────────────────

export const VIDEO_MODEL_REGISTRY: Record<string, VideoModelConfig> = {
  // ─── Kling 2.6 Pro ─────────────────────────────────────────────
  // Docs: https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video/api
  // Uses start_image_url (NOT image_url). Duration: "5" or "10" only.
  'kling-2.6': {
    key: 'kling-2.6',
    label: 'Kling 2.6 Pro (High Motion)',
    sortOrder: 2,
    endpoints: { imageToVideo: 'fal-ai/kling-video/v2.6/pro/image-to-video' },
    duration: {
      paramName: 'duration',
      min: 5, max: 10,
      snap: (n) => n >= 8 ? '10' : '5',
      actualSeconds: (n) => n >= 8 ? 10 : 5,
    },
    aspectRatio: {
      paramName: 'aspect_ratio',
      supported: [], // Kling 2.6 does NOT accept aspect_ratio
      fallback: '',
    },
    imageUrlParam: 'start_image_url',
    endImageParam: 'end_image_url',
    referenceParam: 'subject_reference_image_urls',
    maxReferenceImages: 4,
    nativeAudio: { paramName: 'generate_audio', default: false },
    staticParams: {},
    supportsNegativePrompt: true,
    negativePromptSuffix: 'face morphing, identity drift between frames',
    promptTuning: 'Kling: cinematic language, include lens type, favor push-in/pull-out. 100-150 words.',
  },

  // ─── Kling 2.1 Pro ─────────────────────────────────────────────
  // Docs: https://fal.ai/models/fal-ai/kling-video/v2.1/pro/image-to-video/api
  // Duration: "5" or "10" only. Uses image_url, accepts aspect_ratio.
  'kling-2.1': {
    key: 'kling-2.1',
    label: 'Kling 2.1 Pro',
    sortOrder: 1, // Default model — first in list
    endpoints: { imageToVideo: 'fal-ai/kling-video/v2.1/pro/image-to-video' },
    duration: {
      paramName: 'duration',
      min: 5, max: 10,
      snap: (n) => n >= 8 ? '10' : '5',
      actualSeconds: (n) => n >= 8 ? 10 : 5,
    },
    aspectRatio: {
      paramName: 'aspect_ratio',
      supported: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      fallback: '16:9',
    },
    imageUrlParam: 'image_url',
    endImageParam: 'tail_image_url',
    referenceParam: null,
    staticParams: { cfg_scale: 0.5 },
    supportsNegativePrompt: true,
    negativePromptSuffix: 'face morphing, identity drift between frames',
    promptTuning: 'Kling: cinematic language, include lens type, favor push-in/pull-out. 100-150 words.',
  },

  // ─── Google Veo 3.1 ───────────────────────────────────────────
  // Docs: https://fal.ai/models/fal-ai/veo3.1/image-to-video/api
  // Duration: "4s", "6s", or "8s". Aspect ratio: ONLY "auto", "16:9", "9:16".
  'veo-3.1': {
    key: 'veo-3.1',
    label: 'Google Veo 3.1 (4K Premium)',
    sortOrder: 4,
    endpoints: { imageToVideo: 'fal-ai/veo3.1/image-to-video' },
    duration: {
      paramName: 'duration',
      min: 4, max: 8,
      snap: (n) => n <= 4 ? '4s' : n <= 6 ? '6s' : '8s',
      actualSeconds: (n) => n <= 4 ? 4 : n <= 6 ? 6 : 8,
    },
    aspectRatio: {
      paramName: 'aspect_ratio',
      supported: ['auto', '16:9', '9:16'],
      fallback: 'auto',
    },
    resolution: { paramName: 'resolution', default: '720p' },
    imageUrlParam: 'image_url',
    endImageParam: null,
    referenceParam: null,
    nativeAudio: { paramName: 'generate_audio', default: false },
    staticParams: {},
    supportsNegativePrompt: true,
    negativePromptSuffix: 'texture swimming, edge warping',
    promptTuning: 'Veo: handles complex motion well, ambitious camera paths OK. 100-150 words.',
  },

  // ─── Seedance 1.5 Pro ─────────────────────────────────────────
  // Docs: https://fal.ai/models/fal-ai/bytedance/seedance/v1.5/pro/text-to-video
  //       https://fal.ai/models/fal-ai/bytedance/seedance/v1.5/pro/image-to-video/api
  // Duration: 4-12 integer (verified 2026-04-11 via fal.ai API docs).
  // NATIVE AUDIO: generate_audio defaults true.
  // Scene chaining: end_image_url. Resolution: 480p, 720p, 1080p.
  'seedance-1.5': {
    key: 'seedance-1.5',
    label: 'Seedance 1.5 Pro (Native Audio)',
    sortOrder: 0, // Top of list — best new model with unique audio capability
    endpoints: {
      textToVideo: 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video',
      imageToVideo: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
    },
    duration: {
      paramName: 'duration',
      // fal.ai accepts integers 4-12 only. Was incorrectly set to 15 (Seedance 2.0's limit).
      min: 4, max: 12,
      snap: (n) => Math.min(Math.max(Math.round(n), 4), 12),
      actualSeconds: (n) => Math.min(Math.max(Math.round(n), 4), 12),
    },
    aspectRatio: {
      paramName: 'aspect_ratio',
      supported: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      fallback: '16:9',
    },
    resolution: { paramName: 'resolution', default: '720p' },
    imageUrlParam: 'image_url',
    endImageParam: 'end_image_url',
    referenceParam: null,
    nativeAudio: { paramName: 'generate_audio', default: true },
    staticParams: { camera_fixed: false },
    supportsNegativePrompt: false,
    negativePromptSuffix: 'motion blur artifacts, temporal glitching',
    promptTuning: 'Seedance: cinematic audio-visual coherence, describe both visual AND ambient sound elements. CRITICAL: specify "instrumental ambient only, no vocals, no speech" in the audio portion — the model generates native audio and will hallucinate random-language vocals if not constrained. 100-150 words.',
  },

  // ─── Seedance 2.0 ──────────────────────────────────────────────
  // Docs: https://fal.ai/models/bytedance/seedance-2.0/image-to-video
  // Live on fal.ai as of 2026-04. Early access requires end_user_id.
  // Duration: "auto" or "4"-"15" (string enum). Native audio: generate_audio=true default.
  // Resolution: 480p, 720p. Aspect ratio: auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16.
  // End image supported (end_image_url). Seed for reproducibility.
  // NOTE: Geographic restriction — B2B customers outside US only. We pass end_user_id.
  'seedance-2.0': {
    key: 'seedance-2.0',
    label: 'Seedance 2.0 (Best Audio-Video)',
    sortOrder: 0, // Top of list — newest with native audio + better coherence than 1.5
    endpoints: {
      textToVideo: 'bytedance/seedance-2.0/text-to-video',
      imageToVideo: 'bytedance/seedance-2.0/image-to-video',
    },
    duration: {
      paramName: 'duration',
      min: 4, max: 15,
      // Duration is a STRING enum: "auto", "4", "5", ..., "15"
      snap: (n) => String(Math.min(Math.max(Math.round(n), 4), 15)),
      actualSeconds: (n) => Math.min(Math.max(Math.round(n), 4), 15),
    },
    aspectRatio: {
      paramName: 'aspect_ratio',
      supported: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      fallback: '16:9',
    },
    resolution: { paramName: 'resolution', default: '720p' },
    imageUrlParam: 'image_url',
    endImageParam: 'end_image_url',
    referenceParam: null,
    nativeAudio: { paramName: 'generate_audio', default: true },
    staticParams: {},
    supportsNegativePrompt: false,
    negativePromptSuffix: 'motion blur artifacts, temporal glitching',
    promptTuning: 'Seedance 2.0: cinematic audio-visual coherence, describe both visual motion AND ambient sound elements. For image-to-video: focus on movement/camera, not subject description (image provides that). Include "preserve composition and colors" for consistency. 100-150 words.',
  },

  // --- Alibaba HappyHorse 1.1 ------------------------------------------------
  // Docs: https://fal.ai/models/alibaba/happy-horse/v1.1/image-to-video/api
  //       https://fal.ai/models/alibaba/happy-horse/v1.1/text-to-video/api
  // Image-to-video uses image_url as the first frame. Duration: integer 3-15.
  // Native audio is advertised, but the I2V schema has no generate_audio toggle.
  'happy-horse-v1.1': {
    key: 'happy-horse-v1.1',
    label: 'HappyHorse 1.1 (Native Audio)',
    sortOrder: 0.5,
    endpoints: {
      textToVideo: 'alibaba/happy-horse/v1.1/text-to-video',
      imageToVideo: 'alibaba/happy-horse/v1.1/image-to-video',
    },
    duration: {
      paramName: 'duration',
      min: 3, max: 15,
      snap: (n) => Math.min(Math.max(Math.round(n), 3), 15),
      actualSeconds: (n) => Math.min(Math.max(Math.round(n), 3), 15),
    },
    aspectRatio: {
      paramName: '',
      supported: [],
      fallback: '',
    },
    resolution: { paramName: 'resolution', default: '1080p' },
    imageUrlParam: 'image_url',
    endImageParam: null,
    referenceParam: null,
    nativeAudio: { default: true },
    staticParams: { enable_safety_checker: true },
    supportsNegativePrompt: false,
    negativePromptSuffix: 'audio artifacts, temporal glitching, lip-sync drift',
    promptTuning: 'HappyHorse: concise cinematic motion, preserve first-frame composition, mention intended ambient audio only when no voiceover is present. 80-140 words.',
  },
};

// ─── Exports ─────────────────────────────────────────────────────

/** Get config for a video model. Falls back to kling-2.1 for unknown keys. */
export function getVideoModelConfig(key: string): VideoModelConfig {
  return VIDEO_MODEL_REGISTRY[key] || VIDEO_MODEL_REGISTRY['kling-2.1'];
}

/** Get the fal.ai endpoint for a model key (backward compat with FAL_VIDEO_MODELS). */
export function getVideoModelEndpoint(key: string): string {
  const config = getVideoModelConfig(key);
  return config.endpoints.imageToVideo;
}

/** Get all model keys sorted by sortOrder (for UI dropdowns). */
export function getVideoModelKeys(): string[] {
  return Object.values(VIDEO_MODEL_REGISTRY)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(c => c.key);
}

/** Get label map (backward compat with FAL_VIDEO_MODEL_LABELS). */
export function getVideoModelLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const config of Object.values(VIDEO_MODEL_REGISTRY)) {
    labels[config.key] = config.label;
  }
  return labels;
}

/**
 * Build fal.ai input from config + request.
 *
 * This replaces the 12-case switch in buildFalVideoInput().
 * Config encodes what each model needs; this function reads any config.
 *
 * staticParams spread LAST so model-specific overrides can't be clobbered
 * by generic defaults (per Nimit's feedback).
 */
export function buildVideoInputFromConfig(
  config: VideoModelConfig,
  imageUrl: string,
  prompt: string,
  durationSeconds: number,
  aspectRatio: string,
  negativePrompt?: string,
  nextSceneImageUrl?: string,
  referenceImageUrls?: string[],
  options?: { hasVoiceover?: boolean },
): Record<string, any> {
  const input: Record<string, any> = {
    prompt,
  };

  // Image URL (each model uses a different param name)
  input[config.imageUrlParam] = imageUrl;

  // Duration (skip if model doesn't accept it, e.g., MiniMax)
  if (config.duration.paramName) {
    input[config.duration.paramName] = config.duration.snap(durationSeconds);
  }

  // Aspect ratio (skip if model doesn't accept it)
  if (config.aspectRatio.paramName && config.aspectRatio.supported.length > 0) {
    input[config.aspectRatio.paramName] = config.aspectRatio.supported.includes(aspectRatio)
      ? aspectRatio
      : config.aspectRatio.fallback;
  }

  // Resolution
  if (config.resolution) {
    input[config.resolution.paramName] = config.resolution.default;
  }

  // Negative prompt
  if (config.supportsNegativePrompt && negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  // Scene chaining (end frame from next scene's storyboard image)
  if (nextSceneImageUrl && config.endImageParam) {
    input[config.endImageParam] = nextSceneImageUrl;
  }

  // Reference images (IP-adapter or subject reference)
  if (referenceImageUrls && referenceImageUrls.length > 0 && config.referenceParam) {
    input[config.referenceParam] = referenceImageUrls.slice(0, config.maxReferenceImages || 4);
  }

  // Native audio — disable when scene has voiceover to prevent audio overlap.
  // Voiceover (TTS narration) is the primary audio track; Seedance native audio
  // would generate competing speech/ambient that overlaps with it.
  // Only enable native audio on scenes with NO voiceover narration. Some models
  // advertise native audio but do not expose a toggle, so only send a provider
  // param when the model schema documents one.
  if (config.nativeAudio) {
    const enableNativeAudio = config.nativeAudio.default && !options?.hasVoiceover;
    if (config.nativeAudio.paramName) {
      input[config.nativeAudio.paramName] = enableNativeAudio;
    }

    if (enableNativeAudio) {
      // When native audio IS enabled (no voiceover scene), constrain to
      // English ambient sounds — Seedance can hallucinate non-English vocals.
      input.prompt = `${input.prompt}. Audio direction: ambient environmental sounds, foley effects. Any speech or vocals MUST be in English only. NO non-English speech, NO foreign language vocals.`;
    }
  }

  // Static params LAST — model-specific overrides take precedence over generic defaults
  Object.assign(input, config.staticParams);

  return input;
}

/**
 * Get what duration the model will actually produce (accounts for enum snapping).
 * Used by finalize to calculate timeline frame counts.
 */
export function getActualVideoDuration(key: string, requestedSeconds: number): number {
  const config = getVideoModelConfig(key);
  return config.duration.actualSeconds(requestedSeconds);
}

/** Check if a model generates native audio with video. */
export function modelHasNativeAudio(key: string): boolean {
  const config = getVideoModelConfig(key);
  return config.nativeAudio?.default === true;
}

/**
 * Map an adapter model key to its prompt-tuning family, for use with
 * llm-scene-parser.ts's refineVideoPrompt targetModel parameter.
 *
 * The tuning family controls which model-specific template the LLM uses
 * (4-layer Seedance structure vs 2-4 sentence Kling vs terse Veo).
 * Families are prompt-engineering buckets, not API compatibility — a new
 * "kling-2.7" key would map to 'kling' because the prompt style is the same.
 *
 * Returns null for unknown models → refiner falls back to generic template.
 */
export function getPromptTuningFamily(key: string): 'kling' | 'veo' | 'seedance' | null {
  const lower = (key || '').toLowerCase();
  if (lower.startsWith('seedance')) return 'seedance';
  if (lower.startsWith('kling')) return 'kling';
  if (lower.startsWith('veo')) return 'veo';
  return null;
}
