import { describe, expect, it } from 'vitest';

import {
  CreativeReferenceContextError,
  resolveCreativeReferenceContext,
} from '@/lib/thinkforge/context/creative-reference-context';

const brandAuthority = {
  brandId: 'brand_alpha',
  brandName: 'Alpha',
  recordId: 'record_alpha_7',
  profileUpdatedAt: '2026-08-22T00:00:00.000Z',
  profile: { brandId: 'brand_alpha' },
} as any;

function orgScope(brandId = 'brand_alpha') {
  return { kind: 'organization', orgId: 'org_alpha', brandId };
}

function explicitReferenceSet(status: 'available' | 'pending' | 'unavailable' = 'available') {
  return {
    version: 1,
    referenceSetId: 'refs_explicit_1',
    references: [{
      id: 'ref_explicit_1',
      kind: 'video',
      title: 'A user-approved reference',
      sourceId: 'asset_reference_1',
      rightsStatus: 'user-provided',
      analysisStatus: status,
      ...(status === 'available' ? {
        analysis: {
          visualRhythm: 'Deliberate explanatory beats.',
          recurringMotifs: [],
          evidence: [{ id: 'evidence_1', observation: 'A clear opening visual.', startSeconds: 0, endSeconds: 2 }],
          nonCopyConstraints: ['Do not copy the source expression.'],
        },
      } : {}),
    }],
  };
}

function completedSelectedTrend() {
  return {
    selectionVersion: 1,
    status: 'selected',
    target: 'script',
    selectedAt: '2026-08-22T00:00:00.000Z',
    candidate: {
      candidateId: 'trend_original_format',
      candidateVersion: 1,
      title: 'Original format reference',
      platform: 'youtube',
      evidence: [{
        evidenceId: 'trend_evidence_1',
        evidenceVersion: 1,
        kind: 'user_submitted_reference',
        provider: 'user',
        platform: 'youtube',
        title: 'Authorized reference',
        provenance: { purpose: 'public_trend_discovery', queryFingerprint: 'query_1' },
      }],
      evidenceCompleteness: 1,
      freshness: 'fresh',
      trendSpecEligible: true,
      nextAction: 'use_as_timed_angle',
    },
    analysis: {
      analysisVersion: 1,
      status: 'completed',
      analyzedAt: '2026-08-22T00:01:00.000Z',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      source: {
        referenceId: 'source_reference_1',
        sourceKind: 'remote-url',
        sourceLabel: 'Authorized source',
        sourceFingerprint: 'fingerprint_1',
        durationSec: 12,
      },
      trendSpec: {
        trendId: 'trend_original_format',
        version: 1,
        alignmentFrame: 'beat-space',
        beatGrid: {
          beatsMs: [0, 2_000, 6_000],
          sections: [
            { id: 'section_hook', role: 'hook', start: 0, end: 2_000 },
            { id: 'section_reveal', role: 'reveal', start: 2_000, end: 12_000 },
          ],
          totalMs: 12_000,
        },
        invariants: [],
        variables: [],
        copyFormula: { slots: [] },
        performanceScript: 'A source-specific cue that must never enter the treatment.',
      },
    },
  };
}

describe('creative reference context', () => {
  it('binds explicit visual influence to the active accepted Brand Vault revision', () => {
    const resolved = resolveCreativeReferenceContext({
      userId: 'user_alpha',
      orgId: 'org_alpha',
      brandAuthority,
      explicitReferenceSet: explicitReferenceSet(),
      explicitReferenceScope: orgScope(),
    });

    expect(resolved.scope).toEqual(orgScope());
    expect(resolved.selectedReferenceIds).toEqual(['ref_explicit_1']);
    expect(resolved.analyzedReferenceIds).toEqual(['ref_explicit_1']);
    expect(resolved.brandRevision).toEqual({
      brandId: 'brand_alpha',
      recordId: 'record_alpha_7',
      profileUpdatedAt: '2026-08-22T00:00:00.000Z',
    });
    expect(JSON.stringify(resolved)).not.toContain('sourceLedger');
  });

  it('fails closed when a Brand A reference is offered to Brand B', () => {
    try {
      resolveCreativeReferenceContext({
        userId: 'user_alpha',
        orgId: 'org_alpha',
        brandAuthority,
        explicitReferenceSet: explicitReferenceSet(),
        explicitReferenceScope: orgScope('brand_beta'),
      });
      throw new Error('expected reference scope mismatch');
    } catch (error) {
      expect(error).toBeInstanceOf(CreativeReferenceContextError);
      expect((error as CreativeReferenceContextError).code).toBe('creative_reference_scope_mismatch');
    }
  });

  it('requires scope evidence before an explicit reference can influence a treatment', () => {
    try {
      resolveCreativeReferenceContext({
        userId: 'user_alpha',
        orgId: 'org_alpha',
        brandAuthority,
        explicitReferenceSet: explicitReferenceSet(),
      });
      throw new Error('expected missing reference scope');
    } catch (error) {
      expect(error).toBeInstanceOf(CreativeReferenceContextError);
      expect((error as CreativeReferenceContextError).code).toBe('creative_reference_scope_required');
    }
  });

  it('requires a personal reference to belong to the requesting user', () => {
    try {
      resolveCreativeReferenceContext({
        userId: 'user_alpha',
        brandAuthority: null,
        explicitReferenceSet: explicitReferenceSet(),
        explicitReferenceScope: { kind: 'personal', ownerUserId: 'user_beta' },
      });
      throw new Error('expected personal reference scope mismatch');
    } catch (error) {
      expect(error).toBeInstanceOf(CreativeReferenceContextError);
      expect((error as CreativeReferenceContextError).code).toBe('creative_reference_scope_mismatch');
    }
  });

  it('records missing analysis as a named unknown instead of inventing visual facts', () => {
    const resolved = resolveCreativeReferenceContext({
      userId: 'user_alpha',
      orgId: 'org_alpha',
      brandAuthority,
      explicitReferenceSet: explicitReferenceSet('pending'),
      explicitReferenceScope: orgScope(),
    });

    expect(resolved.referenceSet.references[0]?.analysis).toBeUndefined();
    expect(resolved.unresolved).toEqual([expect.objectContaining({
      referenceId: 'ref_explicit_1',
      code: 'reference_analysis_pending',
    })]);
  });

  it('adapts only a completed, persisted trend analysis as visual influence', () => {
    const resolved = resolveCreativeReferenceContext({
      userId: 'user_alpha',
      orgId: 'org_alpha',
      brandAuthority,
      persistedSelectedTrend: completedSelectedTrend(),
    });

    const reference = resolved.referenceSet.references[0];
    expect(reference).toMatchObject({
      kind: 'video',
      rightsStatus: 'user-provided',
      analysisStatus: 'available',
      analysis: {
        evidence: [
          { id: 'trend_section_1', startSeconds: 0, endSeconds: 2 },
          { id: 'trend_section_2', startSeconds: 2, endSeconds: 12 },
        ],
      },
    });
    expect(reference?.sourceUrl).toBeUndefined();
    expect(JSON.stringify(resolved)).not.toContain('A source-specific cue');
    expect(resolved.unresolved).toEqual([]);
  });

  it('marks an unanalysed persisted trend as pending and excludes inferred visual facts', () => {
    const trend = completedSelectedTrend();
    delete (trend as { analysis?: unknown }).analysis;

    const resolved = resolveCreativeReferenceContext({
      userId: 'user_alpha',
      orgId: 'org_alpha',
      brandAuthority,
      persistedSelectedTrend: trend,
    });

    expect(resolved.referenceSet.references[0]).toMatchObject({ analysisStatus: 'pending' });
    expect(resolved.referenceSet.references[0]?.analysis).toBeUndefined();
    expect(resolved.unresolved[0]?.code).toBe('reference_analysis_pending');
  });

  it('quarantines invalid persisted trend metadata instead of reading it as creative guidance', () => {
    const resolved = resolveCreativeReferenceContext({
      userId: 'user_alpha',
      orgId: 'org_alpha',
      brandAuthority,
      persistedSelectedTrend: { candidate: { candidateId: 'wrong_shape' } },
    });

    expect(resolved.selectedReferenceIds).toEqual([]);
    expect(resolved.unresolved).toEqual([expect.objectContaining({
      code: 'selected_trend_metadata_invalid',
    })]);
  });
});
