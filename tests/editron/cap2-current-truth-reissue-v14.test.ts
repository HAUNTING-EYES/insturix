import { describe, expect, it } from 'vitest';

import {
  assertCap2CurrentTruthSourcesMatchV14,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14,
  CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14,
  parseCap2CurrentTruthReissueAuditV14,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v14';
import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13 } from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v13';
import { hashCanonicalCap2ArtifactV1 } from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';

describe('CAP-2 current-truth reissue V14', () => {
  it('chains immutable V13 and binds the landed Queue 5 overlay-writer slice', () => {
    const audit = parseCap2CurrentTruthReissueAuditV14(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14,
    );

    expect(audit.priorAuditBinding).toEqual({
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.artifactType,
      manifestHash: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.manifestHash,
      normalizedSourceSnapshotHash:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V13.sourceBinding.normalizedSourceSnapshotHash,
    });
    expect(audit.sourceBinding).toMatchObject({
      branch: 'infrastructure-improvs-+Editron',
      commit: '5328255d51d4e1687821836bc73015e2e19428f5',
      normalizedSourceSnapshotHash:
        '0f71cbaacb28d72f42246d3db615eb117b0a2e58750ffca36c3bedbf8c24be45',
      queue5OverlayWriterSourceSnapshotHash:
        '64859075041a6bc092e6e3d2a978667646ea20066f9a957132d7d7784463df8b',
      queue5OverlayWriterSourcePathCount: 16,
    });
    expect(CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14).toHaveLength(16);
    expect(audit.semanticDelta.queueStatus.queue5.status).toBe('ACTIVE_PARTIAL');
    expect(audit.catalogBinding).toMatchObject({
      certifiedOperationCount: 0,
      productionEligibleOperationCount: 0,
    });
    expect(audit.runtimeAuthority).toEqual({
      plannerRegistryWired: false,
      plannerProjectMutationAuthorized: false,
      productionCertificationGranted: false,
      stage25Go: false,
      stage3Authorization: false,
    });
    expect(() => assertCap2CurrentTruthSourcesMatchV14()).not.toThrow();
  });

  it('records the closed direct-writer slice without claiming universal Queue 5', () => {
    const delta = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14.semanticDelta;
    expect(delta.resolvedGaps).toHaveLength(5);
    expect(delta.remainingGaps).toContain(
      'Not every ProjectService writer enforces evidence, rights, locks, predecessors and invalidations.',
    );
    expect(delta.catalogPromotion).toBe(false);
  });

  it('rejects semantic or authority tampering after manifest recomputation', () => {
    const changedDelta = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14) as any;
    changedDelta.semanticDelta.statement += ' tampered';
    changedDelta.manifestHash = rehash(changedDelta);
    expect(() => parseCap2CurrentTruthReissueAuditV14(changedDelta)).toThrow(
      'CAP-2 v14 semantic delta drift.',
    );

    const falseAuthority = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14) as any;
    falseAuthority.runtimeAuthority.stage3Authorization = true;
    falseAuthority.manifestHash = rehash(falseAuthority);
    expect(() => parseCap2CurrentTruthReissueAuditV14(falseAuthority)).toThrow();
  });
});

function rehash(value: typeof CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V14): string {
  const { manifestHash: _oldHash, ...material } = value;
  return hashCanonicalCap2ArtifactV1(material);
}
