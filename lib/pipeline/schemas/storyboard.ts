/**
 * Storyboard Types
 *
 * A storyboard is a collection of scenes with generated images that serve as
 * visual reference / stencils for video production in Editron.
 */

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
  videoDurationMs?: number;
  /** Generation status */
  status?: 'pending' | 'generating' | 'generated' | 'failed';
}

export interface SceneDescriptor {
  sceneIndex: number;
  title: string;
  narration: string;
  visualDescription: string;
  durationSeconds: number;
  mood: string;
  cameraDirection?: string;
  /** Audio/sound design notes from the script (e.g. "sirens, crowd noise") */
  audioDescription?: string;
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
  /** Motion graphic to insert in this scene */
  motionGraphicCue?: string;
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
  videoDurationMs?: number;
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

export interface Storyboard {
  storyboardId: string;
  projectId?: string;
  userId: string;
  sourceScriptId?: string;
  title?: string;
  styleGuide?: StyleGuide;
  scenes: StoryboardScene[];
  /** Overall music prompt for BGM generation (from LLM scene parser) */
  overallMusicPrompt?: string;
  /** Generation mode: parallel (all at once) or sequential (one-by-one with approval) */
  mode?: 'parallel' | 'sequential';
  /** Voiceover configuration */
  voiceoverConfig?: VoiceoverConfig;
  /** Reference image set used for visual consistency (IP-adapter) */
  refSetId?: string;
  /** Approved reference images used during storyboard generation + video prompting */
  approvedReferences?: Array<{
    subjectId: string;
    name: string;
    category?: string;
    visualDescription?: string;
    imageUrl: string;
    scenesAppearingIn: number[];
    weight?: number;
  }>;
  /** Visual consistency report from Gemini Vision analysis of sequential scenes */
  consistencyReport?: ConsistencyReport;
  /** Global editing instructions for the entire video (from LLM parser or user brief) */
  globalEditDirections?: GlobalEditDirections;
  status: 'generating' | 'ready' | 'partial' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
