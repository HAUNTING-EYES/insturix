import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import reconciliationJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-render-proof-delivery-v1.json';
import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v5';
import { parseCap2OwnerReconciliationArtifactV1 } from '@/lib/editron/research/capability-census/cap2-owner-reconciliation-contract-v1';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

const REPOSITORY_ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

function candidate(candidateId: string) {
  const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
  const result = artifact.candidates.find((entry) => entry.candidateId === candidateId);
  if (!result) throw new Error(`Missing render/proof reconciliation candidate ${candidateId}`);
  return result;
}

describe('CAP-2 render/proof/delivery/API/worker owner reconciliation v1', () => {
  it('accepts the closed 27-row research artifact', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.domain).toBe('RENDER_PROOF_DELIVERY_API_WORKERS');
    expect(artifact.status).toBe('DOMAIN_RECONCILED_CATALOG_NOT_POPULATED');
    expect(artifact.candidates).toHaveLength(27);
  });

  it('preserves the V5 historical audit and its declared frozen references', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.sourceBinding.evidencePaths).toHaveLength(34);
    const binding = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5.domainBindings
      .find(({ domain }) => domain === 'RENDER_PROOF_DELIVERY_API_WORKERS')!;
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5.sourceBinding.commit)
      .toBe('82c7db926ea0e2e48c9a6cc7e4772396b5761acf');
    expect(binding.reissueStatus).toBe('RECONCILED_CURRENT_TRUTH_V5');
    const refs = artifact.candidates.flatMap(({ evidenceRefs }) => evidenceRefs)
      .concat(artifact.domainConclusions.flatMap(({ evidenceRefs }) => evidenceRefs));
    expect(new Set(refs.map(({ path: evidencePath }) => evidencePath)).size).toBe(34);
    for (const reference of refs) {
      expect(reference.path).toMatch(/^.+\.(?:ts|tsx)$/);
      expect(reference.symbol.trim()).not.toBe('');
    }
  });

  it('retains every broad source observation as unresolved', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(artifact.sourceBinding.sourceSurfaceSnapshotHash)
      .toBe(inventory.sourceBinding.sourceSnapshotHash);
    expect(artifact.unresolvedSourceObservationIds).toEqual(inventory.unresolvedSourceIds);
  });

  it('fixes the exact candidate and atomic-candidate allowlists', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.candidates.map(({ candidateId }) => candidateId)).toEqual([
      'api.editron-route-surface',
      'delivery.archive',
      'delivery.export-master',
      'delivery.interchange',
      'delivery.manifest',
      'delivery.professional-qc',
      'preview.generalized-observation',
      'proof.chat-render-verification',
      'proof.phase0-claim-rendered',
      'proof.phase0-record-facts',
      'proof.phase0-record-rendered',
      'proof.phase0-render-audio',
      'proof.phase0-render-stills',
      'render.chapter-execute',
      'render.finalization-complete',
      'render.finalization-dispatch',
      'render.finalizer-probe',
      'render.job-read-active',
      'render.job-read-history',
      'render.job-read-one',
      'render.request-export',
      'render.ssr-legacy',
      'render.standard-execute',
      'render.timebase-format-contract',
      'worker.auth-fail-closed',
      'worker.auth-fail-open',
      'worker.auth-shared',
    ]);
    expect(artifact.candidates
      .filter(({ catalogDisposition }) => catalogDisposition === 'ATOMIC_CANDIDATE')
      .map(({ candidateId }) => candidateId)).toEqual([
        'proof.phase0-claim-rendered',
        'proof.phase0-record-facts',
        'proof.phase0-record-rendered',
        'render.job-read-active',
        'render.job-read-history',
        'render.job-read-one',
      ]);
  });

  it('keeps receipt-bound Phase-0 ProjectService writes atomic but specialized', () => {
    for (const id of [
      'proof.phase0-claim-rendered',
      'proof.phase0-record-facts',
      'proof.phase0-record-rendered',
    ]) {
      expect(candidate(id).revisionSafety).toMatchObject({
        status: 'PROJECT_CAS',
        writerReceipt: 'PROJECT_MUTATION_RECEIPT',
      });
    }
    const service = readSource('lib/editron/services/project-service.ts');
    expect(service).toContain('...projectRevisionPredicate(input.expectedRevision)');
    expect(service).toContain('this.publishMutationReceipt(claimReceipt)');
    expect(service).toContain('this.publishMutationReceipt(receipt)');
  });

  it('records shared downstream finalization without claiming complete convergence', () => {
    expect(readSource('app/api/services/editron/cloudrun/render/webhook/route.ts'))
      .toContain('beginRenderFinalization');
    expect(readSource('app/api/services/editron/cloudrun/progress/route.ts'))
      .toContain('beginRenderFinalization');
    expect(readSource('app/api/services/editron/cloudrun/progress/route.ts'))
      .toContain('RENDER_FINALIZATION_RECEIPT_MISSING');
    expect(candidate('render.ssr-legacy').parityStatus).toBe('SEMANTICALLY_DIVERGENT');
  });

  it('does not mistake a duration probe for professional master QC', () => {
    const finalizer = readSource('lib/editron/services/render-finalizer-client.ts');
    const schema = readSource('lib/editron/schemas/render-job.ts');
    expect(finalizer).toContain('MAX_RENDER_FINALIZER_DURATION_MS = 3 * 60 * 60 * 1000');
    expect(schema).toContain('const measuredDurations');
    expect(schema).not.toContain('expectedRationalFps');
    expect(schema).not.toContain('expectedColorPrimaries');
    expect(schema).not.toContain('expectedPixelFormat');
    expect(schema).not.toContain('expectedLoudness');
    expect(candidate('delivery.professional-qc').implementationStatus).toBe('PARTIAL');
  });

  it('records the numeric-FPS chapter policy as an uncertified wrapper', () => {
    const chapters = readSource('lib/editron/services/chapter-renderer.ts');
    const renderRoute = readSource('app/api/services/editron/cloudrun/render/route.ts');
    expect(chapters).toContain('const CHAPTER_SPLIT_THRESHOLD_SECONDS = 15 * 60');
    expect(chapters).toContain('const TARGET_CHAPTER_SECONDS = 2.5 * 60');
    expect(chapters).toContain('const MIN_CHAPTER_SECONDS = 30');
    expect(chapters).toContain('function chapterFramePolicy');
    expect(chapters).toContain('function assertChapterFps');
    expect(renderRoute).toContain('shouldUseChapterRendering(totalFrames, renderFps)');
    expect(candidate('render.chapter-execute').catalogDisposition).toBe('WRAPPER_ONLY');
    expect(candidate('render.timebase-format-contract').implementationStatus).toBe('MISSING');
  });

  it('keeps the twelve historical worker observations separate from current auth controls', () => {
    const failOpen = candidate('worker.auth-fail-open');
    expect(failOpen.evidenceRefs).toHaveLength(12);
    expect(failOpen.evidenceRefs.every(({ path: evidencePath, symbol }) =>
      evidencePath.endsWith('/route.ts') && symbol === ': handler')).toBe(true);
    for (const route of [
      'app/api/internal/workers/render-finalizer/route.ts',
      'app/api/internal/workers/render-finalizer/failure/route.ts',
    ]) {
      const source = readSource(route);
      expect(source).toContain('signingUnavailable');
      expect(source).toContain("process.env.NODE_ENV === 'production'");
    }
    expect(candidate('worker.auth-shared').implementationStatus).toBe('MISSING');
  });

  it('rejects wrapper promotion, lost persistence ownership and evidence drift', () => {
    const falseAtomic = structuredClone(reconciliationJson);
    falseAtomic.candidates.find(({ candidateId }) => candidateId === 'render.request-export')!
      .catalogDisposition = 'ATOMIC_CANDIDATE';
    expect(() => parseCap2OwnerReconciliationArtifactV1(falseAtomic)).toThrow();

    const missingOwner = structuredClone(reconciliationJson);
    missingOwner.candidates.find(({ candidateId }) => candidateId === 'proof.phase0-record-rendered')!
      .chain.persistenceOwner = undefined;
    expect(() => parseCap2OwnerReconciliationArtifactV1(missingOwner)).toThrow();

    const evidenceDrift = structuredClone(reconciliationJson);
    evidenceDrift.sourceBinding.evidencePaths.pop();
    expect(() => parseCap2OwnerReconciliationArtifactV1(evidenceDrift)).toThrow();
  });
});
