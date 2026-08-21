/**
 * Storyboard Types
 *
 * A storyboard is a collection of scenes with generated images that serve as
 * visual reference / stencils for video production in Editron.
 */

import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import type { GeneratedAudioReceipt } from '@/lib/pipeline/tts-service';
import type { GeneratedVideoReceipt } from '@/lib/pipeline/video-generation-service';

/**
 * SubShot — a cut point within a generated video clip.
 * The assembly step uses these to cut one 5s video into multiple timeline segments.
 * Example: a 5s McDonald's playground clip → 3 sub-shots of ~1.5s each.
 */
export interface SubShot {
  /** What this sub-shot shows (used for asset analysis matching) */
  description: string;
  /** Approximate start time within the parent clip (0-1 normalized).
   *  Used when cutting sub-shots from a SINGLE generated clip (Option 3 grouping). */
  startNormalized: number;
  /** Approximate end time within the parent clip (0-1 normalized) */
  endNormalized: number;
  /** Duration in seconds this sub-shot should appear in final video */
  targetDurationSeconds: number;
  /** Narration that plays during this sub-shot (empty if narration continues from previous) */
  narration?: string;

  // ─── Per-SubShot Generation Fields (for independent video gen) ─────
  // When independentGeneration=true, each sub-shot gets its own video clip
  // instead of cutting from one parent clip. Used for montage sequences
  // where each shot shows a completely different subject/action.

  /** If true, this sub-shot generates its own independent video clip */
  independentGeneration?: boolean;
  /** Distinct visual prompt for image/video generation (required when independentGeneration=true) */
  visualDescription?: string;
  /** Motion prompt for AI video gen */
  videoMotionPrompt?: string;
  /** Image quality tokens */
  imageQualityTokens?: string;
  /** Video quality tokens */
  videoQualityTokens?: string;

  // ─── Per-SubShot Asset Tracking ─────
  /** Storyboard image for this sub-shot (set after image gen) */
  imageUrl?: string;
  imageAssetId?: string;
  /** Video clip for this sub-shot (set after video gen) */
  videoUrl?: string;
  videoAssetId?: string;
  videoProvider?: string;
  videoModel?: string;
  videoDurationMs?: number;
  hasNativeAudio?: boolean;
  nativeAudioRights?: AudioRightsContract;
  generatedVideoReceipt?: GeneratedVideoReceipt;
  /** Generation status */
  status?: 'pending' | 'generating' | 'generated' | 'failed';

  /** Asset source classification (set by parser post-processor).
   *  'stock' = search Pixabay/Pexels first, 'ai-video' = generate AI clip */
  assetRecommendation?: 'ai-video' | 'stock' | 'animated-still' | 'graphics-only';
  /** R2 key for AI-generated video asset */
  videoR2Key?: string;
  /** Cached stock video from Pixabay/Pexels prefetch.
   *  Populated by prefetch-stock-video route during video generation. */
  cachedStockVideo?: {
    videoUrl: string;
    videoAssetId: string;
    r2Key: string;
    durationMs: number;
    source: 'pixabay' | 'pexels';
    thumbnailUrl?: string;
    query: string;
  };
}

/**
 * Semantic editorial evidence supplied by ThinkForge V3. These fields describe
 * what the visual must accomplish, never how Editron should render or edit it.
 */
export interface SceneEditorialVisualEvent {
  id: string;
  audienceJob: string;
  visualThesis: string;
  // Preserve the authored treatment relation exactly; Editron may resolve
  // final form later but this semantic handoff must not silently downgrade it.
  audioRelationship: 'anchor' | 'complement' | 'counterpoint' | 'replace';
  timingNote: string;
  continuityNotes: string[];
  sourceRefs: string[];
  creativeReferenceIds: string[];
  brandConstraints: string[];
  accessibilityRequirements: string[];
  captureRequirementIds: string[];
}

export interface SceneEditorialIntent {
  source: 'thinkforge-v3-treatment';
  treatment: {
    treatmentId: string;
    treatmentVersion: number;
    inputFingerprint: string;
  };
  narrativePurpose: string;
  visualEvents: SceneEditorialVisualEvent[];
}

export interface SceneDescriptor {
  sceneIndex: number;
  title: string;
  narration: string;
  visualDescription: string;
  durationSeconds: number;
  /**
   * True when `durationSeconds` came from an explicit timing marker in the
   * script (e.g. "00:00 - 00:15 | Hook" or "Scene 2: 5-25 seconds").
   *
   * Rule 8N (Script Duration is King): when this is true, the
   * edit-direction-applier's pacing multiplier (driven by scene.pacing
   * label) must NOT compound on top of the user's stated number. Honor it.
   *
   * When false/undefined, the duration is an LLM or regex estimate based on
   * word count or heuristics, and pacing multipliers apply normally.
   *
   * Set by `convertTimestampedScriptToScenes` (regex path) and
   * `parseScriptWithLLM` post-processor (LLM path).
   */
  durationWasExplicit?: boolean;
  mood: string;
  cameraDirection?: string;
  /** @deprecated Use musicDescription + sfxDescription instead.
   *  Previously mixed music mood ("gentle nostalgic piano") with SFX ("children's laughter").
   *  Kept for backward compatibility — old projects only have this field.
   *  Consumers should read musicDescription/sfxDescription first, fall back to audioDescription. */
  audioDescription?: string;
  /** Music/BGM mood and style direction. For BGM generation (CassetteAI).
   *  Examples: "gentle nostalgic piano, building to warm uplifting", "high-energy trap beat, 128 BPM"
   *  Does NOT include sound effects — those go in sfxDescription or editDirections.sfxCue. */
  musicDescription?: string;
  /** Sound effects and ambient audio direction. For SFX search/generation.
   *  Three-Layer Sound Model (creative_production_knowledge.md):
   *    - Ambient bed: "restaurant buzz, room tone, outdoor air"
   *    - Spot SFX: "cup clink, door close, footstep"
   *    - Feature SFX: "whoosh, impact hit, stinger"
   *  Does NOT include music/BGM — that goes in musicDescription. */
  sfxDescription?: string;
  /** Dedicated motion/animation prompt for AI video generation (from LLM parser) */
  videoMotionPrompt?: string;
  /** Dynamic quality tokens for image generation, specific to the art style (from LLM) */
  imageQualityTokens?: string;
  /** Dynamic quality tokens for video generation, specific to the art style (from LLM) */
  videoQualityTokens?: string;
  /** Raw production notes from meta sections (style guide, color palette, pacing, etc.)
   *  Previously dropped entirely — now preserved for the edit direction system. */
  rawProductionNotes?: string;
  /** Structured edit directions extracted from the script by the LLM parser.
   *  These drive automated editing in the finalize route and Director Agent. */
  editDirections?: SceneEditDirections;
  /** Semantic treatment evidence. Editron owns any final visual or editorial form. */
  editorialIntent?: SceneEditorialIntent;

  // ─── Generation Unit + Sub-Shot System ────────────────────────

  /** Generation unit ID — scenes sharing this ID are generated from the SAME video clip.
   *  The parser groups related shots (same subject/location) under one generation unit.
   *  Example: "playground" unit generates one 5s clip, cut into 3 sub-shots. */
  generationUnitId?: string;

  /** The PRIMARY visual for this generation unit. Only set on the first scene of a unit.
   *  Other scenes in the same unit inherit the generated video and use subShots for cutting. */
  primaryVisualForUnit?: boolean;

  /** Sub-shots within this scene's generated video. If present, the assembly step
   *  cuts the generated clip at these points instead of using it as one continuous piece. */
  subShots?: SubShot[];

  /** Scene type — determines assembly strategy */
  sceneType?: 'continuous' | 'montage' | 'logo-reveal' | 'text-card' | 'talking-head';

  /** Asset source classification for cost optimization (from LLM parser / post-processor).
   *  - 'ai-video': Hero shots — generate AI video ($0.35/shot)
   *  - 'stock': Generic shots — search Pixabay/Pexels ($0)
   *  - 'animated-still': Ken Burns drift-zoom on storyboard image ($0.012)
   *  - 'graphics-only': Motion graphics template, no video ($0) */
  assetRecommendation?: 'ai-video' | 'stock' | 'animated-still' | 'graphics-only';
}

/** Per-scene editing instructions extracted from the script. */
export interface SceneEditDirections {
  /** Transition INTO this scene from the previous one */
  transition?: {
    type: 'dissolve' | 'dip-to-black' | 'dip-to-white' | 'hard-cut'
        | 'zoom-punch' | 'whip-pan' | 'wipe-left' | 'glitch' | 'soft-cut';
    durationMs?: number;
  };
  /** Filter preset to apply to this scene's image/video overlays */
  filterPresetId?: string;
  /** Pacing adjustment for this scene */
  pacing?: 'fast' | 'medium' | 'slow' | 'building' | 'beat-synced';
  /** Specific SFX direction beyond the general audioDescription */
  sfxCue?: string;
  /** Motion graphic to insert in this scene (free-form description, legacy).
   *  For exact on-screen text extracted from the script use `onScreenText` instead. */
  motionGraphicCue?: string;
  /** Structured on-screen text lines extracted verbatim from the script's
   *  "On-Screen Text:" / "Text:" sections. Each entry is ONE distinct visible text
   *  (e.g. ["Remember this feeling?"], or ["Through the years.", "Your story.", "Our place."]).
   *  Unlike motionGraphicCue (one concatenated blob), this preserves order, count, and
   *  exact punctuation/hashtags so the EDL executor + caption-service can use the literal
   *  text instead of letting Gemini re-generate it. */
  onScreenText?: string[];
  /** Camera rig/movement notes (preserved for reference, future motion tracking) */
  cameraRig?: string;
  /** Explicit color temperature if mentioned in script (Kelvin) */
  colorTemperatureK?: number;
  /** Free-form production notes that don't fit other fields */
  customNotes?: string;
}

/** Global editing instructions for the entire video. */
export interface GlobalEditDirections {
  /** Overall color grade description */
  colorGrade?: string;
  /** Default filter preset for all scenes */
  defaultFilterPresetId?: string;
  /** Default transition between scenes */
  defaultTransition?: { type: string; durationMs: number };
  /** Overall pacing */
  pacing?: string;
  /** How graphic-heavy the edit should be */
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal';
  /** Music mood/style description (supplements overallMusicPrompt) */
  musicMood?: string;
  /** Narrative structure of the script */
  narrativeArc?: 'three-act' | 'aida' | 'hero-journey' | 'gap-method' | 'before-after';
  /** Edit profile ID to use (Phase 3 link) */
  editProfileId?: string;
}

export interface StyleGuide {
  artStyle: string;
  colorPalette: string[];
  characterDescriptions?: Record<string, string>;
  environmentNotes?: string;
  negativePrompt?: string;
}

export interface SceneVoiceover {
  audioUrl: string;
  audioAssetId: string;
  audioDurationMs: number;
  gcsPath?: string;
  r2Key: string | null;
  audioRights: AudioRightsContract;
  generatedAudioReceipt: GeneratedAudioReceipt;
  /** Word-level timing for caption sync (populated after STT on TTS output) */
  words?: Array<{
    word: string;
    startMs: number;
    endMs: number;
  }>;
}

export interface StoryboardScene {
  sceneIndex: number;
  descriptor: SceneDescriptor;
  imageAssetId?: string;
  imageUrl?: string;
  imageGcsPath?: string;
  /** AI-generated video clip from the storyboard image */
  videoAssetId?: string;
  videoUrl?: string;
  videoGcsPath?: string;
  videoProvider?: string;
  videoModel?: string;
  videoDurationMs?: number;
  /** Avatar Vault render job lineage for ThinkForge-cast scenes. */
  avatarPipelineJobId?: string;
  avatarPipelineStatus?: 'blocked' | 'queued' | 'running' | 'succeeded' | 'failed';
  avatarPipelineError?: string;
  /** R2 storage key for the video asset */
  videoR2Key?: string;
  /** True if the video model generated native audio with the video (e.g., Seedance 1.5 Pro).
   *  When true, SFX generation is skipped — audio is baked into the video file. */
  hasNativeAudio?: boolean;
  nativeAudioRights?: AudioRightsContract;
  generatedVideoReceipt?: GeneratedVideoReceipt;
  /** Set to true when scene skips AI video generation (asset type is non-video) */
  videoSkipped?: boolean;
  /** Reason scene skipped video generation */
  videoSkipReason?: 'animated-still' | 'stock' | 'graphics-only';
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  voiceover?: SceneVoiceover;
  generationHistory: Array<{
    assetId: string;
    imageUrl: string;
    timestamp: Date;
    feedback?: string;
    modelUsed: string;
  }>;
}

export interface VoiceoverConfig {
  voice: string;
  language: string;
  contentType?: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
}

/** Per-scene consistency score from Gemini Vision analysis */
export interface ConsistencyScore {
  sceneIndex: number;
  overallScore: number;         // 0-1, 1 = perfectly consistent
  subjectConsistency: number;   // 0-1
  lightingConsistency: number;  // 0-1
  colorConsistency: number;     // 0-1
  styleConsistency: number;     // 0-1
  issues: string[];             // human-readable issues
  shouldRegenerate: boolean;    // true if score < threshold
}

/** Aggregate consistency report across all storyboard scenes */
export interface ConsistencyReport {
  projectConsistency: number;   // average across all scenes
  sceneScores: ConsistencyScore[];
  flaggedScenes: number[];      // indices of scenes below threshold
}

export interface EditronProductionManifest {
  version?: number;
  sourceService?: string;
  sourceSessionId?: string;
  sourceScriptId?: string;
  expectedSceneCount: number;
  expectedStoryboardImages: number;
  expectedVideoClips: number;
  targetDurationSeconds?: number;
  coveragePolicy: 'production-require-all-scenes' | 'draft-partial-allowed';
  warnings: string[];
  /** Server-resolved ThinkForge brief, casting, and provenance carried to downstream consumers. */
  thinkforgeContext?: {
    version: number;
    briefSnapshot?: Record<string, unknown>;
    sourceLedger?: Record<string, unknown>;
    sidecarSourceRefs: string[];
    avatarDirectives: Array<{
      sceneIndex: number;
      durationSeconds: number;
      relipSafe?: boolean;
      speakers: Array<{
        characterId: string;
        avatarProfileId?: string;
        voiceMode: 'cloned' | 'preset' | 'none' | 'unbound';
        lineText: string;
        sourceRefs?: string[];
      }>;
    }>;
  };
}

export type ApprovedStoryboardReferenceProvenance =
  | 'brand-vault'
  | 'website-screenshot'
  | 'uploaded'
  | 'generated'
  | 'missing-brand-evidence';

export type ApprovedStoryboardBrandEvidenceStatus = 'resolved' | 'missing' | 'not-required';

export interface ApprovedStoryboardReference {
  subjectId: string;
  name: string;
  category?: string;
  visualDescription?: string;
  imageUrl: string;
  imageAssetId?: string;
  imageGcsPath?: string;
  scenesAppearingIn: number[];
  weight?: number;
  source?: string;
  assetRole?: string;
  referenceProvenance?: ApprovedStoryboardReferenceProvenance;
  referenceProvenanceLabel?: string;
  requiresBrandEvidence?: boolean;
  brandEvidenceStatus?: ApprovedStoryboardBrandEvidenceStatus;
  evidenceRequiredReason?: string;
}

export interface Storyboard {
  storyboardId: string;
  /** Real Editron project id after finalize. Legacy pre-finalize rows may contain the ThinkForge session id. */
  projectId?: string;
  /** Source ThinkForge session id used for lineage, project reuse, and project-links. */
  sourceSessionId?: string;
  userId: string;
  sourceScriptId?: string;
  /** Brand Vault brand id used to resolve approved reference evidence. */
  brandId?: string;
  title?: string;
  styleGuide?: StyleGuide;
  scenes: StoryboardScene[];
  productionManifest?: EditronProductionManifest;
  /** Overall music prompt for BGM generation (from LLM scene parser) */
  overallMusicPrompt?: string;
  /** Generation mode: parallel (all at once) or sequential (one-by-one with approval) */
  mode?: 'parallel' | 'sequential';
  /** Voiceover configuration */
  voiceoverConfig?: VoiceoverConfig;
  /** Reference image set used for visual consistency (IP-adapter) */
  refSetId?: string;
  /** Approved reference images used during storyboard generation + video prompting */
  approvedReferences?: ApprovedStoryboardReference[];
  /** Visual consistency report from Gemini Vision analysis of sequential scenes */
  consistencyReport?: ConsistencyReport;
  /** Global editing instructions for the entire video (from LLM parser or user brief) */
  globalEditDirections?: GlobalEditDirections;
  /** LLM-suggested profile category — used by profile detection to filter before keyword
   *  scoring (2026-04-17). Eliminates cross-category false positives. */
  suggestedProfileCategory?: string;
  status: 'generating' | 'ready' | 'partial' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
