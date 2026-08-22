import { describe, expect, it } from 'vitest';

import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import { CAP2_ATOMIC_OPERATION_CATALOG_V1 } from '@/lib/editron/research/capability-census/cap2-atomic-operation-catalog-v1';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2,
  parseCap2CurrentTruthReissueAuditV2,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v2';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V3,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V3,
  assertCap2CurrentTruthSourcesMatchV3,
  hashNormalizedCap2SourceSnapshotV3,
  parseCap2CurrentTruthReissueAuditV3,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v3';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4,
  CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V4,
  CAP2_CURRENT_TRUTH_SOURCE_PATHS_V4,
  assertCap2CurrentTruthSourcesMatchV4,
  hashNormalizedCap2FileV4,
  hashNormalizedCap2SourceSnapshotV4,
  parseCap2CurrentTruthReissueAuditV4,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v4';
import {
  CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1,
  CAP2_FROZEN_CATALOG_HASH_V1,
  CAP2_FROZEN_RECONCILIATION_HASHES_V1,
  hashCanonicalCap2ArtifactV1,
  parseCap2CurrentTruthFreezeManifestV1,
} from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

describe('CAP-2A frozen current-truth manifest v1', () => {
  it('freezes research truth without granting runtime or production authority', () => {
    const manifest = parseCap2CurrentTruthFreezeManifestV1(CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1);
    expect(manifest.status).toBe('FROZEN_CURRENT_TRUTH_RESEARCH_ONLY');
    expect(manifest.runtimeAuthority).toEqual({
      plannerRegistryWired: false,
      projectMutationAuthorized: false,
      productionCertificationGranted: false,
    });
    expect(manifest.catalogBinding).toMatchObject({
      declaredOperationCount: 37,
      certifiedOperationCount: 0,
      productionEligibleOperationCount: 0,
    });
  });

  it('binds the frozen catalog and all five reconciliation artifacts by canonical hash', () => {
    expect(hashCanonicalCap2ArtifactV1(CAP2_ATOMIC_OPERATION_CATALOG_V1))
      .toBe(CAP2_FROZEN_CATALOG_HASH_V1);
    expect(CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1.reconciliationBindings.map((binding) => ({
      domain: binding.domain,
      hash: binding.artifactHash,
    }))).toEqual(Object.entries(CAP2_FROZEN_RECONCILIATION_HASHES_V1).map(([domain, hash]) => ({
      domain,
      hash,
    })));
  });

  it('keeps the raw v1 and V3 observations immutable while detecting later source drift', () => {
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(inventory.sourceBinding.sourceSnapshotPaths).toHaveLength(222);
    expect(inventory.sourceBinding.sourceSnapshotHash)
      .toBe('a453fec27ef72e9497fa15ba8b9419023619e0f45e50ad9b674825ac5c84d95a');
    expect(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V3).toHaveLength(221);
    expect(hashNormalizedCap2SourceSnapshotV3(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V3))
      .not.toBe(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.sourceBinding.normalizedSourceSnapshotHash);
    expect(() => assertCap2CurrentTruthSourcesMatchV3())
      .toThrow(/current source snapshot drift/);
  });

  it('reconciles all 11 overlapping source rows without summing them as tools', () => {
    const bindings = CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1.sourceObservationBindings;
    expect(bindings).toHaveLength(11);
    expect(bindings.every(({ candidateIds }) => candidateIds.length > 0)).toBe(true);
    expect(CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1.gateSummary).toMatchObject({
      sourceObservationCoverage: 'PASS',
      observedIdentifierOccurrences: 476,
      reconciledCandidateCount: 121,
      atomicCandidateCount: 37,
    });
  });

  it('keeps every mutator excluded while its closed mutation contract remains declared', () => {
    const mutators = CAP2_ATOMIC_OPERATION_CATALOG_V1.operations
      .filter(({ kind }) => kind === 'MUTATE');
    expect(mutators).toHaveLength(18);
    for (const operation of mutators) {
      expect(operation.support.plannerEligibility).toBe('EXCLUDED');
      expect(operation.owners.mutationOwner).toBeDefined();
      expect(operation.owners.persistenceOwner).toBeDefined();
      expect(operation.execution.revisionSemantics).not.toBe('NONE');
      expect(operation.execution.mutationPath.length).toBeGreaterThan(0);
      expect(operation.effects.writes.length).toBeGreaterThan(0);
      expect(operation.owners.finalConsumers.length).toBeGreaterThan(0);
      expect(operation.verification.proofObligations.length).toBeGreaterThan(0);
    }
  });

  it('records unresolved owner and live-proof gaps instead of hiding them', () => {
    const summary = CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1.gateSummary;
    expect(summary.liveProofOwnership).toBe('GAP_RECORDED');
    expect(summary.mutatorsWithoutLiveProofOwnerIds).toHaveLength(14);
    expect(summary.duplicatedOwnerOperatorIds).toHaveLength(12);
    for (const operatorId of summary.duplicatedOwnerOperatorIds) {
      const operation = CAP2_ATOMIC_OPERATION_CATALOG_V1.operations
        .find((entry) => entry.operatorId === operatorId);
      expect(operation?.owners.ownerDisposition).toBe('DUPLICATED_UNRESOLVED');
      expect(operation?.support.plannerEligibility).toBe('EXCLUDED');
    }
  });

  it('chains V4 to immutable V3 without changing catalog authority', () => {
    const audit = parseCap2CurrentTruthReissueAuditV4(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4);
    expect(audit.status).toBe('REISSUED_CURRENT_TRUTH_RESEARCH_ONLY');
    expect(audit.priorAuditBinding.manifestHash)
      .toBe(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.manifestHash);
    expect(audit.catalogBinding).toMatchObject({
      declaredOperationCount: 37,
      certifiedOperationCount: 0,
      productionEligibleOperationCount: 0,
    });
    expect(audit.semanticDeltasSinceV3.map(({ deltaId }) => deltaId)).toEqual([
      'visual.subject-reframe-source-geometry-owner-v2',
      'proof.hold05-native-reframe-research-only',
      'proof.hold03-hybrid-generated-program-research-only',
    ]);
    expect(CAP2_CURRENT_TRUTH_SOURCE_OBSERVATIONS_V4
      .reduce((total, observation) => total + observation.observedCount, 0)).toBe(475);
    expect(audit.semanticDeltasSinceV3.every(({ resolution }) => (
      resolution.status === 'CURRENT_TRUTH_RECONCILED'
    ))).toBe(true);
    expect(audit.blockerIds).toEqual([]);
    expect(audit.reissueGate).toEqual({
      priorAuditChained: true,
      sourceSurfaceReconciled: true,
      semanticDeltasReconciled: true,
      catalogAuthorityUnchanged: true,
      runtimeAuthorityDenied: true,
    });
    for (const delta of audit.semanticDeltasSinceV3) {
      for (const evidence of delta.evidence) {
        expect(hashNormalizedCap2FileV4(evidence.path), evidence.path)
          .toBe(evidence.normalizedSha256);
      }
    }
    expect(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V4).toHaveLength(221);
    expect(hashNormalizedCap2SourceSnapshotV4(CAP2_CURRENT_TRUTH_SOURCE_PATHS_V4))
      .toBe(audit.sourceBinding.normalizedSourceSnapshotHash);
    expect(() => assertCap2CurrentTruthSourcesMatchV4()).not.toThrow();
    expect(audit.runtimeAuthority).toEqual({
      plannerRegistryWired: false,
      projectMutationAuthorized: false,
      productionCertificationGranted: false,
    });
  });

  it('rejects hash drift, incomplete source coverage and false runtime authority', () => {
    const badHash = structuredClone(CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1);
    badHash.reconciliationBindings[0].artifactHash = '0'.repeat(64);
    expect(() => parseCap2CurrentTruthFreezeManifestV1(badHash)).toThrow(/artifact hash drift/);

    const missingSource = structuredClone(CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1) as any;
    missingSource.sourceObservationBindings.pop();
    expect(() => parseCap2CurrentTruthFreezeManifestV1(missingSource)).toThrow();

    const falseAuthority = structuredClone(CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1) as any;
    falseAuthority.runtimeAuthority.projectMutationAuthorized = true;
    expect(() => parseCap2CurrentTruthFreezeManifestV1(falseAuthority)).toThrow();
  });

  it('retains v2 tamper resistance as historical audit evidence', () => {
    const badHash = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2);
    badHash.manifestHash = '0'.repeat(64);
    expect(() => parseCap2CurrentTruthReissueAuditV2(badHash)).toThrow(/manifest hash drift/);

    const falseDomainPass = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2);
    falseDomainPass.domainBindings[0].reissueStatus = 'HISTORICAL_V1_GATE_STILL_PASSES';
    const { manifestHash: _oldHash, ...tamperedMaterial } = falseDomainPass;
    falseDomainPass.manifestHash = hashCanonicalCap2ArtifactV1(tamperedMaterial);
    expect(() => parseCap2CurrentTruthReissueAuditV2(falseDomainPass))
      .toThrow(/domain binding drift/);

    const falseAuthority = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2) as any;
    falseAuthority.runtimeAuthority.projectMutationAuthorized = true;
    expect(() => parseCap2CurrentTruthReissueAuditV2(falseAuthority)).toThrow();
  });

  it('rejects v3 hash drift, recomputed-status tampering and false runtime authority', () => {
    const badHash = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3);
    badHash.manifestHash = '0'.repeat(64);
    expect(() => parseCap2CurrentTruthReissueAuditV3(badHash)).toThrow(/manifest hash drift/);

    const falseDomainPass = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3) as any;
    falseDomainPass.domainBindings[0].normalizedEvidenceHash = '0'.repeat(64);
    const { manifestHash: _oldHash, ...tamperedMaterial } = falseDomainPass;
    falseDomainPass.manifestHash = hashCanonicalCap2ArtifactV1(tamperedMaterial);
    expect(() => parseCap2CurrentTruthReissueAuditV3(falseDomainPass))
      .toThrow(/domain binding drift/);

    const falseAuthority = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3) as any;
    falseAuthority.runtimeAuthority.projectMutationAuthorized = true;
    expect(() => parseCap2CurrentTruthReissueAuditV3(falseAuthority)).toThrow();
  });

  it('rejects v4 hash drift, recomputed-status tampering and false runtime authority', () => {
    const badHash = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4);
    badHash.manifestHash = '0'.repeat(64);
    expect(() => parseCap2CurrentTruthReissueAuditV4(badHash)).toThrow(/manifest hash drift/);

    const falseDomainPass = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4) as any;
    falseDomainPass.domainBindings[0].normalizedEvidenceHash = '0'.repeat(64);
    const { manifestHash: _oldHash, ...tamperedMaterial } = falseDomainPass;
    falseDomainPass.manifestHash = hashCanonicalCap2ArtifactV1(tamperedMaterial);
    expect(() => parseCap2CurrentTruthReissueAuditV4(falseDomainPass))
      .toThrow(/domain binding drift/);

    const falseAuthority = structuredClone(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V4) as any;
    falseAuthority.runtimeAuthority.projectMutationAuthorized = true;
    expect(() => parseCap2CurrentTruthReissueAuditV4(falseAuthority)).toThrow();
  });
});
