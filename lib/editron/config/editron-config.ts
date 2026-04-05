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

// Models known to work with the Google generativelanguage.googleapis.com API.
// Both Gemini and Gemma 4 models use the same endpoint + SDK.
const VALID_GOOGLE_AI_MODELS = [
  'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro',
  'gemini-3.1-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro',
  'gemma-4-31b-it', 'gemma-4-26b-a4b-it',
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
  /** Model for 5-Track analysis — LOCKED to gemini-2.5-flash (uses Files API) */
  analysisModel: string;
  /** Temperature for editing decisions */
  editingTemperature: number;
  /** Temperature for scene parsing */
  parsingTemperature: number;
}

// ─── The Full Config ───────────────────────────────────────────────

export interface EditronConfig {
  timing: TimingConfig;
  analysis: AnalysisConfig;
  budgets: EditingBudgets;
  editing: EditingParams;
  visual: VisualConfig;
  audio: AudioConfig;
  music: MusicConfig;
  aiModels: AIModelConfig;
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
    maxPunchZooms: 5,
    maxCameraShakes: 4,
    maxKeywordGraphics: 8,
    maxCaptionEmphases: 12,
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
    // Default: gemini-3.1-flash (latest). Gemma 4 testable via env vars.
    // Analysis model LOCKED — uses Gemini Files API for video upload, unverified with Gemma.
    sceneParserModel: validateModel(process.env.LLM_PARSER_MODEL || 'gemini-3.1-flash', 'gemini-3.1-flash'),
    montageDetectionModel: validateModel(process.env.LLM_MONTAGE_MODEL || 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite'),
    subjectExtractionModel: validateModel(process.env.LLM_SUBJECT_MODEL || 'gemini-3.1-flash', 'gemini-3.1-flash'),
    referencePromptModel: validateModel(process.env.LLM_REFERENCE_MODEL || 'gemini-3.1-flash', 'gemini-3.1-flash'),
    unifiedIntelligenceModel: validateModel(process.env.LLM_INTELLIGENCE_MODEL || 'gemini-3.1-flash', 'gemini-3.1-flash'),
    analysisModel: 'gemini-2.5-flash', // LOCKED — Files API dependency
    editingTemperature: 0.3,
    parsingTemperature: 0.3,
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
