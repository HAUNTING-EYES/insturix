import { describe, expect, it } from 'vitest';
import {
  ThinkForgeDocumentAuthorityError,
  resolveThinkForgeGenerationDocumentIntent,
} from '@/lib/thinkforge/agents/prompt-utils';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';

describe('ThinkForge generation route authority', () => {
  it('keeps a selected post contract above script-shaped prompt wording', () => {
    const intent = resolveThinkForgeGenerationDocumentIntent(
      'Write a video script about why LinkedIn posts fail.',
      'video script',
      'user_request',
      createThinkForgeWriterContract('social_post'),
    );

    expect(intent).toMatchObject({
      contentPath: 'post',
      outputKind: 'social_post',
      source: 'content_contract',
    });
  });

  it('keeps a selected script contract above post-shaped prompt wording', () => {
    const intent = resolveThinkForgeGenerationDocumentIntent(
      'Make an Instagram post about our seven-minute documentary.',
      'Instagram post',
      'user_request',
      createThinkForgeWriterContract('video_script'),
    );

    expect(intent).toMatchObject({
      contentPath: 'script',
      outputKind: 'video_script',
      source: 'content_contract',
    });
  });

  it('preserves the selected carousel cardinality', () => {
    const intent = resolveThinkForgeGenerationDocumentIntent(
      'Turn this into a two-slide script outline.',
      undefined,
      'user_request',
      createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
    );

    expect(intent.contract.carouselSlideCount).toBe(5);
    expect(intent.source).toBe('content_contract');
  });

  it('uses prompt routing only for a legacy call with no selected contract', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create a LinkedIn post about production workflows.',
    )).toMatchObject({ outputKind: 'social_post', source: 'explicit_user_request' });

    expect(() => resolveThinkForgeGenerationDocumentIntent(
      'Create a post and a video script.',
    )).toThrow(ThinkForgeDocumentAuthorityError);
  });
});
