import type { GenerateParams, GenerateResult } from "../contract";

/**
 * ThinkForge text generator: turns a planned text card's brief into a publishable post draft via
 * the existing PostWriterAgent (it reuses ThinkForge's writing path — NOT a parallel writer).
 * Returns the draft as assetText. Brand context is best-effort for on-brand voice.
 */
export async function thinkforgeGenerator(params: GenerateParams): Promise<GenerateResult> {
  try {
    let systemBrief = "";
    try {
      const { resolveEffectiveBrand } = await import("@/lib/shared/brand-effective-resolver");
      const { buildBrandContextBlock } = await import("@/lib/shared/brand-context-block");
      const brand = await resolveEffectiveBrand(params.ownerUserId, params.brandId, {
        service: "thinkforge",
      });
      systemBrief = buildBrandContextBlock(brand);
    } catch {
      /* brand context is best-effort — proceed without it */
    }

    const userPrompt = [
      params.title,
      params.angle ? `Angle: ${params.angle}` : "",
      `Platform: ${params.platform}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { PostWriterAgent } = await import("@/lib/thinkforge/agents/post-writer-agent");
    const writer = new PostWriterAgent();
    const { result } = await writer.runStructured({
      context: { projectSummary: params.title, systemBrief },
      userPrompt,
      brandId: params.brandId,
    });

    const text = result?.content?.trim();
    if (!text) return { ok: false, error: "PostWriter returned empty content" };
    return { ok: true, assetText: text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ThinkForge generation failed" };
  }
}
