import { describe, expect, it } from 'vitest';

import { computeS2Baseline } from '@/lib/pipeline/sfx-s2-baseline';
import {
  assertEvaluationCorpusShape,
  S2_MIN_ISOLATED_OPPORTUNITIES,
  S2_MIN_SEQUENCE_CANARIES,
  type IsolatedOpportunityV1,
  type SfxEvaluationCorpusV1,
} from '@/lib/pipeline/sfx-evaluation-corpus';

function miniCorpus(): SfxEvaluationCorpusV1 {
  return {
    version: 'editron-sfx-evaluation-corpus-v1',
    isolated: [
      {
        context: {
          opportunityId: 's2-001',
          surface: { state: 'label', value: 'transition' },
          role: { state: 'label', value: 'whoosh' },
          direction: { state: 'label', value: 'left' },
          motionSpeed: { state: 'label', value: 'fast' },
          contextualNote: 'wipe-left',
        },
        label: null,
      } satisfies IsolatedOpportunityV1,
      {
        context: {
          opportunityId: 's2-002',
          surface: { state: 'label', value: 'scene' },
          role: { state: 'label', value: 'ambience' },
          motionSpeed: { state: 'label', value: 'still' },
          material: { state: 'label', value: 'environmental' },
          contextualNote: 'scene bed',
        },
        label: null,
      } satisfies IsolatedOpportunityV1,
    ],
    sequences: [],
  };
}

function withLabel(
  corpus: SfxEvaluationCorpusV1,
  opportunityId: string,
  label: NonNullable<IsolatedOpportunityV1['label']>,
): SfxEvaluationCorpusV1 {
  return {
    ...corpus,
    isolated: corpus.isolated.map((item) => (item.context.opportunityId === opportunityId ? { ...item, label } : item)),
  };
}

function simpleLabel(opportunityId: string, overrides: Partial<NonNullable<IsolatedOpportunityV1['label']>> = {}): NonNullable<IsolatedOpportunityV1['label']> {
  return {
    labelVersion: 'editron-sfx-evaluation-corpus-v1',
    opportunityId,
    acceptableAssetIds: [],
    unacceptableAssetIds: [],
    absurdAssetIds: [],
    silenceAcceptable: true,
    silenceRequired: false,
    reviewerId: 'r1',
    reviewedAt: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('S2 corpus + pre-tuning baseline', () => {
  it('accepts a valid corpus shape and enforces minimum sizes', () => {
    assertEvaluationCorpusShape(miniCorpus());
    expect(S2_MIN_ISOLATED_OPPORTUNITIES).toBe(64);
    expect(S2_MIN_SEQUENCE_CANARIES).toBe(8);
  });

  it('rejects a corpus with a label mismatch', () => {
    const bad = withLabel(miniCorpus(), 's2-001', {
      ...simpleLabel('WRONG_ID'),
      acceptableAssetIds: ['x'],
    });
    expect(() => assertEvaluationCorpusShape(bad)).toThrow(/opportunityId mismatch/);
  });

  it('computes a frozen baseline with unlabelled metrics as null', async () => {
    const report = await computeS2Baseline(
      miniCorpus(),
      async (_id) => ({ decision: 'selected' as const, selectedAssetId: 'sfx_1' }),
      () => new Date('2026-08-08T00:00:00.000Z'),
    );
    expect(report.corpusSize).toBe(2);
    expect(report.labelledCount).toBe(0);
    expect(report.aggregate.recallAt1).toBeNull(); // no labels yet
    expect(report.aggregate.decisionCounts.selected).toBe(2);
    expect(report.aggregate.roleCounts.whoosh).toBe(1);
  });

  it('computes recall-at-1 when labels exist with acceptable assets', async () => {
    const corpus = withLabel(miniCorpus(), 's2-001', simpleLabel('s2-001', { acceptableAssetIds: ['sfx_1'] }));
    const report = await computeS2Baseline(
      corpus,
      async (_id, _q, _d) => ({ decision: 'selected' as const, selectedAssetId: 'sfx_1' }),
      () => new Date('2026-08-08T00:00:00.000Z'),
    );
    expect(report.labelledCount).toBe(1);
    expect(report.aggregate.recallAt1).toBe(1);
  });

  it('flags an absurd selection when the labelled set contains it', async () => {
    const corpus = withLabel(miniCorpus(), 's2-001', simpleLabel('s2-001', { absurdAssetIds: ['sfx_bad'] }));
    const report = await computeS2Baseline(
      corpus,
      async (_id) => ({ decision: 'selected' as const, selectedAssetId: 'sfx_bad' }),
      () => new Date('2026-08-08T00:00:00.000Z'),
    );
    expect(report.aggregate.absurdRate).toBe(1);
    expect(report.rows[0].absurd).toBe(1);
  });
});