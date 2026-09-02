import { describe, expect, it } from 'vitest';

import {
  assertCap2CurrentTruthSourcesMatchV17,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V17,
  CAP2_QUEUE5_INVALIDATION_SOURCE_PATHS_V17,
  parseCap2CurrentTruthReissueAuditV17,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v17';
import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v16';
import { hashCanonicalCap2ArtifactV1 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';

describe('CAP-2 current-truth reissue V17', () => {
  it('chains immutable V16 and binds the landed Queue 5 invalidation slice', () => {
    const audit = parseCap2CurrentTruthReissueAuditV17(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V17,
    );

    expect(audit.priorAuditBinding).toEqual({
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16.artifactType,
      manifestHash: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16.manifestHash,
      normalizedSourceSnapshotHash:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16.sourceBinding.normalizedSourceSnapshotHash,
    });
    expect(audit.sourceBinding).toMatchObject({
      branch: 'infrastructure-improvs-+Editron',
      commit: '3fc0cd4d06d11954bba97ab632b309c82b2f1516',
      normalizedSourceSnapshotHash:
        '14fbd283f631d96822b7084a7c5a42a6691214b5948309f5b76c3fb3b0674521',
      queue5InvalidationSourceSnapshotHash:
        'f33482feec7195611afd8af143f8202a3694a6a43b9dcc38caed895f08af796f',
      queue5InvalidationSourcePathCount: 9,
    });
    expect(CAP2_QUEUE5_INVALIDATION_SOURCE_PATHS_V17).toHaveLength(9);
    expect(() => assertCap2CurrentTruthSourcesMatchV17()).not.toThrow();
  });

  it('records durable whole-state invalidation without claiming Queue 5 closure', () => {
    const audit = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V17;
    expect(audit.semanticDelta.resolvedGaps).toContain(
      'A failed invalidation enqueue aborts before any project mutation.',
    );
    expect(audit.semanticDelta.queueStatus.queue5.status).toBe('ACTIVE_PARTIAL');
    expect(audit.semanticDelta.catalogPromotion).toBe(false);
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
  });

  it('rejects semantic or authority tampering after manifest recomputation', () => {
    const changedDelta = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V17) as any;
    changedDelta.semanticDelta.statement += ' tampered';
    changedDelta.manifestHash = rehash(changedDelta);
    expect(() => parseCap2CurrentTruthReissueAuditV17(changedDelta)).toThrow(
      'CAP-2 v17 semantic delta drift.',
    );

    const falseAuthority = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V17) as any;
    falseAuthority.runtimeAuthority.stage3Authorization = true;
    falseAuthority.manifestHash = rehash(falseAuthority);
    expect(() => parseCap2CurrentTruthReissueAuditV17(falseAuthority)).toThrow();
  });
});

function rehash(value: typeof CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V17): string {
  const { manifestHash: _oldHash, ...material } = value;
  return hashCanonicalCap2ArtifactV1(material);
}
