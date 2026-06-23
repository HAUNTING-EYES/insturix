import type { GenerateParams, GenerateResult } from "../contract";
import { runPostWriter } from "./_post-writer";

/**
 * ThinkForge text generator: turns a planned text card's brief into a publishable post draft via
 * the existing PostWriterAgent (it reuses ThinkForge's writing path — NOT a parallel writer).
 * Returns the draft as assetText.
 */
export async function thinkforgeGenerator(params: GenerateParams): Promise<GenerateResult> {
  try {
    const { content } = await runPostWriter(params);
    if (!content) return { ok: false, error: "PostWriter returned empty content" };
    return { ok: true, assetText: content };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ThinkForge generation failed" };
  }
}
