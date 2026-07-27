/**
 * intake-resolver - rules-first resolution of a ProductionBrief from normalized intake
 * signals. Infers the METADATA spec (platform -> aspect + duration, bounded to source,
 * count) so the UI can SHOW an editable spec card, NOT ask a template question. Pure,
 * deterministic, never throws. Explicit user edits always win.
 *
 * Knob precedence per field: USER (requested, conf 1, confirmed) > BRAND (brand defaults,
 * a trusted default the user can still override) > INFERRED (from content / platform shape).
 * Format is DERIVED, never asked - "reel vs full edit" is templatization and does not exist.
 *
 * Shares PLATFORM_SHAPE + clampDuration with production-brief so the resolve path and the
 * applyUserOutput edit path can never drift. Two inputs are filled by deferred adapters:
 * IntakeSignals (over Editron's analysis) and BrandDefaults (over the Brand Vault profile).
 */

import {
  type AspectRatio,
  type BriefField,
  clampDuration,
  deriveFormat,
  type IntakeEntryPoint,
  type Platform,
  PLATFORM_SHAPE,
  type ProductionBrief,
} from './production-brief';

/**
 * Brand-derived knob DEFAULTS. Filled by a brand adapter over the Brand Vault profile
 * (deferred seam, mirrors the Scene-adapter pattern). Every field is a DEFAULT the user can
 * override - never a lock. `vibe` is the brand's style/tone (drives look, not the spec).
 */
export interface BrandDefaults {
  preferredPlatform?: Platform;
  preferredAspectRatio?: AspectRatio;
  defaultDurationSec?: number | null;
  vibe?: Record<string, number | string>;
}

/** Normalized signals the resolver reasons over. Filled by the deferred adapter. */
export interface IntakeSignals {
  entryPoint: IntakeEntryPoint;
  assetCount: number;
  /** Total source seconds across all uploaded assets, if known. Caps the output length. */
  totalDurationSec?: number | null;
  contentType?: string | null;
  speechCoverage?: number | null;
  hasBrand: boolean;
  /** Selected persistent brand scope. Preserved even when no accepted profile is available. */
  brandId?: string | null;
  /** The user's connected posting destinations, if known - the best platform signal. */
  connectedPlatforms?: Platform[];
  /** Brand-derived defaults (from the Brand Vault profile). A trusted default, overridable. */
  brand?: BrandDefaults | null;
  /**
   * Optional free-text intent the user typed ("punchy 30s for instagram"). Used as the
   * intent here; STRUCTURED extraction (prompt -> platform/duration overrides) is a separate
   * LLM step that fills `requested` upstream (Rule 30: language via LLM, logic native). Until
   * that parser exists, a prompt seeds `intent` only - it does not silently move knobs.
   */
  prompt?: string | null;
  /** Anything the user EXPLICITLY set - these win and are marked confirmed. */
  requested?: Partial<{
    platform: Platform;
    intent: string;
    targetDurationSec: number | null;
    aspectRatio: AspectRatio;
    count: number;
    style: Record<string, number | string>;
    voiceLanguages: string[];
    captionLanguages: string[];
    deliverables: string[];
  }>;
}

/**
 * Confidence at/above which an inferred knob is settled and NOT highlighted in the card.
 * Below it, the card draws attention to the knob (e.g. "we guessed YouTube - change if
 * you're posting elsewhere"). A highlight, never a blocking menu. INVENTED-PLACEHOLDER.
 */
export const CONFIRM_CONFIDENCE_THRESHOLD = 0.7;

/** Confidence for a "follow the content" (null) duration - a safe default, not a guess. */
const FOLLOW_CONTENT_DURATION_CONFIDENCE = 0.85;

/**
 * Confidence for a BRAND-sourced default. Above the confirm threshold (a trusted default, so
 * the card does not nag), but below 1 (not a user-confirmed pick). INVENTED-PLACEHOLDER.
 */
const BRAND_DEFAULT_CONFIDENCE = 0.8;

interface PlatformInference {
  platform: Platform;
  confidence: number;
}

const LONG_FORM_CONTENT = [
  'podcast', 'interview', 'talking', 'vlog', 'gameplay', 'event',
  'tutorial', 'product', 'demo', 'explainer', 'saas', 'webinar',
];

/**
 * Infer the destination when the user did not pick one AND the brand has no preference.
 * Connected accounts are the best signal - but if MORE THAN ONE is connected the destination
 * is genuinely ambiguous, so we lower the confidence below the threshold to make the card
 * flag it rather than silently cropping for whichever account happened to be first. Otherwise
 * default to a faithful long-form destination (least destructive). Confidences INVENTED.
 */
function inferPlatform(signals: IntakeSignals): PlatformInference {
  const connected = signals.connectedPlatforms;
  if (connected && connected.length > 0) {
    return { platform: connected[0], confidence: connected.length === 1 ? 0.9 : 0.6 };
  }
  const ct = (signals.contentType ?? '').toLowerCase();
  if (LONG_FORM_CONTENT.some((k) => ct.includes(k))) {
    return { platform: 'youtube', confidence: 0.6 }; // faithful/long default, worth a glance
  }
  return { platform: 'unspecified', confidence: 0.45 };
}

/** Coerce a possibly-garbage requested count to a valid integer >= 1 (NaN/0/negative -> 1). */
function normalizeCount(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return 1;
  return Math.max(1, Math.floor(requested));
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0),
    ),
  );
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Resolve a ProductionBrief from normalized intake signals. Infers a complete, editable
 * spec (platform-first). Pure, never throws. Precedence per knob: user request > brand
 * default > content inference. Explicit requests are confirmed (conf 1); brand defaults are
 * settled-not-nagged (conf 0.8); inferences carry their own confidence.
 */
export function resolveProductionBrief(signals: IntakeSignals): ProductionBrief {
  const requested = signals.requested ?? {};
  const brand = signals.brand ?? null;
  const confirmed: BriefField[] = [];
  const inferred: BriefField[] = [];
  const fieldConfidence: Partial<Record<BriefField, number>> = {};
  const sourceDurationSec =
    typeof signals.totalDurationSec === 'number' && signals.totalDurationSec > 0
      ? signals.totalDurationSec
      : null;

  // --- platform (master): user > brand > inference ---
  let platform: Platform;
  let platformConfidence: number;
  if (requested.platform) {
    platform = requested.platform;
    platformConfidence = 1;
    confirmed.push('platform');
  } else if (brand?.preferredPlatform) {
    platform = brand.preferredPlatform;
    platformConfidence = BRAND_DEFAULT_CONFIDENCE;
    inferred.push('platform');
  } else {
    const inf = inferPlatform(signals);
    platform = inf.platform;
    platformConfidence = inf.confidence;
    inferred.push('platform');
  }
  fieldConfidence.platform = platformConfidence;
  const shape = PLATFORM_SHAPE[platform];

  // --- aspectRatio: user > brand > platform shape ---
  let aspectRatio: AspectRatio;
  if (requested.aspectRatio) {
    aspectRatio = requested.aspectRatio;
    fieldConfidence.aspectRatio = 1;
    confirmed.push('aspectRatio');
  } else if (brand?.preferredAspectRatio) {
    aspectRatio = brand.preferredAspectRatio;
    fieldConfidence.aspectRatio = BRAND_DEFAULT_CONFIDENCE;
    inferred.push('aspectRatio');
  } else {
    aspectRatio = shape.aspectRatio;
    fieldConfidence.aspectRatio = platformConfidence; // aspect is as sure as the platform
    inferred.push('aspectRatio');
  }

  // --- targetDurationSec: user > brand > platform shape (all bounded by clampDuration) ---
  let targetDurationSec: number | null;
  if (requested.targetDurationSec !== undefined) {
    targetDurationSec = clampDuration(requested.targetDurationSec, sourceDurationSec);
    fieldConfidence.targetDurationSec = 1;
    confirmed.push('targetDurationSec');
  } else if (brand?.defaultDurationSec !== undefined) {
    targetDurationSec = clampDuration(brand.defaultDurationSec, sourceDurationSec);
    fieldConfidence.targetDurationSec = BRAND_DEFAULT_CONFIDENCE;
    inferred.push('targetDurationSec');
  } else {
    targetDurationSec = clampDuration(shape.durationSec, sourceDurationSec);
    fieldConfidence.targetDurationSec =
      shape.durationSec === null ? FOLLOW_CONTENT_DURATION_CONFIDENCE : platformConfidence;
    inferred.push('targetDurationSec');
  }

  // --- count (default 1; NaN/0/negative -> 1) ---
  let count: number;
  if (requested.count !== undefined) {
    count = normalizeCount(requested.count);
    fieldConfidence.count = 1;
    confirmed.push('count');
  } else {
    count = 1;
    fieldConfidence.count = 1; // count=1 is a safe default, not a guess
    inferred.push('count');
  }

  // --- intent (free text): explicit request, else the typed prompt (verbatim, not parsed) ---
  const promptText = typeof signals.prompt === 'string' ? signals.prompt.trim() : '';
  let intent: string | undefined;
  if (requested.intent) {
    intent = requested.intent;
    fieldConfidence.intent = 1;
    confirmed.push('intent');
  } else if (promptText.length > 0) {
    intent = promptText;
    fieldConfidence.intent = 1; // user-typed = user input, not a guess
    confirmed.push('intent');
  }

  // --- style / vibe: user request > brand vibe (brand is the default look) ---
  let style: Record<string, number | string> | undefined;
  if (requested.style) {
    style = requested.style;
    fieldConfidence.style = 1;
    confirmed.push('style');
  } else if (brand?.vibe) {
    style = brand.vibe;
    fieldConfidence.style = BRAND_DEFAULT_CONFIDENCE;
    inferred.push('style');
  }

  const voiceLanguages = normalizeStringList(requested.voiceLanguages);
  if (voiceLanguages) {
    fieldConfidence.voiceLanguages = 1;
    confirmed.push('voiceLanguages');
  }

  const captionLanguages = normalizeStringList(requested.captionLanguages);
  if (captionLanguages) {
    fieldConfidence.captionLanguages = 1;
    confirmed.push('captionLanguages');
  }

  const deliverables = normalizeStringList(requested.deliverables);
  if (deliverables) {
    fieldConfidence.deliverables = 1;
    confirmed.push('deliverables');
  }

  const format = deriveFormat({ targetDurationSec }, sourceDurationSec);
  const output: ProductionBrief['output'] = { platform, targetDurationSec, aspectRatio, count, intent, style, format };
  if (voiceLanguages) output.voiceLanguages = voiceLanguages;
  if (captionLanguages) output.captionLanguages = captionLanguages;
  if (deliverables) output.deliverables = deliverables;

  return {
    output,
    brand: signals.hasBrand
      ? (signals.brandId?.trim() ? { brandId: signals.brandId.trim() } : {})
      : null,
    entryPoint: signals.entryPoint,
    sourceDurationSec,
    resolution: { fieldConfidence, confirmed, inferred },
  };
}

/**
 * Knobs the spec card should HIGHLIGHT: inferred AND below the confidence threshold, in
 * priority order. Not a menu, not a blocking question - just "double-check these". Platform
 * leads because it drives aspect + duration. Brand-defaulted knobs sit above the threshold,
 * so they are NOT highlighted (trusted default) but remain user-overridable.
 */
export function lowConfidenceFields(
  brief: ProductionBrief,
  opts?: { threshold?: number; only?: BriefField[] },
): BriefField[] {
  const threshold = opts?.threshold ?? CONFIRM_CONFIDENCE_THRESHOLD;
  const consider = opts?.only ?? (['platform', 'targetDurationSec', 'aspectRatio'] as BriefField[]);
  const out: BriefField[] = [];
  for (const field of consider) {
    if (!brief.resolution.inferred.includes(field)) continue;
    if ((brief.resolution.fieldConfidence[field] ?? 0) < threshold) out.push(field);
  }
  return out;
}

/** The single knob most worth a glance, or null if the spec is confident enough to just run. */
export function topFieldToConfirm(
  brief: ProductionBrief,
  opts?: { threshold?: number; only?: BriefField[] },
): BriefField | null {
  return lowConfidenceFields(brief, opts)[0] ?? null;
}

/** True when nothing material needs a glance - the spec can run as-is. */
export function isBriefReady(
  brief: ProductionBrief,
  opts?: { threshold?: number; only?: BriefField[] },
): boolean {
  return lowConfidenceFields(brief, opts).length === 0;
}
