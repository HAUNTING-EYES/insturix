import { describe, expect, it } from 'vitest';

import {
  assertCap2CurrentTruthSourcesMatchV13,
  CAP2_CURRENT_RECONCILIATION_SOURCE_PATHS_V13,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13,
  CAP2_DURATION_AUTHORITY_PHASE_SOURCE_PATHS_V13,
  CAP2_PINNED_SOURCE_CONSUMER_PHASE_SOURCE_PATHS_V13,
  parseCap2CurrentTruthReissueAuditV13,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v13';
import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12 } from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v12';
import { hashCanonicalCap2ArtifactV1 } from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';

describe('CAP-2 current-truth reissue V13', () => {
  it('chains immutable V12 and binds both landed current-source deltas', () => {
    const audit = parseCap2CurrentTruthReissueAuditV13(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13,
    );

    expect(audit.manifestHash).toBe(
      'ff5803ede99bb3b3770b79ce1f1f3151dfe3ee58a62611f06195194125beb61a',
    );
    expect(audit.priorAuditBinding).toEqual({
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12.artifactType,
      manifestHash: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12.manifestHash,
      normalizedSourceSnapshotHash:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V12.sourceBinding.normalizedSourceSnapshotHash,
    });
    expect(audit.sourceBinding).toMatchObject({
      branch: 'infrastructure-improvs-+Editron',
      commit: '2e11e18e3032649a973b128c6bb06ab21b36a9d2',
      normalizedSourceSnapshotHash:
        '05ea0e563a6611463de7227f1af6c62c7866f092a5f3ac50c777861d7402d00a',
      sourceSnapshotPathCount: 351,
      sourceObservationCount: 11,
      observedIdentifierOccurrences: 636,
      durationPhaseCommit: '8a786eb43e448c043aa1a385785d455c2f59e03a',
      durationPhaseSnapshotHash:
        'c088847bb6b4e6e29d4d3bcccdc1ce32102ceac908d167035c3bd9c930b75625',
      pinnedSourceConsumerPhaseCommit:
        '2e11e18e3032649a973b128c6bb06ab21b36a9d2',
      pinnedSourceConsumerPhaseSnapshotHash:
        'c9c73588960e32a4a05f3a71c1149a44b454ce9496942c6e32a52b8d3ecdfacc',
      reconciliationSourceSnapshotHash:
        'c5af3edaf9a8c5f0c5d3ed85534e687764e37a99872f81f3c25554bf62d70fbf',
      reconciliationSourcePathCount: 14,
    });
    expect(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V13).toHaveLength(351);
    expect(CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V13).toHaveLength(11);
    expect(CAP2_DURATION_AUTHORITY_PHASE_SOURCE_PATHS_V13).toHaveLength(5);
    expect(CAP2_PINNED_SOURCE_CONSUMER_PHASE_SOURCE_PATHS_V13).toHaveLength(5);
    expect(CAP2_CURRENT_RECONCILIATION_SOURCE_PATHS_V13).toHaveLength(14);
    expect(audit.reissueGate).toEqual({
      priorAuditChained: true,
      currentSourceSnapshotRecomputed: true,
      durationPhaseEvidenceBound: true,
      pinnedSourceConsumerPhaseEvidenceBound: true,
      historicalV10ThroughV12Preserved: true,
      catalogAuthorityUnchanged: true,
      runtimeAuthorityDenied: true,
    });
    expect(() => assertCap2CurrentTruthSourcesMatchV13()).toThrow(
      'CAP-2 v13 pipeline-video pilot source snapshot drift.',
    );
  });

  it('records truthful duration, selected-source, queue and authority boundaries', () => {
    const { durationAuthority, pinnedSourceConsumer, queueStatus } =
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.semanticDelta;

    expect(durationAuthority).toMatchObject({
      commit: '8a786eb43e448c043aa1a385785d455c2f59e03a',
      disposition: 'FAST_USER_QA_DURATION_AUTHORITY_RECONCILED',
      proof: {
        fastUserQaStatus: 'PASS',
        stages: ['EDIT', 'CORRECTION', 'UNDO', 'REDO', 'RELOAD'],
        persistedDurationInFrames: 300,
        visibleDurationDisplay: '00:10.00',
        genericSavePreservation: 'PASS',
      },
    });
    expect(pinnedSourceConsumer).toMatchObject({
      disposition: 'WIRED_SELECTED_SOURCE_PIN_CONSUMER_CURRENT_TRUTH',
      focusedProof: {
        passedTestCount: 43,
        status: 'PASS',
      },
      safetyBoundary: {
        managedOverlayWithoutPin: 'FAILS_CLOSED_BEFORE_DECODER_ADMISSION',
        sourceEvidence: 'EXACT_SOURCE_VERSION_EVIDENCE_AND_HASHED_V3_BINDING_REQUIRED',
        unpinnedManagedDecode: 'NOT_ALLOWED',
      },
    });
    expect(queueStatus).toEqual({
      queue3: expect.objectContaining({ status: 'ACTIVE_PARTIAL' }),
      queue4: expect.objectContaining({ status: 'ACTIVE_PARTIAL' }),
      queue5: expect.objectContaining({ status: 'OPEN' }),
    });
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.catalogBinding).toMatchObject({
      certifiedOperationCount: 0,
      productionEligibleOperationCount: 0,
    });
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.runtimeAuthority).toEqual({
      plannerRegistryWired: false,
      plannerProjectMutationAuthorized: false,
      productionCertificationGranted: false,
      stage25Go: false,
      stage3Authorization: false,
    });
  });

  it('rejects semantic tampering even when the top-level manifest is recomputed', () => {
    const changedProof = structuredClone(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13,
    ) as any;
    changedProof.semanticDelta.pinnedSourceConsumer.statement += ' tampered';
    changedProof.manifestHash = rehash(changedProof);
    expect(() => parseCap2CurrentTruthReissueAuditV13(changedProof)).toThrow(
      'CAP-2 v13 semantic delta drift.',
    );

    const falseAuthority = structuredClone(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13,
    ) as any;
    falseAuthority.runtimeAuthority.stage3Authorization = true;
    falseAuthority.manifestHash = rehash(falseAuthority);
    expect(() => parseCap2CurrentTruthReissueAuditV13(falseAuthority)).toThrow();
  });
});

function rehash(value: typeof CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13): string {
  const { manifestHash: _oldHash, ...material } = value;
  return hashCanonicalCap2ArtifactV1(material);
}
