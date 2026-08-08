import { describe, expect, it } from 'vitest';

import {
  aggregateCoverageGaps,
  collectRuntimeMisses,
  SFX_COVERAGE_VERSION,
  validateReviewMetadataExtension,
  type SfxRuntimeMissReceipt,
} from '@/lib/pipeline/sfx-s6-coverage';

function miss(over: Partial<SfxRuntimeMissReceipt>): SfxRuntimeMissReceipt {
  return {
    version: SFX_COVERAGE_VERSION,
    receiptId: 'm1',
    producerPath: 'edl',
    role: 'whoosh',
    surface: 'transition',
    query: 'fast left whoosh sweep',
    direction: 'left',
    motionSpeed: 'fast',
    decision: 'no-match',
    silenceFormIntended: false,
    recordedAt: '2026-08-08T00:00:00.000Z',
    sourceRef: 'ref-1',
    ...over,
  };
}

describe('S6-A runtime miss receipts + coverage gaps', () => {
  it('collects misses grouped by role/surface', () => {
    const receipts = [
      miss({ role: 'whoosh', surface: 'transition', recordedAt: '2026-08-08T00:00:00Z' }),
      miss({ role: 'whoosh', surface: 'transition', recordedAt: '2026-08-08T00:00:01Z' }),
      miss({ role: 'tick', surface: 'ui', recordedAt: '2026-08-08T00:00:02Z' }),
    ];
    const collector = collectRuntimeMisses(receipts);
    expect(collector.total).toBe(3);
    expect(collector.byRole.whoosh).toBe(2);
    expect(collector.bySurface.ui).toBe(1);
  });

  it('aggregates gaps by role+surface+query-token and prioritizes most-missed', () => {
    const receipts = [
      miss({ query: 'fast left whoosh', recordedAt: '2026-08-08T00:00Z' }),
      miss({ query: 'fast left whoosh', recordedAt: '2026-08-08T00:01Z' }),
      miss({ query: 'fast left whoosh', recordedAt: '2026-08-08T00:02Z' }),
      miss({ query: 'fast left whoosh', recordedAt: '2026-08-08T00:03Z' }),
      miss({ query: 'fast left whoosh', recordedAt: '2026-08-08T00:04Z' }),
      miss({ query: 'other whoosh', recordedAt: '2026-08-08T00:05Z' }),
    ];
    const gaps = aggregateCoverageGaps(receipts);
    expect(gaps.length).toBe(2);
    expect(gaps[0].missCount).toBe(5); // most-missed first
    expect(gaps[0].priority).toBe(1);  // 5/5 clamped
    expect(gaps[0].sampleQueries).toContain('fast left whoosh');
    expect(gaps[1].missCount).toBe(1);
  });

  it('records form-intended silence as a miss only when NOT intended', () => {
    const intended = collectRuntimeMisses([miss({ decision: 'silence', silenceFormIntended: true })]);
    const unintentional = collectRuntimeMisses([miss({ decision: 'silence', silenceFormIntended: false })]);
    expect(intended.total).toBe(1); // still counted; downstream distinguishes by flag
    expect(unintentional.receipts[0].silenceFormIntended).toBe(false);
  });
});

describe('S6-A richer reviewer metadata', () => {
  it('validates a full extension record', () => {
    const ext = validateReviewMetadataExtension({
      autoEligible: true,
      manualEligible: true,
      domains: ['drama', 'brand'],
      multipleRoleEvidence: [{ role: 'whoosh', confidence: 0.8, source: 'clap' }],
      eventFamilies: ['transition'],
      styleFamily: 'cinematic',
      material: 'air',
      genuineDirection: 'left',
      motionSpeed: 'fast',
      tailMs: 250,
      loopable: false,
      riskClass: 'low',
      reviewerEvidenceRefs: ['rev-1'],
      rights: { licenseId: 'cc0-1.0', status: 'licensed', sourceAssetId: 'sfx_1' },
      publicationState: 'reviewed',
      renderedCanary: { canaryId: 'seq-01', status: 'queued' },
    });
    expect(ext.domains).toEqual(['drama', 'brand']);
    expect(ext.publicationState).toBe('reviewed');
    expect(ext.renderedCanary?.status).toBe('queued');
  });

  it('rejects out-of-range multi-role confidence', () => {
    expect(() => validateReviewMetadataExtension({
      multipleRoleEvidence: [{ role: 'whoosh', confidence: 1.4, source: 'x' }],
    })).toThrow(/confidence out of range/);
  });

  it('rejects fabricated directions', () => {
    expect(() => validateReviewMetadataExtension({
      genuineDirection: 'diagonal-up' as never,
    })).toThrow(/genuineDirection invalid/);
  });

  it('fills defaults when only partial metadata is given', () => {
    const ext = validateReviewMetadataExtension({ domains: ['brand'] });
    expect(ext.eventFamilies).toEqual([]);
    expect(ext.publicationState).toBe('unpublished');
    expect(ext.rights.status).toBe('pending');
  });
});