/**
 * P5 shared flat-writer edit path. Revises the WHOLE document via the flat writer's editContext
 * mode (ScriptWriter for scripts, PostWriter for posts), parses the revised markdown back into
 * blocks, and saves via ReplaceDocument. Throws on any empty/invalid output or save failure so
 * the calling route can fall back to its legacy author path.
 *
 * Shared by /script/edit-blocks and /script/edit so the revise-and-save logic has one source.
 */
import { ScriptWriterAgent, type ScriptWriterInput } from '../agents/script-writer-agent';
import { PostWriterAgent, type PostWriterInput } from '../agents/post-writer-agent';
import { parseMarkdownToBlocks } from '../normalization/markdown-parser';
import {
  isThinkForgePostKind,
  normalizeThinkForgeDocumentType,
  type ThinkForgeWriterKind,
} from '../schemas/document-contract';
import { applyCommand } from './command-service';
import * as db from './db';

export interface FlatWriterEditArgs {
  userId: string;
  sessionId: string;
  scriptId?: string;
  // The current document as stored ({ title, content, blocks, documentType? }).
  existingScript: { title?: string; content?: string; blocks?: unknown[]; documentType?: string } | null | undefined;
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
  const { userId, sessionId, scriptId, existingScript, existingContent, instruction, selection, baseVersion } = args;

  const documentKind = resolveFlatWriterDocumentKind(existingScript?.documentType, existingContent);
  const isScript = !isThinkForgePostKind(documentKind);

  const baseInput = {
    context: { projectSummary: existingScript?.title ? `Editing document: ${existingScript.title}` : '' },
    userPrompt: instruction,
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

  const title = existingScript?.title || (isScript ? 'Script' : 'Post');
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
    },
  } as Parameters<typeof applyCommand>[0], userId);

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
