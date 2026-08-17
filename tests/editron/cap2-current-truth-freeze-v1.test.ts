import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import { CAP2_ATOMIC_OPERATION_CATALOG_V1 } from '@/lib/editron/research/capability-census/cap2-atomic-operation-catalog-v1';
import {
  CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1,
  CAP2_FROZEN_CATALOG_HASH_V1,
  CAP2_FROZEN_RECONCILIATION_HASHES_V1,
  hashCanonicalCap2ArtifactV1,
  parseCap2CurrentTruthFreezeManifestV1,
} from '@/lib/editron/research/capability-census/cap2-current-truth-freeze-v1';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

const REPOSITORY_ROOT = process.cwd();

function sourceSnapshotHash(relativePaths: readonly string[]): string {
  const rows = [...relativePaths]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .map((relativePath) => {
      const fileHash = createHash('sha256')
        .update(readFileSync(path.resolve(REPOSITORY_ROOT, relativePath)))
        .digest('hex');
      return `${relativePath}\0${fileHash}`;
    });
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

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

  it('recomputes the 222-file source snapshot instead of trusting the recorded digest', () => {
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(inventory.sourceBinding.sourceSnapshotPaths).toHaveLength(222);
    expect(sourceSnapshotHash(inventory.sourceBinding.sourceSnapshotPaths))
      .toBe(CAP2_CURRENT_TRUTH_FREEZE_MANIFEST_V1.sourceBinding.sourceSnapshotHash);
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
});
