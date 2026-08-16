import { describe, expect, it } from 'vitest';
import { resolveCanonicalEditSelection } from '@/lib/thinkforge/services/canonical-edit-selection';
import type { ThinkForgeBlock } from '@/lib/thinkforge/schemas/thinkforge-block';

function block(id: string, text: string): ThinkForgeBlock {
  return {
    id,
    kind: 'paragraph',
    content: [{ type: 'text', text, styles: {} }],
  };
}

const blocks = [
  block('block_1', 'Caf\u00e9 proof before promise.'),
  block('block_2', 'Keep this operating detail unchanged.'),
];

describe('canonical ThinkForge edit selection', () => {
  it('accepts a selected substring only when it exists in the canonical block scope', () => {
    expect(resolveCanonicalEditSelection({
      blocks,
      targetBlockIds: ['block_1'],
      requestedSelection: 'Cafe\u0301 proof',
    })).toBe('Cafe\u0301 proof');
  });

  it('rejects stale browser text instead of editing an unrelated saved passage', () => {
    expect(() => resolveCanonicalEditSelection({
      blocks,
      targetBlockIds: ['block_1'],
      requestedSelection: 'A sentence from an older browser snapshot.',
    })).toThrow('selected text no longer matches');
  });

  it('rejects stale block identities rather than silently widening the edit scope', () => {
    expect(() => resolveCanonicalEditSelection({
      blocks,
      targetBlockIds: ['missing_block'],
    })).toThrow('selected document blocks are stale');
  });

  it('formats persisted target blocks when no character selection is provided', () => {
    expect(resolveCanonicalEditSelection({
      blocks,
      targetBlockIds: ['block_2'],
    })).toBe('[block_2] (paragraph) Keep this operating detail unchanged.');
  });

  it('leaves a document-wide edit unfocused', () => {
    expect(resolveCanonicalEditSelection({ blocks, targetBlockIds: [] })).toBeUndefined();
  });
});
