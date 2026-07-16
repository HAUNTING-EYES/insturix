import type { ThinkForgeBlock } from '@/lib/thinkforge/schemas/thinkforge-block';
import { validateThinkForgeBlocks } from '@/lib/thinkforge/schemas/thinkforge-block';
import { thinkForgeBlocksToTiptapJSON } from '@/lib/thinkforge/mappers/thinkforge-to-tiptap';
import { tiptapJSONToThinkForgeBlocks } from '@/lib/thinkforge/mappers/tiptap-to-thinkforge';
import { applyThinkForgeBlockPatches, extractTextFromRichText, type ThinkForgeBlockPatch } from '@/lib/thinkforge/utils/thinkforge-block-patch';
import { preserveExportMetaForUnchangedBlocks } from '@/lib/thinkforge/utils/preserve-export-meta';
import type { TiptapJSON } from '@/lib/thinkforge/schemas/tiptap-schema';
import * as db from '@/lib/thinkforge/services/db';
import {
  ThinkForgeDocumentContractSchema,
  createThinkForgeWriterContract,
  normalizeThinkForgeDocumentContract,
  type ThinkForgeDocumentContract,
} from '@/lib/thinkforge/schemas/document-contract';

export type CommandType = 'UpdateBlock' | 'InsertBlock' | 'DeleteBlock' | 'ReplaceDocument';
export type CommandSource = 'user' | 'ai';

export type CommandRequest = {
  type: CommandType;
  payload: Record<string, any>;
  sessionId: string;
  baseVersion: number;
  source: CommandSource;
};

export type CommandResult =
  | { ok: true; script: db.Script }
  | { ok: false; error: string; currentVersion?: number };

function normalizeBlocksFromPayload(payload: Record<string, any>): ThinkForgeBlock[] {
  if (Array.isArray(payload.blocks)) {
    return validateThinkForgeBlocks(payload.blocks);
  }
  if (payload.richText && typeof payload.richText === 'object') {
    const blocks = tiptapJSONToThinkForgeBlocks(payload.richText as TiptapJSON);
    return validateThinkForgeBlocks(blocks);
  }
  return [];
}

function computeContentFromBlocks(blocks: ThinkForgeBlock[]): string {
  return blocks.map((b) => extractTextFromRichText(b.content)).join('\n\n');
}

function canonicalDocumentType(contract: ThinkForgeDocumentContract): string {
  return contract.documentKind === 'document' ? contract.artifactType : contract.outputKind;
}

function contractsMatch(
  left: ThinkForgeDocumentContract,
  right: ThinkForgeDocumentContract,
): boolean {
  return left.version === right.version
    && left.documentKind === right.documentKind
    && left.outputKind === right.outputKind
    && left.artifactType === right.artifactType;
}

function parseStoredContract(script: db.Script): ThinkForgeDocumentContract | null {
  if (script.contentContract) {
    return ThinkForgeDocumentContractSchema.parse(script.contentContract);
  }
  if (!script.documentType) return null;
  return normalizeThinkForgeDocumentContract(script.documentType);
}

export async function applyCommand(
  request: CommandRequest,
  userId: string,
  orgId?: string | null,
): Promise<CommandResult> {
  const { type, payload, sessionId, baseVersion } = request;
  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) {
    return { ok: false, error: 'Session not found' };
  }
  const canonicalSessionId = session._id;

  const scriptId = typeof payload.scriptId === 'string' ? payload.scriptId : 'default';
  const existing = await db.getScript(canonicalSessionId, scriptId);
  const currentVersion = existing?.version ?? 0;

  let effectiveBaseVersion = baseVersion;
  // For ReplaceDocument on a non-existing script, allow creation regardless of baseVersion
  // This enables the "New Page" flow where the editor sends its current version
  if (type === 'ReplaceDocument' && !existing) {
    // Allow creation - treat as version 0 base
    effectiveBaseVersion = 0;
  } else if (baseVersion !== currentVersion) {
    return { ok: false, error: 'Version conflict', currentVersion };
  }

  let nextBlocks: ThinkForgeBlock[] = existing?.blocks ? validateThinkForgeBlocks(existing.blocks) : [];
  let nextTitle = existing?.title || 'Untitled Script';
  let nextRichText: TiptapJSON | null = existing?.richText ? (existing.richText as TiptapJSON) : null;
  let nextMetadata = existing?.metadata;
  let nextContract: ThinkForgeDocumentContract;
  try {
    const storedContract = existing ? parseStoredContract(existing) : null;
    if (existing?.documentType && !storedContract) {
      return { ok: false, error: 'Stored script has an unsupported document type' };
    }
    nextContract = storedContract
      ?? normalizeThinkForgeDocumentContract(session.projectMeta?.format)
      ?? createThinkForgeWriterContract('video_script');
  } catch {
    return { ok: false, error: 'Stored script has an invalid document contract' };
  }

  if (type === 'ReplaceDocument') {
    nextBlocks = preserveExportMetaForUnchangedBlocks(normalizeBlocksFromPayload(payload), nextBlocks);
    nextTitle = typeof payload.title === 'string' ? payload.title : nextTitle;
    nextRichText = payload.richText ? (payload.richText as TiptapJSON) : thinkForgeBlocksToTiptapJSON(nextBlocks);
    nextMetadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? payload.metadata
      : nextMetadata;
    const explicitContract = payload.contentContract !== undefined
      ? ThinkForgeDocumentContractSchema.safeParse(payload.contentContract)
      : null;
    if (explicitContract && !explicitContract.success) {
      return { ok: false, error: 'Invalid document contract' };
    }

    const explicitDocumentType = typeof payload.documentType === 'string' && payload.documentType.trim()
      ? normalizeThinkForgeDocumentContract(payload.documentType)
      : null;
    if (typeof payload.documentType === 'string' && payload.documentType.trim() && !explicitDocumentType) {
      return { ok: false, error: 'Unsupported document type' };
    }

    if (explicitContract?.success && explicitDocumentType
      && !contractsMatch(explicitContract.data, explicitDocumentType)) {
      return { ok: false, error: 'Document contract conflicts with document type' };
    }

    if (explicitContract?.success) {
      nextContract = explicitContract.data;
    } else if (explicitDocumentType) {
      nextContract = explicitDocumentType;
    }
  }

  if (type === 'UpdateBlock') {
    if (!payload.blockId) {
      return { ok: false, error: 'Missing blockId' };
    }
    const patch: ThinkForgeBlockPatch = {
      blockId: String(payload.blockId),
      content: Array.isArray(payload.content) ? payload.content : undefined,
      text: typeof payload.text === 'string' ? payload.text : undefined,
      kind: payload.kind,
      meta: payload.meta,
    };
    nextBlocks = applyThinkForgeBlockPatches(nextBlocks, [patch]);
    nextRichText = thinkForgeBlocksToTiptapJSON(nextBlocks);
  }

  if (type === 'InsertBlock') {
    const block = payload.block;
    if (!block) {
      return { ok: false, error: 'Missing block' };
    }
    const patch: ThinkForgeBlockPatch = {
      blockId: String(block.id || 'NEW_BLOCK'),
      content: Array.isArray(block.content) ? block.content : undefined,
      text: typeof block.text === 'string' ? block.text : undefined,
      kind: block.kind,
      meta: block.meta,
    };
    nextBlocks = applyThinkForgeBlockPatches(nextBlocks, [patch], {
      insertAfterId: payload.insertAfterBlockId ? String(payload.insertAfterBlockId) : undefined,
      insertBeforeId: payload.insertBeforeBlockId ? String(payload.insertBeforeBlockId) : undefined,
      defaultKind: block.kind || 'paragraph',
    });
    nextRichText = thinkForgeBlocksToTiptapJSON(nextBlocks);
  }

  if (type === 'DeleteBlock') {
    const blockId = payload.blockId ? String(payload.blockId) : null;
    if (!blockId) {
      return { ok: false, error: 'Missing blockId' };
    }
    nextBlocks = validateThinkForgeBlocks(nextBlocks.filter((b) => b.id !== blockId));
    nextRichText = thinkForgeBlocksToTiptapJSON(nextBlocks);
  }

  const nextContent = typeof payload.content === 'string' && type === 'ReplaceDocument'
    ? payload.content
    : computeContentFromBlocks(nextBlocks);

  const saveResult = await db.saveScriptWithVersion(
    canonicalSessionId,
    {
      title: nextTitle,
      content: nextContent,
      blocks: nextBlocks,
      richText: nextRichText || undefined,
      metadata: nextMetadata,
      documentType: canonicalDocumentType(nextContract),
      contentContract: nextContract,
    },
    effectiveBaseVersion,
    scriptId
  );

  if (!saveResult.ok) {
    return { ok: false, error: saveResult.error, currentVersion: saveResult.currentVersion };
  }

  return { ok: true, script: saveResult.script };
}
