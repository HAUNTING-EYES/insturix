/**
 * capabilities.ts — hand-maintained model + avatar capability constants.
 *
 * Single source of truth for eligibility + lane routing. Imported by the avatar
 * shot router (`generateAvatarShot`), the eligibility predicate, and (later) the
 * ThinkForge writer + Editron GenerationRouter. When a model's real ceilings
 * change or a new model lands, edit THIS file — nothing else routes on hardcoded
 * numbers.
 *
 * ACCURACY OVER OPTIMISM. Every number carries its source in a comment. Values we
 * can't confirm are `null` (never invented). Verified 2026-07-09 against code +
 * fal model pages. See memory `avatar-master-doc-v1.1-verification`.
 */

export type ModelRole =
  | 'talking_head' // 1 portrait + audio → lip-synced talking head (lane A0)
  | 'body_scene' // reference images + prompt → body/scene video (lane B visual)
  | 'relip' // existing video + audio → mouth re-synced to the audio
  | 'voice_clone'; // voice sample + text → speech in that voice

export interface ModelCapability {
  name: string;
  role: ModelRole;
  /** fal model id, or null for self-hosted / not-yet-launched. */
  falModelId: string | null;
  /** false = announced placeholder OR deprecated. The router never selects these. */
  available: boolean;
  /** USD per generated second. null = unknown/placeholder — do not invent. */
  costPerSec: number | null;
  /** Max output (or, for relip, max INPUT video) duration in seconds. */
  maxDurationSec: number;
  /** Reference images accepted for identity conditioning. */
  maxRefImages: number;
  resolutions: string[];
  /** Syncs the mouth to a PROVIDED audio track. */
  lipSync: boolean;
  /** Generates its OWN audio (never the user's cloned voice). */
  nativeAudio: boolean;
  /** Clones a voice from a sample. */
  voiceClone: boolean;
  geoRestricted: boolean;
  license: string;
  notes: string;
}

export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  // ─── Voice ───────────────────────────────────────────────────────────────
  chatterbox: {
    name: 'chatterbox',
    role: 'voice_clone',
    falModelId: null, // self-hosted FastAPI on Modal (CHATTERBOX_TTS_ENDPOINT)
    available: true,
    costPerSec: 0, // self-hosted GPU; no per-call vendor fee
    maxDurationSec: 0, // n/a — length follows the script text
    maxRefImages: 0,
    resolutions: [],
    lipSync: false,
    nativeAudio: false,
    voiceClone: true,
    geoRestricted: false,
    license: 'self-hosted (Chatterbox)',
    notes:
      'Zero-shot clone: voice sample + text → cloned-voice WAV. English in practice (raw path drops language). No persistent voiceId — store the voice SAMPLE ref on casting, re-clone each call. lib/avatar/avatar-chatterbox-client.ts',
  },

  // ─── Talking head — lane A0 ──────────────────────────────────────────────
  'kling-ai-avatar-standard': {
    name: 'kling-ai-avatar-standard',
    role: 'talking_head',
    falModelId: 'fal-ai/kling-video/v1/standard/ai-avatar',
    available: true,
    costPerSec: 0.0562, // fal model page 2026-07-09
    maxDurationSec: 60, // fal caps Kling AI Avatar at 60s (5-min figures are other hosts)
    maxRefImages: 1,
    resolutions: ['720p', '1080p'], // UNVERIFIED — fal page does not print resolution
    lipSync: true, // audio-driven talking head
    nativeAudio: false,
    voiceClone: false,
    geoRestricted: false,
    license: 'commercial (fal)',
    notes: 'A0 default speaking lane. 1 portrait + audio → talking head; output length = audio length. WIRED (default face provider).',
  },
  'kling-ai-avatar-pro': {
    name: 'kling-ai-avatar-pro',
    role: 'talking_head',
    falModelId: 'fal-ai/kling-video/ai-avatar/v2/pro',
    available: true,
    costPerSec: 0.115, // fal model page 2026-07-09
    maxDurationSec: 60,
    maxRefImages: 1,
    resolutions: ['720p', '1080p'], // UNVERIFIED on page
    lipSync: true,
    nativeAudio: false,
    voiceClone: false,
    geoRestricted: false,
    license: 'commercial (fal)',
    notes: 'A0 premium tier (crisper lip-sync in motion). Same contract as standard.',
  },

  // ─── Relip (lane B mouth) ────────────────────────────────────────────────
  'kling-lipsync': {
    name: 'kling-lipsync',
    role: 'relip',
    falModelId: 'fal-ai/kling-video/lipsync/audio-to-video',
    available: true,
    costPerSec: 0.0028, // $0.014 per 5s block, fal page 2026-07-09
    maxDurationSec: 10, // ★ HARD CAP on INPUT video (2–10s). Longer speaking shots MUST be chunked.
    maxRefImages: 0,
    resolutions: ['720p', '1080p'],
    lipSync: true,
    nativeAudio: false,
    voiceClone: false,
    geoRestricted: false,
    license: 'commercial (fal)',
    notes: 'Relip service: input video 2–10s (hard cap), audio 2–60s, video ≤100MB / audio ≤5MB. Drifts on audio/video duration mismatch — align lengths before calling.',
  },

  // ─── Body / scene (lane B visual) ────────────────────────────────────────
  'seedance-2.0-r2v': {
    name: 'seedance-2.0-r2v',
    role: 'body_scene',
    falModelId: 'bytedance/seedance-2.0/reference-to-video',
    available: true,
    costPerSec: 0.3024, // 720p, no video inputs (0.1814/s with video inputs), fal page 2026-07-09
    maxDurationSec: 15,
    maxRefImages: 9, // reference-to-video: up to 9 images, referenced @Image1.. in the prompt
    resolutions: ['480p', '720p', '1080p', '4k'], // fal r2v page 2026-07-10 (4k available)
    lipSync: false,
    nativeAudio: true, // native audio is NOT the user's voice — voice comes from Chatterbox + relip
    voiceClone: false,
    geoRestricted: true, // B2B customers outside US only; passes end_user_id
    license: 'commercial (fal)',
    notes: "★ REJECTS REAL-PERSON LIKENESSES (live probe 2026-07-10: content_policy_violation / partner_validation_failed — ByteDance blocks real human faces as refs). Usable for objects/invented characters ONLY, NOT a real user's avatar. For real-person avatars the body engine must be Kling-based (Kling AI Avatar, or a real-person-friendly i2v). Schema (image_urls @Image1.., end_user_id) + geo-access confirmed working.",
  },
  'seedance-2.5': {
    name: 'seedance-2.5',
    role: 'body_scene',
    falModelId: null, // not launched — no adapter yet
    available: false, // ★ flip to true when the API lands (+ one adapter file + real pricing)
    costPerSec: null, // PLACEHOLDER — unknown until launch
    maxDurationSec: 30, // announced ceiling (PLACEHOLDER)
    maxRefImages: 50, // announced ceiling (PLACEHOLDER) — the big identity-hold win
    resolutions: ['720p', '1080p', '4K'], // announced (PLACEHOLDER)
    lipSync: false,
    nativeAudio: true,
    voiceClone: false,
    geoRestricted: false, // unknown at announce
    license: 'commercial (announced)',
    notes:
      'PLACEHOLDER for the unreleased Seedance 2.5 (announced 30s / 4K / 50 refs). When the API lands: add ONE adapter file, register it, flip available=true, fill real pricing. The router auto-prefers it wherever its ceilings win — zero 2.5-specific logic elsewhere.',
  },

  // ─── Deprecated ──────────────────────────────────────────────────────────
  'omnihuman-fal': {
    name: 'omnihuman-fal',
    role: 'talking_head',
    falModelId: 'fal-ai/bytedance/omnihuman/v1.5',
    available: false, // ★ A1 DEAD (identity drift). Existing wiring left untouched; never route NEW work here.
    costPerSec: 0.16,
    maxDurationSec: 30, // 30s @1080p / 60s @720p
    maxRefImages: 1,
    resolutions: ['720p', '1080p'],
    lipSync: true,
    nativeAudio: false,
    voiceClone: false,
    geoRestricted: false,
    license: 'commercial (fal)',
    notes: 'A1 DEAD — deprecated for drift. Kept as a fallback provider in the existing face stage only; do not route new lanes here.',
  },
};

/**
 * avatarRig — what the avatar generation system can actually do today. Drives the
 * eligibility predicate + lane routing. English-only + A0-first reflect the shipped
 * reality, not the doc's aspiration.
 */
export const AVATAR_RIG = {
  maxClipSec: 60, // A0 (Kling AI Avatar) ceiling ← fal
  framings: ['bust', 'full_body'] as const,
  // Motion is prompt-driven (the Motion Director composes it); this is the vocabulary
  // we direct, not a fixed animation set.
  motionVocabulary: ['idle', 'gesture', 'present_to_camera', 'weight_shift', 'lean_in', 'walk_in'] as const,
  // Camera moves are applied deterministically in the Remotion composition (drift-free),
  // NOT by the model.
  cameraMoves: ['static', 'push_in', 'pull_out'] as const,
  languages: ['en'] as const, // Chatterbox English in practice; multilingual PARKED
  voiceEngine: 'chatterbox', // zero-shot clone; casting stores the voice SAMPLE ref (no server voiceId)
  relip: {
    service: 'kling-lipsync',
    maxInputVideoSec: 10, // ★ HARD CAP ← fal; speaking shots longer than this MUST chunk to ≤10s
    maxAudioSec: 60,
    maxVideoBytes: 100 * 1024 * 1024,
    maxAudioBytes: 5 * 1024 * 1024,
  },
} as const;

/**
 * editronExecutables — the decision-family vocabulary the Editron executor can run.
 * CODE-VERIFIED against `lib/editron/services/creative-brief.ts` BriefDecisionType (~:216-228),
 * 2026-07-09. This is a capability INVENTORY of what the executor does TODAY — NOT a template
 * menu. The named `graphic_*` families mirror the current executor vocabulary and will be
 * superseded when Rule-11 generative MG lands (a separate Codex frontier). Keep in sync with
 * BriefDecisionType — it is the contract the ThinkForge writer + GenerationRouter check eligibility against.
 */
export const EDITRON_EXECUTABLES = [
  'zoom_push', 'zoom_punch', 'zoom_pull_back', 'zoom_drift',
  'transition_dissolve', 'transition_hard_cut', 'transition_whip_pan',
  'transition_fade_to_black', 'transition_flash', 'transition_j_cut',
  'transition_l_cut', 'transition_soft_cut', 'transition_wipe',
  'caption_emphasis',
  'sfx_whoosh', 'sfx_impact', 'sfx_shimmer', 'sfx_ambient',
  'speed_slow_motion', 'speed_ramp',
  'graphic_stat_counter', 'graphic_lower_third', 'graphic_callout',
  'graphic_keyword_highlight', 'graphic_quote_card', 'graphic_logo_reveal',
  'camera_shake',
  'audio_duck', 'audio_bed_select',
  'hold_longer', 'cut_shorter',
] as const;

export type EditronExecutable = (typeof EDITRON_EXECUTABLES)[number];

/** Family grouping — partitions EDITRON_EXECUTABLES; used by eligibility / routing checks. */
export const EDITRON_EXECUTABLE_FAMILIES = {
  zoom: ['zoom_push', 'zoom_punch', 'zoom_pull_back', 'zoom_drift'],
  transition: [
    'transition_dissolve', 'transition_hard_cut', 'transition_whip_pan',
    'transition_fade_to_black', 'transition_flash', 'transition_j_cut',
    'transition_l_cut', 'transition_soft_cut', 'transition_wipe',
  ],
  caption: ['caption_emphasis'],
  sfx: ['sfx_whoosh', 'sfx_impact', 'sfx_shimmer', 'sfx_ambient'],
  speed: ['speed_slow_motion', 'speed_ramp'],
  graphic: [
    'graphic_stat_counter', 'graphic_lower_third', 'graphic_callout',
    'graphic_keyword_highlight', 'graphic_quote_card', 'graphic_logo_reveal',
  ],
  camera: ['camera_shake'],
  audio: ['audio_duck', 'audio_bed_select'],
  pacing: ['hold_longer', 'cut_shorter'],
} as const satisfies Record<string, readonly EditronExecutable[]>;

export type EditronExecutableFamily = keyof typeof EDITRON_EXECUTABLE_FAMILIES;

export function getModelCapability(name: string): ModelCapability | undefined {
  return MODEL_CAPABILITIES[name];
}

/** Available models for a role, e.g. every wired body/scene generator. */
export function availableModelsForRole(role: ModelRole): ModelCapability[] {
  return Object.values(MODEL_CAPABILITIES).filter((m) => m.available && m.role === role);
}
