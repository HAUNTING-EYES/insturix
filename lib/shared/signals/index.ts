/**
 * @insturix/signals — Shared Signal Module
 *
 * The single source of truth for the 47 creative signals that drive
 * both Editron (video editing) and ThinkForge (content writing).
 *
 * Architecture: B+ (separate graphs, shared signal module)
 * Decision: 2026-05-19 — CEO/Eng/External Architect reviewed
 * Doc: docs/creative-content-knowledge.md (4,337 lines, 9 Parts)
 *
 * Usage:
 *   import { CreativeSignals, validateSignals, SIGNAL_RANGES } from '@/lib/shared/signals';
 */

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  // Signal types
  CreativeSignals,
  DerivedSignals,
  NumericCreativeSignal,

  // Enum types
  BloomLevel,
  AwarenessLevel,
  EpistemicStance,
  TemporalOrientation,
  PowerDynamic,
  TransitionCraftStyle,

  // Constraint types
  ContentConstraints,
  OutputFormat,
  CTAType,
  RegulatoryIndustry,

  // Profile types
  ContentSignalProfile,
  InferenceMetadata,

  // Dynamics types
  SignalEnvelope,
  SignalValueOrEnvelope,
  EnvelopeCurve,
  PatternBreakV1,
} from './types';

// ─── Runtime ─────────────────────────────────────────────────────────────────
export {
  // Validation
  SIGNAL_RANGES,
  validateSignals,
  validatePatternBreak,

  // Derived computation
  computeDerivedSignals,

  // Envelope evaluation
  evaluateEnvelope,

  // Scope metadata
  SIGNAL_SCOPE_METADATA,
} from './validation';

export type { SignalRange, ValidationResult, SignalScope, SignalScopeMetadata } from './validation';
