import { describe, expect, it } from 'vitest';
import {
  normalizeThinkForgeDocumentType,
  parseThinkForgeDocumentContract,
} from '@/lib/thinkforge/schemas/document-contract';
import {
  resolveThinkForgeDocumentIntent,
  resolveThinkForgeGenerationDocumentIntent,
} from '@/lib/thinkforge/agents/prompt-utils';
import { resolveFlatWriterDocumentKind } from '@/lib/thinkforge/services/flat-writer-edit';

describe('ThinkForge canonical document contract', () => {
  it('normalizes legacy and user-facing labels at the boundary', () => {
    expect(normalizeThinkForgeDocumentType('post')).toBe('social_post');
    expect(normalizeThinkForgeDocumentType('screenplay')).toBe('video_script');
    expect(normalizeThinkForgeDocumentType('Instagram carousel')).toBe('carousel');
    expect(parseThinkForgeDocumentContract({ kind: 'screenplay' })).toEqual({
      version: 1,
      documentKind: 'script',
      outputKind: 'video_script',
      artifactType: 'screenplay',
    });
  });

  it('rejects unsupported versions and inconsistent dimensions', () => {
    expect(() => parseThinkForgeDocumentContract({
      version: 2,
      documentKind: 'script',
      outputKind: 'video_script',
      artifactType: 'screenplay',
    })).toThrow(/unsupported document contract version/i);

    expect(() => parseThinkForgeDocumentContract({
      version: 1,
      documentKind: 'post',
      outputKind: 'video_script',
      artifactType: 'screenplay',
    })).toThrow(/inconsistent/i);
  });

  it('keeps post, carousel, and video-script intent distinct', () => {
    expect(resolveThinkForgeDocumentIntent(
      'Write a LinkedIn post about video production workflows.',
      'screenplay',
    )).toMatchObject({ contentPath: 'post', documentKind: 'post', outputKind: 'social_post' });

    expect(resolveThinkForgeDocumentIntent(
      'Create an Instagram carousel for this campaign.',
      'video_script',
    )).toMatchObject({ contentPath: 'post', documentKind: 'post', outputKind: 'carousel' });

    expect(resolveThinkForgeDocumentIntent(
      'Write an Instagram reel script with camera direction.',
      'post',
    )).toMatchObject({ contentPath: 'script', documentKind: 'script', outputKind: 'video_script' });
  });

  it('uses the selected canonical kind for system-triggered initial drafts', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create the complete first draft for this idea.',
      'Instagram carousel',
      'initial_draft_claim',
    )).toMatchObject({
      contentPath: 'post',
      documentType: 'carousel',
      source: 'document_type',
    });
  });

  it('uses persisted kind before markdown heuristics for follow-up edits', () => {
    expect(resolveFlatWriterDocumentKind('screenplay', 'Plain legacy script content')).toBe('video_script');
    expect(resolveFlatWriterDocumentKind('post', '# Scene 1\nThis heading is quoted in the post.')).toBe('social_post');
    expect(resolveFlatWriterDocumentKind('carousel', 'Slide copy')).toBe('carousel');
    expect(resolveFlatWriterDocumentKind(undefined, '# Scene 1\nOpening')).toBe('video_script');
  });
});
