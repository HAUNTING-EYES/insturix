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
    if (!content && !imagePrompt) {
      return { ok: false, error: "PostWriter returned no copy or image prompt" };
    }
    const brief = [
      content ? `Caption:\n${content}` : "",
      imagePrompt ? `Image prompt:\n${imagePrompt}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    // 'drafting' (not 'generated'): the copy + prompt are ready, the image is still to be made.
    return { ok: true, assetText: brief, status: "drafting" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Clickatron generation failed" };
  }
}
