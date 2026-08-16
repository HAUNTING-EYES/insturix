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
 * 'reel' = a condensed highlight cut (best moments, hook-first ordering); 'auto-edit' = a
 * faithful full edit (chronological). Nobody selects this; deriveFormat computes it.
 */
export type OutputFormat = 'reel' | 'auto-edit';

export type IntakeEntryPoint = 'upload' | 'script' | 'thinkforge' | 'generate' | 'idea';

/** The user-editable knobs we track confidence for (the spec-card fields). */
export type BriefField =
  | 'platform'
  | 'targetDurationSec'
  | 'aspectRatio'
  | 'count'
  | 'intent'
  | 'style'
  | 'voiceLanguages'
  | 'captionLanguages'
  | 'deliverables';

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
  /** Spoken voice languages requested for production. Explicit user/session intake only. */
  voiceLanguages?: string[];
  /** Caption/subtitle languages requested for production. Explicit user/session intake only. */
  captionLanguages?: string[];
  /** Concrete requested output deliverables. Explicit user/session intake only. */
  deliverables?: string[];
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

export interface BriefTrendCopyField {
  id: string;
  role: string;
  template: string;
  maxChars?: number;
}

export interface BriefTrendConstraint {
  id: string;
  layer: string;
  feature: string;
  value?: string | number;
  dist?: { mean: number; sd: number };
  support: number;
  anchor?: { beat?: number; sectionId?: string };
}

export interface BriefTrendChoice {
  id: string;
  layer: string;
  feature: string;
  freedomRange?: { min?: number; max?: number } | string[];
}

export interface BriefTrendContext {
  trendId: string;
  alignmentFrame: 'beat-space' | 'slot-space';
  applicationMode: 'full_output' | 'embedded_motif';
  naturalDurationSec: number;
  selectedDurationSec: number;
  durationBoundariesSec: number[];
  copyFields: BriefTrendCopyField[];
  constraints: BriefTrendConstraint[];
  choices: BriefTrendChoice[];
  performanceScript: string;
  hashtags?: string[];
  warnings?: string[];
}

export interface BriefCasting {
  /** sidecar character.id -> avatar/voice binding. */
  map: Record<string, CharacterCasting>;
}

export interface CharacterCasting {
  /** Accepted Avatar Vault profile this character is. Absent = not avatar-cast. */
  avatarProfileId?: string;
  /** Voice for this character's spoken lines. */
  voice:
    | { mode: 'cloned'; voiceReferenceUrl: string }
    | { mode: 'preset'; ttsVoiceId: string }
    | { mode: 'none' };
}

export interface ProductionBrief {
  output: BriefOutputSpec;
  /** Optional brand context ref (brand drives vibe). Brand-optional, user-primary. */
  brand?: { brandId?: string | null } | null;
  resolution: BriefResolution;
  entryPoint: IntakeEntryPoint;
  /** Total source seconds available - caps output length + drives the format derivation. */
  sourceDurationSec?: number | null;
  /** Optional TrendSpec consumption metadata; final edit/render form stays owned downstream. */
  trend?: BriefTrendContext;
  /** Optional character -> avatar/voice binding resolved by ThinkForge intake. */
  casting?: BriefCasting;
}

/**
 * Platform -> default shape (aspect + a default length; null = follow content). SHAPE only;
 * vibe/pacing comes from the brand, never the platform. SINGLE SOURCE - both the resolver
 * and applyUserOutput's platform cascade read this. INVENTED-PLACEHOLDER (calibrate).
 */
export const PLATFORM_SHAPE: Record<Platform, { aspectRatio: AspectRatio; durationSec: number | null }> = {
  tiktok: { aspectRatio: '9:16', durationSec: 30 },
  'instagram-reels': { aspectRatio: '9:16', durationSec: 30 },
  'youtube-shorts': { aspectRatio: '9:16', durationSec: 45 },
  'instagram-feed': { aspectRatio: '4:5', durationSec: 30 },
  youtube: { aspectRatio: '16:9', durationSec: null },
  linkedin: { aspectRatio: '1:1', durationSec: 60 },
  x: { aspectRatio: '16:9', durationSec: 45 },
  unspecified: { aspectRatio: '16:9', durationSec: null },
};

/** Output <= this fraction of the source => a condensed highlight cut. INVENTED-PLACEHOLDER. */
export const CONDENSE_RATIO = 0.5;

/**
 * Normalize a requested/default length to a valid target: `null` (follow content) for
 * null/undefined/NaN/non-positive input, otherwise capped to the source length (you cannot
 * cut more than you uploaded). Never returns a negative, NaN, or over-source value.
 */
export function clampDuration(
  durationSec: number | null | undefined,
  sourceDurationSec?: number | null,
): number | null {
  if (durationSec === null || durationSec === undefined) return null;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  if (typeof sourceDurationSec === 'number' && sourceDurationSec > 0 && durationSec > sourceDurationSec) {
    return sourceDurationSec;
  }
  return durationSec;
}

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
  'voiceLanguages',
  'captionLanguages',
  'deliverables',
];

/** Shape knobs a platform change re-defaults (unless the same edit sets them explicitly). */
const PLATFORM_CASCADE_FIELDS: readonly BriefField[] = ['aspectRatio', 'targetDurationSec'];

/**
 * Apply the user's explicit spec-card edits to a brief, enforcing the SAME invariants the
 * resolver does (so the edit path can't drift from the resolve path):
 *  - changing `platform` (the master knob) re-defaults aspect/duration from PLATFORM_SHAPE,
 *    unless the same edit set them explicitly;
 *  - `targetDurationSec` is always clamped to the source (cannot cut more than uploaded);
 *  - `format` is re-derived from the merged spec.
 * Edited knobs become confirmed (confidence 1); cascaded knobs stay inferred. Never mutates.
 */
export function applyUserOutput(
  brief: ProductionBrief,
  patch: Partial<BriefOutputSpec>,
): ProductionBrief {
  const touched = OUTPUT_FIELD_KEYS.filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined,
  );
  const merged: BriefOutputSpec = { ...brief.output, ...patch };

  if (patch.platform !== undefined) {
    const shape = PLATFORM_SHAPE[patch.platform];
    if (patch.aspectRatio === undefined) merged.aspectRatio = shape.aspectRatio;
    if (patch.targetDurationSec === undefined) merged.targetDurationSec = shape.durationSec;
  }
  merged.targetDurationSec = clampDuration(merged.targetDurationSec, brief.sourceDurationSec);
  merged.format = deriveFormat(merged, brief.sourceDurationSec);

  const confirmed = new Set(brief.resolution.confirmed);
  const inferred = new Set(brief.resolution.inferred);
  const fieldConfidence = { ...brief.resolution.fieldConfidence };
  for (const f of touched) {
    confirmed.add(f);
    inferred.delete(f);
    fieldConfidence[f] = 1;
  }
  if (patch.platform !== undefined) {
    const platformConf = fieldConfidence.platform ?? 1;
    for (const f of PLATFORM_CASCADE_FIELDS) {
      if (!touched.includes(f)) {
        confirmed.delete(f); // it was auto-cascaded, not user-set
        inferred.add(f);
        fieldConfidence[f] = platformConf;
      }
    }
  }
  return {
    ...brief,
    output: merged,
    resolution: {
      ...brief.resolution,
      confirmed: [...confirmed],
      inferred: [...inferred],
      fieldConfidence,
    },
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
