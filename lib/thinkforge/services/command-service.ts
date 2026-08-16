import type { ThinkForgeBlock } from '@/lib/thinkforge/schemas/thinkforge-block';
import { validateThinkForgeBlocks } from '@/lib/thinkforge/schemas/thinkforge-block';
import { applyThinkForgeBlockPatches, extractTextFromRichText, type ThinkForgeBlockPatch } from '@/lib/thinkforge/utils/thinkforge-block-patch';
import { thinkForgeBlocksToTiptapJSON } from '@/lib/thinkforge/mappers/thinkforge-to-tiptap';
import type { TiptapJSON } from '@/lib/thinkforge/schemas/tiptap-schema';
import {
  normalizeCanonicalThinkForgeDocumentState,
  ThinkForgeDocumentStateError,
} from '@/lib/thinkforge/canonical-document-state';
import * as db from '@/lib/thinkforge/services/db';
import {
  ThinkForgeDocumentContractSchema,
  normalizeThinkForgeDocumentContract,
  thinkForgeDocumentContractMatchesClassification,
  thinkForgeDocumentContractsMatchExactly,
  type ThinkForgeDocumentContract,
} from '@/lib/thinkforge/schemas/document-contract';
import { reconcileWriterOutputMetadata } from '@/lib/thinkforge/persistence/writer-output-binding';

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

const USER_MUTABLE_METADATA_KEYS = new Set(['canonicalFormat']);

function asMetadataRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function resolveDocumentMetadata(
  existing: unknown,
  incoming: unknown,
  source: CommandSource,
): Record<string, any> {
  const existingMetadata = asMetadataRecord(existing);
  const incomingMetadata = asMetadataRecord(incoming);
  if (source === 'ai') {
    return { ...existingMetadata, ...incomingMetadata, source: 'ai' };
  }

  const userMetadata = Object.fromEntries(
    Object.entries(incomingMetadata).filter(([key]) => USER_MUTABLE_METADATA_KEYS.has(key)),
  );
  return {
    ...existingMetadata,
    ...userMetadata,
    source: typeof existingMetadata.source === 'string' ? existingMetadata.source : 'user',
  };
}

function computeContentFromBlocks(blocks: ThinkForgeBlock[]): string {
  return blocks.map((b) => extractTextFromRichText(b.content)).join('\n\n');
}

function canonicalDocumentType(contract: ThinkForgeDocumentContract): string {
  return contract.documentKind === 'document' ? contract.artifactType : contract.outputKind;
}

function parseStoredContract(script: db.Script): ThinkForgeDocumentContract | null {
  if (script.contentContract) {
    return ThinkForgeDocumentContractSchema.parse(script.contentContract);
  }
  if (!script.documentType) return null;
  return normalizeThinkForgeDocumentContract(script.documentType);
}

function parseSessionContract(projectMeta: unknown): ThinkForgeDocumentContract | null {
  if (!projectMeta || typeof projectMeta !== 'object' || Array.isArray(projectMeta)) {
    return null;
  }

  const metadata = projectMeta as Record<string, unknown>;
  if (metadata.contentContract !== undefined && metadata.contentContract !== null) {
    return ThinkForgeDocumentContractSchema.parse(metadata.contentContract);
  }

  return null;
}

export async function applyCommand(
  request: CommandRequest,
  userId: string,
  orgId?: string | null,
): Promise<CommandResult> {
  const { type, payload, sessionId, baseVersion } = request;
  if (typeof payload.scriptId !== 'string' || payload.scriptId.trim().length === 0) {
    return { ok: false, error: 'Document identity is required' };
  }
  if (payload.scriptId.trim() !== payload.scriptId) {
    return { ok: false, error: 'Document identity is invalid' };
  }

  const session = await db.getSession(sessionId, userId, orgId);
  if (!session) {
    return { ok: false, error: 'Session not found' };
  }
  const canonicalSessionId = session._id;

  const scriptId = payload.scriptId;
  const existing = await db.getScript(canonicalSessionId, scriptId);
  const currentVersion = existing?.version ?? 0;

  if (baseVersion !== currentVersion) {
    return { ok: false, error: 'Version conflict', currentVersion };
  }

  let nextBlocks: ThinkForgeBlock[] = existing?.blocks ? validateThinkForgeBlocks(existing.blocks) : [];
  let nextTitle = existing?.title || 'Untitled Script';
  let nextRichText: TiptapJSON | null = existing?.richText ? (existing.richText as TiptapJSON) : null;
  let nextMetadata = existing?.metadata;
  let replacementContent: string | null = null;
  let nextContract: ThinkForgeDocumentContract | null;
  try {
    const storedContract = existing ? parseStoredContract(existing) : null;
    if (existing?.documentType && !storedContract) {
      return { ok: false, error: 'Stored script has an unsupported document type' };
    }
    nextContract = storedContract
      ?? parseSessionContract(session.projectMeta);
  } catch {
    return { ok: false, error: 'Stored script has an invalid document contract' };
  }

  if (type === 'ReplaceDocument') {
    try {
      const canonicalState = normalizeCanonicalThinkForgeDocumentState(payload, nextBlocks);
      nextBlocks = canonicalState.blocks;
      nextRichText = canonicalState.richText;
      replacementContent = canonicalState.content;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof ThinkForgeDocumentStateError
          ? error.message
          : 'Invalid canonical document state',
      };
    }
    nextTitle = typeof payload.title === 'string' ? payload.title : nextTitle;
    nextMetadata = resolveDocumentMetadata(nextMetadata, payload.metadata, request.source);
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
      && !thinkForgeDocumentContractMatchesClassification(explicitContract.data, explicitDocumentType)) {
      return { ok: false, error: 'Document contract conflicts with document type' };
    }

    if (existing && nextContract) {
      if (explicitContract?.success
        && !thinkForgeDocumentContractsMatchExactly(nextContract, explicitContract.data)) {
        return { ok: false, error: 'Document contract is immutable' };
      }
      if (explicitDocumentType
        && !thinkForgeDocumentContractMatchesClassification(nextContract, explicitDocumentType)) {
        return { ok: false, error: 'Document contract is immutable' };
      }
    }
    const requestedContract = explicitContract?.success
      ? explicitContract.data
      : explicitDocumentType;
    if (!existing && requestedContract) {
      nextContract = requestedContract;
    }
  }

  if (!nextContract) {
    return {
      ok: false,
      error: existing
        ? 'Stored script is missing a document contract'
        : 'Document contract is required for a new document',
    };
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

  const nextContent = type === 'ReplaceDocument'
    ? replacementContent ?? ''
    : computeContentFromBlocks(nextBlocks);

  try {
    nextMetadata = reconcileWriterOutputMetadata({
      existingMetadata: existing?.metadata,
      incomingMetadata: payload.metadata,
      nextMetadata,
      source: request.source,
      previousContent: typeof existing?.content === 'string' ? existing.content : '',
      nextContent,
      previousVersion: currentVersion,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? `Invalid writer output metadata: ${error.message}`
        : 'Invalid writer output metadata',
    };
  }

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
    baseVersion,
    scriptId
  );

  if (!saveResult.ok) {
    return { ok: false, error: saveResult.error, currentVersion: saveResult.currentVersion };
  }

  return { ok: true, script: saveResult.script };
}
