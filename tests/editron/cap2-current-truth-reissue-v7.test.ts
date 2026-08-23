import { describe, expect, it } from 'vitest';

import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v6';
import {
  assertCap2CurrentTruthSourcesMatchV7,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V7,
  hashNormalizedCap2FileV7,
  parseCap2CurrentTruthReissueAuditV7,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v7';
import { hashCanonicalCap2ArtifactV1 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';

describe('CAP-2A current-truth reissue V7', () => {
  it('chains V6 and binds all post-V6 source drift without promotion', () => {
    const audit = parseCap2CurrentTruthReissueAuditV7(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7,
    );
    expect(audit.priorAuditBinding.manifestHash)
      .toBe(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6.manifestHash);
    expect(audit.sourceBinding).toMatchObject({
      commit: '45b5785e3c12fd03296f02cb40ed7e0a3573ea4d',
      normalizedSourceSnapshotHash:
        'd476471bda793c1857152036da47804668532a115e23cdd7c04cca474a24c1d8',
      sourceSnapshotPathCount: 231,
      sourceObservationCount: 11,
      observedIdentifierOccurrences: 486,
      reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V7',
    });
    expect(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V7).toHaveLength(231);
    expect(audit.semanticDelta.evidence).toHaveLength(20);
    for (const evidence of audit.semanticDelta.evidence) {
      expect(hashNormalizedCap2FileV7(evidence.path), evidence.path)
        .toBe(evidence.normalizedSha256);
    }
    expect(() => assertCap2CurrentTruthSourcesMatchV7()).not.toThrow();
    expect(audit.catalogBinding).toMatchObject({
      declaredOperationCount: 37,
      certifiedOperationCount: 0,
      productionEligibleOperationCount: 0,
    });
    expect(audit.runtimeAuthority).toEqual({
      plannerRegistryWired: false,
      projectMutationAuthorized: false,
      productionCertificationGranted: false,
    });
  });

  it('rejects hash-recomputed evidence tampering and false authority', () => {
    const changedEvidence = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7);
    changedEvidence.semanticDelta.evidence[0].normalizedSha256 = '0'.repeat(64);
    changedEvidence.manifestHash = rehash(changedEvidence);
    expect(() => parseCap2CurrentTruthReissueAuditV7(changedEvidence))
      .toThrow(/reconciled evidence drift/);

    const falseAuthority = structuredClone(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7,
    ) as any;
    falseAuthority.runtimeAuthority.projectMutationAuthorized = true;
    falseAuthority.manifestHash = rehash(falseAuthority);
    expect(() => parseCap2CurrentTruthReissueAuditV7(falseAuthority)).toThrow();
  });
});

function rehash(value: typeof CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7): string {
  const { manifestHash: _oldHash, ...material } = value;
  return hashCanonicalCap2ArtifactV1(material);
}
