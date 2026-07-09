import type { GenerateParams } from "../contract";
import { resolveSystemBrief } from "./_brand-brief";

export interface PostWriterOutput {
  /** On-brand post copy / caption, ready for the platform (markdown emphasis stripped). */
  content: string;
  /** The tailored single-image prompt PostWriter emits alongside the copy (props + text overlays).
   *  The graphics generator uses this to kick off Clickatron image generation; undefined when the
   *  writer didn't propose an image. */
  imagePrompt?: string;
}

/**
 * Shared PostWriter call for the text + graphics generators. Resolves brand context (best-effort)
 * and runs ThinkForge's PostWriterAgent, returning the on-brand post copy / caption AND the tailored
 * single-image prompt PostWriter emits (previously discarded — now carried so CalOS can drive image
 * generation for graphics cards; the caption path simply ignores `imagePrompt`).
 */
export async function runPostWriter(params: GenerateParams): Promise<PostWriterOutput> {
  const systemBrief = await resolveSystemBrief(params.ownerUserId, params.brandId, params.orgId);

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

  const imagePrompt = result?.clickatron?.singleImagePrompt?.trim();
  return {
    content: stripMarkdownEmphasis(result?.content?.trim() ?? ""),
    ...(imagePrompt ? { imagePrompt } : {}),
  };
}

/** Social platforms render copy as plain text — strip markdown bold markers so posts don't show
 *  literal **asterisks** (LinkedIn/X/IG don't render them). */
function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
}
