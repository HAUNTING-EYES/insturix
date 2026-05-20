/**
 * @insturix/signals — Signal Validation & Defaults
 *
 * Validates signal values against defined ranges.
 * Provides FORMAT defaults and smart defaults.
 * Computes derived signals.
 *
 * This is the runtime enforcement that prevents "humor=7" from
 * entering the system. Types (types.ts) enforce SHAPE.
 * This file enforces VALUES.
 */

import type {
  CreativeSignals,
  DerivedSignals,
  ContentSignalProfile,
  NumericCreativeSignal,
  PatternBreakV1,
  SignalEnvelope,
  EnvelopeCurve,
} from './types';

// ─── Signal Range Definitions ────────────────────────────────────────────────

export interface SignalRange {
  min: number;
  max: number;
  default: number;
}

/**
 * Valid ranges for all numeric creative signals.
 * Enum signals are validated separately via their union types.
 *
 * Source: docs/creative-content-knowledge.md Part 2, each signal's "Range" field.
 */
export const SIGNAL_RANGES: Record<NumericCreativeSignal, SignalRange> = {
  // RHETORICAL
  logos_load:             { min: 0, max: 1, default: 0.5 },
  pathos_load:            { min: 0, max: 1, default: 0.5 },
  ethos_load:             { min: 0, max: 1, default: 0.5 },
  kairos_pressure:        { min: 0, max: 1, default: 0.3 },

  // COGNITIVE
  elaboration_demand:     { min: 0, max: 1, default: 0.5 },
  novelty:                { min: 0, max: 1, default: 0.5 },
  abstraction_level:      { min: 0, max: 1, default: 0.5 },

  // EMOTIONAL
  visceral_impact:        { min: 0, max: 1, default: 0.3 },
  behavioral_utility:     { min: 0, max: 1, default: 0.5 },
  reflective_depth:       { min: 0, max: 1, default: 0.3 },
  narrative_transportation: { min: 0, max: 1, default: 0.3 },
  emotional_valence:      { min: -1, max: 1, default: 0 },
  emotional_arousal:      { min: 0, max: 1, default: 0.5 },

  // AUDIENCE
  assumed_expertise:      { min: 0, max: 1, default: 0.5 },
  social_proof_reliance:  { min: 0, max: 1, default: 0.3 },
  in_group_signal:        { min: 0, max: 1, default: 0.2 },
  autonomy_grant:         { min: 0, max: 1, default: 0.5 },

  // STRUCTURAL
  pacing_velocity:        { min: 0, max: 1, default: 0.5 },
  tension_arc:            { min: 0, max: 1, default: 0.5 },
  predictability:         { min: 0, max: 1, default: 0.5 },
  linguistic_complexity:  { min: 0, max: 1, default: 0.5 },

  // VOICE
  formality:              { min: -1, max: 1, default: 0 },
  humor:                  { min: 0, max: 1, default: 0.2 },
  enthusiasm:             { min: 0, max: 1, default: 0.5 },
  warmth:                 { min: 0, max: 1, default: 0.5 },
  certainty:              { min: 0, max: 1, default: 0.5 },
  intensity_performance:  { min: 0, max: 1, default: 0.5 },

  // PURPOSE
  education_intent:       { min: 0, max: 1, default: 0.3 },
  entertainment_intent:   { min: 0, max: 1, default: 0.3 },
  connection_intent:      { min: 0, max: 1, default: 0.3 },

  // TEMPORAL
  temporal_relevance_decay: { min: 0, max: 1, default: 0.5 },
  scope_breadth:          { min: 0, max: 1, default: 0.5 },

  // CRAFT
  negative_space:         { min: 0, max: 1, default: 0.3 },
  specificity_grain:      { min: 0, max: 1, default: 0.5 },
  rhythmic_variation:     { min: 0, max: 1, default: 0.5 },
  pivot_intensity:        { min: 0, max: 1, default: 0.3 },
  callback_density:       { min: 0, max: 1, default: 0.2 },
  subtext_depth:          { min: 0, max: 1, default: 0.2 },
  implication_reliance:   { min: 0, max: 1, default: 0.3 },

  // VISUAL-VERBAL
  visual_dependency:      { min: 0, max: 1, default: 0.5 },
  show_tell_ratio:        { min: 0, max: 1, default: 0.5 },
  multimodal_counterpoint: { min: 0, max: 1, default: 0.1 },
};

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  clamped: Partial<CreativeSignals>;
}

/**
 * Validates a partial signal profile against defined ranges.
 * Clamps out-of-range values and reports errors.
 *
 * This runs on Brand DNA save, on brief extraction, and on any
 * signal profile before it enters the cascade.
 */
export function validateSignals(signals: Partial<CreativeSignals>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const clamped: Partial<CreativeSignals> = { ...signals };

  for (const [key, value] of Object.entries(signals)) {
    if (value === undefined || value === null) continue;

    const range = SIGNAL_RANGES[key as NumericCreativeSignal];

    if (range && typeof value === 'number') {
      // Numeric signal — clamp to range
      if (value < range.min || value > range.max) {
        const clampedValue = Math.max(range.min, Math.min(range.max, value));
        errors.push(
          `Signal "${key}" value ${value} is outside valid range [${range.min}, ${range.max}]. Clamped to ${clampedValue}.`
        );
        (clamped as Record<string, unknown>)[key] = clampedValue;
      }
    }
    // Enum signals are validated at compile time by TypeScript union types.
    // Runtime enum validation could be added here if needed for dynamic data.
  }

  // Constraint check: enthusiasm <= arousal + 0.2 (documented correlation)
  if (
    typeof clamped.enthusiasm === 'number' &&
    typeof clamped.emotional_arousal === 'number' &&
    clamped.enthusiasm > clamped.emotional_arousal + 0.2
  ) {
    warnings.push(
      `Enthusiasm (${clamped.enthusiasm}) exceeds emotional_arousal + 0.2 (${clamped.emotional_arousal + 0.2}). ` +
      `This correlation constraint suggests enthusiasm should not significantly exceed arousal.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    clamped,
  };
}

/**
 * Validates a PatternBreak: magnitude in range, signal is numeric.
 */
export function validatePatternBreak(pb: PatternBreakV1): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (pb.magnitude < 0.2 || pb.magnitude > 0.8) {
    errors.push(
      `PatternBreak magnitude ${pb.magnitude} outside valid range [0.2, 0.8]. ` +
      `Below 0.2 is imperceptible; above 0.8 risks breaking adjacent constraints.`
    );
  }

  if (!pb.reason || pb.reason.trim().length === 0) {
    errors.push('PatternBreak requires a reason for auditability.');
  }

  const range = SIGNAL_RANGES[pb.signal];
  if (!range) {
    errors.push(`Signal "${pb.signal}" is not a valid numeric signal for PatternBreak.`);
  }

  return { valid: errors.length === 0, errors, warnings, clamped: {} };
}

// ─── Derived Signal Computation ──────────────────────────────────────────────

/**
 * Computes the 3 derived signals from the resolved signal profile.
 * These are NEVER set directly — always computed.
 *
 * Formulas from docs/creative-content-knowledge.md Part 2.11:
 *   cognitive_load = 0.3*elaboration + 0.25*abstraction + 0.25*complexity + 0.2*novelty
 *   information_density = 0.4*logos + 0.3*elaboration + 0.3*abstraction
 *   persuasion_intent = max(logos, pathos, ethos)
 */
export function computeDerivedSignals(signals: Partial<CreativeSignals>): DerivedSignals {
  const get = (key: keyof CreativeSignals, fallback: number): number => {
    const v = signals[key];
    return typeof v === 'number' ? v : fallback;
  };

  const elaboration = get('elaboration_demand', 0.5);
  const abstraction = get('abstraction_level', 0.5);
  const complexity = get('linguistic_complexity', 0.5);
  const noveltyVal = get('novelty', 0.5);
  const logos = get('logos_load', 0.5);
  const pathos = get('pathos_load', 0.5);
  const ethos = get('ethos_load', 0.5);

  return {
    cognitive_load:     0.3 * elaboration + 0.25 * abstraction + 0.25 * complexity + 0.2 * noveltyVal,
    information_density: 0.4 * logos + 0.3 * elaboration + 0.3 * abstraction,
    persuasion_intent:  Math.max(logos, pathos, ethos),
  };
}

// ─── Signal Envelope Evaluation ──────────────────────────────────────────────

/**
 * Evaluates a signal envelope at a normalized time position.
 * See docs/creative-content-knowledge.md Part 3.1 for full spec.
 *
 * @param envelope The signal envelope to evaluate
 * @param normalizedTime 0–1 position within the scope's duration
 * @returns The signal value at that point in time
 */
export function evaluateEnvelope(envelope: SignalEnvelope, normalizedTime: number): number {
  const t = Math.max(0, Math.min(1, normalizedTime));

  // Guard: peakPosition at boundaries means one phase is zero-length
  if (envelope.peakPosition <= 0) {
    return interpolate(envelope.peak, envelope.end, t, envelope.releaseCurve);
  }
  if (envelope.peakPosition >= 1) {
    return interpolate(envelope.start, envelope.peak, t, envelope.attackCurve);
  }

  if (t <= envelope.peakPosition) {
    // Attack phase: start → peak
    const localT = t / envelope.peakPosition;
    return interpolate(envelope.start, envelope.peak, localT, envelope.attackCurve);
  } else {
    // Release phase: peak → end
    const localT = (t - envelope.peakPosition) / (1 - envelope.peakPosition);
    return interpolate(envelope.peak, envelope.end, localT, envelope.releaseCurve);
  }
}

function interpolate(from: number, to: number, t: number, curve: EnvelopeCurve): number {
  const clampedT = Math.max(0, Math.min(1, t));
  switch (curve) {
    case 'linear':
      return from + (to - from) * clampedT;
    case 'exponential':
      return from + (to - from) * (clampedT * clampedT);
    case 'logarithmic':
      return from + (to - from) * Math.sqrt(clampedT);
    default:
      return from + (to - from) * clampedT; // fallback to linear
  }
}

// ─── Signal Scope Metadata ───────────────────────────────────────────────────

export type SignalScope = 'global' | 'per_scene' | 'transition';

export interface SignalScopeMetadata {
  defaultScope: SignalScope;
  /** Below this scope level, the signal has no meaningful variation. */
  minMeaningfulScope: string;
  /** Can this signal be locked by campaign/brand? Style = yes, content = no. */
  campaignLockable: boolean;
}

/**
 * Per-signal scope metadata.
 * Governs how the cascade resolver interprets each signal.
 * See docs/creative-content-knowledge.md Part 2 per-signal entries.
 */
export const SIGNAL_SCOPE_METADATA: Partial<Record<keyof CreativeSignals, SignalScopeMetadata>> = {
  // Campaign-lockable (style/brand signals)
  ethos_load:           { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: true },
  kairos_pressure:      { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: true },
  emotional_valence:    { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: true },
  audience_awareness:   { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: true },
  formality:            { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: true },
  humor:                { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: true },
  warmth:               { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: true },
  epistemic_stance:     { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: true },
  certainty:            { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: true },
  power_dynamic:        { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: true },

  // NOT campaign-lockable (content-dependent signals)
  logos_load:           { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: false },
  pathos_load:          { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: false },
  elaboration_demand:   { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: false },
  novelty:              { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: false },
  pacing_velocity:      { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: false },
  emotional_arousal:    { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: false },
  tension_arc:          { defaultScope: 'global', minMeaningfulScope: 'project', campaignLockable: false },
  visual_dependency:    { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: false },
  show_tell_ratio:      { defaultScope: 'per_scene', minMeaningfulScope: 'scene', campaignLockable: false },

  // Transition-scoped
  transition_craft:     { defaultScope: 'transition', minMeaningfulScope: 'scene', campaignLockable: false },
};
