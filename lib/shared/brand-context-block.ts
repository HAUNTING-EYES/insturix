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
