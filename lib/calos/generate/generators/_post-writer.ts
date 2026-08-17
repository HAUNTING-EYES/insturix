import type { PostWriterResult } from "@/lib/thinkforge/agents/post-writer-agent";
import {
  resolveCalosWriterExecutionContext,
  type CalosWriterExecutionContext,
  type CalosWriterParams,
} from "./_brand-brief";

export interface PostWriterOutput extends CalosWriterExecutionContext {
  /** On-brand post copy / caption, ready for the platform (markdown emphasis stripped). */
  content: string;
  result: PostWriterResult;
  /** Tailored single-image prompt emitted by PostWriter for Clickatron. */
  imagePrompt?: string;
}

/** Shared canonical PostWriter call for text and graphics deliverables. */
export async function runPostWriter(params: CalosWriterParams): Promise<PostWriterOutput> {
  const execution = await resolveCalosWriterExecutionContext(params);
  const {
    authoringContext,
    authoringRequest,
    userPrompt,
    sourceLedger,
    productionBrief,
    editorialPlan,
  } = execution;
  const { PostWriterAgent } = await import("@/lib/thinkforge/agents/post-writer-agent");
  const writer = new PostWriterAgent();
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

  const imagePrompt = result.clickatron.singleImagePrompt?.trim();
  return {
    ...execution,
    result,
    content: stripMarkdownEmphasis(result.content.trim()),
    ...(imagePrompt ? { imagePrompt } : {}),
  };
}

/** Social platforms render copy as plain text, not Markdown emphasis. */
function stripMarkdownEmphasis(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
}
