import type { ThinkForgeGeneratedArtifact } from "../contract";
import type { PostWriterOutput } from "./_post-writer";
import type { ScriptWriterExecution } from "./_script-writer";

function requireContent(content: string): string {
  const canonical = content.trim();
  if (!canonical) throw new Error("ThinkForge writer returned empty content.");
  return canonical;
}

export function buildPostWriterArtifact(
  output: PostWriterOutput,
): Extract<ThinkForgeGeneratedArtifact, { documentType: "social_post" | "carousel" }> {
  const { route, result, sourceLedger, productionBrief, authoringContext } = output;
  if (route.documentType !== "social_post" && route.documentType !== "carousel") {
    throw new Error(`PostWriter cannot materialize ${route.documentType}.`);
  }
  if (route.contentContract.outputKind !== route.documentType) {
    throw new Error("CalOS post route and document contract disagree.");
  }

  return {
    content: requireContent(output.content),
    documentType: route.documentType,
    contentContract: route.contentContract,
    briefSnapshot: productionBrief,
    authoringContextSnapshot: authoringContext.snapshot,
    signalTrace: authoringContext.signalTrace,
    writerOutput: {
      writerType: "post",
      contentAnalysis: result.contentAnalysis,
      hashtags: result.hashtags,
      visualPrompts: result.clickatron,
      sourceLedger,
      writerMetadata: result.metadata,
    },
  };
}

export function buildScriptWriterArtifact(
  output: ScriptWriterExecution,
): Extract<ThinkForgeGeneratedArtifact, { documentType: "video_script" }> {
  const { route, result, sourceLedger, productionBrief, authoringContext } = output;
  if (route.documentType !== "video_script") {
    throw new Error(`ScriptWriter cannot materialize ${route.documentType}.`);
  }
  if (route.contentContract.outputKind !== "video_script") {
    throw new Error("CalOS script route and document contract disagree.");
  }

  return {
    content: requireContent(output.content),
    documentType: "video_script",
    contentContract: route.contentContract,
    briefSnapshot: productionBrief,
    authoringContextSnapshot: authoringContext.snapshot,
    signalTrace: authoringContext.signalTrace,
    writerOutput: {
      writerType: "script",
      contentAnalysis: result.contentAnalysis,
      visualPrompts: result.visualMetadata,
      scriptSidecar: result.sidecar,
      sidecarVersion: result.sidecar.sidecarVersion,
      sourceLedger,
      writerMetadata: result.metadata,
    },
  };
}
