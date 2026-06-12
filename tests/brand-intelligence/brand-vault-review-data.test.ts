import { describe, expect, it } from 'vitest';
import { groupConflicts } from '../../components/dashboard/BrandVault/brand-vault-data';
import type { BrandEvidenceCandidate } from '../../lib/shared/brand-website-refinery-types';

const OBSERVED_AT = '2026-06-13T00:00:00.000Z';

function candidate(signalPath: string, normalizedValue: unknown, confidence = 0.7): BrandEvidenceCandidate {
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
});
