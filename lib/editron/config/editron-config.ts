/**
 * Editron Centralized Configuration
 *
 * EVERY configurable value in the Editron pipeline lives here.
 * Replaces 100+ hardcoded values scattered across services.
 *
 * Resolution order: userOverrides > profileSettings > defaults
 *
 * To find what WAS hardcoded and WHERE, each value has a comment
 * with the original file and line number.
 *
 * Rule 11N: All values must work across the full range of B2B content.
 * Rule 12N: Use proper types, not `as any`.
 */

import type { EditProfile } from '@/lib/editron/data/edit-profile-types';

// ─── Timing & Frame Constants ──────────────────────────────────────

export interface TimingConfig {
  /** Project frame rate. Was: hardcoded `30` in 15+ files */
  fps: number;
  /** Minimum overlay/segment duration in frames. Was: `45` in director-agent.ts:558 */
  minSegmentFrames: number;
  /** Maximum sub-shot duration for montage in frames. Was: `90` in finalize/route.ts */
  maxMontageSubShotFrames: number;
  /** 5-Track analysis timeout in ms. Was: `120_000` in five-track-analysis.ts:939 */
  analysisTimeoutMs: number;
  /** Remotion Lambda render timeout in ms. Was: `600_000` in chapter-renderer.ts:253 */
  renderTimeoutMs: number;
  /** fal.ai per-call timeout in ms. Was: `60_000` in storyboard-service.ts:83 */
  falCallTimeoutMs: number;
  /** BGM fade-out duration in frames. Was: `30` in constants/audio-standards.ts:52 */
  bgmFadeOutFrames: number;
}

// ─── Analysis Thresholds ───────────────────────────────────────────

export interface AnalysisConfig {
  /** How many keyframes to analyze per second of video. Was: hardcoded 3 total, now 1/sec */
  keyframesPerSecond: number;
  /** Minimum confidence to trust analysis data. Was: `0.5` in edl-executor.ts:66 */
  minConfidenceForDecisions: number;
  /** Energy level that constitutes a music "drop". Was: `0.7` in five-track-analysis.ts:800 */
  energyDropThreshold: number;
  /** Energy level for music "breakdown". Was: `0.3` in five-track-analysis.ts:806 */
  energyBreakdownThreshold: number;
  /** Motion intensity that constitutes "significant motion". Was: `0.1` in auto-post-processing.ts:166 */
  significantMotionThreshold: number;
  /** Motion intensity that constitutes a "peak". Was: `0.4` in unified-edit-intelligence.ts:257 */
  motionPeakThreshold: number;
  /** Window for merging compound anchors, in ms (fps-independent). Was: 5 frames (~167ms at 30fps) */
  anchorMergeWindowMs: number;
  /** Voiceover-to-video matching overlap requirement. Was: ±15 frames in unified-edit-intelligence.ts:182 */
  voiceoverMatchMode: 'overlap' | 'proximity';
  /** Analysis cache version — bump when analysis logic changes to invalidate old cache */
  analysisVersion: number;
}

// ─── Editing Decision Budgets ──────────────────────────────────────

export interface EditingBudgets {
  /** Max punch-in zooms (scale ≥ 1.10) per video. Was: `3 * totalSec / 30` in prompt */
  maxPunchZooms: number;
  /** Max camera shakes per video. Was: `4 * totalSec / 30` in prompt */
  maxCameraShakes: number;
  /** Max keyword graphics per video. Was: `7 * totalSec / 30` in prompt */
  maxKeywordGraphics: number;
  /** Max caption emphases per video. Was: `10 * totalSec / 30` in prompt */
  maxCaptionEmphases: number;
  /** Maximum edit decisions per second of video. Was: `0.6-1.0` in prompt */
  maxDecisionsPerSecond: number;
  /** Minimum frames between keyword graphics. Was: `90` in decision-budget.ts:101 */
  minGraphicGapFrames: number;
  /** Minimum frames between same-type decisions. Was: `10` in reactive-edit-engine dedup */
  minDecisionGapFrames: number;
}

// ─── Editing Parameters ────────────────────────────────────────────

export interface EditingParams {
  /** Zoom scale range [min, max]. Was: unconstrained in edl-executor.ts */
  zoomScaleRange: [number, number];
  /** Speed multiplier range [min, max]. Was: unconstrained in edl-executor.ts */
  speedRange: [number, number];
  /** Camera shake intensity range [min, max]. Was: unconstrained */
  shakeIntensityRange: [number, number];
  /** Camera shake max duration in frames. Was: `15` in edl-executor.ts:192 */
  shakeMaxDurationFrames: number;
  /** Camera shake offset as fraction of canvas width. Was: `0.01` in edl-executor.ts:197 */
  shakeCanvasOffsetFraction: number;
  /** Drift zoom amount for static images. Was: `0.03` in auto-post-processing.ts:187 */
  driftZoomAmount: number;
  /** Drift zoom amount for logo/text overlays. Was: `0.01` in auto-post-processing.ts:187 */
  driftZoomLogoAmount: number;
  /** Transition tolerance: max frames from clip boundary. Was: ±15 in edl-executor.ts:228 */
  transitionBoundaryToleranceFrames: number;
  /** Duration variety: same-duration threshold in seconds. Was: `0.5` in auto-post-processing.ts:344 */
  durationVarietyThresholdSec: number;
  /** Duration variety: adjustment amount in seconds. Was: `1.5` in auto-post-processing.ts:346 */
  durationVarietyAdjustmentSec: number;
}

// ─── Visual / Graphics ─────────────────────────────────────────────

export interface VisualConfig {
  /** Reading speed in characters per second (research: 12-15 CPS). Source: PMC/Nimdzi studies */
  readingSpeedCPS: number;
  /** Maximum freeze-frame duration in ms. Research: attention drops after 4s */
  maxFreezeMs: number;
  /** Minimum freeze-frame duration in ms. Must be noticeable */
  minFreezeMs: number;
  /** Graphic animation base durations in ms, per type. From actual CSS @keyframes in edl-executor.ts */
  graphicAnimationDurations: Record<string, number>;
  /** Graphic display durations in frames, per type. Was: hardcoded in GRAPHIC_DURATIONS */
  graphicDisplayFrames: Record<string, number>;
  /** Screen zone definitions (fraction of canvas height/width) */
  screenZones: {
    topZoneHeight: number;      // Was: 0.20
    centerZoneHeight: number;   // Was: 0.40
    bottomZoneHeight: number;   // Was: 0.20
    sideZoneWidth: number;      // Was: 0.15
    safeMarginFraction: number; // Was: 0.05
    safeMarginPortrait: number; // Was: 0.06
    /** Caption zone top position (landscape). Below this = caption zone. */
    captionZoneTopLandscape: number;
    /** Caption zone top position (portrait). */
    captionZoneTopPortrait: number;
    /** Minimum graphic area as fraction of canvas to justify freeze-frame */
    minGraphicAreaRatio: number;
  };
}

// ─── Audio ─────────────────────────────────────────────────────────

export interface AudioConfig {
  /** BGM ducking level under voiceover (0-1). Was: `0.20` default, profile-overridable */
  duckLevel: number;
  /** Ramp-down time in ms when ducking starts. Was: `300` */
  rampDownMs: number;
  /** Ramp-up time in ms when ducking ends. Was: `600` */
  rampUpMs: number;
  /** Look-ahead time in ms (pre-ducking). Was: `200` */
  lookAheadMs: number;
  /** Default BGM volume (0-1). Was: `0.75` in audio worker */
  defaultBgmVolume: number;
  /** Default SFX volume (0-1). Was: `0.3` in audio worker */
  defaultSfxVolume: number;
}

// ─── Music Section Prescriptions ───────────────────────────────────

export interface MusicSectionRule {
  /** Recommended cut frequency in seconds. How often to cut during this section */
  cutFrequencySec: number;
  /** Default transition type for this section */
  transitionType: string;
  /** Allowed effects during this section */
  allowedEffects: string[];
}

export interface MusicConfig {
  /** Beat sync mode. Was: from profile but not consumed */
  beatSyncMode: 'none' | 'downbeats' | 'all';
  /** Min BPM for beat detection. Was: `40` in beat-detection-service.ts */
  minBPM: number;
  /** Max BPM for beat detection. Was: `240` in beat-detection-service.ts */
  maxBPM: number;
  /** Section rules — MUST be genre-aware, not one-size-fits-all */
  sectionRules: Record<string, MusicSectionRule>;
}

// ─── AI Models ─────────────────────────────────────────────────────

// Models verified working on Google generativelanguage.googleapis.com API.
// VERIFIED 2026-05-16: gemini-3.1-flash and gemini-3.1-pro DO NOT EXIST (404).
// Only -preview suffix variants are valid for the 3.1 family.
const VALID_GOOGLE_AI_MODELS = [
  'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro',
];

/** Validate a model ID and fallback to default if invalid.
 *  Prevents cryptic SDK errors from typos in env vars. */
function validateModel(model: string, fallback: string): string {
  if (VALID_GOOGLE_AI_MODELS.includes(model)) return model;
  console.warn(`[EditronConfig] Invalid model "${model}". Falling back to "${fallback}". Valid: ${VALID_GOOGLE_AI_MODELS.join(', ')}`);
  return fallback;
}

export interface AIModelConfig {
  /** Model for scene parsing (env: LLM_PARSER_MODEL) */
  sceneParserModel: string;
  /** Model for montage detection (env: LLM_MONTAGE_MODEL) */
  montageDetectionModel: string;
  /** Model for subject extraction (env: LLM_SUBJECT_MODEL) */
  subjectExtractionModel: string;
  /** Model for reference prompt refinement (env: LLM_REFERENCE_MODEL) */
  referencePromptModel: string;
  /** Model for unified intelligence (env: LLM_INTELLIGENCE_MODEL) */
  unifiedIntelligenceModel: string;
  /** Model for 5-Track analysis (uses Files API for real footage) */
  analysisModel: string;
  /** Temperature for editing decisions */
  editingTemperature: number;
  /** Temperature for scene parsing */
  parsingTemperature: number;
}

// ─── Profile Detection ─────────────────────────────────────────────
//
// Scoring math + thresholds for profile-detection-service.ts. Centralized
// here (Rule A6 — one source of truth) so scoring behavior can be tuned
// in ONE place without touching scoring code.
//
// CRITICAL BUG FIXED 2026-04-17 (see pipeline_investigations.md):
// Previous scoring divided raw score by EACH profile's own maxPossible
// (sum of its keyword weights). This PENALIZED profiles with rich keyword
// vocabularies — a profile with 4 keywords totaling 1.1 max could beat a
// profile with 16 keywords totaling 5.2 max even with fewer actual matches,
// because percentage-based scoring favors sparse profiles.
// Concrete bug: Nike athletic script detected as "E-Commerce / Product
// Launch" (B-02, 4 keywords) instead of "Athletic" (B-05, 16 keywords)
// because B-02 scored 0.55 (2 matches / 4 keywords) vs B-05 0.38 (5
// matches / 16 keywords) — despite B-05 having 5x more actual evidence.
//
// NEW APPROACH: normalize by a FIXED target score instead of per-profile
// max. Absolute match strength wins. Profile can't game the scoring by
// having fewer keywords.

export interface ProfileDetectionConfig {
  /**
   * Fixed divisor for normalizing raw keyword-match scores into the 0-1
   * confidence range. Represents the "strong match" target score.
   *
   * Mathematical interpretation: 2.5 is roughly the sum of weights when
   * 5 medium-weight keywords (0.5) match, or 3 strong keywords (0.8)
   * match, or 7 light keywords (0.35) match. Any combination summing to
   * 2.5+ rounds to confidence 1.0 (auto-select).
   *
   * Tuning guide:
   *   - Lower (e.g., 2.0): easier auto-select — more profiles reach 0.60+
   *   - Higher (e.g., 3.0): harder auto-select — fewer auto-matches, more
   *     falls to G-01 Universal Clean fallback
   *
   * Empirical validation (Nike test 2026-04-17):
   *   B-05 Athletic score 2.0 / 2.5 = 0.80 → auto-select ✓
   *   B-02 Product Launch score 0.6 / 2.5 = 0.24 → falls to suggest tier ✓
   */
  scoreNormalizationTarget: number;

  /**
   * Minimum raw score for a profile to appear in detection results.
   * Prevents zero-match and trivial-match profiles from cluttering output.
   * Was previously hardcoded as `confidence < 0.05` in detectProfile().
   */
  minConfidenceThreshold: number;

  /**
   * Confidence threshold at which detected profile is auto-selected
   * without user review. Above this, the system trusts its own detection.
   * Was hardcoded as `0.60` in getAutoSelectedProfile().
   */
  autoSelectConfidence: number;

  /**
   * Confidence threshold below which detection falls back to G-01
   * Universal Clean and flags the project for manual profile review.
   * Was hardcoded as `0.40` in getAutoSelectedProfile().
   */
  fallbackConfidence: number;
}

// ─── Raw Footage Processing (Mode 2) ─────────────────────────────

export interface RawFootageConfig {
  /** Minimum segment duration after cuts, in SECONDS (computed to frames at runtime via clip fps).
   * NOT hardcoded frames — user footage can be 24fps, 29.97fps, 30fps, 60fps. */
  minSegmentAfterCutSeconds: number;
  /** Silence removal thresholds by content type (from creative doc v2 §3).
   * Each entry: { removeAboveMs, shortenRangeMs: [min, max], shortenTargetMs } */
  silenceThresholdByContentType: Record<string, {
    removeAboveMs: number;
    shortenRangeMs: [number, number];
    shortenTargetMs: number;
  }>;
  /** Filler removal mode. 'all-above-threshold' removes all fillers when rate exceeds threshold.
   * 'boundary-only' only removes fillers at segment boundaries. */
  fillerRemovalMode: 'all-above-threshold' | 'boundary-only';
  /** Filler rate above this triggers "casual" content detection + aggressive filler removal. */
  casualFillerRateThreshold: number;
  /** Transcript coverage above this indicates "speech-heavy" content. */
  speechHeavyCoverageThreshold: number;
  /** Segment boundary pause threshold in ms. Pauses longer than this start a new segment. */
  segmentPauseThresholdMs: number;
  /** Best-take detection: Jaccard similarity threshold for "repeated phrase" detection. */
  bestTakeJaccardThreshold: number;
}

// ─── The Full Config ───────────────────────────────────────────────

export interface FeatureFlags {
  useCompositionEngine?: boolean;
}

export interface EditronConfig {
  timing: TimingConfig;
  analysis: AnalysisConfig;
  budgets: EditingBudgets;
  editing: EditingParams;
  visual: VisualConfig;
  audio: AudioConfig;
  music: MusicConfig;
  aiModels: AIModelConfig;
  profileDetection: ProfileDetectionConfig;
  rawFootage: RawFootageConfig;
  features?: FeatureFlags;
}

// ─── Default Values ────────────────────────────────────────────────

export const DEFAULT_CONFIG: EditronConfig = {
  timing: {
    fps: 30,
    minSegmentFrames: 45,
    maxMontageSubShotFrames: 90,
    analysisTimeoutMs: 120_000,
    renderTimeoutMs: 600_000,
    falCallTimeoutMs: 60_000,
    bgmFadeOutFrames: 30,
  },
  analysis: {
    keyframesPerSecond: 1,
    minConfidenceForDecisions: 0.5,
    energyDropThreshold: 0.7,
    energyBreakdownThreshold: 0.3,
    significantMotionThreshold: 0.1,
    motionPeakThreshold: 0.4,
    anchorMergeWindowMs: 167,
    voiceoverMatchMode: 'overlap',
    analysisVersion: 2,
  },
  budgets: {
    // Values aligned to production code (decision-budget.ts) — code is tested, these are correct.
    maxPunchZooms: 3,        // Was 5 in config, 3 in production code
    maxCameraShakes: 4,
    maxKeywordGraphics: 7,   // Was 8 in config, 7 in production code
    maxCaptionEmphases: 10,  // Was 12 in config, 10 in production code
    maxDecisionsPerSecond: 0.8,
    minGraphicGapFrames: 90,
    minDecisionGapFrames: 10,
  },
  editing: {
    zoomScaleRange: [0.85, 1.20],
    speedRange: [0.25, 2.0],
    shakeIntensityRange: [0.05, 0.8],
    shakeMaxDurationFrames: 15,
    shakeCanvasOffsetFraction: 0.01,
    driftZoomAmount: 0.03,
    driftZoomLogoAmount: 0.01,
    transitionBoundaryToleranceFrames: 5,
    durationVarietyThresholdSec: 0.5,
    durationVarietyAdjustmentSec: 1.5,
  },
  visual: {
    readingSpeedCPS: 13,
    maxFreezeMs: 4000,
    minFreezeMs: 500,
    graphicAnimationDurations: {
      'stat-counter': 500,
      'keyword-highlight': 300,
      'logo-reveal': 1200,
      'quote-card': 500,
      'lower-third': 400,
      'callout': 350,
      'emphasis-text': 300,
    },
    graphicDisplayFrames: {
      'stat-counter': 120,
      'keyword-highlight': 60,
      'lower-third': 90,
      'quote-card': 120,
      'logo-reveal': 120,
      'callout': 75,
    },
    screenZones: {
      topZoneHeight: 0.20,
      centerZoneHeight: 0.40,
      bottomZoneHeight: 0.20,
      sideZoneWidth: 0.15,
      safeMarginFraction: 0.05,
      safeMarginPortrait: 0.06,
      captionZoneTopLandscape: 0.80,
      captionZoneTopPortrait: 0.82,
      minGraphicAreaRatio: 0.05,
    },
  },
  audio: {
    duckLevel: 0.20,
    rampDownMs: 300,
    rampUpMs: 600,
    lookAheadMs: 200,
    defaultBgmVolume: 0.75,
    defaultSfxVolume: 0.3,
  },
  music: {
    beatSyncMode: 'none',
    minBPM: 40,
    maxBPM: 240,
    sectionRules: {
      intro:     { cutFrequencySec: 4.0, transitionType: 'dissolve',    allowedEffects: [] },
      verse:     { cutFrequencySec: 3.0, transitionType: 'hard-cut',    allowedEffects: [] },
      build:     { cutFrequencySec: 1.5, transitionType: 'hard-cut',    allowedEffects: ['zoom-punch'] },
      chorus:    { cutFrequencySec: 2.0, transitionType: 'hard-cut',    allowedEffects: ['zoom-punch'] },
      drop:      { cutFrequencySec: 0.5, transitionType: 'zoom-punch',  allowedEffects: ['zoom-punch', 'glitch', 'speed-ramp'] },
      breakdown: { cutFrequencySec: 5.0, transitionType: 'dissolve',    allowedEffects: ['slow-motion'] },
      bridge:    { cutFrequencySec: 3.0, transitionType: 'soft-cut',    allowedEffects: [] },
      outro:     { cutFrequencySec: 5.0, transitionType: 'dissolve',    allowedEffects: ['pull-back'] },
    },
  },
  aiModels: {
    // Env var overrides validated against VALID_GOOGLE_AI_MODELS.
    //
    // Model hierarchy:
    //   Gemma 4 (31B)       — Parsing + analysis (FREE on AI Studio, 256K context, native vision)
    //   Gemini 2.5 Flash    — Intelligence, scoring, chat, and backup fallback
    //
    // Analysis model uses withAnalysisFallback() in gemini-model-factory.ts:
    // tries Gemma 4 first, falls back to gemini-2.5-flash ONLY on model-incompatibility errors.
    // Model hierarchy:
    //   gemini-2.5-flash               — Parser, subjects, reference prompts (GOOD at following complex multi-rule prompts)
    //   gemini-3.1-flash-lite-preview  — Montage detection only (simple single-task prompts)
    //   gemini-3.1-pro-preview         — Edit decisions / Unified Intelligence (best reasoning, 300s budget)
    //   gemma-4-31b-it                 — Vision analysis (FREE, native video/image understanding)
    //
    // HOTFIX HISTORY:
    //   e4943987: reverted sceneParserModel from gemini-3.1-pro-preview to gemini-2.5-flash (pro was too slow, 504)
    //   f0318616: switched to gemini-3.1-flash-lite-preview (even faster)
    //   d3d295d0: added AbortSignal.timeout(90s) because flash-lite was also timing out on large scripts
    //
    // BUNDLE 3 (2026-04-08): flash-lite was IGNORING the Bundle 2 parser prompt rules
    //   (independentGeneration, onScreenText, literal shot counts). Diagnosed via McDonald's
    //   proj_r8E_z9WVaBX9 — all 13 sub-shots had independentGeneration:false despite explicit
    //   Mode B examples in the prompt. Flash-lite is too small to reliably follow ~18K-char
    //   multi-rule prompts. Moving to gemini-2.5-flash: ~3x cost vs flash-lite but significantly
    //   better instruction-following. Still well within the 90s abort cap on typical scripts.
    //   subjectExtractionModel stays on 2.5-flash for the same reason (structured output reliability).
    //   montageDetectionModel stays on flash-lite because it's a narrower task (simpler prompt).
    sceneParserModel: validateModel(process.env.LLM_PARSER_MODEL || 'gemini-2.5-flash', 'gemini-2.5-flash'),
    montageDetectionModel: validateModel(process.env.LLM_MONTAGE_MODEL || 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash'),
    subjectExtractionModel: validateModel(process.env.LLM_SUBJECT_MODEL || 'gemini-2.5-flash', 'gemini-2.5-flash'),
    referencePromptModel: validateModel(process.env.LLM_REFERENCE_MODEL || 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash'),
    unifiedIntelligenceModel: validateModel(process.env.LLM_INTELLIGENCE_MODEL || 'gemini-3.1-pro-preview', 'gemini-2.5-flash'),
    // REVERTED 2026-05-15: gemini-3.1-flash / gemini-3.1-pro are NOT valid model IDs.
    // Google API returns 404: "models/gemini-3.1-pro is not found for API version v1beta".
    // The -preview suffix IS required. Keeping verified-working models.
    analysisModel: validateModel(process.env.LLM_ANALYSIS_MODEL || 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash'),
    editingTemperature: 0.3,
    parsingTemperature: 0.3,
  },
  profileDetection: {
    // See ProfileDetectionConfig interface above for full rationale.
    // 2.5 = "strong match target" (5 medium-weight keyword matches or equivalent).
    // Validated against Nike test 2026-04-17: B-05 Athletic (16 keywords) now
    // beats B-02 Product Launch (4 keywords) as intended.
    scoreNormalizationTarget: 2.5,
    // Below this raw score, profile is excluded from results. Previously hardcoded
    // as `confidence < 0.05` (post-normalization check) which was inconsistent across
    // profiles because the normalization itself varied by profile. Now applied
    // consistently as a raw-score threshold.
    minConfidenceThreshold: 0.05,
    // Auto-select threshold — detected profile accepted without user review.
    autoSelectConfidence: 0.60,
    // Fall-back threshold — below this, G-01 Universal Clean is used + project flagged
    // for manual profile review in UI.
    fallbackConfidence: 0.40,
  },
  rawFootage: {
    minSegmentAfterCutSeconds: 1.5,
    silenceThresholdByContentType: {
      'talking-head':  { removeAboveMs: 1500, shortenRangeMs: [800, 1500],  shortenTargetMs: 300  },
      'tutorial':      { removeAboveMs: 1500, shortenRangeMs: [800, 1500],  shortenTargetMs: 300  },
      'vlog':          { removeAboveMs: 1200, shortenRangeMs: [600, 1200],  shortenTargetMs: 250  },
      'interview':     { removeAboveMs: 2500, shortenRangeMs: [1000, 2500], shortenTargetMs: 500  },
      'documentary':   { removeAboveMs: 4000, shortenRangeMs: [2000, 4000], shortenTargetMs: 800  },
      'comedy':        { removeAboveMs: 6000, shortenRangeMs: [3000, 6000], shortenTargetMs: 1500 },
      'cinematic':     { removeAboveMs: 4000, shortenRangeMs: [2000, 4000], shortenTargetMs: 800  },
      'ad':            { removeAboveMs: 1000, shortenRangeMs: [500, 1000],  shortenTargetMs: 200  },
      'product-demo':  { removeAboveMs: 1000, shortenRangeMs: [500, 1000],  shortenTargetMs: 200  },
      'corporate':     { removeAboveMs: 2000, shortenRangeMs: [800, 2000],  shortenTargetMs: 400  },
    },
    fillerRemovalMode: 'all-above-threshold',
    casualFillerRateThreshold: 0.05,
    speechHeavyCoverageThreshold: 0.80,
    segmentPauseThresholdMs: 1000,
    bestTakeJaccardThreshold: 0.6,
  },
  features: {
    useCompositionEngine: true,
  },
};

// ─── Config Builder ────────────────────────────────────────────────

/**
 * Build a complete EditronConfig by merging:
 * 1. DEFAULT_CONFIG (baseline)
 * 2. Profile settings (from the edit profile)
 * 3. User overrides (from export dialog brief)
 *
 * Profile settings take precedence over defaults.
 * User overrides take precedence over everything.
 */
export function buildEditronConfig(
  project: { fps?: number; durationInFrames?: number },
  profile?: EditProfile,
  userOverrides?: Partial<EditronConfig>,
): EditronConfig {
  // Start with defaults
  const config: EditronConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  // Apply project settings
  if (project.fps) config.timing.fps = project.fps;

  // Apply profile settings
  if (profile) {
    // Audio
    if (profile.bgmDuckLevel !== undefined) config.audio.duckLevel = profile.bgmDuckLevel;

    // Budgets — derive from profile's cutsPerMinRange
    if (profile.cutsPerMinRange) {
      const avgCPM = (profile.cutsPerMinRange[0] + profile.cutsPerMinRange[1]) / 2;
      config.budgets.maxDecisionsPerSecond = avgCPM / 60;
    }

    // Music
    // Profile beatSync setting (if the action exists in profile)
    const hasBeatSync = profile.actions?.some(a => a.tool === 'sync_cuts_to_beats');
    if (hasBeatSync) {
      const beatAction = profile.actions.find(a => a.tool === 'sync_cuts_to_beats');
      config.music.beatSyncMode = beatAction?.params?.beatFilter === 'all' ? 'all' : 'downbeats';
    }

    // Pacing → adjust budgets
    if (profile.pacing === 'fast') {
      config.budgets.maxPunchZooms = Math.ceil(config.budgets.maxPunchZooms * 1.5);
      config.budgets.maxCameraShakes = Math.ceil(config.budgets.maxCameraShakes * 1.5);
    } else if (profile.pacing === 'slow') {
      config.budgets.maxPunchZooms = Math.ceil(config.budgets.maxPunchZooms * 0.5);
      config.budgets.maxCameraShakes = Math.ceil(config.budgets.maxCameraShakes * 0.5);
    }
  }

  // Apply user overrides (deep merge)
  if (userOverrides) {
    deepMerge(config, userOverrides);
  }

  return config;
}

/** Deep merge source into target (mutates target) */
function deepMerge(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}

// ─── Utility: Calculate read time from research data ───────────────

/**
 * Calculate how long a graphic should freeze the video, based on:
 * 1. CSS animation entrance duration (from graphicAnimationDurations)
 * 2. Text reading time (characters / readingSpeedCPS)
 * 3. Bounds: minFreezeMs to maxFreezeMs
 *
 * Research source: PMC subtitle reading studies (12-15 CPS optimal)
 * NOT hardcoded guesses.
 */
export function calculateFreezeTimeMs(
  text: string,
  graphicType: string,
  config: EditronConfig = DEFAULT_CONFIG,
): number {
  const charCount = text.length;
  const readTimeMs = (charCount / config.visual.readingSpeedCPS) * 1000;
  const animTimeMs = config.visual.graphicAnimationDurations[graphicType] || 400;
  const total = animTimeMs + readTimeMs;
  return Math.max(config.visual.minFreezeMs, Math.min(config.visual.maxFreezeMs, total));
}

/**
 * Calculate how long a graphic should be displayed (not just freeze, but total on-screen time).
 * This is freeze time + extra linger time for the viewer to absorb.
 */
export function calculateGraphicDisplayFrames(
  text: string,
  graphicType: string,
  config: EditronConfig = DEFAULT_CONFIG,
): number {
  const freezeMs = calculateFreezeTimeMs(text, graphicType, config);
  // Add 50% extra time for lingering (video resumes but graphic stays visible)
  const totalMs = freezeMs * 1.5;
  return Math.round((totalMs / 1000) * config.timing.fps);
}
