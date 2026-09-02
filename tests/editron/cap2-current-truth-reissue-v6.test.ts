import { describe, expect, it } from 'vitest';

import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v5';
import {
  assertCap2CurrentTruthSourcesMatchV6,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6,
  hashNormalizedCap2FileV6,
  parseCap2CurrentTruthReissueAuditV6,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v6';
import { hashCanonicalCap2ArtifactV1 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';

describe('CAP-2A current-truth reissue V6', () => {
  it('preserves the superseded V6 artifact and reports current-source drift', () => {
    const audit = parseCap2CurrentTruthReissueAuditV6(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6,
    );
    expect(audit.priorAuditBinding.manifestHash)
      .toBe(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5.manifestHash);
    expect(audit.sourceBinding).toMatchObject({
      commit: 'd84b54159bbcb2f247e7688571a18ecba5ef3b36',
      sourceSnapshotPathCount: 222,
      sourceObservationCount: 11,
      observedIdentifierOccurrences: 477,
      reconciliationStatus: 'RECONCILED_CURRENT_TRUTH_V6',
    });
    expect(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V6).toHaveLength(222);
    expect(audit.reissueGate.sourceSurfaceReconciledAndReverified).toBe(true);
    expect(audit.semanticDelta).toMatchObject({
      deltaId: 'proof.hold03-provider-contract-and-directional-motion-v6',
      disposition: 'BENCHMARK_CONFOUND_CORRECTED_RERUN_REQUIRED',
      catalogPromotion: false,
    });
    expect(audit.semanticDelta.evidence).toHaveLength(9);
    for (const evidence of audit.semanticDelta.evidence) {
      expect(hashNormalizedCap2FileV6(evidence.path), evidence.path)
        .toBe(evidence.normalizedSha256);
    }
    expect(() => assertCap2CurrentTruthSourcesMatchV6())
      .toThrow('CAP-2 v6 current source coverage drift.');
    expect(audit.runtimeAuthority).toEqual({
      plannerRegistryWired: false,
      projectMutationAuthorized: false,
      productionCertificationGranted: false,
    });
  });

  it('rejects hash-recomputed evidence tampering and false runtime authority', () => {
    const changedEvidence = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6);
    changedEvidence.semanticDelta.evidence[0].normalizedSha256 = '0'.repeat(64);
    changedEvidence.manifestHash = rehash(changedEvidence);
    expect(() => parseCap2CurrentTruthReissueAuditV6(changedEvidence))
      .toThrow(/corrected evidence drift/);

    const falseAuthority = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6) as any;
    falseAuthority.runtimeAuthority.projectMutationAuthorized = true;
    falseAuthority.manifestHash = rehash(falseAuthority);
    expect(() => parseCap2CurrentTruthReissueAuditV6(falseAuthority)).toThrow();
  });
});

function rehash(value: typeof CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V6): string {
  const { manifestHash: _oldHash, ...material } = value;
  return hashCanonicalCap2ArtifactV1(material);
}
