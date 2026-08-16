import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  createThinkForgeWriterContract,
  normalizeThinkForgeDocumentType,
  parseThinkForgeDocumentContract,
  resolveExplicitThinkForgeDocumentRequest,
  resolveCarouselSlideCount,
} from '@/lib/thinkforge/schemas/document-contract';
import { PostWriterAgent, type PostWriterInput } from '@/lib/thinkforge/agents/post-writer-agent';
import {
  resolveThinkForgeDocumentIntent,
  resolveThinkForgeGenerationDocumentIntent,
} from '@/lib/thinkforge/agents/prompt-utils';
import { mergeThinkForgeProjectMetadata } from '@/lib/thinkforge/state/types';
import { buildThinkForgeAuthoringCompatibilityMetadata } from '@/lib/thinkforge/schemas/authoring-request';

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
    expect(resolveCarouselSlideCount('Create an 8-slide carousel')).toBe(8);
    expect(resolveCarouselSlideCount('Create an eight-slide carousel')).toBe(8);
    expect(resolveCarouselSlideCount('Create a 300-slide LinkedIn document carousel')).toBe(300);
    expect(() => resolveCarouselSlideCount('Create a 301-slide carousel')).toThrow(/between 2 and 300/i);
    expect(() => createThinkForgeWriterContract('carousel', { carouselSlideCount: 1 })).toThrow(/(?:greater than or equal to|>=)\s*2/i);
  });

  it('preserves carousel slide count through direct and system generation intent', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create a 4-slide LinkedIn carousel about approval bottlenecks.',
      'carousel',
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

    expect(prompt).toContain('Return exactly 5 entries in clickatron.carouselDeck.slides');
    expect(prompt).toContain('authorized sourceRefs from tf_untrusted_data.claimSources');
    expect(prompt).toContain('never pad the count with invented claims');
  });

  it('keeps the selected contract authoritative when prompt topics mention another format', () => {
    expect(resolveThinkForgeDocumentIntent(
      'Write a LinkedIn post about video production workflows.',
      'screenplay',
      createThinkForgeWriterContract('social_post'),
    )).toMatchObject({ contentPath: 'post', documentKind: 'post', outputKind: 'social_post' });

    expect(resolveThinkForgeDocumentIntent(
      'Write a script explaining this campaign.',
      'screenplay',
      createThinkForgeWriterContract('carousel', { carouselSlideCount: 5 }),
    )).toMatchObject({ contentPath: 'post', documentKind: 'post', outputKind: 'carousel' });

    expect(resolveThinkForgeDocumentIntent(
      'Write an Instagram post about scripts with camera direction.',
      'post',
      createThinkForgeWriterContract('video_script'),
    )).toMatchObject({ contentPath: 'script', documentKind: 'script', outputKind: 'video_script' });
  });

  it('distinguishes an explicit output target from subject-matter words', () => {
    expect(resolveExplicitThinkForgeDocumentRequest(
      'Write a LinkedIn post about video production scripts.',
    )).toMatchObject({ status: 'supported', contract: { outputKind: 'social_post' } });
    expect(resolveExplicitThinkForgeDocumentRequest(
      'Create a seven-minute YouTube video about LinkedIn posts.',
    )).toMatchObject({ status: 'supported', contract: { outputKind: 'video_script' } });
    expect(resolveExplicitThinkForgeDocumentRequest(
      'Turn this LinkedIn post into a 6-slide Instagram carousel.',
    )).toMatchObject({
      status: 'supported',
      contract: { outputKind: 'carousel', carouselSlideCount: 6 },
    });
  });

  it('requires a conversion to update the typed contract before generation', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Turn this post into an Instagram reel script with camera direction.',
      'Instagram post',
      'user_request',
      createThinkForgeWriterContract('social_post'),
    )).toMatchObject({
      contentPath: 'post',
      outputKind: 'social_post',
      source: 'content_contract',
    });

    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create the complete first draft for this idea about video production.',
      'Instagram post',
      'initial_draft_claim',
      createThinkForgeWriterContract('social_post'),
    )).toMatchObject({
      contentPath: 'post',
      outputKind: 'social_post',
      source: 'content_contract',
    });
  });

  it('does not let unsupported or multi-output wording mutate a typed session', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Write a newsletter about our launch.',
      'Instagram post',
      'user_request',
      createThinkForgeWriterContract('social_post'),
    )).toMatchObject({ outputKind: 'social_post', source: 'content_contract' });

    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create a post and a video script for this launch.',
      'Instagram post',
      'user_request',
      createThinkForgeWriterContract('social_post'),
    )).toMatchObject({ outputKind: 'social_post', source: 'content_contract' });

    expect(() => resolveThinkForgeGenerationDocumentIntent(
      'Write a newsletter about our launch.',
    )).toThrow(/production writer contract for newsletter/i);
    expect(() => resolveThinkForgeGenerationDocumentIntent(
      'Create a post and a video script for this launch.',
    )).toThrow(/choose one output/i);
  });

  it('fails closed without document authority instead of guessing from prose', () => {
    expect(() => resolveThinkForgeDocumentIntent(
      'Write a short, honest LinkedIn post for founders.',
    )).toThrow(/choose a post, carousel, or script document/i);

    expect(() => resolveThinkForgeDocumentIntent(
      'Write a video script for this character profile.',
      'character_bible',
    )).toThrow(/not handled by the post or script writer/i);
  });

  it('does not let prompt wording reclassify a selected legacy document', () => {
    expect(resolveThinkForgeDocumentIntent(
      'Write a short, honest LinkedIn post for founders.',
      'video_script',
    )).toMatchObject({ contentPath: 'script', outputKind: 'video_script', source: 'legacy_document_type' });

    expect(resolveThinkForgeDocumentIntent(
      'Write a LinkedIn post about scripts that waste production time.',
      'social_post',
    )).toMatchObject({ contentPath: 'post', outputKind: 'social_post', source: 'legacy_document_type' });

    expect(resolveThinkForgeDocumentIntent(
      'Turn this LinkedIn post into a reel script with camera direction.',
      'social_post',
    )).toMatchObject({ contentPath: 'post', outputKind: 'social_post', source: 'legacy_document_type' });
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
    )).toMatchObject({ contentPath: 'post', outputKind: 'carousel', source: 'content_contract' });
  });

  it('canonicalizes all compatibility fields from the persisted authoring request', () => {
    const authoringRequest = {
      version: 1 as const,
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' as const },
      targetDurationSec: 420,
    };
    const metadata = mergeThinkForgeProjectMetadata(
      {
        authoringRequest,
        format: '60-second LinkedIn video script',
        platform: 'LinkedIn',
        durationSec: 60,
      },
      { format: 'Instagram post', platform: 'Instagram', durationSec: 30 },
    );

    expect(metadata).toMatchObject({
      authoringRequest,
      contentContract: authoringRequest.contentContract,
      format: '7-minute YouTube video script',
      platform: 'YouTube',
      durationSec: 420,
    });
  });

  it('rejects competing authoring requests and explicit document contracts', () => {
    const scriptRequest = {
      version: 1 as const,
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' as const },
      targetDurationSec: 420,
    };
    const postRequest = {
      version: 1 as const,
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' as const },
      postControls: {
        version: 1 as const,
        cta: { preference: 'editorial' as const },
        hashtags: { preference: 'editorial' as const },
        emoji: { preference: 'editorial' as const },
      },
    };

    expect(() => mergeThinkForgeProjectMetadata(
      { authoringRequest: scriptRequest },
      { authoringRequest: postRequest },
    )).toThrow(/conflicting authoring requests/i);
    expect(() => mergeThinkForgeProjectMetadata(
      { authoringRequest: scriptRequest },
      { contentContract: createThinkForgeWriterContract('social_post') },
    )).toThrow(/conflicts with an explicit project document contract/i);
  });

  it('persists the explicit authoring request at intake and consumes its contract in generation', () => {
    const page = readFileSync(new URL('../../app/dashboard/thinkforge/page.tsx', import.meta.url), 'utf8');
    const service = readFileSync(new URL('../../lib/thinkforge/services/chat-service.ts', import.meta.url), 'utf8');

    expect(page).toContain('authoringRequest');
    expect(page).toContain('ThinkForgeAuthoringRequestSchema.parse');
    expect(page).not.toContain('resolveCarouselSlideCount');
    expect(service).toContain('resolveProjectMetaAuthoringRequest(sessionState.metadata)');
    expect(service).toContain('authoringRequest: authoritativeAuthoringRequest');
    expect(service).toContain('authoritativeAuthoringRequest?.contentContract');
    expect(service).toContain('contentContract: documentIntent.contract');
    expect(service).toContain('ThinkForge generation requires an authoritative document contract');
    expect(service).not.toContain("requestedDocumentIntent?.documentType ?? 'screenplay'");
    expect(service).not.toContain('content signal profile resolution failed');
    expect(service).not.toContain('collectExemplarPassively');
  });

  it('keeps client drafting on the typed contract without duration or carousel prose parsing', () => {
    const page = readFileSync(new URL('../../app/dashboard/thinkforge/page.tsx', import.meta.url), 'utf8');
    const ideaGrid = readFileSync(new URL('../../components/dashboard/ThinkForge/IdeaGrid.tsx', import.meta.url), 'utf8');
    const chatPanel = readFileSync(new URL('../../components/dashboard/ThinkForge/ChatPanel.tsx', import.meta.url), 'utf8');
    const settings = readFileSync(new URL('../../components/dashboard/ThinkForge/SessionMetadataSettings.tsx', import.meta.url), 'utf8');
    const storyboarding = readFileSync(new URL('../../components/dashboard/ThinkForge/StoryboardingMode.tsx', import.meta.url), 'utf8');

    expect(ideaGrid).toContain('describeThinkForgeAuthoringDeliverable');
    expect(ideaGrid).not.toContain('setExpandedIdea({ ...expandedIdea, format:');
    expect(ideaGrid).not.toContain('setExpandedIdea({ ...expandedIdea, platform:');
    expect(chatPanel).toContain('resolveSelectedIdeaAuthoringRequest');
    expect(chatPanel).toContain('buildThinkForgeAuthoringCompatibilityMetadata');
    expect(chatPanel).toContain('!effectiveAuthoringRequest && !hasDocumentContent');
    expect(chatPanel).not.toContain('normalizeThinkForgeDocumentContract(selectedIdea.format)');
    expect(chatPanel).not.toContain('resolveCarouselSlideCount');
    expect(chatPanel).not.toContain('60-second');
    expect(chatPanel).not.toContain('under 60 seconds');
    expect(settings).toContain("contentContract.outputKind === 'video_script'");
    expect(settings).toContain('synchronizeIdeaWithAuthoringRequest');
    expect(settings).not.toContain('formats.some');
    expect(settings).not.toContain('setFormats');
    expect(storyboarding).toContain('selectedIdea={selectedIdea}');
    expect(page).toContain('setAuthoringRequest(restoredIdea.authoringRequest || null)');
  });

  it('derives compatibility metadata from an arbitrary explicit script duration', () => {
    const metadata = buildThinkForgeAuthoringCompatibilityMetadata({
      version: 1,
      contentContract: createThinkForgeWriterContract('video_script'),
      platformSurface: { id: 'youtube' },
      targetDurationSec: 420,
    });

    expect(metadata).toMatchObject({
      durationSec: 420,
      format: '7-minute YouTube video script',
      platform: 'YouTube',
      contentContract: createThinkForgeWriterContract('video_script'),
    });
    expect(metadata.authoringRequest.targetDurationSec).toBe(420);
  });

  it('uses the selected canonical kind for system-triggered initial drafts', () => {
    expect(resolveThinkForgeGenerationDocumentIntent(
      'Create the complete first draft for this idea.',
      'Instagram carousel',
      'initial_draft_claim',
    )).toMatchObject({
      contentPath: 'post',
      documentType: 'carousel',
      source: 'legacy_document_type',
    });
  });

});
