/**
 * Deterministic Clickatron visual-language derivation.
 *
 * The authored document owns carousel structure. This module annotates that structure
 * with visual style, slide roles, and real overlay copy; it never chooses, clamps, or
 * repairs the number of slides.
 */

import type { CreativeSignals } from '@/lib/shared/signals/types';
import {
  normalizeClickatronCarouselSlideCount,
  type ClickatronTextPolicy,
  type ClickatronVisualMode,
} from '@/lib/thinkforge/schemas/clickatron-creative-contract';

export type CarouselSlideRole = 'hook' | 'context' | 'proof' | 'cta';

export interface DerivedSourceBlock {
  /** Optional heading for the block; preferred as editable overlay copy. */
  title?: string;
  /** Block body; its first sentence is the overlay-copy fallback. */
  text: string;
}

export interface DerivedCarouselSlide {
  index: number;
  role: CarouselSlideRole;
  /** Exact copy from the authored content, or null when the slide stays text-free. */
  overlayCopy: string | null;
  /** Structural layout hint, not final pixel choreography. */
  layoutToken: 'centered-statement' | 'split-emphasis' | 'stat-block' | 'cta-focus';
  sourceBlockIndex: number;
}

export interface DerivedClickatronVisualStyle {
  visualMode: ClickatronVisualMode;
  textPolicy: ClickatronTextPolicy;
  vibe: string[];
  imageStyle: string[];
  palette: {
    source: 'brand';
    temperatureBias: 'warm' | 'cool' | 'neutral';
  };
  confidence: number;
  lowConfidenceFields: string[];
  rationale: string[];
}

export interface DerivedCarouselVisualSpec extends DerivedClickatronVisualStyle {
  slideCount: number;
  slides: DerivedCarouselSlide[];
}

export interface DeriveClickatronVisualStyleInput {
  signals: Partial<CreativeSignals>;
  goal?: string;
  proofPoints?: string[];
  overrides?: {
    visualMode?: ClickatronVisualMode;
  };
}

export interface DeriveCarouselInput extends DeriveClickatronVisualStyleInput {
  /** Exact count from the canonical authored deck. */
  slideCount: number;
  blocks: DerivedSourceBlock[];
}

const SIGNAL_PRESENT = 0.5;
const FORMALITY_EDGE = 0.3;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function has(signal: number | undefined, threshold = SIGNAL_PRESENT): boolean {
  return typeof signal === 'number' && signal >= threshold;
}

function firstLine(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const sentence = trimmed.split(/(?<=[.!?])\s/)[0].trim();
  return sentence.length > 0 ? sentence : null;
}

function deriveVisualMode(
  input: DeriveClickatronVisualStyleInput,
  rationale: string[],
): { mode: ClickatronVisualMode; confident: boolean } {
  const { signals, proofPoints = [], overrides } = input;
  if (overrides?.visualMode) {
    rationale.push(`visualMode=${overrides.visualMode} (user override)`);
    return { mode: overrides.visualMode, confident: true };
  }

  // product_mockup is never inferred from generic conversion or logo presence. It must
  // be explicit because asking an image model to show a product needs product evidence.
  if (has(signals.logos_load) || proofPoints.length >= 2) {
    rationale.push(`visualMode=text_forward_graphic (logos_load present or ${proofPoints.length} proof points)`);
    return { mode: 'text_forward_graphic', confident: true };
  }
  if (has(signals.narrative_transportation) || has(signals.pathos_load) || has(signals.warmth)) {
    rationale.push('visualMode=photo (narrative, pathos, or warmth signal present)');
    return { mode: 'photo', confident: true };
  }
  if (has(signals.education_intent)) {
    rationale.push('visualMode=illustration (education_intent present)');
    return { mode: 'illustration', confident: true };
  }
  rationale.push('visualMode=photo (default; no strong visual signal present)');
  return { mode: 'photo', confident: false };
}

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

  return Array.from({ length: count }, (_, index) => {
    const block = blocks[index];
    if (!block) {
      throw new Error(`carousel visual-language block ${index} is missing`);
    }
    const role = assignRole(index, count, hasProof, goal);
    const extracted = block.title?.trim() || firstLine(block.text);
    return {
      index,
      role,
      overlayCopy: role === 'cta' ? null : (extracted || null),
      layoutToken: layoutForRole(role),
      sourceBlockIndex: index,
    };
  });
}

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
  if (chips.length === 0) chips.push('clean');
  const capped = [...new Set(chips)].slice(0, 3);
  rationale.push(`vibe=[${capped.join(', ')}] (resolved signal vocabulary)`);
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
  if (has(signals.warmth) || (typeof signals.emotional_valence === 'number' && signals.emotional_valence > 0.2)) {
    return 'warm';
  }
  if (
    (typeof signals.formality === 'number' && signals.formality >= FORMALITY_EDGE)
    || (typeof signals.emotional_valence === 'number' && signals.emotional_valence < -0.2)
  ) {
    return 'cool';
  }
  return 'neutral';
}

/** Derive visual style without inventing document structure. */
export function deriveClickatronVisualStyle(
  input: DeriveClickatronVisualStyleInput,
): DerivedClickatronVisualStyle {
  const rationale: string[] = [];
  const lowConfidenceFields: string[] = [];
  const { mode: visualMode, confident: modeConfident } = deriveVisualMode(input, rationale);
  if (!modeConfident) lowConfidenceFields.push('visualMode');

  const vibe = deriveVibe(input.signals, rationale);
  if (vibe.length === 1 && vibe[0] === 'clean') lowConfidenceFields.push('vibe');

  return {
    visualMode,
    textPolicy: 'editable_text_layers',
    vibe,
    imageStyle: deriveImageStyle(visualMode, input.signals),
    palette: { source: 'brand', temperatureBias: deriveTemperature(input.signals) },
    confidence: clamp(1 - lowConfidenceFields.length / 2, 0, 1),
    lowConfidenceFields,
    rationale,
  };
}

/**
 * Annotate an already-authored carousel deck. Invalid structure fails loudly instead of
 * being truncated, padded, or replaced with a platform heuristic.
 */
export function deriveCarouselVisualSpec(input: DeriveCarouselInput): DerivedCarouselVisualSpec {
  const slideCount = normalizeClickatronCarouselSlideCount(input.slideCount);
  if (slideCount === undefined) {
    throw new Error('slideCount is required for carousel visual-language derivation');
  }
  if (input.blocks.length !== slideCount) {
    throw new Error(
      `carousel visual-language blocks must match canonical slideCount (${input.blocks.length}/${slideCount})`,
    );
  }

  const style = deriveClickatronVisualStyle(input);
  const slides = deriveSlides(input, slideCount);
  const lowConfidenceFields = [...style.lowConfidenceFields];
  if (slides.some((slide) => slide.overlayCopy === null && slide.role !== 'cta')) {
    lowConfidenceFields.push('overlayCopy');
  }
  const uniqueLowConfidenceFields = [...new Set(lowConfidenceFields)];

  return {
    ...style,
    slideCount,
    slides,
    confidence: clamp(1 - uniqueLowConfidenceFields.length / 3, 0, 1),
    lowConfidenceFields: uniqueLowConfidenceFields,
    rationale: [...style.rationale, `slideCount=${slideCount} (canonical authored deck)`],
  };
}
