import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  createThinkForgeWriterContract,
  normalizeThinkForgeDocumentType,
  parseThinkForgeDocumentContract,
  resolveCarouselSlideCount,
} from '@/lib/thinkforge/schemas/document-contract';
import { PostWriterAgent, type PostWriterInput } from '@/lib/thinkforge/agents/post-writer-agent';
import {
  resolveThinkForgeDocumentIntent,
  resolveThinkForgeGenerationDocumentIntent,
} from '@/lib/thinkforge/agents/prompt-utils';
import { resolveFlatWriterDocumentKind } from '@/lib/thinkforge/services/flat-writer-edit';
import { mergeThinkForgeProjectMetadata } from '@/lib/thinkforge/state/types';

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

    expect(() => parseThinkForgeDocumentContract({
      ...createThinkForgeWriterContract('social_post'),
      carouselSlideCount: 5,
    })).toThrow(/only valid for carousel/i);
  });

  it('captures and validates carousel slide count at intake', () => {
    expect(resolveCarouselSlideCount('Create an Instagram 5-slide carousel')).toBe(5);
    expect(resolveCarouselSlideCount('Create a five-slide Instagram carousel')).toBe(5);
    expect(resolveCarouselSlideCount('Create an Instagram carousel with six slides')).toBe(6);
    expect(normalizeThinkForgeDocumentType('Create an Instagram 5-slide carousel')).toBe('carousel');
    expect(parseThinkForgeDocumentContract({ kind: 'Create a five-slide LinkedIn carousel' })).toMatchObject({
      outputKind: 'carousel',
      carouselSlideCount: 5,
    });
    expect(parseThinkForgeDocumentContract({ kind: 'LinkedIn 6 slides' })).toMatchObject({
      outputKind: 'carousel',
      carouselSlideCount: 6,
    });
    expect(() => resolveCarouselSlideCount('Create an 8-slide carousel')).toThrow(/between 2 and 7/i);
    expect(() => resolveCarouselSlideCount('Create an eight-slide carousel')).toThrow(/between 2 and 7/i);
    expect(() => createThinkForgeWriterContract('carousel', { carouselSlideCount: 1 })).toThrow(/(?:greater than or equal to|>=)\s*2/i);
  });

  it('preserves carousel slide count through direct and system generation intent', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create a 4-slide LinkedIn carousel about approval bottlenecks.',
      undefined,
      'user_request',
    ).contract).toEqual(createThinkForgeWriterContract('carousel', { carouselSlideCount: 4 }));

    const selectedContract = createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 });
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create the complete first draft for this idea.',
      'LinkedIn carousel',
      'initial_draft_claim',
      selectedContract,
    ).contract).toEqual(selectedContract);
  });

  it('threads the persisted carousel count into the one-pass post writer contract', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const input: PostWriterInput = {
      context: { projectSummary: 'Idea: Explain approval bottlenecks\nPlatform: LinkedIn' },
      project: { contentContract: createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }) },
      userPrompt: 'Create the complete first draft.',
    };
    const prompt = new PostWriterAgent().buildPrompt(input);

    expect(prompt).toContain('Return exactly 5 entries in clickatron.carouselPrompts');
    expect(prompt).toContain('never pad the count with invented claims');
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

  it('uses explicit deliverable grammar instead of ambiguous adjectives', () => {
    expect(resolveThinkForgeDocumentIntent(
      'Write a short, honest LinkedIn post for founders.',
      'video_script',
    )).toMatchObject({ contentPath: 'post', outputKind: 'social_post', source: 'user_prompt' });

    expect(resolveThinkForgeDocumentIntent(
      'Write a LinkedIn post about scripts that waste production time.',
      'video_script',
    )).toMatchObject({ contentPath: 'post', outputKind: 'social_post', source: 'user_prompt' });

    expect(resolveThinkForgeDocumentIntent(
      'Turn this LinkedIn post into a reel script with camera direction.',
      'social_post',
    )).toMatchObject({ contentPath: 'script', outputKind: 'video_script', source: 'user_prompt' });
  });

  it('keeps the persisted canonical contract above loose format metadata for system drafts', () => {
    const carouselContract = createThinkForgeWriterContract('carousel');
    const metadata = mergeThinkForgeProjectMetadata(
      { format: 'LinkedIn carousel', contentContract: carouselContract },
      { format: 'video script' },
    );

    expect(metadata.contentContract).toEqual(carouselContract);
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create the complete first script draft for this idea.',
      metadata.format,
      'initial_draft_claim',
      metadata.contentContract,
    )).toMatchObject({ contentPath: 'post', outputKind: 'carousel', source: 'document_type' });
  });

  it('persists a canonical contract at intake and consumes it in generation', () => {
    const page = readFileSync(new URL('../../app/dashboard/thinkforge/page.tsx', import.meta.url), 'utf8');
    const service = readFileSync(new URL('../../lib/thinkforge/services/chat-service.ts', import.meta.url), 'utf8');

    expect(page).toContain('contentContract');
    expect(page).toContain('resolveCarouselSlideCount');
    expect(service).toContain('sessionState.metadata.contentContract');
    expect(service).toContain('contentContract: documentIntent.contract');
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
