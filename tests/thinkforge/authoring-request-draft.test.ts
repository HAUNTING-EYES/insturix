import { describe, expect, it } from 'vitest';
import {
  createThinkForgeAuthoringRequestDraft,
  resolveThinkForgeAuthoringRequestDraft,
} from '@/lib/thinkforge/schemas/authoring-request-draft';
import {
  buildTrendSelectionPayload,
  trendTargetForAuthoringRequest,
} from '@/components/dashboard/ThinkForge/TrendWorkflowPanel';
import type { TrendCandidate } from '@/lib/thinkforge/trends/trend-evidence';
import { resolveThinkForgePlatformSurfaceFromLabel } from '@/lib/thinkforge/schemas/authoring-request';
import {
  resolveThinkForgePublishingConstraintsForAuthoringRequest,
} from '@/lib/thinkforge/signals/publishing-constraints';

describe('ThinkForge authoring request draft', () => {
  it('normalizes exact platform aliases and preserves unknown destinations explicitly', () => {
    expect(resolveThinkForgePlatformSurfaceFromLabel('Twitter/X')).toEqual({ id: 'x' });
    expect(resolveThinkForgePlatformSurfaceFromLabel('YouTube Shorts')).toEqual({ id: 'youtube' });
    expect(resolveThinkForgePlatformSurfaceFromLabel('Client Community')).toEqual({
      id: 'custom',
      customLabel: 'Client Community',
    });
    expect(() => resolveThinkForgePlatformSurfaceFromLabel('')).toThrow();
  });

  it('requires explicit output and publishing-destination choices', () => {
    const result = resolveThinkForgeAuthoringRequestDraft(createThinkForgeAuthoringRequestDraft());
    expect(result).toEqual({ success: false, error: 'Choose an output type.' });
  });

  it('preserves a seven-minute script without imposing a scene or provider cap', () => {
    const draft = createThinkForgeAuthoringRequestDraft();
    const result = resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'video_script',
      platformId: 'youtube',
      publishingSurfaceId: 'youtube_video',
      durationMinutes: '7',
      durationSeconds: '0',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.request.targetDurationSec).toBe(420);
    expect(result.request.contentContract.outputKind).toBe('video_script');
    expect(result.request.postControls).toBeUndefined();
  });

  it('round-trips exact post controls without changing their values or order', () => {
    const draft = createThinkForgeAuthoringRequestDraft();
    const result = resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'social_post',
      platformId: 'custom',
      publishingSurfaceId: 'custom',
      customPlatformLabel: 'Client community',
      ctaPreference: 'direct',
      ctaAction: 'Book the audit',
      ctaDestination: 'https://example.com/audit',
      hashtagPreference: 'exact',
      hashtags: ['#BrandOps', '#ProofFirst'],
      emojiPreference: 'none',
      targetLengthValue: '240',
      targetLengthUnit: 'words',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(createThinkForgeAuthoringRequestDraft(result.request)).toMatchObject({
      platformId: 'custom',
      publishingSurfaceId: 'custom',
      customPlatformLabel: 'Client community',
      ctaPreference: 'direct',
      ctaAction: 'Book the audit',
      ctaDestination: 'https://example.com/audit',
      hashtagPreference: 'exact',
      hashtags: ['#BrandOps', '#ProofFirst'],
      emojiPreference: 'none',
      targetLengthValue: '240',
      targetLengthUnit: 'words',
    });
  });

  it('fails before generation when exact hashtags are empty', () => {
    const draft = createThinkForgeAuthoringRequestDraft();
    const result = resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'social_post',
      platformId: 'linkedin',
      publishingSurfaceId: 'linkedin_post',
      hashtagPreference: 'exact',
      hashtags: [],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/exact hashtag control requires at least one value/i);
  });

  it.each([
    [['BrandOps'], /must start with #/i],
    [['#Brand Ops'], /contain only letters, marks, numbers, or underscores/i],
    [['#BrandOps', '#brandops'], /must be unique/i],
  ])('rejects an invalid exact hashtag plan: %j', (hashtags, expectedError) => {
    const draft = createThinkForgeAuthoringRequestDraft();
    const result = resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'social_post',
      platformId: 'instagram',
      publishingSurfaceId: 'instagram_feed',
      hashtagPreference: 'exact',
      hashtags,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(expectedError);
  });

  it('accepts exact Unicode hashtags without rewriting them', () => {
    const unicodeHashtag = '#\u0938\u093e\u0915\u094d\u0937\u094d\u092f';
    const draft = createThinkForgeAuthoringRequestDraft();
    const result = resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'social_post',
      platformId: 'instagram',
      publishingSurfaceId: 'instagram_feed',
      hashtagPreference: 'exact',
      hashtags: [unicodeHashtag, '#Evidencia_2026'],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.request.postControls?.hashtags.values).toEqual([unicodeHashtag, '#Evidencia_2026']);
  });

  it('rejects invalid duration seconds and carousel capacity explicitly', () => {
    const draft = createThinkForgeAuthoringRequestDraft();
    expect(resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'video_script',
      platformId: 'youtube',
      publishingSurfaceId: 'youtube_video',
      durationMinutes: '1',
      durationSeconds: '60',
    })).toEqual({ success: false, error: 'Duration seconds must be between 0 and 59.' });

    const carousel = resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'carousel',
      platformId: 'instagram',
      publishingSurfaceId: 'instagram_carousel',
      carouselSlideCount: '8',
    });
    expect(carousel.success).toBe(false);
    if (carousel.success) return;
    expect(carousel.error).toMatch(/between 2 and 7/i);
  });

  it('maps exact carousel and script requests into trend targets without using source platform', () => {
    const base = createThinkForgeAuthoringRequestDraft();
    const carousel = resolveThinkForgeAuthoringRequestDraft({
      ...base,
      outputKind: 'carousel',
      platformId: 'linkedin',
      publishingSurfaceId: 'linkedin_document_carousel',
      carouselSlideCount: '5',
    });
    const script = resolveThinkForgeAuthoringRequestDraft({
      ...base,
      outputKind: 'video_script',
      platformId: 'youtube',
      publishingSurfaceId: 'youtube_video',
      durationMinutes: '7',
    });
    expect(carousel.success).toBe(true);
    expect(script.success).toBe(true);
    if (!carousel.success || !script.success) return;

    const sourceCandidate = { candidateId: 'instagram-source', platform: 'instagram' } as TrendCandidate;
    expect(trendTargetForAuthoringRequest(carousel.request)).toBe('post');
    expect(trendTargetForAuthoringRequest(script.request)).toBe('script');
    expect(buildTrendSelectionPayload('session_1', sourceCandidate, carousel.request)).toEqual({
      sessionId: 'session_1',
      candidate: sourceCandidate,
      target: 'post',
      authoringRequest: carousel.request,
    });
  });

  it('keeps YouTube long-form and Shorts explicit and rejects an overlong Short before generation', () => {
    const base = createThinkForgeAuthoringRequestDraft();
    const ambiguous = resolveThinkForgeAuthoringRequestDraft({
      ...base,
      outputKind: 'video_script',
      platformId: 'youtube',
      durationMinutes: '1',
    });
    expect(ambiguous).toEqual({ success: false, error: 'Choose a publishing destination.' });

    const longForm = resolveThinkForgeAuthoringRequestDraft({
      ...base,
      outputKind: 'video_script',
      platformId: 'youtube',
      publishingSurfaceId: 'youtube_video',
      durationMinutes: '7',
    });
    const overlongShort = resolveThinkForgeAuthoringRequestDraft({
      ...base,
      outputKind: 'video_script',
      platformId: 'youtube',
      publishingSurfaceId: 'youtube_shorts',
      durationMinutes: '7',
    });
    const validShort = resolveThinkForgeAuthoringRequestDraft({
      ...base,
      outputKind: 'video_script',
      platformId: 'youtube',
      publishingSurfaceId: 'youtube_shorts',
      durationMinutes: '3',
    });
    expect(longForm.success).toBe(true);
    expect(overlongShort).toEqual({
      success: false,
      error: 'youtube_shorts supports at most 180 seconds; requested 420 seconds',
    });
    expect(validShort.success).toBe(true);
    if (!longForm.success || !validShort.success) return;

    expect(resolveThinkForgePublishingConstraintsForAuthoringRequest(longForm.request).surface)
      .toBe('youtube_video');
    expect(resolveThinkForgePublishingConstraintsForAuthoringRequest(validShort.request)).toMatchObject({
      surface: 'youtube_shorts',
      sourceId: 'youtube_help',
      maxDurationSeconds: 180,
    });
  });

  it('rejects mismatched product and platform pairs', () => {
    const result = resolveThinkForgeAuthoringRequestDraft({
      ...createThinkForgeAuthoringRequestDraft(),
      outputKind: 'social_post',
      platformId: 'instagram',
      publishingSurfaceId: 'linkedin_post',
    });
    expect(result).toEqual({
      success: false,
      error: 'Publishing destination conflicts with the selected platform.',
    });
  });
});
