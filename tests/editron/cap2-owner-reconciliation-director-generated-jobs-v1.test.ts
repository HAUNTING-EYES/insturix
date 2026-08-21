import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import reconciliationJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-director-generated-jobs-v1.json';
import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3,
  getCap2CurrentTruthDomainEvidencePathsV3,
  hashNormalizedCap2SourceSnapshotV3,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v3';
import { parseCap2OwnerReconciliationArtifactV1 } from '@/lib/editron/research/capability-census/cap2-owner-reconciliation-contract-v1';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

const REPOSITORY_ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

function candidate(candidateId: string) {
  const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
  const result = artifact.candidates.find((entry) => entry.candidateId === candidateId);
  if (!result) throw new Error(`Missing Director/generated reconciliation candidate ${candidateId}`);
  return result;
}

function sourceFilesUnder(relativeRoot: string): string[] {
  const root = path.resolve(REPOSITORY_ROOT, relativeRoot);
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'research'].includes(entry.name)) visit(absolute);
      } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(absolute);
      }
    }
  };
  visit(root);
  return files;
}

describe('CAP-2 Director/generated/analysis/jobs owner reconciliation v1', () => {
  it('accepts the closed research artifact without claiming product wiring', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.domain).toBe('DIRECTOR_GENERATED_ANALYSIS_JOBS');
    expect(artifact.status).toBe('DOMAIN_RECONCILED_CATALOG_NOT_POPULATED');
    expect(artifact.candidates).toHaveLength(23);
  });

  it('binds all 38 current evidence files over immutable v1 history', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.sourceBinding.evidencePaths).toHaveLength(38);
    const binding = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.domainBindings
      .find(({ domain }) => domain === 'DIRECTOR_GENERATED_ANALYSIS_JOBS')!;
    expect(hashNormalizedCap2SourceSnapshotV3(
      getCap2CurrentTruthDomainEvidencePathsV3('DIRECTOR_GENERATED_ANALYSIS_JOBS'),
    )).toBe(binding.normalizedEvidenceHash);
    expect(binding.reissueStatus).toBe('RECONCILED_CURRENT_TRUTH_V3');
    const refs = artifact.candidates.flatMap(({ evidenceRefs }) => evidenceRefs)
      .concat(artifact.domainConclusions.flatMap(({ evidenceRefs }) => evidenceRefs));
    for (const reference of refs) {
      expect(readSource(reference.path), `${reference.path}#${reference.symbol}`)
        .toContain(reference.symbol);
    }
  });

  it('retains every broad source observation as unresolved', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(artifact.sourceBinding.sourceSurfaceSnapshotHash)
      .toBe(inventory.sourceBinding.sourceSnapshotHash);
    expect(artifact.unresolvedSourceObservationIds).toEqual(inventory.unresolvedSourceIds);
  });

  it('advances only canonical analysis read and generated-state CAS operations', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.candidates
      .filter(({ catalogDisposition }) => catalogDisposition === 'ATOMIC_CANDIDATE')
      .map(({ candidateId }) => candidateId)).toEqual([
      'analysis.project-read',
      'generated-composition.finalize',
      'generated-composition.prepare',
    ]);
  });

  it('proves generated-composition state is not product-wired', () => {
    const productFiles = [
      ...sourceFilesUnder('app'),
      ...sourceFilesUnder('components'),
      ...sourceFilesUnder('lib/editron'),
    ].filter((absolute) => !absolute.endsWith(`${path.sep}project-service.ts`));
    const productText = productFiles.map((absolute) => readFileSync(absolute, 'utf8')).join('\n');
    expect(productText).not.toContain('prepareProjectGeneratedCompositionV1(');
    expect(productText).not.toContain('finalizeProjectGeneratedCompositionV1(');
    expect(candidate('generated-composition.editor-consumer').implementationStatus).toBe('MISSING');
    expect(readSource('lib/editron/services/project-generated-composition-legacy-timeline-projection-v1.ts'))
      .toContain("rendererDisposition: 'NOT_WIRED'");
  });

  it('keeps Director and durable family jobs as wrappers', () => {
    expect(candidate('director.execute-plan').catalogDisposition).toBe('WRAPPER_ONLY');
    expect(candidate('job.editorial-intent').catalogDisposition).toBe('WRAPPER_ONLY');
    expect(candidate('job.reference-style').catalogDisposition).toBe('WRAPPER_ONLY');
    expect(candidate('job.unified-durable-plan').implementationStatus).toBe('MISSING');
    const director = readSource('lib/editron/agent/director-agent.ts');
    expect(director).toContain('acquireDirectorMutationLease');
    expect(director).toContain('saveProjectWithReceipt');
  });

  it('keeps legacy template MG, AI codegen and generalized composition distinct', () => {
    expect(candidate('mg.legacy-template-route').parityStatus).toBe('SEMANTICALLY_DIVERGENT');
    expect(candidate('mg.codegen').catalogDisposition).toBe('EXCLUDED_NON_CAPABILITY');
    expect(readSource('app/api/services/editron/motion-graphics/route.ts'))
      .toContain('Motion Graphics Template API');
    expect(readSource('lib/editron/motion-graphics/codegen/codegen-service.ts'))
      .toContain('generateMoment');
    expect(readSource('lib/editron/research/open-ended-planner/generated-composition-program-v1.ts'))
      .toContain('GeneratedCompositionProgramV1');
  });

  it('rejects false promotion, missing ownership and evidence-union drift', () => {
    const falseAtomic = structuredClone(reconciliationJson);
    falseAtomic.candidates.find(({ candidateId }) => candidateId === 'director.execute-plan')!
      .catalogDisposition = 'ATOMIC_CANDIDATE';
    expect(() => parseCap2OwnerReconciliationArtifactV1(falseAtomic)).toThrow();

    const missingOwner = structuredClone(reconciliationJson);
    missingOwner.candidates.find(({ candidateId }) => candidateId === 'generated-composition.prepare')!
      .chain.mutationOwners = [];
    expect(() => parseCap2OwnerReconciliationArtifactV1(missingOwner)).toThrow();

    const evidenceDrift = structuredClone(reconciliationJson);
    evidenceDrift.sourceBinding.evidencePaths.pop();
    expect(() => parseCap2OwnerReconciliationArtifactV1(evidenceDrift)).toThrow();
  });
});
