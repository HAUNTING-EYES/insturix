import { describe, expect, it } from 'vitest';
import { buildSourceLanes, groupConflicts } from '../../components/dashboard/BrandVault/brand-vault-data';
import type { BrandVaultSnapshot } from '../../components/dashboard/BrandVault/brand-vault-types';
import type {
  BrandEvidenceCandidate,
  BrandVaultSourceInput,
} from '../../lib/shared/brand-website-refinery-types';

const OBSERVED_AT = '2026-06-13T00:00:00.000Z';

function candidate(
  signalPath: string,
  normalizedValue: unknown,
  confidence = 0.7,
  overrides: Partial<BrandEvidenceCandidate> = {},
): BrandEvidenceCandidate {
  return {
    id: `candidate_${signalPath}_${String(normalizedValue).replace(/[^a-z0-9]+/gi, '_')}`,
    sourceType: signalPath.startsWith('assets.') ? 'logo_asset' : 'css',
    sourceUrl: 'https://signal.example/',
    sourceField: signalPath.startsWith('assets.') ? 'website.logoImage' : 'css.colors',
    signalPath,
    rawValue: normalizedValue,
    normalizedValue,
    confidence,
    authorityClass: 'owned',
    observedAt: OBSERVED_AT,
    extractorId: 'brand-website-refinery.v1',
    ...overrides,
  };
}

function source(kind: BrandVaultSourceInput['kind'], overrides: Partial<BrandVaultSourceInput> = {}): BrandVaultSourceInput {
  return {
    kind,
    name: `${kind}-source`,
    evidenceOrigin: 'user_supplied',
    ...overrides,
  };
}

describe('Brand Vault review data helpers', () => {
  it('does not treat asset alternatives as signal conflicts', () => {
    const conflicts = groupConflicts([
      candidate('assets.logoCandidates', 'https://signal.example/logo.svg', 0.86),
      candidate('assets.logoCandidates', 'https://signal.example/favicon.ico', 0.48),
      candidate('assets.socialPreviewImages', 'https://signal.example/og.jpg', 0.62),
      candidate('assets.socialPreviewImages', 'https://signal.example/twitter.jpg', 0.62),
      candidate('palette.primary', '#102033', 0.76),
      candidate('palette.primary', '#ff6a00', 0.66),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      path: 'palette.primary',
      group: 'palette',
    });
    expect(conflicts[0]?.candidates.map((item) => item.signalPath)).toEqual(['palette.primary', 'palette.primary']);
  });

  it('marks implemented evidence lanes from candidates instead of showing them as mocked', () => {
    const snapshot = {
      job: {
        id: 'brand_refinery_job_ui_truth',
        userId: 'user_truth',
        status: 'needs_review',
        inputs: {
          websiteUrl: 'https://signal.example',
          socialLinks: ['https://x.com/signal'],
          sourceEvidence: [
            source('social_profile', { platform: 'x', url: 'https://x.com/signal' }),
            source('social_post', { platform: 'x', text: 'Pinned launch post', evidenceOrigin: 'connected_fetch' }),
            source('uploaded_guideline', { name: 'Brand book.pdf' }),
            source('uploaded_asset', { name: 'Logo.png' }),
            source('crawl_seed', { url: 'https://signal.example' }),
            source('legacy_brand_intelligence', { name: 'legacy-profile-v1' }),
          ],
        },
        warnings: [],
        createdAt: OBSERVED_AT,
        updatedAt: OBSERVED_AT,
      },
      record: null,
      reviewPayload: null,
      candidates: [
        candidate('voice.recurringPhrases', 'ship the signal', 0.68, {
          sourceType: 'social_post',
          sourceField: 'sourceEvidence.1.social_post.text.voicePhrases',
          extractorId: 'brand-vault-social-evidence.v1',
        }),
        candidate('palette.primary', ['#101820'], 0.78, {
          sourceType: 'uploaded_guideline',
          sourceField: 'sourceEvidence.2.uploaded_guideline.colors',
          extractorId: 'brand-vault-upload-parser.v1',
        }),
        candidate('crawl.page', 'https://signal.example/about', 0.7, {
          sourceType: 'website',
          sourceUrl: 'https://signal.example/about',
          sourceField: 'crawl.page',
          extractorId: 'brand-vault-crawler.v1',
        }),
        candidate('voice.killList', ['legacy maybe'], 0.4, {
          sourceType: 'legacy_brand_intelligence',
          sourceField: 'sourceEvidence.5.legacy_brand_intelligence',
          extractorId: 'brand-vault-source-staging.v1',
        }),
      ],
    } satisfies BrandVaultSnapshot;

    const lanes = buildSourceLanes(snapshot);
    expect(lanes.find((lane) => lane.id === 'socials')).toMatchObject({ status: 'live', count: 2 });
    expect(lanes.find((lane) => lane.id === 'uploads')).toMatchObject({ status: 'live', count: 2 });
    expect(lanes.find((lane) => lane.id === 'crawler')).toMatchObject({ status: 'live', count: 1 });
    expect(lanes.find((lane) => lane.id === 'legacy')).toMatchObject({ status: 'pending', count: 1 });
    expect(lanes.some((lane) => String(lane.status) === 'mocked')).toBe(false);
  });

  it('marks optional lanes as not supplied when no source exists', () => {
    const lanes = buildSourceLanes({
      job: null,
      record: null,
      reviewPayload: null,
      candidates: [],
    });

    expect(lanes.find((lane) => lane.id === 'socials')).toMatchObject({ status: 'not_provided', count: 0 });
    expect(lanes.find((lane) => lane.id === 'uploads')).toMatchObject({ status: 'not_provided', count: 0 });
    expect(lanes.find((lane) => lane.id === 'crawler')).toMatchObject({ status: 'not_provided', count: 0 });
  });
});
