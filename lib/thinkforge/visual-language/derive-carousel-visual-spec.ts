/**
 * Carousel Visual-Language Deriver [R6 / atomization]
 *
 * Turns the atoms that ALREADY exist (ThinkForge CreativeSignals + resolved content
 * profile + brand + the actual content blocks) into the STRUCTURE of a carousel:
 * per-slide roles, real extracted overlay copy, visual mode, palette bias, curated
 * vibe/style chips, slide count — each with a confidence score and a plain-English
 * rationale. It replaces the templatized free-text VIBE/STYLE inputs the user used to
 * fill in by hand (design doc: Clickatron-Carousel-Visual-Deriver-Design-2026-07-06).
 *
 * Boundaries (deliberate):
 * - This is a NATIVE logic engine (Rule 30): it decides STRUCTURE, it never generates
 *   scene prose. The image scene string stays the writer's / the prompt compiler's job.
 * - overlayCopy is EXTRACTED real copy (a title / first line), never a generated or
 *   keyword-bag string — that is what caused the baked word-salad.
 * - Signals are COARSE and PARTIAL: the resolver sets a matched signal to ~0.58–0.78 and
 *   leaves the rest undefined (content-signal-resolver.ts:406-444). So the deriver leans
 *   on the reliably-set profile fields (goal, proofPoints, platform) and treats signals
 *   as boosts-when-present. Every signal threshold below is 0.5 — the natural present /
 *   absent boundary for that value scheme. Thresholds ← resolver value scheme.
 */

import type { CreativeSignals } from '@/lib/shared/signals/types';
import type { ClickatronVisualMode, ClickatronTextPolicy } from '@/lib/thinkforge/schemas/clickatron-creative-contract';

export type CarouselSlideRole = 'hook' | 'context' | 'proof' | 'cta';

export interface DerivedSourceBlock {
  /** Optional heading for the block (becomes preferred overlay copy). */
  title?: string;
  /** The block body — first sentence is the overlay-copy fallback. */
  text: string;
}

export interface DerivedCarouselSlide {
  index: number;
  role: CarouselSlideRole;
  /** REAL copy pulled from the content (title or first line), or null to stay text-free.
   *  Never a generated/keyword string. Lands on the editable overlay layer. */
  overlayCopy: string | null;
  /** Structural layout hint (computed from role), not pixel choreography. */
  layoutToken: 'centered-statement' | 'split-emphasis' | 'stat-block' | 'cta-focus';
  sourceBlockIndex: number | null;
}

export interface DerivedCarouselVisualSpec {
  visualMode: ClickatronVisualMode;
  textPolicy: ClickatronTextPolicy;
  slideCount: number;
  slides: DerivedCarouselSlide[];
  /** Curated-vocabulary chips (no free text). Each chip maps back to signal ranges,
   *  so a manual chip change is itself a signal override — the loop stays closed. */
  vibe: string[];
  imageStyle: string[];
  palette: {
    /** Always use the brand palette; the deriver only biases temperature within it. */
    source: 'brand';
    temperatureBias: 'warm' | 'cool' | 'neutral';
  };
  /** 0–1 overall: share of decisions backed by present atoms vs. fallen to a default. */
  confidence: number;
  /** Fields that fell back to a default — the UI highlights these for a one-tap fix. */
  lowConfidenceFields: string[];
  /** Plain-English "why" per major decision (the founder values the WHY, Pearl L2). */
  rationale: string[];
}

export interface DeriveCarouselInput {
  signals: Partial<CreativeSignals>;
  /** Resolved content goal (inferGoal: 'conversion' | 'education' | 'announcement' | …). */
  goal?: string;
  proofPoints?: string[];
  platform?: string;
  blocks: DerivedSourceBlock[];
  brandHasLogo?: boolean;
  /** User overrides — platform decides slide count, but the user can override it. */
  overrides?: {
    slideCount?: number;
    visualMode?: ClickatronVisualMode;
  };
}

// ── Bounds ──────────────────────────────────────────────────────────────────
export const MIN_CAROUSEL_SLIDES = 2; // a carousel needs at least 2 ← product definition
export const MAX_CAROUSEL_SLIDES = 7; // ← product spec; mirrors session/route.ts cap

// Platform-default slide counts ← common carousel norms per platform (industry heuristic,
// override always wins). Marked as norm-derived, not measured from our own data yet.
const PLATFORM_DEFAULT_SLIDE_COUNT: Record<string, number> = {
  instagram: 6,
  linkedin: 5,
  facebook: 5,
  tiktok: 4,
  twitter: 4,
  x: 4,
};
const FALLBACK_SLIDE_COUNT = 5; // ← generic carousel default when platform unknown

const SIGNAL_PRESENT = 0.5; // present/absent boundary for 0–1 signals ← resolver value scheme
const FORMALITY_EDGE = 0.3; // formality is −1..1; resolver sets 0.58 / −0.35 ← resolver value scheme

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function has(signal: number | undefined, threshold = SIGNAL_PRESENT): boolean {
  return typeof signal === 'number' && signal >= threshold;
}

/** First sentence (or a trimmed lead) of a block — the real overlay-copy fallback. */
function firstLine(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const sentence = trimmed.split(/(?<=[.!?])\s/)[0].trim();
  return sentence.length > 0 ? sentence : null;
}

function deriveVisualMode(input: DeriveCarouselInput, rationale: string[]): { mode: ClickatronVisualMode; confident: boolean } {
  const { signals, goal, proofPoints = [], overrides } = input;
  if (overrides?.visualMode) {
    rationale.push(`visualMode=${overrides.visualMode} (user override)`);
    return { mode: overrides.visualMode, confident: true };
  }
  // NOTE: product_mockup is deliberately NOT auto-derived. "Show the product" cannot be
  // inferred from goal+logo — most conversion content is conceptual/editorial, not a
  // product-on-display render (battle test: the SaaS "production floor" narrative was
  // wrongly forced to product_mockup). The user picks product_mockup explicitly via the
  // chip UI (an override); a future signal for true product-shot intent could re-add it.
  // Data/proof-heavy → typographic/stat-forward.
  if (has(signals.logos_load) || proofPoints.length >= 2) {
    rationale.push(`visualMode=text_forward_graphic (logos_load present or ${proofPoints.length} proof points → data-forward)`);
    return { mode: 'text_forward_graphic', confident: true };
  }
  // Story/emotional → real photography.
  if (has(signals.narrative_transportation) || has(signals.pathos_load) || has(signals.warmth)) {
    rationale.push('visualMode=photo (narrative/pathos/warmth present → human, story-driven imagery)');
    return { mode: 'photo', confident: true };
  }
  // Teaching → explanatory illustration/diagram.
  if (has(signals.education_intent)) {
    rationale.push('visualMode=illustration (education_intent present → explanatory imagery)');
    return { mode: 'illustration', confident: true };
  }
  rationale.push('visualMode=photo (default — no strong visual signal present)');
  return { mode: 'photo', confident: false };
}

function deriveSlideCount(input: DeriveCarouselInput, rationale: string[]): { count: number; confident: boolean } {
  const { platform, blocks, overrides } = input;
  if (typeof overrides?.slideCount === 'number') {
    const count = clamp(overrides.slideCount, MIN_CAROUSEL_SLIDES, MAX_CAROUSEL_SLIDES);
    rationale.push(`slideCount=${count} (user override)`);
    return { count, confident: true };
  }
  const platformKey = platform?.toLowerCase().trim() ?? '';
  const platformDefault = PLATFORM_DEFAULT_SLIDE_COUNT[platformKey];
  const target = platformDefault ?? FALLBACK_SLIDE_COUNT;
  // Never promise more slides than we have content for.
  const contentBound = blocks.length > 0 ? blocks.length : target;
  const count = clamp(Math.min(target, contentBound), MIN_CAROUSEL_SLIDES, MAX_CAROUSEL_SLIDES);
  rationale.push(
    platformDefault
      ? `slideCount=${count} (platform "${platformKey}" default ${target}, bounded by ${blocks.length} content blocks)`
      : `slideCount=${count} (no platform default; generic ${FALLBACK_SLIDE_COUNT} bounded by ${blocks.length} content blocks)`,
  );
  return { count, confident: Boolean(platformDefault) };
}

// Goals that actually end on a call to action. For education / connection / etc. the
// closing slide is just the final content point, not a CTA — labeling it 'cta' would force
// a cta-focus layout onto a content slide (battle test: a tutorial's "Step 4" became a CTA).
const PERSUASIVE_GOALS = new Set(['conversion', 'announcement']);

function assignRole(index: number, count: number, hasProof: boolean, goal?: string): CarouselSlideRole {
  if (index === 0) return 'hook';
  if (index === count - 1) return goal && PERSUASIVE_GOALS.has(goal) ? 'cta' : 'context';
  return hasProof ? 'proof' : 'context';
}

function layoutForRole(role: CarouselSlideRole): DerivedCarouselSlide['layoutToken'] {
  switch (role) {
    case 'hook': return 'centered-statement';
    case 'proof': return 'stat-block';
    case 'cta': return 'cta-focus';
    default: return 'split-emphasis';
  }
}

function deriveSlides(input: DeriveCarouselInput, count: number): DerivedCarouselSlide[] {
  const { blocks, proofPoints = [], goal } = input;
  const hasProof = proofPoints.length > 0;
  const slides: DerivedCarouselSlide[] = [];
  for (let index = 0; index < count; index++) {
    const role = assignRole(index, count, hasProof, goal);
    const block = blocks[index];
    // overlayCopy = REAL extracted copy: block title, else its first line. A cta slide's
    // copy is the call-to-action itself (goal/brand-owned, applied downstream) — never a
    // content block, which would mislabel a content point as the CTA.
    const extracted = block ? (block.title?.trim() || firstLine(block.text)) : null;
    const overlayCopy = role === 'cta' ? null : (extracted && extracted.length > 0 ? extracted : null);
    slides.push({
      index,
      role,
      overlayCopy,
      layoutToken: layoutForRole(role),
      sourceBlockIndex: block ? index : null,
    });
  }
  return slides;
}

/** Curated vibe vocabulary — each chip is emitted only when its signal condition holds. */
function deriveVibe(signals: Partial<CreativeSignals>, rationale: string[]): string[] {
  const chips: string[] = [];
  if (has(signals.kairos_pressure)) chips.push('urgent');
  if (typeof signals.formality === 'number' && signals.formality >= FORMALITY_EDGE) chips.push('sober');
  if (typeof signals.formality === 'number' && signals.formality <= -FORMALITY_EDGE) chips.push('casual');
  if (has(signals.warmth)) chips.push('warm');
  if (has(signals.humor)) chips.push('playful');
  if (has(signals.ethos_load)) chips.push('authoritative');
  if (has(signals.narrative_transportation)) chips.push('story-driven');
  if (has(signals.novelty)) chips.push('bold');
  if (chips.length === 0) chips.push('clean'); // neutral default when nothing fired
  const capped = [...new Set(chips)].slice(0, 3);
  rationale.push(`vibe=[${capped.join(', ')}] (from present signals; curated vocabulary)`);
  return capped;
}

const IMAGE_STYLE_BY_MODE: Record<ClickatronVisualMode, string> = {
  auto: 'clean',
  photo: 'editorial photo',
  illustration: 'flat illustration',
  product_mockup: 'product render',
  text_forward_graphic: 'typographic',
  diagram: 'schematic',
  mixed: 'editorial collage',
};

function deriveImageStyle(mode: ClickatronVisualMode, signals: Partial<CreativeSignals>): string[] {
  const styles = [IMAGE_STYLE_BY_MODE[mode]];
  if (has(signals.warmth)) styles.push('warm-toned');
  else if (typeof signals.formality === 'number' && signals.formality >= FORMALITY_EDGE) styles.push('high-contrast');
  return [...new Set(styles)].slice(0, 2);
}

function deriveTemperature(signals: Partial<CreativeSignals>): 'warm' | 'cool' | 'neutral' {
  if (has(signals.warmth) || (typeof signals.emotional_valence === 'number' && signals.emotional_valence > 0.2)) return 'warm';
  if ((typeof signals.formality === 'number' && signals.formality >= FORMALITY_EDGE) ||
      (typeof signals.emotional_valence === 'number' && signals.emotional_valence < -0.2)) return 'cool';
  return 'neutral';
}

/**
 * Derive the carousel visual language from atoms. Pure — no I/O, no LLM, deterministic.
 */
export function deriveCarouselVisualSpec(input: DeriveCarouselInput): DerivedCarouselVisualSpec {
  const rationale: string[] = [];
  const lowConfidenceFields: string[] = [];

  const { mode: visualMode, confident: modeConfident } = deriveVisualMode(input, rationale);
  if (!modeConfident) lowConfidenceFields.push('visualMode');

  const { count: slideCount, confident: countConfident } = deriveSlideCount(input, rationale);
  if (!countConfident) lowConfidenceFields.push('slideCount');

  const slides = deriveSlides(input, slideCount);
  const missingCopy = slides.filter((s) => s.overlayCopy === null && s.role !== 'cta').length;
  if (missingCopy > 0) lowConfidenceFields.push('overlayCopy');

  const vibe = deriveVibe(input.signals, rationale);
  if (vibe.length === 1 && vibe[0] === 'clean') lowConfidenceFields.push('vibe');

  const imageStyle = deriveImageStyle(visualMode, input.signals);
  const temperatureBias = deriveTemperature(input.signals);

  // Copy is layered on overlays by default (never baked as gibberish); the compiler flips
  // this to baked copy only for text-capable models with REAL copy present.
  const textPolicy: ClickatronTextPolicy = 'editable_text_layers';

  // Confidence = share of the 4 major decisions (mode, count, copy, vibe) backed by atoms.
  const confidence = clamp(1 - lowConfidenceFields.length / 4, 0, 1);

  return {
    visualMode,
    textPolicy,
    slideCount,
    slides,
    vibe,
    imageStyle,
    palette: { source: 'brand', temperatureBias },
    confidence,
    lowConfidenceFields: [...new Set(lowConfidenceFields)],
    rationale,
  };
}
