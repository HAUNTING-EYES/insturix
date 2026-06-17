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
            'Book a demo this week',
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
});
