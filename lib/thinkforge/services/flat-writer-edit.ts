/**
 * P5 shared flat-writer edit path. Revises the WHOLE document via the flat writer's editContext
 * mode (ScriptWriter for scripts, PostWriter for posts), parses the revised markdown back into
 * blocks, and saves via ReplaceDocument. Throws on any empty/invalid output or save failure so
 * the calling route can fall back to its legacy author path.
 *
 * Shared by /script/edit-blocks and /script/edit so the revise-and-save logic has one source.
 */
import {
  ScriptWriterAgent,
  type ScriptWriterInput,
  type ScriptWriterResult,
} from '../agents/script-writer-agent';
import {
  PostWriterAgent,
  type PostWriterInput,
  type PostWriterResult,
} from '../agents/post-writer-agent';
import { resolveThinkForgeAuthoringContext } from '../context/resolved-authoring-context';
import { getVersion as getWritingKnowledgeVersion } from '../data/writing-graph-query';
import { resolveThinkForgeProductionBrief } from '../brief/resolve-production-brief';
import { parseMarkdownToBlocks } from '../normalization/markdown-parser';
import { buildThinkForgeSourceLedger } from '../provenance/source-ledger';
import {
  isThinkForgePostKind,
  normalizeThinkForgeDocumentType,
  type ThinkForgeWriterKind,
} from '../schemas/document-contract';
import {
  buildThinkForgeSignalTrace,
  formatContentSignalProfileForPrompt,
  resolveContentSignalProfile,
} from '../signals';
import { resolveProjectMetaBrandId } from '../state/types';
import { applyCommand } from './command-service';
import * as db from './db';

export interface FlatWriterEditArgs {
  userId: string;
  orgId?: string | null;
  sessionId: string;
  scriptId?: string;
  // The current document as stored ({ title, content, blocks, documentType? }).
  existingScript: {
    title?: string;
    content?: string;
    blocks?: unknown[];
    documentType?: string;
    metadata?: Record<string, unknown>;
  } | null | undefined;
  existingContent: string;
  instruction: string;
  selection?: string;
  baseVersion: number;
}

export interface FlatWriterEditResult {
  title: string;
  content: string;
  blocks: unknown[];
}

export function resolveFlatWriterDocumentKind(
  documentType: string | undefined,
  existingContent: string,
): ThinkForgeWriterKind {
  const storedKind = normalizeThinkForgeDocumentType(documentType);
  if (storedKind === 'social_post' || storedKind === 'carousel' || storedKind === 'video_script') {
    return storedKind;
  }

  return /^\s*#{1,3}\s+Scene\s+\d+/im.test(existingContent)
    ? 'video_script'
    : 'social_post';
}

export async function reviseDocumentViaFlatWriter(args: FlatWriterEditArgs): Promise<FlatWriterEditResult> {
  const { userId, orgId, sessionId, scriptId, existingScript, existingContent, instruction, selection, baseVersion } = args;

  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) {
    throw new Error('ThinkForge session not found or not authorized');
  }
  const canonicalScript = await db.getScript(session._id, scriptId || null);

  const documentKind = resolveFlatWriterDocumentKind(
    canonicalScript?.documentType ?? existingScript?.documentType,
    existingContent,
  );
  const isScript = !isThinkForgePostKind(documentKind);
  const authoringContext = await resolveThinkForgeAuthoringContext({
    userId,
    orgId: session.orgId ?? orgId ?? null,
    sessionProjectMeta: session.projectMeta,
    providedProject: session.projectMeta,
    projectId: session._id,
    sessionId: session._id,
    currentPrompt: instruction,
    currentScript: existingContent,
    writingKnowledgeVersion: getWritingKnowledgeVersion(),
  });
  const brandId = resolveProjectMetaBrandId(authoringContext.projectMeta);
  const contentSignalProfile = resolveContentSignalProfile({
    userPrompt: instruction,
    documentType: documentKind,
    platform: authoringContext.projectMeta.platform,
    brandId,
    sessionId: session._id,
    project: authoringContext.projectMeta,
    context: {
      projectSummary: authoringContext.projectMeta.idea ?? authoringContext.projectMeta.purpose ?? '',
      currentScript: existingContent,
      systemBrief: authoringContext.systemBrief,
    },
    retrievedContext: authoringContext.retrievedContext,
    contentContract: canonicalScript?.contentContract,
  });
  const signalTrace = buildThinkForgeSignalTrace(contentSignalProfile);
  const groundedSystemBrief = [
    authoringContext.systemBrief,
    formatContentSignalProfileForPrompt(contentSignalProfile),
  ].filter(Boolean).join('\n\n');
  const productionBrief = resolveThinkForgeProductionBrief({
    userPrompt: instruction,
    project: authoringContext.projectMeta,
    documentType: documentKind,
    contentPath: isScript ? 'script' : 'post',
    brandId,
  });
  const sourceLedger = buildThinkForgeSourceLedger({
    userPrompt: instruction,
    retrievedContext: authoringContext.retrievedContext,
    brandId,
    sessionId: session._id,
  });

  const baseInput = {
    context: {
      projectSummary: canonicalScript?.title || existingScript?.title
        ? `Editing document: ${canonicalScript?.title ?? existingScript?.title}`
        : '',
      currentScript: existingContent,
      systemBrief: groundedSystemBrief,
    },
    userPrompt: instruction,
    retrievedContext: authoringContext.retrievedContext,
    project: authoringContext.projectMeta,
    sessionId: session._id,
    brandId,
    contentSignalProfile,
    productionBrief,
    sourceLedger,
    editContext: { existingContent, instruction, selection },
  };

  const { result } = isScript
    ? await new ScriptWriterAgent().runStructured(baseInput as unknown as ScriptWriterInput)
    : await new PostWriterAgent().runStructured(baseInput as unknown as PostWriterInput);

  const revised = (result as { content?: string }).content ?? '';
  if (revised.trim().length < 30) {
    throw new Error('flat-writer edit returned empty/too-short content');
  }

  const blocks = parseMarkdownToBlocks(revised);
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('flat-writer edit produced no parseable blocks');
  }

  const title = canonicalScript?.title || existingScript?.title || (isScript ? 'Script' : 'Post');
  const previousMetadata = canonicalScript?.metadata && typeof canonicalScript.metadata === 'object'
    ? canonicalScript.metadata
    : existingScript?.metadata ?? {};
  const writerOutput = isScript
    ? scriptWriterMetadata(result as ScriptWriterResult, sourceLedger)
    : postWriterMetadata(result as PostWriterResult);
  const saveResult = await applyCommand({
    type: 'ReplaceDocument',
    sessionId,
    baseVersion,
    source: 'ai',
    payload: {
      scriptId: scriptId || 'default',
      title,
      content: revised,
      blocks,
      documentType: documentKind,
      metadata: {
        ...previousMetadata,
        workflow: 'edit',
        source: 'ai',
        documentType: documentKind,
        authoringContextSnapshot: authoringContext.snapshot,
        signalTrace,
        briefSnapshot: productionBrief,
        writerOutput,
      },
    },
  } as Parameters<typeof applyCommand>[0], userId, orgId);

  if (!saveResult.ok) {
    throw new Error(saveResult.error || 'failed to save revised document');
  }

  const updated = await db.getScript(sessionId, scriptId || null);
  return {
    title: updated?.title || title,
    content: updated?.content || revised,
    blocks: (updated?.blocks as unknown[]) || blocks,
  };
}

function postWriterMetadata(result: PostWriterResult): Record<string, unknown> {
  return {
    writerType: 'post',
    contentAnalysis: result.contentAnalysis,
    hashtags: result.hashtags,
    visualPrompts: result.clickatron,
    writerMetadata: result.metadata,
  };
}

function scriptWriterMetadata(
  result: ScriptWriterResult,
  sourceLedger: ReturnType<typeof buildThinkForgeSourceLedger>,
): Record<string, unknown> {
  return {
    writerType: 'script',
    contentAnalysis: result.contentAnalysis,
    visualPrompts: result.visualMetadata,
    scriptSidecar: result.sidecar,
    sidecarVersion: result.sidecar.sidecarVersion,
    sourceLedger,
    writerMetadata: result.metadata,
  };
}
