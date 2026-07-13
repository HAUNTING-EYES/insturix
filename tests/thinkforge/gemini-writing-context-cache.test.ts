import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildWritingContextSystemInstruction,
  generateStructuredWithWritingContextCache,
  generateWithWritingContextCache,
  getCreativeContentKnowledgeText,
} from '@/lib/thinkforge/services/gemini-writing-context-cache';

describe('ThinkForge Gemini writing context cache helpers', () => {
  it('loads the complete creative content knowledge document', () => {
    const text = getCreativeContentKnowledgeText();

    expect(text).toContain('CREATIVE CONTENT KNOWLEDGE');
    expect(text).toContain('# DOCUMENT COMPLETE');
    expect(text).toContain('Content type is EMERGENT from signals');
    expect(text).not.toContain('Status: Part 0 written. Parts 1-8 pending.');
  });

  it('wraps the document as intelligence context instead of a template instruction', () => {
    const instruction = buildWritingContextSystemInstruction('Content type is EMERGENT from signals.');

    expect(instruction).toContain('<creative_content_knowledge>');
    expect(instruction).toContain('Use the creative content knowledge as writing intelligence, not as rigid templates.');
    expect(instruction).toContain('Content type emerges from signals');
    expect(instruction).toContain('</thinkforge_writing_context_rules>');
  });

  it('rejects an already-aborted unstructured request before touching Gemini', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateWithWritingContextCache({ prompt: 'write a post', abortSignal: controller.signal }),
    ).rejects.toThrow('aborted before start');
  });

  it('rejects an already-aborted structured request before touching Gemini', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateStructuredWithWritingContextCache({
        prompt: 'write a script',
        schema: z.object({ output: z.string() }),
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow('aborted before start');
  });
});
