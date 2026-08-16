import { describe, expect, it } from 'vitest';
import {
  createThinkForgeAuthoringRequestDraft,
  resolveThinkForgeAuthoringRequestDraft,
} from '@/lib/thinkforge/schemas/authoring-request-draft';

describe('ThinkForge authoring request draft', () => {
  it('requires explicit output and platform choices', () => {
    const result = resolveThinkForgeAuthoringRequestDraft(createThinkForgeAuthoringRequestDraft());
    expect(result).toEqual({ success: false, error: 'Choose an output type.' });
  });

  it('preserves a seven-minute script without imposing a scene or provider cap', () => {
    const draft = createThinkForgeAuthoringRequestDraft();
    const result = resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'video_script',
      platformId: 'youtube',
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
      hashtagPreference: 'exact',
      hashtags: [],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/exact hashtag control requires at least one value/i);
  });

  it('rejects invalid duration seconds and carousel capacity explicitly', () => {
    const draft = createThinkForgeAuthoringRequestDraft();
    expect(resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'video_script',
      platformId: 'youtube',
      durationMinutes: '1',
      durationSeconds: '60',
    })).toEqual({ success: false, error: 'Duration seconds must be between 0 and 59.' });

    const carousel = resolveThinkForgeAuthoringRequestDraft({
      ...draft,
      outputKind: 'carousel',
      platformId: 'instagram',
      carouselSlideCount: '8',
    });
    expect(carousel.success).toBe(false);
    if (carousel.success) return;
    expect(carousel.error).toMatch(/between 2 and 7/i);
  });
});
