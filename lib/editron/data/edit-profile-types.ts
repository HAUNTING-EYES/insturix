/**
 * Edit Profile Type Definitions
 *
 * Core types for the 54-profile auto-editing system.
 * Profiles are deterministic editing programs — not style guides.
 * Each profile defines exactly what the Director Agent executes.
 */

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
  /** Pacing multiplier (1.0 = normal, 0.7 = fast, 1.4 = slow) */
  pacingMultiplier: number;
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
  /** Tone preference */
  tone?: string;
  /** BGM mood override */
  bgmMood?: string;
}

export interface DirectorResult {
  success: boolean;
  profileId: ProfileId;
  actionsExecuted: number;
  actionsSkipped: Array<{ action: string; reason: string }>;
  overlaysModified: number;
  checkpointId: string;
  executionMs: number;
  warnings: string[];
}
