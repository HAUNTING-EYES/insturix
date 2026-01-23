import type { AgentScriptResponse, InsertPosition } from './intent';
import { isRichTextAST, type ThinkForgeBlock } from '../schemas/thinkforge-block';

function hasInsertPosition(position: InsertPosition): boolean {
  return (
    (position as any)?.afterBlockId ||
    (position as any)?.beforeBlockId ||
    (position as any)?.atEnd
  );
}

function assertValidBlocks(blocks: unknown[]): asserts blocks is ThinkForgeBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('Invalid AgentScriptResponse: blocks required');
  }
  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      throw new Error('Invalid AgentScriptResponse: block is not an object');
    }
    const b = block as any;
    if (typeof b.id !== 'string' || b.id.length < 4) {
      throw new Error('Invalid AgentScriptResponse: block.id missing');
    }
    if (!isRichTextAST(b.content)) {
      throw new Error(`Invalid AgentScriptResponse: block content invalid (${b.id})`);
    }
  }
}

function assertValidPatches(patches: unknown[], existingBlockIds: Set<string>): void {
  if (!Array.isArray(patches) || patches.length === 0) {
    throw new Error('Invalid AgentScriptResponse: patches required');
  }
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object') {
      throw new Error('Invalid AgentScriptResponse: patch is not an object');
    }
    const p = patch as any;
    if (typeof p.blockId !== 'string' || p.blockId.length < 4) {
      throw new Error('Invalid AgentScriptResponse: patch.blockId missing');
    }
    if (!existingBlockIds.has(p.blockId)) {
      throw new Error(`Invalid AgentScriptResponse: patch.blockId not found (${p.blockId})`);
    }
    if (!isRichTextAST(p.content)) {
      throw new Error(`Invalid AgentScriptResponse: patch content invalid (${p.blockId})`);
    }
  }
}

export function validateAgentResponse(
  response: AgentScriptResponse,
  state: {
    blocks: ThinkForgeBlock[];
  }
): void {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid AgentScriptResponse: not an object');
  }

  if (response.mode !== 'replace' && response.mode !== 'insert' && response.mode !== 'patch') {
    throw new Error('Invalid AgentScriptResponse: missing or invalid mode');
  }

  if (response.mode === 'replace' || response.mode === 'insert') {
    assertValidBlocks(response.blocks);
  }

  if (response.mode === 'insert') {
    if (!response.position || typeof response.position !== 'object' || !hasInsertPosition(response.position)) {
      throw new Error('Invalid AgentScriptResponse: insert.position required');
    }
  }

  if (response.mode === 'patch') {
    const existingIds = new Set(state.blocks.map((b) => b.id));
    assertValidPatches(response.patches, existingIds);
  }
}
