/**
 * intake-resolver - rules-first resolution of a ProductionBrief from normalized intake
 * signals. Pure, deterministic, never throws (D4). Explicit user requests always win;
 * everything else is inferred with a confidence the caller uses to decide whether to
 * ask ONE confirming question ("ask the basics").
 *
 * The ADAPTER that fills IntakeSignals from Editron's real perception/analysis
 * (content-type-detector, 5-track, moment-bundle) is the single DEFERRED integration
 * point - deliberately NOT built here so this module stays isolated from WIP. Everything
 * the resolver needs is on the IntakeSignals struct.
 */

import type {
  AspectRatio,
  BriefField,
  IntakeEntryPoint,
  OutputFormat,
  ProductionBrief,
} from './production-brief';

/** Normalized signals the resolver reasons over. Filled by the deferred adapter. */
export interface IntakeSignals {
  entryPoint: IntakeEntryPoint;
  /** How many media assets the user brought (0 for pure text/idea entry). */
  assetCount: number;
  /** Total source seconds across assets, if known. */
  totalDurationSec?: number | null;
  /**
   * Coarse content type from the detector, if available
   * (e.g. 'podcast', 'talking-head', 'vlog', 'tutorial', 'gameplay', 'product-demo').
   */
  contentType?: string | null;
  /** 0..1 fraction of source that is speech, if known. */
  speechCoverage?: number | null;
  hasBrand: boolean;
  /** Anything the user EXPLICITLY asked for - these win and are marked confirmed. */
  requested?: Partial<{
    format: OutputFormat;
    intent: string;
    targetDurationSec: number | null;
    aspectRatio: AspectRatio;
    style: Record<string, number | string>;
  }>;
}

/**
 * Confidence at or above which an inferred field is treated as settled and we do NOT
 * ask the user to confirm it.
 *
 * WARNING: INVENTED-PLACEHOLDER (plan O2). Calibrate from real intake accept/override
 * telemetry; do not trust as-is. Deliberately conservative: below it we ask ONE
 * confirming question rather than silently committing.
 */
export const CONFIRM_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Confidence for a DERIVED duration when the format's default is a CONCRETE number
 * (reel 30s, explainer 60s). Below the confirm threshold on purpose: a guessed length
 * is the classic thing to confirm. INVENTED-PLACEHOLDER (plan O2).
 */
const DERIVED_FIXED_DURATION_CONFIDENCE = 0.5;

/**
 * Confidence for a DERIVED duration when the format's default is `null` = "follow the
 * content, let the director decide". That is a SAFE default (not a guessed number), so
 * it sits above the confirm threshold and we don't pester the user about it.
 * INVENTED-PLACEHOLDER (plan O2).
 */
const DERIVED_FOLLOW_CONTENT_DURATION_CONFIDENCE = 0.85;

/** Default target length (seconds) per format. Overridable defaults, not fixed rules. */
const FORMAT_DEFAULT_DURATION: Partial<Record<OutputFormat, number | null>> = {
  reel: 30, // common social short length
  explainer: 60, // typical SaaS explainer
  ad: 30, // standard ad spot
  ugc: 30,
  'talking-head': null, // follow the content
  'auto-edit': null, // director decides from the source
};

/** Aspect follows format tightly, so it inherits the format's confidence. */
const FORMAT_DEFAULT_ASPECT: Partial<Record<OutputFormat, AspectRatio>> = {
  reel: '9:16',
  ugc: '9:16',
  ad: '9:16',
  explainer: '16:9',
  'talking-head': '16:9',
  'auto-edit': '16:9',
};

interface FormatInference {
  format: OutputFormat;
  confidence: number;
}

/**
 * Rules-first format inference from the normalized signals. Pure, deterministic. The
 * confidence numbers are heuristic (INVENTED-PLACEHOLDER, plan O2) and chosen so the
 * confirm threshold cleanly separates "just proceed" from "ask one question": genuinely
 * ambiguous inputs (podcast, bare idea, unknown, tiny clip) land BELOW the threshold.
 */
function inferFormat(signals: IntakeSignals): FormatInference {
  const ct = (signals.contentType ?? '').toLowerCase();

  // Entry point is a strong prior.
  if (signals.entryPoint === 'script' || signals.entryPoint === 'thinkforge') {
    // Came in as a written script -> an authored piece, not a raw-footage cleanup.
    if (ct.includes('explainer') || ct.includes('product') || ct.includes('saas')) {
      return { format: 'explainer', confidence: 0.8 };
    }
    return { format: 'talking-head', confidence: 0.62 }; // askable: talking-head vs explainer
  }
  if (signals.entryPoint === 'generate' || signals.entryPoint === 'idea') {
    return { format: 'explainer', confidence: 0.55 }; // askable
  }

  // Upload path: infer from content type.
  if (ct.includes('podcast')) {
    // The founder's exact ambiguity: podcast could be a full edit OR a reel. Default to
    // the faithful edit, but LOW confidence -> we will ask.
    return { format: 'auto-edit', confidence: 0.5 };
  }
  if (ct.includes('talking') || ct.includes('interview')) {
    return { format: 'talking-head', confidence: 0.72 };
  }
  if (ct.includes('product') || ct.includes('demo') || ct.includes('tutorial')) {
    return { format: 'explainer', confidence: 0.72 };
  }
  if (ct.includes('vlog') || ct.includes('gameplay') || ct.includes('event')) {
    return { format: 'auto-edit', confidence: 0.72 };
  }

  // Very short single upload -> likely a clip/reel intent, but not certain.
  if (
    signals.assetCount <= 1 &&
    typeof signals.totalDurationSec === 'number' &&
    signals.totalDurationSec > 0 &&
    signals.totalDurationSec <= 60
  ) {
    return { format: 'reel', confidence: 0.55 }; // askable
  }

  // Unknown -> faithful edit, low confidence -> ask.
  return { format: 'auto-edit', confidence: 0.45 };
}

/**
 * Resolve a ProductionBrief from normalized intake signals. Rules-first, pure, never
 * throws. Explicit user requests always win (confirmed, confidence 1); everything else
 * is inferred with a confidence the caller can use to decide whether to ask.
 */
export function resolveProductionBrief(signals: IntakeSignals): ProductionBrief {
  const requested = signals.requested ?? {};
  const confirmed: BriefField[] = [];
  const inferred: BriefField[] = [];
  const fieldConfidence: Partial<Record<BriefField, number>> = {};

  // --- format ---
  let format: OutputFormat;
  if (requested.format) {
    format = requested.format;
    confirmed.push('format');
    fieldConfidence.format = 1;
  } else {
    const inf = inferFormat(signals);
    format = inf.format;
    inferred.push('format');
    fieldConfidence.format = inf.confidence;
  }

  // --- targetDurationSec ---
  let targetDurationSec: number | null;
  if (requested.targetDurationSec !== undefined) {
    targetDurationSec = requested.targetDurationSec;
    confirmed.push('targetDurationSec');
    fieldConfidence.targetDurationSec = 1;
  } else {
    const defaultDuration = FORMAT_DEFAULT_DURATION[format] ?? null;
    targetDurationSec = defaultDuration;
    inferred.push('targetDurationSec');
    // A concrete guessed length is askable; "follow the content" (null) is a safe default.
    fieldConfidence.targetDurationSec =
      defaultDuration === null
        ? DERIVED_FOLLOW_CONTENT_DURATION_CONFIDENCE
        : DERIVED_FIXED_DURATION_CONFIDENCE;
  }

  // --- aspectRatio ---
  let aspectRatio: AspectRatio;
  if (requested.aspectRatio) {
    aspectRatio = requested.aspectRatio;
    confirmed.push('aspectRatio');
    fieldConfidence.aspectRatio = 1;
  } else {
    aspectRatio = FORMAT_DEFAULT_ASPECT[format] ?? '16:9';
    inferred.push('aspectRatio');
    // Aspect is tightly coupled to format, so it inherits the format's confidence.
    fieldConfidence.aspectRatio = fieldConfidence.format ?? 0.5;
  }

  // --- intent (free text) ---
  let intent: string | undefined;
  if (requested.intent) {
    intent = requested.intent;
    confirmed.push('intent');
    fieldConfidence.intent = 1;
  }

  // --- style ---
  let style: Record<string, number | string> | undefined;
  if (requested.style) {
    style = requested.style;
    confirmed.push('style');
    fieldConfidence.style = 1;
  }

  return {
    output: { format, intent, targetDurationSec, aspectRatio, style },
    brand: signals.hasBrand ? {} : null,
    entryPoint: signals.entryPoint,
    resolution: { fieldConfidence, confirmed, inferred },
  };
}

/**
 * Every uncertain inferred field, in priority order. The building block for the "ask the
 * basics" loop: a UI can show how many confirmations remain, or drive them one at a time.
 *
 * Priority order matters: format is UPSTREAM of duration and aspect (it sets their
 * defaults), so it leads - the user's answer re-resolves the rest, which may remove the
 * need to ask anything else. `only` is that priority order (default: the material output
 * fields, not free-text intent/style).
 */
export function pendingConfirmFields(
  brief: ProductionBrief,
  opts?: { threshold?: number; only?: BriefField[] },
): BriefField[] {
  const threshold = opts?.threshold ?? CONFIRM_CONFIDENCE_THRESHOLD;
  const consider = opts?.only ?? (['format', 'targetDurationSec', 'aspectRatio'] as BriefField[]);
  const pending: BriefField[] = [];
  for (const field of consider) {
    if (!brief.resolution.inferred.includes(field)) continue;
    if ((brief.resolution.fieldConfidence[field] ?? 0) < threshold) pending.push(field);
  }
  return pending;
}

/**
 * The single field to confirm first (highest-priority uncertain field), or null if
 * everything is confident enough to proceed. "Ask the basics" = ask exactly ONE thing,
 * and only when genuinely unsure.
 */
export function nextConfirmField(
  brief: ProductionBrief,
  opts?: { threshold?: number; only?: BriefField[] },
): BriefField | null {
  return pendingConfirmFields(brief, opts)[0] ?? null;
}

/** True when nothing material is left to confirm - the brief is safe to hand the director. */
export function isBriefReady(
  brief: ProductionBrief,
  opts?: { threshold?: number; only?: BriefField[] },
): boolean {
  return pendingConfirmFields(brief, opts).length === 0;
}
