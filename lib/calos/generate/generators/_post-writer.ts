import type { GenerateParams } from "../contract";

/**
 * Shared PostWriter call for the text + graphics generators. Resolves brand context (best-effort)
 * and runs ThinkForge's PostWriterAgent, returning BOTH the post copy and the image prompt
 * PostWriter emits (its `clickatron` field) so graphics can hand a tailored prompt to Clickatron.
 */
export async function runPostWriter(
  params: GenerateParams,
): Promise<{ content: string; imagePrompt: string | null }> {
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

  const content = result?.content?.trim() ?? "";
  const carousel = result?.clickatron?.carouselPrompts;
  const imagePrompt =
    result?.clickatron?.singleImagePrompt?.trim() ||
    (Array.isArray(carousel) && carousel.length ? carousel.join("\n\n") : "") ||
    null;
  return { content, imagePrompt };
}
