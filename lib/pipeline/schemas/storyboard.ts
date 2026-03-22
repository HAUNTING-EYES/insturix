/**
 * Storyboard Types
 *
 * A storyboard is a collection of scenes with generated images that serve as
 * visual reference / stencils for video production in Editron.
 */

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
