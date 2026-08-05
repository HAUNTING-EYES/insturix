/**
 * MG Codegen — the DENSITY BUDGET (P3.5 door, founder decision 2026-07-18).
 *
 * "How much MG" is the USER's dial; "which beats and what design" is the system's. This module is the dial's
 * deterministic half: a pure function from {user preference, video evidence, brand energy, duration} to an
 * INTEGER moment budget the designer must respect when licensing beats. Same inputs → same budget, always —
 * no model call, no randomness, throws loud on malformed input (R18N).
 *
 * Every number is sourced (Rule 31):
 * - rate range 0–8 graphics/min            ← CKG intent:param.graphic_density "range: float 0-8"
 * - evidence-justified ceiling 4/min       ← CKG rationale: "8 numbers in 2 minutes → up to 4 graphics/min"
 * - restraint default 2/min                ← derived: half the evidence ceiling — the lane's sparse/licensed
 *                                            law (MG master plan §9) + the premium-restraint anchor bar
 * - brand nudge ±0.5/min                   ← direction from CKG ("high formality → fewer, low → more, punchier");
 *                                            Brand.motion.energy (0..1) is the codebase's calibrated
 *                                            formality-inverse; slope 1/min per energy unit is derived taste,
 *                                            bounded and calibrated downstream by judge + founder eyeball
 * - minSpacingSec 3.0                      ← CKG signal:structural.time_since_last_graphic clutter threshold
 * - ceil() on duration × rate              ← any non-vetoed clip with beats licenses at least one moment;
 *                                            'off' stays a hard zero (editorial-preferences: "hard user veto")
 *
 * The budget caps COUNT only. Spacing (minSpacingSec) is enforced where moments land on the timeline (harness
 * selection / P5 seam), and the designer's licensing judgment decides WHICH beats deserve the budget.
 */

import type { EditorialFamilyPreference } from '../../../production-brief/editorial-preferences';

export interface MgDensityBudgetInput {
  /** Video duration in seconds (finite, > 0). */
  durationSec: number;
  /** Transcript beats available to license (integer ≥ 0) — the budget can never exceed this. */
  beatCount: number;
  /** Verified numeric facts the enricher attached across beats (integer ≥ 0) — CKG's entity_number_count. */
  numericEvidenceCount: number;
  /** Narrative/abstract (concept) beats available to license — expressive talks are as license-worthy as numeric
   *  facts (founder: "MG need not be numbers, it can be abstract stuff"). Optional — default 0 ⇒ no behavior change
   *  for callers that don't offer narrative beats. ⚠ INVENTED weighting (treated 1:1 with numeric) — calibrate via
   *  the Fix-0 harness before tuning further; env MG_DENSITY_RATE_BASE / MG_DENSITY_CEILING override the knobs. */
  narrativeEvidenceCount?: number;
  /** Brand.motion.energy, 0..1 (finite) — the formality-inverse nudge. */
  brandMotionEnergy: number;
  /** The project's motionGraphics family preference; absent/undefined = 'auto' (absence means auto). */
  preference?: EditorialFamilyPreference | null;
}

export interface MgDensityBudget {
  /** Hard cap on licensed moments for this video. 0 = the designer licenses nothing (user veto / no beats). */
  maxMoments: number;
  /** Minimum seconds between licensed moments on the timeline (enforced at placement, not by the designer). */
  minSpacingSec: number;
  /** User expressive-strength dial (preference.intensity), passed through for the designer's styling bias. */
  expressiveIntensity?: number;
  /** Deterministic receipt of the derivation — logged and shown to the designer. */
  rationale: string;
}

const RATE_RANGE_MAX = 8; // per-minute hard top ← CKG graphic_density range
const EVIDENCE_CEILING = 4; // per-minute evidence-justified ceiling ← CKG rationale example
const RESTRAINT_BASE = 2; // per-minute auto default ← half the evidence ceiling (derived, header)
const RATE_FLOOR = 0.5; // per-minute floor so ceil() licenses ≥1 on any non-vetoed clip with beats
const MIN_SPACING_SEC = 3.0; // ← CKG time_since_last_graphic clutter threshold

// ⚠ INVENTED overrides (Founder cater: raise MG volume incl. abstract beats). ⚠ tune via the Fix-0 harness.
function densityRateBase(): number {
  const raw = process.env.MG_DENSITY_RATE_BASE;
  if (raw != null) { const n = Number(raw); if (Number.isFinite(n) && n > 0) return Math.min(RATE_RANGE_MAX, Math.max(RATE_FLOOR, n)); }
  return RESTRAINT_BASE;
}
function densityCeiling(): number {
  const raw = process.env.MG_DENSITY_CEILING;
  if (raw != null) { const n = Number(raw); if (Number.isFinite(n) && n > 0) return Math.min(RATE_RANGE_MAX, Math.max(RATE_FLOOR, n)); }
  return EVIDENCE_CEILING;
}

function assertFinite(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`density-budget: ${name} must be a finite number, got ${String(value)}`);
  }
}

function assertCount(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0 || !Number.isInteger(value)) {
    throw new Error(`density-budget: ${name} must be a non-negative integer, got ${String(value)}`);
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function computeMgDensityBudget(input: MgDensityBudgetInput): MgDensityBudget {
  assertFinite('durationSec', input.durationSec);
  if (input.durationSec <= 0) throw new Error(`density-budget: durationSec must be > 0, got ${input.durationSec}`);
  assertCount('beatCount', input.beatCount);
  assertCount('numericEvidenceCount', input.numericEvidenceCount);
  assertCount('narrativeEvidenceCount', input.narrativeEvidenceCount ?? 0);
  assertFinite('brandMotionEnergy', input.brandMotionEnergy);
  const energy = clamp(input.brandMotionEnergy, 0, 1);

  const pref = input.preference ?? undefined;
  const mode = pref?.mode ?? 'auto';
  const expressiveIntensity = pref?.intensity;

  if (mode === 'off') {
    return {
      maxMoments: 0,
      minSpacingSec: MIN_SPACING_SEC,
      ...(expressiveIntensity !== undefined ? { expressiveIntensity } : {}),
      rationale: 'mode off — hard user veto, zero moments',
    };
  }
  if (input.beatCount === 0) {
    return {
      maxMoments: 0,
      minSpacingSec: MIN_SPACING_SEC,
      ...(expressiveIntensity !== undefined ? { expressiveIntensity } : {}),
      rationale: 'no transcript beats — nothing to license',
    };
  }

  const durationMin = input.durationSec / 60;
  const brandNudge = energy - 0.5; // ±0.5/min, direction ← CKG formality modulator
  // evidence = numeric + narrative/abstract beats (see evidenceRateAll in the auto branch) // ← CKG computedFrom

  let rate: number;
  let derivation: string;
  if (mode === 'prefer') {
    // The user's dial rules: frequency 0..1 spans the restraint default up to the evidence ceiling.
    const frequency = pref?.frequency ?? 0.5;
    rate = clamp(RESTRAINT_BASE + 2 * frequency + brandNudge, RATE_FLOOR, RATE_RANGE_MAX);
    derivation = `prefer: base ${RESTRAINT_BASE} + freq ${frequency.toFixed(2)}×2 + brand ${brandNudge >= 0 ? '+' : ''}${brandNudge.toFixed(2)}`;
  } else {
    // auto: restraint default, liftable by evidence (numeric AND/OR narrative/abstract beats) up to the ceiling.
    const ceil = densityCeiling();
    const evidenceRateAll = (input.numericEvidenceCount + (input.narrativeEvidenceCount ?? 0)) / durationMin;
    rate = clamp(Math.max(densityRateBase() + brandNudge, Math.min(evidenceRateAll, ceil)), RATE_FLOOR, ceil);
    derivation = `auto: max(base ${densityRateBase()} + brand ${brandNudge >= 0 ? '+' : ''}${brandNudge.toFixed(2)}, evidence ${evidenceRateAll.toFixed(2)}/min (numeric ${input.numericEvidenceCount} + narrative ${input.narrativeEvidenceCount ?? 0}) capped ${ceil})`;
  }

  const maxMoments = Math.min(Math.ceil(durationMin * rate), input.beatCount);
  return {
    maxMoments,
    minSpacingSec: MIN_SPACING_SEC,
    ...(expressiveIntensity !== undefined ? { expressiveIntensity } : {}),
    rationale: `${derivation} → ${rate.toFixed(2)}/min × ${durationMin.toFixed(2)}min → ceil ${Math.ceil(durationMin * rate)}, beats cap ${input.beatCount} → ${maxMoments}`,
  };
}
