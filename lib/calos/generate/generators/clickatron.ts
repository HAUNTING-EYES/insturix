import type { GenerateParams, GenerateResult } from "../contract";
import { runPostWriter } from "./_post-writer";

/**
 * Clickatron graphics generator (v1 — handoff). Produces the on-brand caption + a tailored image
 * PROMPT (PostWriter's clickatron field) as the creative brief. The image itself is made by
 * Clickatron's session-based, async, credit-charged generator — so this leaves the card in
 * 'drafting' with the brief ready; pulling the finished image back onto the card (assetUrl) is the
 * shared completion callback, built with the approval/learning phase. No new LLM prompt here, so
 * no new eval gate (PostWriter's prompt is ThinkForge's and eval'd there).
 */
export async function clickatronGenerator(params: GenerateParams): Promise<GenerateResult> {
  try {
    const { content, imagePrompt } = await runPostWriter(params);
    if (!content) return { ok: false, error: "PostWriter returned empty caption" };
    // v1: produce the on-brand CAPTION (visible) + carry the writer's tailored image prompt so the
    // dispatcher can kick off Clickatron image generation for this card. The image itself is made
    // async in Clickatron (credit-charged) and pulled back onto the card by the completion callback,
    // so status stays 'drafting' until the asset lands.
    return { ok: true, assetText: content, status: "drafting", ...(imagePrompt ? { imagePrompt } : {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Clickatron generation failed" };
  }
}
