import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { extractTextFromRichText } from '../utils/thinkforge-block-patch';

function normalizeForComparison(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function blockText(block: ThinkForgeBlock): string {
  return extractTextFromRichText(block.content).trim();
}

export function resolveCanonicalEditSelection(input: {
  blocks: ThinkForgeBlock[];
  targetBlockIds: string[];
  requestedSelection?: string | null;
}): string | undefined {
  const targetIds = [...new Set(input.targetBlockIds.filter((id) => id && id !== '__END__'))];
  const targetIdSet = new Set(targetIds);
  const targetBlocks = targetIds.length > 0
    ? input.blocks.filter((block) => targetIdSet.has(block.id))
    : [];

  if (targetBlocks.length !== targetIds.length) {
    throw new Error('The selected document blocks are stale. Reload the document and try the edit again.');
  }

  const requestedSelection = input.requestedSelection?.trim();
  if (requestedSelection) {
    const canonicalScope = (targetBlocks.length > 0 ? targetBlocks : input.blocks)
      .map(blockText)
      .filter(Boolean)
      .join('\n\n');
    if (!normalizeForComparison(canonicalScope).includes(normalizeForComparison(requestedSelection))) {
      throw new Error('The selected text no longer matches the saved document. Reload and select it again.');
    }
    return requestedSelection;
  }

  if (targetBlocks.length === 0) return undefined;
  return targetBlocks
    .map((block) => `[${block.id}] (${block.kind}) ${blockText(block)}`.trim())
    .filter(Boolean)
    .join('\n');
}
