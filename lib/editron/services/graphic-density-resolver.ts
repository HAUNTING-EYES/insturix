/**
 * Signal-Driven Graphic Density Resolver (v3)
 *
 * Computes how many graphics a video should have from content signals,
 * replacing static profile-based density ("moderate" = 5).
 *
 * Architecture:
 *   resolveGraphicBudget(signals) → graphicsPerMinute (0-8)
 *   scoreOnScreenTextEntries(entries, context) → ranked list with confidence
 *
 * v2 behavior preserved: entityRate × 0.5 + formality reduction.
 * v3 adds new signal terms with v0 coefficients (initially zero = no regression).
 * Calibrate against real creator videos before adjusting coefficients.
 *
 * Source: memory/project_signal_driven_density_v3.md (design approved 2026-05-20)
 * CRG: intent:param.graphic_density — range 0-8, entity_count/duration + formality
 */

// ─── Input types ──────────────────────────────────────────

export interface DensitySignals {
  entityNumberCount: number;
  entityCtaCount: number;
  videoDurationSec: number;
  formality: number;              // 0-1
  speechCoverage: number;         // 0-1, fraction of video with speech
  motionIntensityAvg: number;     // 0-1, average motion across video
  hasFacePresent: boolean;
  topicBoundaryCount: number;
  speechEnergyAvg: number;        // 0-1
}

export interface OnScreenTextEntry {
  text: string;
  sceneIndex: number;
  sourceType: 'script' | 'transcript' | 'brief';
  triggerMoment?: string;
}

export interface ScoredEntry {
  entry: OnScreenTextEntry;
  confidence: number;
  reasons: string[];
}

export interface DensityContext {
  totalScenes: number;
  sceneDurationsSec: number[];
  sceneEnergyLevels?: number[];
  topicBoundaryIndices?: number[];
}

// ─── Budget resolver ──────────────────────────────────────

const V2_ENTITY_RATE_COEFF = 0.5;        // ← genre-parameter-computer.ts:130
const V2_FORMALITY_THRESHOLD = 0.7;       // ← genre-parameter-computer.ts:132 + CRG
const V2_FORMALITY_REDUCTION = 0.6;       // ← genre-parameter-computer.ts:132 (multiply by 0.6)

// v3 coefficients — v0 values set to match v2 output (no regression).
// All new-signal terms start at 0. Calibrate against reference videos.
const V3_SPEECH_COVERAGE_COEFF = 0;       // ⚠️ v0 — needs calibration. Expected direction: positive (more speech = more info = more graphic opportunities)
const V3_MOTION_INTENSITY_COEFF = 0;      // ⚠️ v0 — needs calibration. Expected direction: negative (high motion = hard to read overlays)
const V3_FACE_PRESENT_PENALTY = 0;        // ⚠️ v0 — needs calibration. Expected direction: negative (face = talking head = fewer distracting overlays)
const V3_TOPIC_BOUNDARY_COEFF = 0;        // ⚠️ v0 — needs calibration. Expected direction: positive (more topics = more graphic opportunities)
const V3_SPEECH_ENERGY_COEFF = 0;         // ⚠️ v0 — needs calibration. Expected direction: positive (higher energy = more emphasis points)

const MIN_BUDGET = 1;                     // Floor: at least 1 graphic for any video with content
const MAX_GRAPHICS_PER_MIN = 8;           // CRG: intent:param.graphic_density range 0-8

export function resolveGraphicBudget(signals: DensitySignals): {
  graphicsPerMinute: number;
  totalBudget: number;
  densityLabel: 'minimal' | 'moderate' | 'heavy';
  debugBreakdown: Record<string, number>;
} {
  const durationMin = Math.max(0.5, signals.videoDurationSec / 60);

  // v2 base: entity rate × coefficient
  const entityRate = (signals.entityNumberCount + signals.entityCtaCount) / durationMin;
  let graphicsPerMin = entityRate * V2_ENTITY_RATE_COEFF;

  // v2: formality reduction
  if (signals.formality > V2_FORMALITY_THRESHOLD) {
    graphicsPerMin *= V2_FORMALITY_REDUCTION;
  }

  // v3 signal adjustments (all zero in v0 — no regression)
  const speechAdj = signals.speechCoverage * V3_SPEECH_COVERAGE_COEFF;
  const motionAdj = signals.motionIntensityAvg * V3_MOTION_INTENSITY_COEFF;
  const faceAdj = signals.hasFacePresent ? V3_FACE_PRESENT_PENALTY : 0;
  const topicAdj = (signals.topicBoundaryCount / durationMin) * V3_TOPIC_BOUNDARY_COEFF;
  const energyAdj = signals.speechEnergyAvg * V3_SPEECH_ENERGY_COEFF;

  graphicsPerMin += speechAdj + motionAdj + faceAdj + topicAdj + energyAdj;
  graphicsPerMin = Math.max(0, Math.min(MAX_GRAPHICS_PER_MIN, graphicsPerMin));

  const totalBudget = Math.max(MIN_BUDGET, Math.round(graphicsPerMin * durationMin));

  const densityLabel: 'minimal' | 'moderate' | 'heavy' =
    graphicsPerMin <= 1.5 ? 'minimal'
    : graphicsPerMin <= 4 ? 'moderate'
    : 'heavy';

  console.log(`[DensityResolver] Budget: ${totalBudget} graphics (${graphicsPerMin.toFixed(1)}/min, ${densityLabel}) for ${durationMin.toFixed(1)}min video`);

  return {
    graphicsPerMinute: graphicsPerMin,
    totalBudget,
    densityLabel,
    debugBreakdown: {
      entityRate,
      v2Base: entityRate * V2_ENTITY_RATE_COEFF,
      formalityReduction: signals.formality > V2_FORMALITY_THRESHOLD ? V2_FORMALITY_REDUCTION : 1.0,
      speechAdj,
      motionAdj,
      faceAdj,
      topicAdj,
      energyAdj,
      final: graphicsPerMin,
    },
  };
}

// ─── Entry scoring ────────────────────────────────────────

const NUMBER_PATTERN = /\d+(\.\d+)?%?|\$[\d,.]+|#\d+/;
const CTA_PATTERN = /\b(subscribe|follow|click|download|sign up|join|buy|shop|learn more|get started|try|free)\b/i;
const PROPER_NOUN_PATTERN = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/;

const SCORE_NUMBER = 0.4;                 // ← design doc, v0
const SCORE_PROPER_NOUN = 0.3;            // ← design doc, v0
const SCORE_CTA = 0.3;                    // ← design doc, v0
const SCORE_OPENING = 0.25;               // ← design doc, v0
const SCORE_CLOSING = 0.25;               // ← design doc, v0
const SCORE_TOPIC_BOUNDARY = 0.15;        // ← design doc, v0
const SCORE_HIGH_ENERGY = 0.1;            // ← design doc, v0

export function scoreOnScreenTextEntries(
  entries: OnScreenTextEntry[],
  context: DensityContext,
): ScoredEntry[] {
  const topicBoundarySet = new Set(context.topicBoundaryIndices || []);

  const scored = entries.map((entry): ScoredEntry => {
    let confidence = 0;
    const reasons: string[] = [];

    if (NUMBER_PATTERN.test(entry.text)) {
      confidence += SCORE_NUMBER;
      reasons.push('contains-number');
    }

    if (PROPER_NOUN_PATTERN.test(entry.text)) {
      confidence += SCORE_PROPER_NOUN;
      reasons.push('proper-noun');
    }

    if (CTA_PATTERN.test(entry.text)) {
      confidence += SCORE_CTA;
      reasons.push('CTA');
    }

    if (entry.sceneIndex === 0) {
      confidence += SCORE_OPENING;
      reasons.push('opening-scene');
    }

    if (entry.sceneIndex >= context.totalScenes - 1) {
      confidence += SCORE_CLOSING;
      reasons.push('closing-scene');
    }

    if (topicBoundarySet.has(entry.sceneIndex)) {
      confidence += SCORE_TOPIC_BOUNDARY;
      reasons.push('topic-boundary');
    }

    if (context.sceneEnergyLevels && context.sceneEnergyLevels[entry.sceneIndex] > 0.7) {
      confidence += SCORE_HIGH_ENERGY;
      reasons.push('high-energy-scene');
    }

    return { entry, confidence, reasons };
  });

  scored.sort((a, b) => b.confidence - a.confidence);

  return scored;
}

export function selectTopEntries(
  scored: ScoredEntry[],
  budget: number,
): ScoredEntry[] {
  return scored.slice(0, budget);
}
