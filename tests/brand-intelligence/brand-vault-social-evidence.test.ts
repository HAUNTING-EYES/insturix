import { describe, expect, it } from 'vitest';
import { createBrandVaultSocialEvidenceCandidates } from '../../lib/shared/brand-vault-social-evidence';
import type { BrandVaultSourceInput } from '../../lib/shared/brand-website-refinery-types';

const OBSERVED_AT = '2026-06-16T00:00:00.000Z';

describe('Brand Vault social evidence candidates', () => {
  it('uses media OCR, media transcript, and profile bio when caption text is absent', () => {
    const source: BrandVaultSourceInput = {
      kind: 'social_post',
      url: 'https://www.instagram.com/p/brand_systems_1/',
      platform: 'instagram',
      name: 'Instagram media brand_systems_1',
      evidenceOrigin: 'public_fallback',
      pinned: true,
      media: {
        mediaType: 'video',
        thumbnailUrl: 'https://cdn.example/thumb.jpg',
        ocrText: 'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams.',
        transcript: 'Book a demo this week.',
      },
      profile: {
        bio: 'AI content production for agencies.',
        category: 'Software',
      },
    };

    const candidates = createBrandVaultSocialEvidenceCandidates({
      jobId: 'brand_refinery_job_social_media_text',
      source,
      sourceField: 'sourceEvidence.0',
      startIndex: 0,
      observedAt: OBSERVED_AT,
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'voice.recurringPhrases',
          sourceField: 'sourceEvidence.0.text.voicePhrases',
          normalizedValue: expect.arrayContaining([
            'Stop losing brand consistency between strategy and delivery',
            'Trusted by 80 creative teams',
            'AI content production for agencies.',
          ]),
        }),
        expect.objectContaining({
          signalPath: 'identity.proofStyle',
          normalizedValue: 'community',
        }),
        expect.objectContaining({
          signalPath: 'voice.ctaDirectness',
        }),
      ]),
    );
    expect(candidates.map((candidate) => candidate.excerpt).join(' ')).not.toContain('Profile bio:');
  });

  it('keeps post titles available for hook shape without promoting titles, authors, handles, or single-video transcript lines as recurring voice', () => {
    const source: BrandVaultSourceInput = {
      kind: 'social_post',
      url: 'https://www.youtube.com/watch?v=brandhook1',
      platform: 'youtube',
      name: 'This is how businesses get robbed',
      text: '@partnerone @partnertwo @insturix Made with Insturix. One platform. Not ten.',
      evidenceOrigin: 'public_fallback',
      media: {
        mediaType: 'video',
        transcript: 'Content production is broken. Edit your footage. Not just generate.',
      },
      profile: {
        bio: 'Nimit Jain',
        category: 'Software',
      },
    };

    const candidates = createBrandVaultSocialEvidenceCandidates({
      jobId: 'brand_refinery_job_social_title_pollution',
      source,
      sourceField: 'sourceEvidence.0',
      startIndex: 0,
      observedAt: OBSERVED_AT,
    });

    // A single video's transcript is one-off spoken content, not repeated brand
    // language, so it must not be promoted as recurring voice. Titles, authors,
    // and handles are likewise never recurring.
    const voiceCandidate = candidates.find((candidate) => candidate.sourceField === 'sourceEvidence.0.text.voicePhrases');
    const voicePhrases = (voiceCandidate?.normalizedValue as string[] | undefined) ?? [];
    for (const banned of [
      'Content production is broken',
      'Edit your footage',
      'Not just generate',
      'This is how businesses get robbed',
      'Nimit Jain',
      '@partnerone',
    ]) {
      expect(voicePhrases).not.toContain(banned);
    }

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalPath: 'voice.hookArchetypes',
          sourceField: 'sourceEvidence.0.text.hookArchetypes',
          excerpt: 'This is how businesses get robbed',
        }),
      ]),
    );
  });
});
