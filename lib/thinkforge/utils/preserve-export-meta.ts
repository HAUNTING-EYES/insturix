import { validateThinkForgeBlocks, type ThinkForgeBlock } from '../schemas/thinkforge-block';
import { extractTextFromRichText } from './thinkforge-block-patch';

function visibleBlockText(block: ThinkForgeBlock): string {
  return extractTextFromRichText(block.content).trim();
}

export function preserveExportMetaForUnchangedBlocks(
  incomingBlocks: ThinkForgeBlock[],
  existingBlocks?: ThinkForgeBlock[] | null,
): ThinkForgeBlock[] {
  const normalizedIncoming = validateThinkForgeBlocks(incomingBlocks);
  if (!normalizedIncoming.length || !existingBlocks?.length) {
    return normalizedIncoming;
  }

  const existingById = new Map<string, ThinkForgeBlock>();
  for (const block of validateThinkForgeBlocks(existingBlocks)) {
    if (block.exportMeta) {
      existingById.set(block.id, block);
    }
  }

  if (!existingById.size) {
    return normalizedIncoming;
  }

  return validateThinkForgeBlocks(normalizedIncoming.map((block) => {
    if (block.exportMeta) {
      return block;
    }

    const previous = existingById.get(block.id);
    if (!previous?.exportMeta) {
      return block;
    }

    if (visibleBlockText(previous) !== visibleBlockText(block)) {
      return block;
    }

    return {
      ...block,
      exportMeta: previous.exportMeta,
    };
  }));
}
