/**
 * ProductionBrief - the resolved INTENT for a video job: what the user wants MADE.
 *
 * This is distinct from `lib/editron/services/creative-brief.ts`, which is the Path-E
 * DIRECTOR brief (the edit-intent the LLM authors WHILE cutting). This object sits one
 * layer UP: it is the OUTPUT SPECIFICATION (format, duration, aspect, intent) resolved
 * at intake, BEFORE the director runs, and handed to the director as an input constraint.
 *
 * Design (Editron-Creative-Brief-Spine-Plan, D1-D5):
 *  - D2 per-field confidence: every resolved field carries how sure we are (0..1).
 *  - D3 brief overrides inferred: a field the user explicitly stated is `confirmed`
 *    and must never be silently overridden by inference downstream.
 *  - D4 rules-first: resolution is a pure function over normalized signals; no LLM.
 *
 * It intentionally does NOT import Editron's churning perception/analysis types. The
 * adapter that maps real signals -> IntakeSignals (see intake-resolver) is the single
 * DEFERRED integration point; keeping this module dependency-free lets it ship and be
 * tested in isolation while the rest of Editron is under active work.
 */

/** The kind of thing to produce. A parameter, never a template name (Motion Graphics Rule 11). */
export type OutputFormat =
  | 'auto-edit' // clean up / edit the source as-is (podcast -> edited podcast, vlog -> edited vlog)
  | 'reel' // short vertical highlight cut, heavy motion
  | 'explainer' // structured explainer / SaaS walkthrough
  | 'talking-head' // single-speaker piece to camera
  | 'ad' // paid ad spot
  | 'ugc'; // creator-style UGC ad

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

/** Where the job entered from - a strong prior for format inference. */
export type IntakeEntryPoint = 'upload' | 'script' | 'thinkforge' | 'generate' | 'idea';

/** Fields whose resolution we track confidence for (the ones an intake could get wrong). */
export type BriefField = 'format' | 'targetDurationSec' | 'aspectRatio' | 'style' | 'intent';

export interface BriefOutputSpec {
  format: OutputFormat;
  /** Free-text "what it's for" (e.g. "clip for LinkedIn"), if the user said. */
  intent?: string;
  /** Desired final length. `null` = explicitly "let the director decide from content". */
  targetDurationSec?: number | null;
  aspectRatio?: AspectRatio;
  /**
   * Style as PARAMETERS, never a mode name (Motion Graphics Rule 11: no template
   * library). e.g. { energy: 0.8, motionDensity: 0.6 }. Free-form; director consumes.
   */
  style?: Record<string, number | string>;
}

export interface BriefResolution {
  /** 0..1 confidence per field. Absent field = not resolved / not applicable. */
  fieldConfidence: Partial<Record<BriefField, number>>;
  /** Fields the user explicitly stated (confidence 1; never override downstream). */
  confirmed: BriefField[];
  /** Fields we inferred from signals (may be low-confidence -> candidate to confirm). */
  inferred: BriefField[];
}

export interface ProductionBrief {
  output: BriefOutputSpec;
  /** Optional brand context ref. Brand-optional, user-primary (founder decision). */
  brand?: { brandId?: string | null } | null;
  resolution: BriefResolution;
  /** Where the job entered from - affects defaults. */
  entryPoint: IntakeEntryPoint;
}

/** The output keys that are also tracked BriefFields (used to type patch application). */
const OUTPUT_FIELD_KEYS: readonly BriefField[] = [
  'format',
  'targetDurationSec',
  'aspectRatio',
  'style',
  'intent',
];

/**
 * Apply the user's explicit output choices to a brief. Every patched field becomes
 * `confirmed` at confidence 1 (D3: the brief overrides inferred values). Returns a new
 * brief; never mutates. Use this when the user answers a confirm question or edits the
 * spec directly.
 */
export function applyUserOutput(
  brief: ProductionBrief,
  patch: Partial<BriefOutputSpec>,
): ProductionBrief {
  const touched = OUTPUT_FIELD_KEYS.filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined,
  );
  const confirmed = [...brief.resolution.confirmed];
  const fieldConfidence = { ...brief.resolution.fieldConfidence };
  for (const f of touched) {
    if (!confirmed.includes(f)) confirmed.push(f);
    fieldConfidence[f] = 1;
  }
  const inferred = brief.resolution.inferred.filter((f) => !touched.includes(f));
  return {
    ...brief,
    output: { ...brief.output, ...patch },
    resolution: { ...brief.resolution, confirmed, inferred, fieldConfidence },
  };
}

/**
 * Promote an already-set field to confirmed WITHOUT changing its value - e.g. the user
 * accepted the inferred default ("yes, a full edit is fine"). Returns a new brief.
 */
export function markConfirmed(brief: ProductionBrief, field: BriefField): ProductionBrief {
  if (brief.resolution.confirmed.includes(field)) return brief;
  return {
    ...brief,
    resolution: {
      ...brief.resolution,
      confirmed: [...brief.resolution.confirmed, field],
      inferred: brief.resolution.inferred.filter((f) => f !== field),
      fieldConfidence: { ...brief.resolution.fieldConfidence, [field]: 1 },
    },
  };
}
