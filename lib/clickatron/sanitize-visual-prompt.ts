/**
 * Visual-prompt guard [R6] — enforce the "imagePrompt is visual-only" contract that the
 * ThinkForge writer is already instructed to follow but sometimes violates.
 *
 * The sidecar tells the writer: "Keep renderPlan.imagePrompt focused on scene,
 * composition, objects, metaphor, style, mood, and layout" and "Put exact readable words
 * in renderPlan.textLayers, NOT inside renderPlan.imagePrompt" (clickatron-creative-
 * sidecar.ts:203,208). When the LLM disobeys, the imagePrompt ends with an appended
 * metadata block — "…Overlay text: 'Unlock the Entire Insturix Production Floor'. Brand:
 * Insturix. Audience: … Offer: … Product: … CTA: …" (observed in prod 2026-07-05). A
 * diffusion model reads those as things to DRAW, so it bakes the brand name as text and
 * invents a logo.
 *
 * This is NOT a content-guessing regex (Rule 29): it removes only sentence segments that
 * begin with a known non-visual METADATA LABEL. A real visual sentence ("a billboard
 * reading 'SALE'", "the product sits on a walnut table") has no such leading label, so it
 * is never touched. If stripping would empty the prompt, the original is returned
 * unchanged (fail-safe — never send an empty prompt to the model).
 */

// Labels that are brief/handoff metadata, never a visual scene directive. Matched only at
// the START of a sentence, followed by a colon. Each ← the writer's brief field names.
const NON_VISUAL_META_LABEL =
  /^(?:brand|overlay text|overlay copy|text overlay|caption|cta|call to action|offer|product|audience|objective|goal|deliverable|platform|angle|tone)\s*:/i;

export interface SanitizedVisualPrompt {
  clean: string;
  /** The segments that were removed — surfaced for logging/telemetry, not the user. */
  stripped: string[];
}

/**
 * Strip appended non-visual metadata from an image/scene prompt. Deterministic and pure.
 */
export function sanitizeVisualPrompt(prompt: string): SanitizedVisualPrompt {
  if (typeof prompt !== 'string' || !prompt.trim()) return { clean: prompt ?? '', stripped: [] };

  // Split into sentences on terminal punctuation; a leading quote/space is tolerated so
  // `Overlay text: 'Unlock …'.` is still recognized as a labeled segment.
  const sentences = prompt.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  const stripped: string[] = [];
  for (const sentence of sentences) {
    const probe = sentence.trim().replace(/^['"“”]/, '');
    if (NON_VISUAL_META_LABEL.test(probe)) stripped.push(sentence.trim());
    else kept.push(sentence);
  }

  const clean = kept.join(' ').trim();
  // Fail-safe: if the whole prompt was metadata (nothing visual left), keep the original
  // rather than emit an empty prompt. The loud log below still records the anomaly.
  if (!clean) return { clean: prompt.trim(), stripped: [] };
  return { clean, stripped };
}
