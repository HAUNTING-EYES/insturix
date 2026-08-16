/**
 * P5 shared flat-writer edit path. Revises the WHOLE document via the flat writer's editContext
 * mode (ScriptWriter for scripts, PostWriter for posts), parses the revised markdown back into
 * blocks, and saves via ReplaceDocument. The persisted session/document is the sole authority;
 * browser-provided document snapshots are never accepted as edit input.
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
import { buildContinuedThinkForgeSourceLedger } from '../provenance/source-ledger-continuity';
import {
  isThinkForgePostKind,
  normalizeThinkForgeDocumentType,
  ThinkForgeDocumentContractSchema,
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
  scriptId: string;
  instruction: string;
  selection?: string;
  /** @deprecated Ignored. Persisted document state is loaded by exact identity. */
  existingScript?: {
    title?: string;
    content?: string;
    blocks?: unknown[];
    documentType?: string;
    metadata?: Record<string, unknown>;
  } | null | undefined;
  /** @deprecated Ignored. Persisted document content is authoritative. */
  existingContent?: string;
  /** @deprecated Ignored. The persisted version is the commit baseline. */
  baseVersion?: number;
}

export type FlatWriterEditResult = db.Script;

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

function requireExactIdentity(value: unknown, label: 'session' | 'document'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`ThinkForge ${label} identity is required`);
  }
  if (value.trim() !== value) {
    throw new Error(`ThinkForge ${label} identity is invalid`);
  }
  return value;
}

function resolveStoredWriterKind(script: db.Script): ThinkForgeWriterKind {
  const documentKind = normalizeThinkForgeDocumentType(script.documentType);
  if (documentKind !== 'social_post' && documentKind !== 'carousel' && documentKind !== 'video_script') {
    throw new Error('Stored ThinkForge document type is unsupported');
  }

  if (script.contentContract !== undefined) {
    const parsedContract = ThinkForgeDocumentContractSchema.safeParse(script.contentContract);
    if (!parsedContract.success) {
      throw new Error('Stored ThinkForge document contract is invalid');
    }
    if (parsedContract.data.outputKind !== documentKind) {
      throw new Error('Stored ThinkForge document contract conflicts with its type');
    }
  }

  return documentKind;
}

export async function reviseDocumentViaFlatWriter(args: FlatWriterEditArgs): Promise<FlatWriterEditResult> {
  const { userId, orgId, instruction, selection } = args;
  const sessionId = requireExactIdentity(args.sessionId, 'session');
  const scriptId = requireExactIdentity(args.scriptId, 'document');

  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) {
    throw new Error('ThinkForge session not found or not authorized');
  }
  const canonicalSessionId = session._id;
  const canonicalOrgId = session.orgId ?? orgId ?? null;
  const canonicalScript = await db.getScript(canonicalSessionId, scriptId);
  if (!canonicalScript) {
    throw new Error('ThinkForge document not found');
  }

  const documentKind = resolveStoredWriterKind(canonicalScript);
  const existingContent = typeof canonicalScript.content === 'string' ? canonicalScript.content : '';
  const isScript = !isThinkForgePostKind(documentKind);
  const authoringContext = await resolveThinkForgeAuthoringContext({
    userId,
    orgId: canonicalOrgId,
    sessionProjectMeta: session.projectMeta,
    providedProject: session.projectMeta,
    projectId: canonicalSessionId,
    sessionId: canonicalSessionId,
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
    sessionId: canonicalSessionId,
    project: authoringContext.projectMeta,
    context: {
      projectSummary: authoringContext.projectMeta.idea ?? authoringContext.projectMeta.purpose ?? '',
      currentScript: existingContent,
      systemBrief: authoringContext.systemBrief,
    },
    retrievedContext: authoringContext.retrievedContext,
    contentContract: canonicalScript.contentContract,
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
  const previousMetadata = canonicalScript.metadata && typeof canonicalScript.metadata === 'object'
    ? canonicalScript.metadata as Record<string, unknown>
    : {};
  const previousWriterOutput = previousMetadata.writerOutput
    && typeof previousMetadata.writerOutput === 'object'
    && !Array.isArray(previousMetadata.writerOutput)
    ? previousMetadata.writerOutput as Record<string, unknown>
    : {};
  const sourceLedger = buildContinuedThinkForgeSourceLedger({
    userPrompt: instruction,
    retrievedContext: authoringContext.retrievedContext,
    brandId,
    sessionId: canonicalSessionId,
    previousLedger: previousWriterOutput.sourceLedger,
  });

  const baseInput = {
    context: {
      projectSummary: canonicalScript.title
        ? `Editing document: ${canonicalScript.title}`
        : '',
      currentScript: existingContent,
      systemBrief: groundedSystemBrief,
    },
    userPrompt: instruction,
    retrievedContext: authoringContext.retrievedContext,
    project: authoringContext.projectMeta,
    sessionId: canonicalSessionId,
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

  const title = canonicalScript.title;
  const writerOutput = isScript
    ? scriptWriterMetadata(result as ScriptWriterResult, sourceLedger)
    : postWriterMetadata(result as PostWriterResult, sourceLedger);
  const saveResult = await applyCommand({
    type: 'ReplaceDocument',
    sessionId: canonicalSessionId,
    baseVersion: canonicalScript.version ?? 0,
    source: 'ai',
    payload: {
      scriptId,
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
  } as Parameters<typeof applyCommand>[0], userId, canonicalOrgId);

  if (!saveResult.ok) {
    throw new Error(saveResult.error || 'failed to save revised document');
  }

  return saveResult.script;
}

function postWriterMetadata(
  result: PostWriterResult,
  sourceLedger: ReturnType<typeof buildContinuedThinkForgeSourceLedger>,
): Record<string, unknown> {
  return {
    writerType: 'post',
    contentAnalysis: result.contentAnalysis,
    hashtags: result.hashtags,
    visualPrompts: result.clickatron,
    sourceLedger,
    writerMetadata: result.metadata,
  };
}

function scriptWriterMetadata(
  result: ScriptWriterResult,
  sourceLedger: ReturnType<typeof buildContinuedThinkForgeSourceLedger>,
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
