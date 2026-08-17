import type { ScriptWriterResult } from "@/lib/thinkforge/agents/script-writer-agent";
import {
  resolveCalosWriterExecutionContext,
  type CalosWriterExecutionContext,
  type CalosWriterParams,
} from "./_brand-brief";

export interface ScriptWriterExecution extends CalosWriterExecutionContext {
  content: string;
  result: ScriptWriterResult;
}

/** Canonical ScriptWriter call for a CalOS video deliverable. */
export async function runScriptWriterExecution(
  params: CalosWriterParams,
): Promise<ScriptWriterExecution> {
  const execution = await resolveCalosWriterExecutionContext(params);
  const {
    authoringContext,
    authoringRequest,
    userPrompt,
    sourceLedger,
    productionBrief,
    editorialPlan,
  } = execution;
  const { ScriptWriterAgent } = await import("@/lib/thinkforge/agents/script-writer-agent");
  const writer = new ScriptWriterAgent();
  const { result } = await writer.runStructured({
    context: {
      projectSummary: authoringContext.projectMeta.title || params.title,
      systemBrief: authoringContext.systemBrief,
    },
    userPrompt,
    authoringRequest,
    brandId: authoringContext.projectMeta.brandId,
    project: authoringContext.projectMeta,
    retrievedContext: authoringContext.retrievedContext,
    contentSignalProfile: authoringContext.contentSignalProfile,
    productionBrief,
    sourceLedger,
    editorialPlan,
  });

  return {
    ...execution,
    result,
    content: result.content.trim(),
  };
}

/** Backward-compatible text projection for callers not yet migrated to the full artifact. */
export async function runScriptWriter(params: CalosWriterParams): Promise<string> {
  return (await runScriptWriterExecution(params)).content;
}
