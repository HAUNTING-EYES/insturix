import type { GenerateParams } from "../contract";

/**
 * Shared PostWriter call for the text + graphics generators. Resolves brand context (best-effort)
 * and runs ThinkForge's PostWriterAgent, returning the on-brand post copy / caption. (The image
 * prompt PostWriter can emit is internal plumbing — it's generated and HIDDEN inside ThinkForge's
 * export-to-Clickatron flow at image-gen time, never surfaced to the user.)
 */
export async function runPostWriter(params: GenerateParams): Promise<string> {
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

  return result?.content?.trim() ?? "";
}
