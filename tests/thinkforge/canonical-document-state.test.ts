import { describe, expect, it } from 'vitest';
import {
  normalizeCanonicalThinkForgeDocumentState,
  serializeThinkForgeBlocksToMarkdown,
} from '@/lib/thinkforge/canonical-document-state';
import { thinkForgeBlocksToTiptapJSON } from '@/lib/thinkforge/mappers/thinkforge-to-tiptap';
import { tiptapJSONToThinkForgeBlocks } from '@/lib/thinkforge/mappers/tiptap-to-thinkforge';
import type { ThinkForgeBlock } from '@/lib/thinkforge/schemas/thinkforge-block';

const paragraph: ThinkForgeBlock = {
  id: 'block_paragraph',
  kind: 'paragraph',
  content: [{ type: 'text', text: 'A useful post.', styles: {} }],
};

describe('canonical ThinkForge document state', () => {
  it('derives non-empty content from the editor Tiptap document', () => {
    const richText = thinkForgeBlocksToTiptapJSON([paragraph]);
    const state = normalizeCanonicalThinkForgeDocumentState({ richText, content: '' });

    expect(state.content).toBe('A useful post.');
    expect(state.blocks).toHaveLength(1);
  });

  it('rejects contradictory projections atomically', () => {
    const richText = thinkForgeBlocksToTiptapJSON([paragraph]);
    expect(() => normalizeCanonicalThinkForgeDocumentState({
      richText,
      blocks: [{ ...paragraph, content: [{ type: 'text', text: 'Different copy.', styles: {} }] }],
    })).toThrow(/blocks conflicts/i);
    expect(() => normalizeCanonicalThinkForgeDocumentState({
      richText,
      content: 'Different copy.',
    })).toThrow(/content conflicts/i);
  });

  it('uses block structure as the canonical markdown form before signing a document', () => {
    const heading: ThinkForgeBlock = {
      id: 'block_heading',
      kind: 'header',
      content: [{ type: 'text', text: 'Approval ownership', styles: {} }],
      meta: { level: 3 },
    };
    const richText = thinkForgeBlocksToTiptapJSON([heading]);

    const state = normalizeCanonicalThinkForgeDocumentState({
      blocks: [heading],
      richText,
      content: '### Approval ownership',
    });

    expect(state.content).toBe('### Approval ownership');
    expect(tiptapJSONToThinkForgeBlocks(richText)[0]?.meta).toEqual({ level: 3 });
    expect(serializeThinkForgeBlocksToMarkdown(state.blocks)).toBe(state.content);
  });

  it('accepts canonical prose after a scene without reparsing it through the lossy markdown importer', () => {
    const scene: ThinkForgeBlock = {
      id: 'block_scene',
      kind: 'scene',
      content: [{ type: 'text', text: 'Deliver the core claim.', styles: {} }],
      scene: { visualDescription: 'Show the proof.', subjects: [] },
    };
    const closing: ThinkForgeBlock = {
      id: 'block_closing',
      kind: 'paragraph',
      content: [{ type: 'text', text: 'Exact manually edited closing.', styles: {} }],
    };
    const blocks = [scene, closing];
    const richText = thinkForgeBlocksToTiptapJSON(blocks);
    const content = serializeThinkForgeBlocksToMarkdown(blocks);

    const state = normalizeCanonicalThinkForgeDocumentState({ richText, blocks, content });

    expect(state.content).toBe(content);
    expect(state.content).toContain('Exact manually edited closing.');
  });

  it('round-trips every scene slot used by production guidance', () => {
    const scene: ThinkForgeBlock = {
      id: 'block_scene',
      kind: 'scene',
      content: [{ type: 'text', text: 'Say the opening line.', styles: {} }],
      scene: {
        visualDescription: 'Medium close-up at eye level.',
        subjects: [{ name: 'Host', category: 'person' }],
        duration: 12,
        durationExplicit: true,
        mood: 'assured',
        onScreenText: ['A clear promise'],
        sfxDescription: 'Soft click',
        musicDescription: 'Restrained pulse',
      },
    };

    const roundTrip = tiptapJSONToThinkForgeBlocks(thinkForgeBlocksToTiptapJSON([scene]));
    expect(roundTrip[0]?.scene).toEqual(scene.scene);
    expect(serializeThinkForgeBlocksToMarkdown(roundTrip)).toContain('**Visual:** Medium close-up at eye level.');
  });
});
