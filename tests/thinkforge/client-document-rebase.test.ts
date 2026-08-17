import { describe, expect, it } from 'vitest';

import { rebaseThinkForgeDocument } from '../../lib/thinkforge/client-document-rebase';

function doc(...paragraphs: string[]): Record<string, unknown> {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

function paragraphTexts(richText: unknown): string[] {
  const document = richText as { content?: Array<Record<string, unknown>> };
  return (document.content ?? []).map((paragraph) => {
    const content = Array.isArray(paragraph.content) ? paragraph.content : [];
    return content.map((node) => typeof node.text === 'string' ? node.text : '').join('');
  });
}

describe('ThinkForge document three-way rebase', () => {
  it('merges independent edits to different blocks', () => {
    const result = rebaseThinkForgeDocument({
      base: { title: 'Draft', richText: doc('Hook', 'Proof') },
      local: { title: 'Draft', richText: doc('Sharper hook', 'Proof') },
      remote: { title: 'Draft', richText: doc('Hook', 'Verified proof') },
    });

    expect(result.status).toBe('merged');
    if (result.status === 'merged') {
      expect(paragraphTexts(result.richText)).toEqual(['Sharper hook', 'Verified proof']);
    }
  });

  it('merges separate word-level edits inside the same paragraph', () => {
    const result = rebaseThinkForgeDocument({
      base: { title: 'Draft', richText: doc('The quick brown fox ships today.') },
      local: { title: 'Draft', richText: doc('The very quick brown fox ships today.') },
      remote: { title: 'Draft', richText: doc('The quick brown fox ships tomorrow.') },
    });

    expect(result.status).toBe('merged');
    if (result.status === 'merged') {
      expect(paragraphTexts(result.richText)).toEqual(['The very quick brown fox ships tomorrow.']);
    }
  });

  it('rejects competing changes to the same text span without choosing a winner', () => {
    const result = rebaseThinkForgeDocument({
      base: { title: 'Draft', richText: doc('Ship today') },
      local: { title: 'Draft', richText: doc('Ship tomorrow') },
      remote: { title: 'Draft', richText: doc('Ship next week') },
    });

    expect(result).toMatchObject({
      status: 'conflict',
      conflicts: expect.arrayContaining([
        expect.objectContaining({ reason: 'overlapping_change' }),
      ]),
    });
  });

  it('rejects delete-versus-modify conflicts', () => {
    const result = rebaseThinkForgeDocument({
      base: { title: 'Draft', richText: doc('Hook', 'Proof') },
      local: { title: 'Draft', richText: doc('Hook') },
      remote: { title: 'Draft', richText: doc('Hook', 'Stronger proof') },
    });

    expect(result).toMatchObject({
      status: 'conflict',
      conflicts: expect.arrayContaining([
        expect.objectContaining({ reason: 'delete_modify' }),
      ]),
    });
  });

  it('merges a title edit with an independent body edit', () => {
    const result = rebaseThinkForgeDocument({
      base: { title: 'Draft', richText: doc('Hook') },
      local: { title: 'Launch story', richText: doc('Hook') },
      remote: { title: 'Draft', richText: doc('Sharper hook') },
    });

    expect(result.status).toBe('merged');
    if (result.status === 'merged') {
      expect(result.title).toBe('Launch story');
      expect(paragraphTexts(result.richText)).toEqual(['Sharper hook']);
    }
  });
});
