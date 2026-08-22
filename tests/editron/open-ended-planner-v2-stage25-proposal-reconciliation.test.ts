import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1, buildStage25LockSetHashV1,
  reconcileStage25ProposalV1, type Stage25ChangeSetReceiptV1, type Stage25EffectRegionV1,
  type Stage25ProposalV1, type Stage25RangeLockV1,
} from '@/lib/editron/research/open-ended-planner/stage25-proposal-reconciliation-v1';

const timebase = { timebaseId: 'project-timebase-1', version: '1' } as const;
const evaluatedAt = '2026-08-22T18:30:00.000Z';

describe('Stage 2.5 proposal reconciliation', () => {
  it('keeps a current proposal eligible without creating state effects', () => {
    const proposal = makeProposal();
    const result = reconcile(proposal, 'R42', [], []);
    expect(result).toMatchObject({ disposition: 'ELIGIBLE_AT_BASE', rebasedExpectedProjectRevision: 'R42', stateEffects: [] });
    expect(result.assessmentHash).toHaveLength(64);
  });

  it('rebases a half-open disjoint user edit and keeps the exact current revision', () => {
    const proposal = makeProposal();
    const change = makeChange({ affectedRegions: [region('manual-title-boundary', ['project', 'overlays', 'title-1', 'position'], 360, 400, ['overlay:title-1'])] });
    const result = reconcile(proposal, 'R43', [change], []);
    expect(result).toMatchObject({ disposition: 'ELIGIBLE_REBASED_DISJOINT', rebasedExpectedProjectRevision: 'R43', conflictReceiptIds: [] });
    expect(result.projectedWriteSet[0].range).toMatchObject({ startTick: '300', endExclusiveTick: '360' });
  });

  it('blocks an ambiguous overlapping edit rather than silently merging it', () => {
    const proposal = makeProposal();
    const change = makeChange({ affectedRegions: [region('manual-title', ['project', 'overlays', 'title-1', 'position'], 330, 350, ['overlay:title-1'])] });
    const result = reconcile(proposal, 'R43', [change], []);
    expect(result).toMatchObject({ disposition: 'BLOCKED_CONFLICT', rebasedExpectedProjectRevision: null, conflictReceiptIds: ['change-1'] });
  });

  it('projects an identity-preserving writer-issued shift through exact tick ranges', () => {
    const proposal = makeProposal();
    const transformUnsigned = {
      transformId: 'shift-1', projectId: 'project-1', fromProjectRevision: 'R42', toProjectRevision: 'R43',
      pathPrefix: ['project', 'overlays'], range: undefined,
      sourceRange: { timebase, startTick: '120', endExclusiveTick: '1000' }, deltaTicks: '30',
      preservedIdentityRefs: ['overlay:title-1'], proofRefs: ['receipt:cut-1:coordinate-transform-proof'], proofStatus: 'PASS' as const,
    };
    const { range: _unused, ...transformMaterial } = transformUnsigned;
    const transform = { ...transformMaterial, transformHash: hashCanonicalJsonV1(transformMaterial) };
    const change = makeChange({
      affectedRegions: [region('ripple', ['project', 'overlays'], 120, 1000, [])], coordinateTransforms: [transform],
    });
    const result = reconcile(proposal, 'R43', [change], []);
    expect(result).toMatchObject({ disposition: 'ELIGIBLE_REBASED_WITH_TRANSFORM', appliedTransformIds: ['shift-1'], rebasedExpectedProjectRevision: 'R43' });
    expect(result.projectedWriteSet[0].range).toMatchObject({ startTick: '330', endExclusiveTick: '390' });
  });

  it('blocks a current lock after transforming the proposal into current coordinates', () => {
    const proposal = makeProposal();
    const transformMaterial = {
      transformId: 'shift-1', projectId: 'project-1', fromProjectRevision: 'R42', toProjectRevision: 'R43',
      pathPrefix: ['project', 'overlays'], sourceRange: { timebase, startTick: '120', endExclusiveTick: '1000' }, deltaTicks: '30',
      preservedIdentityRefs: ['overlay:title-1'], proofRefs: ['coordinate-proof'], proofStatus: 'PASS' as const,
    };
    const change = makeChange({ affectedRegions: [region('ripple', ['project', 'overlays'], 120, 1000, [])], coordinateTransforms: [{ ...transformMaterial, transformHash: hashCanonicalJsonV1(transformMaterial) }] });
    const lock = makeLock(region('locked-title', ['project', 'overlays', 'title-1'], 330, 390, ['overlay:title-1']));
    const result = reconcile(proposal, 'R43', [change], [lock]);
    expect(result).toMatchObject({ disposition: 'BLOCKED_LOCK', blockingLockIds: ['lock-1'], rebasedExpectedProjectRevision: null });
  });

  it('blocks invalidated evidence even when the user edit is range-disjoint', () => {
    const proposal = makeProposal();
    const change = makeChange({
      affectedRegions: [region('audio-change', ['project', 'audio', 'bgm'], 500, 550, ['overlay:bgm'])],
      invalidatedArtifactRefs: ['proof:title-safe-zone:R42'],
    });
    const result = reconcile(proposal, 'R43', [change], []);
    expect(result).toMatchObject({ disposition: 'BLOCKED_STALE_EVIDENCE', staleEvidenceRefs: ['proof:title-safe-zone:R42'] });
  });

  it('rejects forged, duplicated and incomplete change chains', () => {
    const proposal = makeProposal(); const change = makeChange({ affectedRegions: [] });
    const forged = { ...change, actorKind: 'AGENT' as const };
    expect(() => reconcile(proposal, 'R43', [forged], [])).toThrow('CHANGE_RECEIPT_CHAIN_INVALID');
    expect(() => reconcile(proposal, 'R44', [change, change], [])).toThrow('CHANGE_RECEIPT_DUPLICATED');
    expect(() => reconcile(proposal, 'R44', [change], [])).toThrow('CHANGE_RECEIPT_CHAIN_INCOMPLETE');
    expect(() => reconcile(proposal, 'R43', [], [])).toThrow('CHANGE_RECEIPT_CHAIN_INCOMPLETE');
  });

  it('rejects forged proposal and lock-set identities', () => {
    const proposal = makeProposal();
    expect(() => reconcile({ ...proposal, targetPredicateIds: ['forged-target'] }, 'R42', [], []))
      .toThrow('PROPOSAL_HASH_INVALID');
    const lock = makeLock(region('locked-title', ['project', 'overlays', 'title-1'], 300, 360, ['overlay:title-1']));
    expect(() => reconcileStage25ProposalV1({
      evaluatedAt, proposal, currentProjectRevision: 'R42', changesSinceBase: [], currentLocks: [lock], currentLockSetHash: 'f'.repeat(64),
    })).toThrow('LOCK_SET_HASH_INVALID');
  });

  it('rejects a transform that does not preserve the proposal identity', () => {
    const proposal = makeProposal();
    const transformMaterial = {
      transformId: 'shift-1', projectId: 'project-1', fromProjectRevision: 'R42', toProjectRevision: 'R43',
      pathPrefix: ['project', 'overlays'], sourceRange: { timebase, startTick: '120', endExclusiveTick: '1000' }, deltaTicks: '30',
      preservedIdentityRefs: [] as string[], proofRefs: ['coordinate-proof'], proofStatus: 'PASS' as const,
    };
    const change = makeChange({ affectedRegions: [region('ripple', ['project', 'overlays'], 120, 1000, [])], coordinateTransforms: [{ ...transformMaterial, transformHash: hashCanonicalJsonV1(transformMaterial) }] });
    expect(reconcile(proposal, 'R43', [change], [])).toMatchObject({ disposition: 'BLOCKED_CONFLICT', appliedTransformIds: [] });
  });
});

function reconcile(proposal: Stage25ProposalV1, currentProjectRevision: string, changesSinceBase: Stage25ChangeSetReceiptV1[], currentLocks: Stage25RangeLockV1[]) {
  return reconcileStage25ProposalV1({
    evaluatedAt, proposal, currentProjectRevision, changesSinceBase, currentLocks,
    currentLockSetHash: buildStage25LockSetHashV1({ projectId: proposal.projectId, currentProjectRevision, locks: currentLocks }),
  });
}

function makeProposal(): Stage25ProposalV1 {
  const material = {
    schemaVersion: STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1, proposalId: 'proposal-1', projectId: 'project-1',
    baseProjectRevision: 'R42', timebase,
    readSet: [region('read-title', ['project', 'overlays', 'title-1'], 300, 360, ['overlay:title-1'])],
    writeSet: [region('write-title', ['project', 'overlays', 'title-1', 'position'], 300, 360, ['overlay:title-1'])],
    evidenceRefs: ['proof:title-safe-zone:R42'], targetPredicateIds: ['target:title-behind-subject'],
  };
  return { ...material, proposalHash: hashCanonicalJsonV1(material) };
}

function makeChange(input: {
  affectedRegions: Stage25EffectRegionV1[];
  invalidatedArtifactRefs?: string[];
  coordinateTransforms?: Stage25ChangeSetReceiptV1['coordinateTransforms'];
}): Stage25ChangeSetReceiptV1 {
  const material = {
    schemaVersion: STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1, receiptId: 'change-1', projectId: 'project-1', actorKind: 'USER' as const,
    beforeProjectRevision: 'R42', afterProjectRevision: 'R43', timebase, affectedRegions: input.affectedRegions,
    invalidatedArtifactRefs: input.invalidatedArtifactRefs ?? [], coordinateTransforms: input.coordinateTransforms ?? [],
  };
  return { ...material, receiptHash: hashCanonicalJsonV1(material) };
}

function makeLock(lockedRegion: Stage25EffectRegionV1): Stage25RangeLockV1 {
  const material = {
    schemaVersion: STAGE25_PROPOSAL_RECONCILIATION_VERSION_V1, lockId: 'lock-1', projectId: 'project-1', status: 'ACTIVE' as const,
    ownerActorId: 'user-1', reason: 'User locked the approved title placement', region: lockedRegion,
  };
  return { ...material, lockHash: hashCanonicalJsonV1(material) };
}

function region(regionId: string, path: string[], startTick: number, endExclusiveTick: number, identityRefs: string[]): Stage25EffectRegionV1 {
  return { regionId, path, range: { timebase, startTick: String(startTick), endExclusiveTick: String(endExclusiveTick) }, identityRefs };
}
