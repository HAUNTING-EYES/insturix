/**
 * intake-resolver - rules-first resolution of a ProductionBrief from normalized intake
 * signals. Infers the METADATA spec (platform -> aspect + duration, bounded to source,
 * count) so the UI can SHOW an editable spec card, NOT ask a template question. Pure,
 * deterministic, never throws. Explicit user edits always win.
 *
 * The adapter that fills IntakeSignals from Editron's real analysis is the deferred seam.
 */

import {
  type AspectRatio,
  type BriefField,
  deriveFormat,
  type IntakeEntryPoint,
  type Platform,
  type ProductionBrief,
} from './production-brief';

/** Normalized signals the resolver reasons over. Filled by the deferred adapter. */
export interface IntakeSignals {
  entryPoint: IntakeEntryPoint;
  assetCount: number;
  /** Total source seconds across all uploaded assets, if known. Caps the output length. */
  totalDurationSec?: number | null;
  contentType?: string | null;
  speechCoverage?: number | null;
  hasBrand: boolean;
  /** The user's connected posting destinations, if known - the best platform signal. */
  connectedPlatforms?: Platform[];
  /** Anything the user EXPLICITLY set - these win and are marked confirmed. */
  requested?: Partial<{
    platform: Platform;
    intent: string;
    targetDurationSec: number | null;
    aspectRatio: AspectRatio;
    count: number;
    style: Record<string, number | string>;
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
 * Platform -> default shape (aspect + a default length; null = follow content). These are
 * the SHAPE only. Vibe/pacing comes from the brand, never from the platform.
 * INVENTED-PLACEHOLDER (calibrate).
 */
const PLATFORM_DEFAULTS: Record<Platform, { aspectRatio: AspectRatio; durationSec: number | null }> = {
  tiktok: { aspectRatio: '9:16', durationSec: 30 },
  'instagram-reels': { aspectRatio: '9:16', durationSec: 30 },
  'youtube-shorts': { aspectRatio: '9:16', durationSec: 45 },
  'instagram-feed': { aspectRatio: '4:5', durationSec: 30 },
  youtube: { aspectRatio: '16:9', durationSec: null },
  linkedin: { aspectRatio: '1:1', durationSec: 60 },
  x: { aspectRatio: '16:9', durationSec: 45 },
  unspecified: { aspectRatio: '16:9', durationSec: null },
};

interface PlatformInference {
  platform: Platform;
  confidence: number;
}

const LONG_FORM_CONTENT = [
  'podcast', 'interview', 'talking', 'vlog', 'gameplay', 'event',
  'tutorial', 'product', 'demo', 'explainer', 'saas', 'webinar',
];

/**
 * Infer the destination when the user did not pick one. Connected accounts are the best
 * signal; otherwise default to a faithful long-form destination - the LEAST DESTRUCTIVE
 * default (keep the footage; a short is an explicit switch, never a silent guess).
 * Confidences are INVENTED-PLACEHOLDER.
 */
function inferPlatform(signals: IntakeSignals): PlatformInference {
  if (signals.connectedPlatforms && signals.connectedPlatforms.length > 0) {
    return { platform: signals.connectedPlatforms[0], confidence: 0.9 };
  }
  const ct = (signals.contentType ?? '').toLowerCase();
  if (LONG_FORM_CONTENT.some((k) => ct.includes(k))) {
    return { platform: 'youtube', confidence: 0.6 }; // faithful/long default, worth a glance
  }
  return { platform: 'unspecified', confidence: 0.45 };
}

/** Clamp a length to the source: you cannot cut more than you uploaded (founder's rule). */
function clampToSource(durationSec: number | null, sourceDurationSec: number | null): number | null {
  if (durationSec === null) return null; // follow content
  if (sourceDurationSec !== null && durationSec > sourceDurationSec) return sourceDurationSec;
  return durationSec;
}

/**
 * Resolve a ProductionBrief from normalized intake signals. Infers a complete, editable
 * spec (platform-first). Pure, never throws. Explicit requests win (confirmed, conf 1).
 */
export function resolveProductionBrief(signals: IntakeSignals): ProductionBrief {
  const requested = signals.requested ?? {};
  const confirmed: BriefField[] = [];
  const inferred: BriefField[] = [];
  const fieldConfidence: Partial<Record<BriefField, number>> = {};
  const sourceDurationSec =
    typeof signals.totalDurationSec === 'number' && signals.totalDurationSec > 0
      ? signals.totalDurationSec
      : null;

  // --- platform (master) ---
  let platform: Platform;
  let platformConfidence: number;
  if (requested.platform) {
    platform = requested.platform;
    platformConfidence = 1;
    confirmed.push('platform');
  } else {
    const inf = inferPlatform(signals);
    platform = inf.platform;
    platformConfidence = inf.confidence;
    inferred.push('platform');
  }
  fieldConfidence.platform = platformConfidence;
  const defaults = PLATFORM_DEFAULTS[platform];

  // --- aspectRatio (from platform) ---
  let aspectRatio: AspectRatio;
  if (requested.aspectRatio) {
    aspectRatio = requested.aspectRatio;
    fieldConfidence.aspectRatio = 1;
    confirmed.push('aspectRatio');
  } else {
    aspectRatio = defaults.aspectRatio;
    fieldConfidence.aspectRatio = platformConfidence; // aspect is as sure as the platform
    inferred.push('aspectRatio');
  }

  // --- targetDurationSec (from platform, bounded to source) ---
  let targetDurationSec: number | null;
  if (requested.targetDurationSec !== undefined) {
    targetDurationSec = clampToSource(requested.targetDurationSec, sourceDurationSec);
    fieldConfidence.targetDurationSec = 1;
    confirmed.push('targetDurationSec');
  } else {
    targetDurationSec = clampToSource(defaults.durationSec, sourceDurationSec);
    fieldConfidence.targetDurationSec =
      defaults.durationSec === null ? FOLLOW_CONTENT_DURATION_CONFIDENCE : platformConfidence;
    inferred.push('targetDurationSec');
  }

  // --- count (default 1; extras are opt-in) ---
  let count: number;
  if (requested.count !== undefined) {
    count = Math.max(1, Math.floor(requested.count));
    fieldConfidence.count = 1;
    confirmed.push('count');
  } else {
    count = 1;
    fieldConfidence.count = 1; // count=1 is a safe default, not a guess
    inferred.push('count');
  }

  // --- intent / style (free text; brand drives vibe) ---
  let intent: string | undefined;
  if (requested.intent) {
    intent = requested.intent;
    fieldConfidence.intent = 1;
    confirmed.push('intent');
  }
  let style: Record<string, number | string> | undefined;
  if (requested.style) {
    style = requested.style;
    fieldConfidence.style = 1;
    confirmed.push('style');
  }

  const format = deriveFormat({ targetDurationSec }, sourceDurationSec);

  return {
    output: { platform, targetDurationSec, aspectRatio, count, intent, style, format },
    brand: signals.hasBrand ? {} : null,
    entryPoint: signals.entryPoint,
    sourceDurationSec,
    resolution: { fieldConfidence, confirmed, inferred },
  };
}

/**
 * Knobs the spec card should HIGHLIGHT: inferred AND below the confidence threshold, in
 * priority order. Not a menu, not a blocking question - just "double-check these". Platform
 * leads because it drives aspect + duration.
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
