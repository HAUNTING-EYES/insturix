import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import coreJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-core-timeline-v1.json';
import directorJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-director-generated-jobs-v1.json';
import mediaJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-media-audio-v1.json';
import renderJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-render-proof-delivery-v1.json';
import visualJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-visual-v1.json';
import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import {
  CAP2_ATOMIC_CANDIDATE_IDS_V1,
  CAP2_ATOMIC_OPERATION_CATALOG_V1,
} from '@/lib/editron/research/capability-census/cap2-atomic-operation-catalog-v1';
import { parseCap2CatalogV1 } from '@/lib/editron/research/capability-census/cap2-atomic-operation-contract-v1';
import { parseCap2OwnerReconciliationArtifactV1 } from '@/lib/editron/research/capability-census/cap2-owner-reconciliation-contract-v1';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

const REPOSITORY_ROOT = process.cwd();
const reconciliations = [coreJson, visualJson, mediaJson, directorJson, renderJson]
  .map(parseCap2OwnerReconciliationArtifactV1);

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

function codeRefs(operation: typeof CAP2_ATOMIC_OPERATION_CATALOG_V1.operations[number]) {
  return [
    ...operation.surfaces.entrypoints,
    operation.owners.decisionOwner,
    operation.owners.formOwner,
    operation.owners.mutationOwner,
    operation.owners.persistenceOwner,
    operation.owners.proofOwner,
    ...operation.owners.finalConsumers,
    ...operation.execution.mutationPath,
    ...operation.verification.deterministicValidators,
    ...operation.evidenceRefs,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
}

describe('CAP-2 atomic operation catalog v1', () => {
  it('parses all 37 records as frozen current truth without granting production authority', () => {
    const catalog = parseCap2CatalogV1(CAP2_ATOMIC_OPERATION_CATALOG_V1);
    expect(catalog.catalogStatus).toBe('FROZEN_CURRENT_TRUTH');
    expect(catalog.declaredOperationCount).toBe(37);
    expect(catalog.operations).toHaveLength(37);
    expect(catalog.sourceCounts).toHaveLength(11);
    expect(catalog.unresolvedSourceIds).toEqual([]);
  });

  it('covers every and only reconciled atomic candidate exactly once', () => {
    const expected = reconciliations
      .flatMap(({ candidates }) => candidates)
      .filter(({ catalogDisposition }) => catalogDisposition === 'ATOMIC_CANDIDATE')
      .map(({ candidateId }) => candidateId)
      .sort();
    expect(CAP2_ATOMIC_CANDIDATE_IDS_V1).toEqual(expected);
    expect(CAP2_ATOMIC_OPERATION_CATALOG_V1.operations.map(({ operatorId }) => operatorId))
      .toEqual(expected);
  });

  it('retains source counts as observations instead of summing them as tools', () => {
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(CAP2_ATOMIC_OPERATION_CATALOG_V1.sourceBinding.sourceSnapshotHash)
      .toBe(inventory.sourceBinding.sourceSnapshotHash);
    expect(CAP2_ATOMIC_OPERATION_CATALOG_V1.sourceCounts.map(({ sourceId, observedCount }) => ({
      sourceId,
      observedCount,
    }))).toEqual(inventory.observations.map(({ sourceId, observedCount }) => ({
      sourceId,
      observedCount,
    })));
  });

  it('resolves every owner, entrypoint, consumer, validator and evidence symbol', () => {
    for (const operation of CAP2_ATOMIC_OPERATION_CATALOG_V1.operations) {
      for (const reference of codeRefs(operation)) {
        expect(readSource(reference.path), `${operation.operatorId}: ${reference.path}#${reference.symbol}`)
          .toContain(reference.symbol);
      }
    }
    for (const sourceCount of CAP2_ATOMIC_OPERATION_CATALOG_V1.sourceCounts) {
      for (const reference of sourceCount.evidenceRefs) {
        expect(readSource(reference.path), `${sourceCount.sourceId}: ${reference.path}`)
          .toContain(reference.symbol);
      }
    }
  });

  it('certifies no operation and exposes no production mutator', () => {
    for (const operation of CAP2_ATOMIC_OPERATION_CATALOG_V1.operations) {
      expect(operation.support.certificationStatus).toBe('UNCERTIFIED');
      expect(operation.support.projectClasses.every(({ status }) => status === 'UNCERTIFIED')).toBe(true);
      expect(operation.support.plannerEligibility).not.toBe('PRODUCTION_ELIGIBLE');
      if (operation.kind === 'MUTATE') {
        expect(operation.support.plannerEligibility).toBe('EXCLUDED');
        expect(operation.execution.revisionSemantics).toBe('PROJECT_CAS');
        expect(operation.effects.writes.length).toBeGreaterThan(0);
        expect(operation.execution.mutationPath.length).toBeGreaterThan(0);
      } else {
        expect(operation.support.plannerEligibility).toBe('READ_ONLY');
        expect(operation.effects.writes).toEqual([]);
      }
    }
  });

  it('keeps PASS, FAIL and UNVERIFIABLE and versioned proof obligations on every row', () => {
    for (const operation of CAP2_ATOMIC_OPERATION_CATALOG_V1.operations) {
      expect(operation.verification.proofDispositions).toEqual(['PASS', 'FAIL', 'UNVERIFIABLE']);
      expect(operation.verification.proofObligations.length).toBeGreaterThan(0);
      expect(operation.verification.proofObligations.every(({ version }) => version === '1.0.0')).toBe(true);
    }
  });

  it('keeps semantic owner divergence excluded', () => {
    const divergent = CAP2_ATOMIC_OPERATION_CATALOG_V1.operations
      .filter(({ surfaces }) => surfaces.parityStatus === 'SEMANTICALLY_DIVERGENT');
    expect(divergent.length).toBeGreaterThan(0);
    for (const operation of divergent) {
      expect(operation.owners.ownerDisposition).toBe('DUPLICATED_UNRESOLVED');
      expect(operation.support.plannerEligibility).toBe('EXCLUDED');
    }
  });

  it('records concrete cross-operation state and invalidation effects', () => {
    const beatSync = CAP2_ATOMIC_OPERATION_CATALOG_V1.operations
      .find(({ operatorId }) => operatorId === 'music.beat-sync');
    expect(beatSync?.effects.writes).toContainEqual({
      refType: 'TIMELINE_RANGE',
      selector: 'eligible-cut-boundaries',
      coordinateDomain: 'PROJECT_TIMEBASE',
    });
    expect(beatSync?.effects.invalidates.map(({ selector }) => selector))
      .toEqual(expect.arrayContaining(['timeline-render-proof', 'speech-boundary-proof']));

    const generatedFinalize = CAP2_ATOMIC_OPERATION_CATALOG_V1.operations
      .find(({ operatorId }) => operatorId === 'generated-composition.finalize');
    expect(generatedFinalize?.effects.invalidates.map(({ selector }) => selector))
      .toContain('prior-generated-composition-render');
  });

  it('rejects false production promotion and a missing mutation path', () => {
    const promoted = structuredClone(CAP2_ATOMIC_OPERATION_CATALOG_V1);
    promoted.operations[0].support.plannerEligibility = 'PRODUCTION_ELIGIBLE';
    expect(() => parseCap2CatalogV1(promoted)).toThrow(/production eligibility/);

    const brokenMutation = structuredClone(CAP2_ATOMIC_OPERATION_CATALOG_V1);
    const mutation = brokenMutation.operations.find(({ kind }) => kind === 'MUTATE');
    expect(mutation).toBeDefined();
    mutation!.execution.mutationPath = [];
    expect(() => parseCap2CatalogV1(brokenMutation)).toThrow(/mutating operations require/);
  });
});
