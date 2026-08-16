import type { GenerateParams, GenerateResult } from "../contract";
import { resolveCalosGenerationRoute } from "../route-map";
import { runPostWriter } from "./_post-writer";
import { buildPostWriterArtifact } from "./_writer-artifact";

/** Prepare canonical copy and visual intent for a Clickatron-owned CalOS deliverable. */
export async function clickatronGenerator(params: GenerateParams): Promise<GenerateResult> {
  try {
    const route = resolveCalosGenerationRoute(params.format);
    if (route.service !== "clickatron") {
      throw new Error(`CalOS format ${route.format} is not owned by Clickatron.`);
    }

    const output = await runPostWriter(params);
    const thinkforgeArtifact = buildPostWriterArtifact(output);
    if (route.documentType === "carousel") {
      const carouselPrompts = output.result.clickatron.carouselPrompts ?? [];
      if (carouselPrompts.length === 0) {
        throw new Error("PostWriter returned no carousel visual prompts.");
      }
      return {
        ok: true,
        assetText: thinkforgeArtifact.content,
        thinkforgeArtifact,
        status: "drafting",
      };
    }

    if (!output.imagePrompt) {
      throw new Error("PostWriter returned no single-image visual prompt.");
    }
    return {
      ok: true,
      assetText: thinkforgeArtifact.content,
      thinkforgeArtifact,
      status: "drafting",
      imagePrompt: output.imagePrompt,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Clickatron generation failed" };
  }
}
