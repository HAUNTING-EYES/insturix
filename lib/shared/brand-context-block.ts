/**
 * Brand Context Block — Shared Prompt Injection Utility
 *
 * Formats UnifiedBrand data into an XML-structured <brand_context> block
 * that can be injected into ANY LLM prompt across the platform.
 *
 * Single source of truth for brand→prompt formatting (Rule 18N).
 * Consumed by: scene parser, script author, Editron AI chat, unified
 * intelligence, ideas agent, stylist agent, and any future prompt.
 *
 * Design:
 * - Pure function: UnifiedBrand | null → string
 * - Returns empty string when no brand → prompt behaves as before
 * - XML-structured per Rule 35
 * - Compact: only populated fields are included
 */

import type { UnifiedBrand } from './brand-registry';
import {
  type BrandSignal,
  type BrandSignalProfile,
  type BrandProofStyle,
} from './brand-signal-profile';

/**
 * Build an XML-structured brand context block for prompt injection.
 *
 * @param brand - The unified brand from BrandRegistry, or null if no brand
 * @returns XML string to inject into any prompt, or empty string if no brand
 *
 * @example
 * ```ts
 * const brandBlock = buildBrandContextBlock(brand);
 * const prompt = `<role>...</role>\n${brandBlock}\n<task>...</task>`;
 * ```
 */
export function buildBrandContextBlock(brand: UnifiedBrand | null): string {
  if (!brand) return '';

  const lines: string[] = ['<brand_context>'];
  lines.push(`Brand: ${brand.name}`);

  // ── Voice Identity ──────────────────────────────────────────
  if (brand.voice.voiceLock) {
    lines.push(`Voice: ${brand.voice.voiceLock}`);
  }
  if (brand.voice.nicheMap) {
    lines.push(`Audience/Niche: ${brand.voice.nicheMap}`);
  }
  if (brand.voice.killList.length > 0) {
    lines.push(`NEVER use these words/phrases: ${brand.voice.killList.join(', ')}`);
  }
  if (brand.voice.hookArchetypes.length > 0) {
    lines.push(`Preferred hook styles: ${brand.voice.hookArchetypes.join(', ')}`);
  }
  if (brand.voice.structuralHabits.length > 0) {
    lines.push(`Structural habits: ${brand.voice.structuralHabits.join(', ')}`);
  }

  // ── Visual Identity ─────────────────────────────────────────
  if (brand.visual.colors.length > 0) {
    lines.push(`Brand colors: ${brand.visual.colors.join(', ')}`);
  }
  if (brand.visual.visualStyle) {
    lines.push(`Visual style: ${brand.visual.visualStyle}`);
  }
  if (brand.visual.typography) {
    lines.push(`Typography: ${brand.visual.typography}`);
  }
  if (brand.visual.industry) {
    lines.push(`Industry: ${brand.visual.industry}`);
  }

  lines.push('</brand_context>');
  return lines.join('\n');
}

/**
 * Build a compact brand context string (non-XML) for systems that
 * don't use XML prompts (e.g., genre-parameter-computer, quality review).
 *
 * @param brand - The unified brand, or null
 * @returns Flat string summary, or empty string if no brand
 */
export function buildBrandContextFlat(brand: UnifiedBrand | null): string {
  if (!brand) return '';

  const parts: string[] = [`Brand: ${brand.name}`];

  if (brand.voice.voiceLock) parts.push(`Voice: ${brand.voice.voiceLock}`);
  if (brand.visual.colors.length > 0) parts.push(`Colors: ${brand.visual.colors.join(', ')}`);
  if (brand.visual.visualStyle) parts.push(`Style: ${brand.visual.visualStyle}`);
  if (brand.visual.industry) parts.push(`Industry: ${brand.visual.industry}`);
  if (brand.voice.killList.length > 0) parts.push(`Avoid: ${brand.voice.killList.join(', ')}`);

  return parts.join(' | ');
}

// ────────────────────────────────────────────────────────────────────────────
// Rich brand context — reads the evidence-first BrandSignalProfile directly
// ────────────────────────────────────────────────────────────────────────────

/**
 * Confidence floor for an ACCEPTED Brand Vault profile. Lower than raw extraction's 0.55
 * (ACTIONABLE_SIGNAL) because an accepted profile is human-vetted — it only exists once the user
 * accepts it — so we trust its signals at a lower bar, excluding only fallback defaults and
 * unsafe/untrusted signals.
 * 0.50 ← founder decision 2026-06-24 (accepted vault = vetted).
 */
const ACCEPTED_SIGNAL_FLOOR = 0.5;

export function isAcceptedSignalUsable(signal: BrandSignal<unknown>): boolean {
  return (
    signal.confidence >= ACCEPTED_SIGNAL_FLOOR &&
    signal.trustLevel !== 'fallback_default' &&
    signal.authorityClass !== 'unsafe_or_untrusted' &&
    (signal.trustLevel !== 'llm_inference' || signal.evidenceIds.length > 0)
  );
}

function actionableValueOf<T>(signal: BrandSignal<T> | undefined): T | undefined {
  return signal && isAcceptedSignalUsable(signal) ? signal.value : undefined;
}

function actionableListOf(signal: BrandSignal<string[]> | undefined): string[] | undefined {
  const value = actionableValueOf(signal);
  return value && value.length > 0 ? value : undefined;
}

function nonEmptyList(values: string[] | undefined): string[] | undefined {
  return values && values.length > 0 ? values : undefined;
}

const PROOF_STYLE_GUIDANCE: Record<BrandProofStyle, string> = {
  testimonial: 'customer testimonials and quotes',
  metrics: 'concrete numbers and metrics',
  authority: 'expert authority and credentials',
  community: 'community and social proof',
  demo: 'product demonstrations',
  editorial: 'editorial storytelling',
  unknown: '',
};

/**
 * Translate the actionable 0..1 voice dials into plain writing directives.
 * Band: value >= 0.6 reads as the high pole, <= 0.4 the low pole; 0.4–0.6 is treated as
 * "no strong reading" and skipped, so the writer is never over-instructed on a weak signal.
 * (0.6/0.4 is a deliberate neutral band around the 0.5 midpoint — domain choice, not a
 * graph-sourced threshold.)
 */
function describeVoiceTone(voice: BrandSignalProfile['voice']): string[] {
  const out: string[] = [];
  const dial = (signal: BrandSignal<number>, high: string, low: string): void => {
    if (!isAcceptedSignalUsable(signal)) return;
    if (signal.value >= 0.6) out.push(high);
    else if (signal.value <= 0.4) out.push(low);
  };
  dial(voice.assertiveness, 'assertive and confident', 'gentle and understated');
  dial(voice.warmth, 'warm and human', 'cool and clinical');
  dial(voice.defaultFormality, 'formal and professional', 'casual and conversational');
  dial(voice.jargonDensity, 'comfortable with technical, expert-level language', 'plain and jargon-free');
  dial(voice.humor, 'lightly playful and witty', 'serious and straightforward');
  dial(voice.ctaDirectness, 'direct and explicit with calls to action', 'soft and low-pressure with calls to action');
  return out;
}

/**
 * Build an XML brand context block from the RICH accepted Brand Vault profile.
 *
 * Unlike {@link buildBrandContextBlock} (which takes the flattened UnifiedBrand and loses ~40
 * signals), this reads the evidence-first BrandSignalProfile directly, so the writer sees the
 * full, confidence-gated voice + identity guidance. Only USABLE signals are emitted
 * (isAcceptedSignalUsable: trusted source, >= 0.50 confidence — a lower bar than raw extraction's
 * 0.55 because the profile is human-accepted); fallback / unsafe signals are suppressed. Falls back to the legacy
 * UnifiedBrand field, per signal, when the profile doesn't carry an actionable one.
 *
 * Scope is deliberately writer-relevant (identity + voice). Palette / visual / motion dials are
 * for the image/video generators and are intentionally omitted here to keep the copy prompt
 * focused (Rule 35: narrow, relevant context).
 *
 * @param profile - The accepted BrandSignalProfile from the vault
 * @param fallbackBrand - Optional legacy UnifiedBrand for per-field fallback
 * @returns XML <brand_context> block, same shape as buildBrandContextBlock
 */
export function buildRichBrandContextBlock(
  profile: BrandSignalProfile,
  fallbackBrand?: UnifiedBrand | null,
): string {
  const lines: string[] = ['<brand_context>'];

  const name = actionableValueOf(profile.identity.brandName) ?? fallbackBrand?.name ?? 'Brand';
  lines.push(`Brand: ${name}`);

  const category =
    actionableValueOf(profile.identity.category) ??
    actionableValueOf(profile.identity.industry) ??
    fallbackBrand?.visual.industry;
  if (category && category !== 'unknown') lines.push(`Industry/category: ${category}`);

  const audience =
    actionableListOf(profile.identity.audience) ??
    (fallbackBrand?.voice.nicheMap ? [fallbackBrand.voice.nicheMap] : undefined);
  if (audience?.length) lines.push(`Audience: ${audience.join(', ')}`);

  const psycho = profile.identity.audiencePsychographics;
  if (psycho) {
    const drivers = actionableListOf(psycho.valueDrivers);
    const pains = actionableListOf(psycho.painPoints);
    const jtbd = actionableListOf(psycho.jobsToBeDone);
    if (drivers?.length) lines.push(`Audience values: ${drivers.join(', ')}`);
    if (pains?.length) lines.push(`Audience pain points: ${pains.join(', ')}`);
    if (jtbd?.length) lines.push(`Audience is trying to: ${jtbd.join(', ')}`);
  }

  const productServices = actionableListOf(profile.identity.productServices);
  if (productServices?.length) lines.push(`Products/services: ${productServices.join(', ')}`);

  const proofStyle = actionableValueOf(profile.identity.proofStyle);
  if (proofStyle && proofStyle !== 'unknown' && PROOF_STYLE_GUIDANCE[proofStyle]) {
    lines.push(`Persuade with: ${PROOF_STYLE_GUIDANCE[proofStyle]}`);
  }

  const tone = describeVoiceTone(profile.voice);
  if (tone.length) lines.push(`Voice/tone: ${tone.join('; ')}`);

  const hookArchetypes =
    actionableListOf(profile.voice.hookArchetypes) ?? nonEmptyList(fallbackBrand?.voice.hookArchetypes);
  if (hookArchetypes?.length) lines.push(`Preferred hook styles: ${hookArchetypes.join(', ')}`);

  const recurringPhrases =
    actionableListOf(profile.voice.recurringPhrases) ?? nonEmptyList(fallbackBrand?.voice.structuralHabits);
  if (recurringPhrases?.length) lines.push(`Recurring phrases/structures to favor: ${recurringPhrases.join(', ')}`);

  const casingBias = actionableValueOf(profile.typography.casingBias);
  if (casingBias && casingBias !== 'unknown' && casingBias !== 'mixed') {
    lines.push(`Casing style: ${casingBias}`);
  }

  // Hard constraint last (phrased imperatively) so it lands with the most weight.
  const killList = actionableListOf(profile.voice.killList) ?? nonEmptyList(fallbackBrand?.voice.killList);
  if (killList?.length) lines.push(`NEVER use these words/phrases: ${killList.join(', ')}`);

  lines.push('</brand_context>');
  return lines.join('\n');
}
