import type { GenerateParams } from "../contract";
import { resolveSystemBrief } from "./_brand-brief";

/**
 * ScriptWriter call for CalOS video deliverables.
 *
 * A video card's deliverable IS a script: CalOS writes it from the card's idea + small brief via
 * ThinkForge's ScriptWriterAgent. The user then drives the video forward themselves — ThinkForge ->
 * Editron for an AI-assisted edit, or take the script and shoot/upload their own footage. CalOS
 * never renders the video (Editron has no headless render entry point). Returns the script markdown.
 */
export async function runScriptWriter(params: GenerateParams): Promise<string> {
  const systemBrief = await resolveSystemBrief(params.ownerUserId, params.brandId, params.orgId);

  const userPrompt = [
    params.title, // the idea
    params.angle ? `Brief: ${params.angle}` : "", // the small brief (card.details)
    params.format ? `Format: ${params.format}` : "",
    `Platform: ${params.platform}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { ScriptWriterAgent } = await import("@/lib/thinkforge/agents/script-writer-agent");
  const writer = new ScriptWriterAgent();
  const { result } = await writer.runStructured({
    context: { projectSummary: params.title, systemBrief },
    userPrompt,
    brandId: params.brandId,
  });

  return result?.content?.trim() ?? "";
}
