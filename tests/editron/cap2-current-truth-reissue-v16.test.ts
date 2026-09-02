import { describe, expect, it } from 'vitest';

import {
  assertCap2CurrentTruthSourcesMatchV16,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16,
  CAP2_QUEUE5_ACTOR_SOURCE_PATHS_V16,
  parseCap2CurrentTruthReissueAuditV16,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v16';
import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15 } from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v15';
import { hashCanonicalCap2ArtifactV1 } from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';

describe('CAP-2 current-truth reissue V16', () => {
  it('chains immutable V15 and binds the landed Queue 5 actor-provenance slice', () => {
    const audit = parseCap2CurrentTruthReissueAuditV16(
      CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16,
    );

    expect(audit.priorAuditBinding).toEqual({
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15.artifactType,
      manifestHash: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15.manifestHash,
      normalizedSourceSnapshotHash:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V15.sourceBinding.normalizedSourceSnapshotHash,
    });
    expect(audit.sourceBinding).toMatchObject({
      branch: 'infrastructure-improvs-+Editron',
      commit: 'a0084baee93273a1e1a2b5b0f149870c7182ba03',
      normalizedSourceSnapshotHash:
        '6a29ab8986e27f97f123bf945cfbf615abcfd8d9cde09220156d0d639d848ce4',
      queue5ActorSourceSnapshotHash:
        '813f94b4384dffed7d21d14e3644fec2b4212c106e2738a3b3083ea8d2e6a4c1',
      queue5ActorSourcePathCount: 3,
    });
    expect(CAP2_QUEUE5_ACTOR_SOURCE_PATHS_V16).toHaveLength(3);
    expect(() => assertCap2CurrentTruthSourcesMatchV16()).toThrow(
      'CAP-2 v16 live Queue 5 source snapshot drift.',
    );
  });

  it('records explicit current actors without claiming universal Queue 5 closure', () => {
    const audit = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16;
    expect(audit.semanticDelta.resolvedGaps).toContain(
      'Current ProjectService mutation command types exclude unknown legacy actor provenance.',
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
    const changedDelta = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16) as any;
    changedDelta.semanticDelta.statement += ' tampered';
    changedDelta.manifestHash = rehash(changedDelta);
    expect(() => parseCap2CurrentTruthReissueAuditV16(changedDelta)).toThrow(
      'CAP-2 v16 semantic delta drift.',
    );

    const falseAuthority = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16) as any;
    falseAuthority.runtimeAuthority.stage3Authorization = true;
    falseAuthority.manifestHash = rehash(falseAuthority);
    expect(() => parseCap2CurrentTruthReissueAuditV16(falseAuthority)).toThrow();
  });
});

function rehash(value: typeof CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V16): string {
  const { manifestHash: _oldHash, ...material } = value;
  return hashCanonicalCap2ArtifactV1(material);
}
