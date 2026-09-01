/**
 * Edit Profile Type Definitions
 *
 * Core types for the 54-profile auto-editing system.
 * Profiles are deterministic editing programs — not style guides.
 * Each profile defines exactly what the Director Agent executes.
 */


import type {
  EditorialFamily,
  EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';
import type { ProjectMutationReceiptV1 } from '@/lib/editron/services/project-service';
// ─── Profile Categories ─────────────────────────────────────────

export type ProfileCategory =
  | 'platform-native'    // CAT-A: Platform-optimized (8)
  | 'industry-vertical'  // CAT-B: Sector-specific (14)
  | 'content-format'     // CAT-C: Structure-defined (12)
  | 'cinematic-style'    // CAT-D: Aesthetic-first (8)
  | 'narrative-mode'     // CAT-E: Story-structure (6)
  | 'production-mode'    // CAT-F: Footage-type (4)
  | 'special-purpose';   // CAT-G: Fallback + blend (2)

// ─── Profile IDs ─────────────────────────────────────────────────

export type ProfileId =
  // CAT-A Platform Native
  | 'A-01' | 'A-02' | 'A-03' | 'A-04' | 'A-05' | 'A-06' | 'A-07' | 'A-08'
  // CAT-B Industry Vertical
  | 'B-01' | 'B-02' | 'B-03' | 'B-04' | 'B-05' | 'B-06' | 'B-07' | 'B-08'
  | 'B-09' | 'B-10' | 'B-11' | 'B-12' | 'B-13' | 'B-14'
  // CAT-C Content Format
  | 'C-01' | 'C-02' | 'C-03' | 'C-04' | 'C-05' | 'C-06' | 'C-07' | 'C-08'
  | 'C-09' | 'C-10' | 'C-11' | 'C-12'
  // CAT-D Cinematic Style
  | 'D-01' | 'D-02' | 'D-03' | 'D-04' | 'D-05' | 'D-06' | 'D-07' | 'D-08'
  // CAT-E Narrative Mode
  | 'E-01' | 'E-02' | 'E-03' | 'E-04' | 'E-05' | 'E-06'
  // CAT-F Production Mode
  | 'F-01' | 'F-02' | 'F-03' | 'F-04'
  // CAT-G Special Purpose
  | 'G-01' | 'G-02';

// ─── Sub-Profile Modifiers ───────────────────────────────────────

export type ModifierId =
  | 'PLATFORM-YT' | 'PLATFORM-IG-REEL' | 'PLATFORM-TIKTOK' | 'PLATFORM-LI'
  | 'PLATFORM-AD-15' | 'PLATFORM-AD-30' | 'PLATFORM-AD-60'
  | 'TONE-PREMIUM' | 'TONE-URGENT' | 'TONE-EMOTIONAL' | 'TONE-COMEDIC'
  | 'DUR-SHORT' | 'DUR-LONG';

// ─── Core Types ──────────────────────────────────────────────────

export interface EditProfile {
  profileId: ProfileId;
  name: string;
  description: string;
  category: ProfileCategory;

  // ─── Edit Parameters ─────────────────────────────────
  /** CSS filter preset ID */
  filterPresetId: string;
  /** Overall pacing */
  pacing: 'fast' | 'medium' | 'slow' | 'variable' | 'beat-synced';
  /** Target cuts per minute */
  cutsPerMinRange: [number, number];
  /** Default transition between scenes */
  defaultTransition: string;
  /** Caption style */
  captionStyle: 'none' | 'subtitle' | 'word-by-word' | 'karaoke' | 'fancy' | 'keyword-highlight' | 'hormozi' | 'mrbeast' | 'ali-abdaal' | 'corporate' | 'tiktok';
  /** BGM duck level (0-1) */
  bgmDuckLevel: number;
  /** Graphics density */
  graphicsDensity: 'heavy' | 'moderate' | 'minimal';
  /**
   * Transition SFX policy — controls the rule-driven transition SFX placer
   * (Director step 3.6, DIRECTOR_KNOWLEDGE_BASE.md Part 9 rules A-001/A-002).
   *
   * - 'full' (default when omitted): KB default volumes — whoosh 0.30 on
   *   dissolve/wipe, impact 0.55 on zoom-punch/flash. Use for energetic,
   *   social, brand-promotion content where transition SFX sells the motion.
   * - 'subtle': 50% volume attenuation (-6 dB). Use for cinematic, emotional,
   *   narrative content where SFX should be felt, not heard.
   * - 'off': skip transition SFX placement entirely. Use for documentary,
   *   luxury, minimalist content where silence/restraint IS the aesthetic.
   *
   * The absence of this field = 'full' (KB default). Only opinionated profiles
   * need to specify this — most inherit standard behavior.
   */
  transitionSFXPolicy?: 'full' | 'subtle' | 'off';

  // ─── Director Agent Actions ───────────────────────────
  /** Ordered tool calls the Director Agent executes */
  actions: EditProfileAction[];

  // ─── Auto-Detection ───────────────────────────────────
  /** Keywords that boost this profile's detection score */
  signalKeywords: SignalKeyword[];
}

export interface EditProfileAction {
  /** Tool name from Editron AI tools (e.g., 'add_captions', 'sync_cuts_to_beats') */
  tool: string;
  /** Pre-configured parameters for the tool */
  params: Record<string, any>;
  /** Only execute if condition is met */
  condition?: 'hasVideoOverlays' | 'hasSpeech' | 'hasVoiceover' | 'hasMultipleScenes' | 'hasBGM';
  /** Human-readable description for review UI */
  description: string;
  /** Execution order (lower = first) */
  order: number;
  /** What to do on failure */
  failBehavior: 'skip' | 'abort' | 'warn';
}

export interface SignalKeyword {
  /** The keyword or phrase to match */
  term: string;
  /** Which ThinkForge metadata field to search */
  field: 'narration' | 'visual' | 'music' | 'notes' | 'environment' | 'character' | 'mood' | 'platform' | 'contentType';
  /** How much this keyword boosts the profile's score (0-1) */
  weight: number;
}

// ─── Detection Types ─────────────────────────────────────────────

export interface DetectionResult {
  profileId: ProfileId;
  confidence: number; // 0-1
  reasoning: string[];
  suggestedModifiers: ModifierId[];
}

export interface EditorialExecutionScope {
  version: 'editorial-execution-scope-v1';
  source: 'chat-editorial-intent';
  mode: 'explicit-families-only';
  families: EditorialFamily[];
}

export interface ProjectBrief {
  /** Auto-detected profile (highest confidence) */
  detectedProfile?: DetectionResult;
  /** User-selected profile (overrides detection) */
  selectedProfileId?: ProfileId;
  /** Applied modifiers */
  modifiers: ModifierId[];
  /** User overrides on top of profile */
  overrides?: Partial<Pick<EditProfile, 'filterPresetId' | 'pacing' | 'captionStyle' | 'bgmDuckLevel' | 'graphicsDensity' | 'defaultTransition'>>;
  /** Reference video URL for style extraction */
  referenceVideoUrl?: string;
  /** Target platform */
  platform?: string;
  /** User intent / goal (e.g., "promote product", "educate", "entertain") */
  intent?: string;
  /** Tone preference */
  tone?: string;
  /** BGM mood override */
  bgmMood?: string;
  /** Creative Brief preferences (Director's Cut architecture) */
  captionStyle?: 'word_by_word' | 'sentence' | 'key_phrases' | 'none';
  transitionPreference?: 'minimal' | 'subtle' | 'dynamic' | 'energetic';
  zoomBehavior?: 'none' | 'subtle' | 'moderate' | 'aggressive';
  motionGraphics?: 'none' | 'stats_only' | 'full';
  pacingFeel?: 'calm' | 'balanced' | 'energetic' | 'fast';
  musicPreference?: 'none' | 'subtle_bed' | 'energetic' | 'match_video';
  /** User policy for family authority. Exact form/timing stays resolver-owned. */
  editorialPreferences?: EditorialPreferences;
  /** Internal transaction boundary for a family-specific chat edit. */
  executionScope?: EditorialExecutionScope;
}

export interface DirectorResult {
  success: boolean;
  profileId: ProfileId;
  /**
   * The last ProjectService receipt issued by a successful Director run.
   * The automatic worker must bind lifecycle completion to this exact receipt
   * instead of reconstructing a revision from stale route-local state.
   */
  terminalProjectReceipt?: ProjectMutationReceiptV1;
  /** Durable async children created by this exact Director run. */
  pendingAsyncChildJobIds?: string[];
  decisionAuthority?: {
    version: 'decision-authority-v1';
    source: 'unified-decision-bundle' | 'fallback-reactive' | 'profile-driven';
    decisionMode?: 'creative-brief-primary' | 'signal-primary' | 'merged-supplemental' | 'unified-planner' | 'profile';
    executableProducer: 'creative-brief' | 'signal-driven' | 'unified-planner' | 'profile';
    advisoryProducers: Array<'creative-brief' | 'signal-driven' | 'profile'>;
    signalDecisionRole: 'none' | 'primary' | 'advisor' | 'co-owner';
    signalDecisionsCanAddExecutable: boolean;
    primaryDecisionCount: number;
    signalDecisionCount: number;
    addedSignalDecisionCount: number;
    validatedDecisionCount: number;
    suppressedSignalDuplicateCount: number;
    evidenceOnlySignalDecisionCount: number;
    totalDecisions: number;
    executedDecisions: number;
    executionScope?: EditorialExecutionScope;
    signalAudit?: {
      version: 'signal-decision-audit-summary-v1';
      totalCount: number;
      outcomes: Record<string, number>;
      byType: Record<string, number>;
      byFamily: Record<string, number>;
      byReason: Record<string, number>;
      candidateCount: number;
      sampleCount: number;
    };
  };
  actionsExecuted: number;
  actionsSkipped: Array<{ action: string; reason: string }>;
  overlaysModified: number;
  checkpointId: string;
  executionMs: number;
  warnings: string[];
  pipelineWarnings?: Array<{ severity: string; phase: string; message: string; details?: Record<string, any>; timestamp: number; autoFixed?: boolean; autoFixDescription?: string }>;
  qualityGate?: {
    totalActions: number;
    passedActions: number;
    failedActions: number;
    totalDegradations: number;
    criticalDegradations: number;
    overallTrend: 'improving' | 'stable' | 'degrading';
  };
}
