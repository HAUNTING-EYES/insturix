/**
 * ProductionBrief - the resolved OUTPUT SPEC for a video job, as METADATA, not a template
 * type. The user never picks "reel vs full edit" - that is templatization (Motion Graphics
 * Rule 11). Instead we capture concrete knobs (platform, duration, aspect, count), infer
 * their defaults, and let the user edit them in a spec card before the cut runs. "Reel" is
 * not a choice; it is just what you GET from short + vertical.
 *
 * `format` survives ONLY as an internal, DERIVED ordering hint (condensed highlight vs
 * faithful full edit) computed from the metadata - never asked, never shown.
 *
 * Vibe/energy (punchy vs calm, animation density) is BRAND-driven: not captured here, not
 * platform-derived, applied downstream from the brand and editable before the final edit.
 *
 * Isolated from Editron WIP: the adapter that fills IntakeSignals is the deferred seam.
 */

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

/** Distribution destination. The MASTER shape knob: sets aspect + a default duration. */
export type Platform =
  | 'tiktok'
  | 'instagram-reels'
  | 'youtube-shorts'
  | 'instagram-feed'
  | 'youtube'
  | 'linkedin'
  | 'x'
  | 'unspecified';

/**
 * Internal ordering hint DERIVED from the metadata - NOT a user-facing template choice.
 * The resolver only ever derives 'reel' (condensed highlight, hook-first ordering) or
 * 'auto-edit' (faithful full edit, chronological); the remaining values are ordering
 * buckets the composer recognizes. Nobody selects this.
 */
export type OutputFormat = 'reel' | 'auto-edit' | 'explainer' | 'talking-head' | 'ad' | 'ugc';

export type IntakeEntryPoint = 'upload' | 'script' | 'thinkforge' | 'generate' | 'idea';

/** The user-editable knobs we track confidence for (the spec-card fields). */
export type BriefField = 'platform' | 'targetDurationSec' | 'aspectRatio' | 'count' | 'intent' | 'style';

export interface BriefOutputSpec {
  /** Where it's going. Master knob - drives aspect + default duration. */
  platform: Platform;
  /** Final length (seconds). `null` = follow the content (full length). Bounded <= source. */
  targetDurationSec?: number | null;
  aspectRatio?: AspectRatio;
  /** How many distinct cuts to make. Default 1; extras are opt-in (render cost). */
  count: number;
  /** Free-text "what it's for", if the user said it. */
  intent?: string;
  /** Style params (never a mode name). Vibe mainly comes from the brand, not here. */
  style?: Record<string, number | string>;
  /** DERIVED internal ordering hint (condensed vs faithful). Never asked/shown. */
  format: OutputFormat;
}

export interface BriefResolution {
  /** 0..1 confidence per knob. Low-confidence knobs get highlighted in the card. */
  fieldConfidence: Partial<Record<BriefField, number>>;
  /** Knobs the user explicitly set (confidence 1; never silently overridden). */
  confirmed: BriefField[];
  /** Knobs we inferred (may be low-confidence -> highlight in the card). */
  inferred: BriefField[];
}

export interface ProductionBrief {
  output: BriefOutputSpec;
  /** Optional brand context ref (brand drives vibe). Brand-optional, user-primary. */
  brand?: { brandId?: string | null } | null;
  resolution: BriefResolution;
  entryPoint: IntakeEntryPoint;
  /** Total source seconds available - caps output length + drives the format derivation. */
  sourceDurationSec?: number | null;
}

/**
 * Output <= this fraction of the source => a condensed highlight cut, not a full edit.
 * INVENTED-PLACEHOLDER (calibrate).
 */
export const CONDENSE_RATIO = 0.5;

/**
 * Derive the internal ordering hint from the metadata: a short output relative to the
 * source is a condensed highlight ('reel'); otherwise a faithful full edit ('auto-edit').
 * Pure; never a user choice.
 */
export function deriveFormat(
  output: Pick<BriefOutputSpec, 'targetDurationSec'>,
  sourceDurationSec?: number | null,
): OutputFormat {
  const t = output.targetDurationSec;
  if (
    typeof t === 'number' &&
    t > 0 &&
    typeof sourceDurationSec === 'number' &&
    sourceDurationSec > 0 &&
    t <= sourceDurationSec * CONDENSE_RATIO
  ) {
    return 'reel';
  }
  return 'auto-edit';
}

const OUTPUT_FIELD_KEYS: readonly BriefField[] = [
  'platform',
  'targetDurationSec',
  'aspectRatio',
  'count',
  'intent',
  'style',
];

/**
 * Apply the user's explicit spec-card edits to a brief. Every patched knob becomes
 * confirmed at confidence 1; `format` is always RE-DERIVED from the merged spec so the
 * ordering hint stays consistent (e.g. shortening the duration flips it to a highlight).
 * Never mutates.
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
  const mergedOutput: BriefOutputSpec = { ...brief.output, ...patch };
  mergedOutput.format = deriveFormat(mergedOutput, brief.sourceDurationSec);
  return {
    ...brief,
    output: mergedOutput,
    resolution: { ...brief.resolution, confirmed, inferred, fieldConfidence },
  };
}

/** Promote an already-set knob to confirmed without changing its value. */
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
