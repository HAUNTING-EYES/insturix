import type { GenerateParams, GenerateResult } from "../contract";
import { resolveCalosGenerationRoute } from "../route-map";
import { runPostWriter } from "./_post-writer";
import { runScriptWriterExecution } from "./_script-writer";
import { buildPostWriterArtifact, buildScriptWriterArtifact } from "./_writer-artifact";

/** Generate a complete canonical ThinkForge artifact for a CalOS text or video deliverable. */
export async function thinkforgeGenerator(params: GenerateParams): Promise<GenerateResult> {
  try {
    const route = resolveCalosGenerationRoute(params.format);
    const thinkforgeArtifact = route.documentType === "video_script"
      ? buildScriptWriterArtifact(await runScriptWriterExecution(params))
      : buildPostWriterArtifact(await runPostWriter(params));

    return {
      ok: true,
      assetText: thinkforgeArtifact.content,
      thinkforgeArtifact,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ThinkForge generation failed" };
  }
}
