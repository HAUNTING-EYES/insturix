import { describe, expect, it } from 'vitest';

import { BUNDLED_SFX_CATALOG } from '@/lib/pipeline/sfx-catalog';
import {
  adjudicateObservations,
  buildLabellingCandidateSet,
  isValidOpportunityObservation,
  sameReviewerAssessment,
  toFrozenOpportunityLabel,
  type OpportunityObservationV1,
} from '@/lib/pipeline/sfx-labelling';

function observation(over: Partial<OpportunityObservationV1>): OpportunityObservationV1 {
  return {
    version: 'editron-sfx-observation-v1',
    opportunityId: 's2-001-transition-whoosh',
    reviewerId: 'reviewer-a',
    reviewedAt: '2026-08-08T00:00:00.000Z',
    acceptableAssetIds: [],
    unacceptableAssetIds: [],
    absurdAssetIds: [],
    silenceAcceptable: true,
    silenceRequired: false,
    roleState: 'reviewed',
    surfaceState: 'reviewed',
    directionState: 'not-perceptible',
    motionSpeedState: 'not-perceptible',
    materialState: 'not-meaningful',
    ...over,
  };
}

describe('S2-L1 candidate builder (reviewer audition set)', () => {
  it('is deterministic for the same opportunity + role', () => {
    const a = buildLabellingCandidateSet('s2-001-transition-whoosh', 'whoosh', 'transition', { entries: BUNDLED_SFX_CATALOG.entries });
    const b = buildLabellingCandidateSet('s2-001-transition-whoosh', 'whoosh', 'transition', { entries: BUNDLED_SFX_CATALOG.entries });
    expect(a.candidates.map((c) => c.assetId)).toEqual(b.candidates.map((c) => c.assetId));
  });

  it('always includes the silence pseudo-candidate last', () => {
    const set = buildLabellingCandidateSet('s2-001-transition-whoosh', 'whoosh', 'transition', { entries: BUNDLED_SFX_CATALOG.entries });
    expect(set.candidates[set.candidates.length - 1].isSilence).toBe(true);
    expect(set.candidates[set.candidates.length - 1].assetId).toBe('__silence__');
  });

  it('includes a few decoys from unrelated roles so absurd/unacceptable can be marked', () => {
    const set = buildLabellingCandidateSet('s2-001-transition-whoosh', 'whoosh', 'transition', { entries: BUNDLED_SFX_CATALOG.entries });
    const decoys = set.candidates.filter((c) => !c.matchesRole && !c.isSilence);
    expect(decoys.length).toBeGreaterThan(0);
    expect(decoys.every((d) => d.role !== 'whoosh')).toBe(true);
  });
});

describe('S2-L1 observation validation + reviewer independence', () => {
  it('accepts a valid observation; rejects malformed ones', () => {
    expect(isValidOpportunityObservation(observation({}))).toBe(true);
    expect(isValidOpportunityObservation({ ...observation({}), version: 'nope' })).toBe(false);
    expect(isValidOpportunityObservation(null)).toBe(false);
    expect(isValidOpportunityObservation({ ...observation({}), silenceRequired: 'yes' })).toBe(false);
  });

  it('two identical reviewer observations are a consensus', () => {
    const a = observation({ acceptableAssetIds: ['sfx_1'], reviewerId: 'A' });
    const b = observation({ acceptableAssetIds: ['sfx_1'], reviewerId: 'B' });
    const outcome = adjudicateObservations([a, b]);
    expect(outcome?.consensus).toBe(true);
    expect(outcome?.result).toBe('accepted-consensus');
    expect(outcome?.reviewers).toEqual(['A', 'B']);
  });

  it('two DIFFERENT reviewer observations are UNRESOLVED, never auto-merged', () => {
    const a = observation({ acceptableAssetIds: ['sfx_1'], reviewerId: 'A' });
    const b = observation({ acceptableAssetIds: ['sfx_2'], reviewerId: 'B' });
    const outcome = adjudicateObservations([a, b]);
    expect(outcome?.consensus).toBe(false);
    expect(outcome?.resolved).toBe(false);
    expect(outcome?.result).toBe('unresolved');
  });

  it('a single observation adjudicates as accepted-consensus', () => {
    const out = adjudicateObservations([observation({ reviewerId: 'A' })]);
    expect(out?.consensus).toBe(true);
    expect(out?.result).toBe('accepted-consensus');
  });

  it('sameReviewerAssessment only compares the observed asset sets + silence', () => {
    expect(sameReviewerAssessment(observation({ acceptableAssetIds: ['a'] }), observation({ acceptableAssetIds: ['a'] }))).toBe(true);
    expect(sameReviewerAssessment(observation({ acceptableAssetIds: ['a'] }), observation({ acceptableAssetIds: ['b'] }))).toBe(false);
    expect(sameReviewerAssessment(observation({ silenceRequired: true }), observation({ silenceRequired: false }))).toBe(false);
  });
});

describe('S2-L1 frozen label mapping', () => {
  it('produces a frozen label when adjudication is resolved; null when unresolved', () => {
    const obs = observation({ acceptableAssetIds: ['sfx_1'], reviewerId: 'A' });
    const resolved = adjudicateObservations([obs]);
    const frozen = toFrozenOpportunityLabel(resolved, obs);
    expect(frozen?.acceptableAssetIds).toEqual(['sfx_1']);
    expect(frozen?.reviewerId).toBe('A');

    const conflict = adjudicateObservations([
      observation({ acceptableAssetIds: ['sfx_1'], reviewerId: 'A' }),
      observation({ acceptableAssetIds: ['sfx_2'], reviewerId: 'B' }),
    ]);
    expect(toFrozenOpportunityLabel(conflict, obs)).toBeNull();
  });

  it('records conflicting reviewers on an accepted-consensus with two reviewers', () => {
    const a = observation({ acceptableAssetIds: ['x'], reviewerId: 'A' });
    const b = observation({ acceptableAssetIds: ['x'], reviewerId: 'B' });
    const frozen = toFrozenOpportunityLabel(adjudicateObservations([a, b]), a, ['B']);
    expect(frozen?.adjudication?.conflictingReviewerIds).toHaveLength(0);
    expect(frozen?.adjudication?.result).toBe('accepted-consensus');
  });
});