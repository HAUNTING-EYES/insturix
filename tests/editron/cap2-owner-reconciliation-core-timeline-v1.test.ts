import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import reconciliationJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-core-timeline-v1.json';
import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v2';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v5';
import {
  assertCap2CurrentTruthSourcesMatchV7,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v7';
import {
  assertCap2CurrentTruthSourcesMatchV8,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v8';
import {
  assertCap2CurrentTruthSourcesMatchV9,
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V9,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v9';
import { parseCap2OwnerReconciliationArtifactV1 } from '@/lib/editron/research/capability-census/cap2-owner-reconciliation-contract-v1';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

const REPOSITORY_ROOT = process.cwd();

function absolutePath(relativePath: string): string {
  return path.resolve(REPOSITORY_ROOT, relativePath);
}

function readSource(relativePath: string): string {
  return readFileSync(absolutePath(relativePath), 'utf8');
}

function candidate(candidateId: string) {
  const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
  const result = artifact.candidates.find((entry) => entry.candidateId === candidateId);
  if (!result) throw new Error(`Missing reconciliation candidate ${candidateId}`);
  return result;
}

describe('CAP-2 core timeline owner reconciliation v1', () => {
  it('accepts the closed research artifact without claiming catalog completion', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.status).toBe('DOMAIN_RECONCILED_CATALOG_NOT_POPULATED');
    expect(artifact.candidates).toHaveLength(20);
    expect(artifact.candidates.map(({ candidateId }) => candidateId)).toEqual([
      'chat.checkpoint.redo',
      'chat.checkpoint.undo',
      'chat.transaction.rollback',
      'overlay.add',
      'overlay.atomic-receipt-metadata',
      'overlay.batch-update',
      'overlay.delete-cascade',
      'overlay.delete-one',
      'overlay.split',
      'overlay.trim',
      'overlay.update-one',
      'project.autosave',
      'project.read',
      'project.save',
      'project.update-generic',
      'timeline.close-gaps',
      'timeline.cut-range',
      'timeline.read-view',
      'ui.history.redo',
      'ui.history.undo',
    ]);
  });

  it('preserves historical bindings while V9 owns current source verification', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    const binding = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5.domainBindings
      .find(({ domain }) => domain === 'CORE_PROJECT_TIMELINE_CHECKPOINT')!;
    expect(binding.reissueStatus).toBe('RECONCILED_CURRENT_TRUTH_V5');
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.priorAuditBinding.artifactType)
      .toBe('EditronCapabilityCurrentTruthReissueAuditV6');
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8.priorAuditBinding).toMatchObject({
      artifactType: 'EditronCapabilityCurrentTruthReissueAuditV7',
      manifestHash: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.manifestHash,
    });
    expect(() => assertCap2CurrentTruthSourcesMatchV7()).toThrow(
      'CAP-2 v7 current source coverage drift.',
    );
    expect(() => assertCap2CurrentTruthSourcesMatchV8()).toThrow(
      'CAP-2 v8 current source coverage drift.',
    );
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V9.priorAuditBinding).toMatchObject({
      artifactType: 'EditronCapabilityCurrentTruthReissueAuditV8',
      manifestHash: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8.manifestHash,
    });
    expect(() => assertCap2CurrentTruthSourcesMatchV9()).not.toThrow();

    const refs = artifact.candidates.flatMap(({ evidenceRefs }) => evidenceRefs)
      .concat(artifact.domainConclusions.flatMap(({ evidenceRefs }) => evidenceRefs));
    for (const reference of refs) {
      expect(readSource(reference.path), `${reference.path}#${reference.symbol}`)
        .toContain(reference.symbol);
    }
  });

  it('retains every broad Phase-2 source observation as unresolved', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(artifact.sourceBinding.sourceSurfaceSnapshotHash)
      .toBe(inventory.sourceBinding.sourceSnapshotHash);
    expect(artifact.unresolvedSourceObservationIds).toEqual(inventory.unresolvedSourceIds);
  });

  it('keeps only bounded atomic rows as catalog candidates', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.candidates
      .filter(({ catalogDisposition }) => catalogDisposition === 'ATOMIC_CANDIDATE')
      .map(({ candidateId }) => candidateId)).toEqual([
      'overlay.add',
      'overlay.delete-one',
      'overlay.update-one',
      'project.read',
      'timeline.read-view',
    ]);
    expect(artifact.candidates
      .filter(({ atomicity }) => ['COMPOUND_MULTIWRITE', 'WHOLE_STATE_REPLACEMENT', 'NON_CAPABILITY'].includes(atomicity))
      .every(({ catalogDisposition }) => catalogDisposition !== 'ATOMIC_CANDIDATE'))
      .toBe(true);
  });

  it('records manual/chat execution divergence instead of false parity', () => {
    expect(candidate('overlay.add').parityStatus).toBe('SEMANTICALLY_DIVERGENT');
    expect(candidate('overlay.update-one').parityStatus).toBe('SEMANTICALLY_DIVERGENT');
    expect(candidate('overlay.split').parityStatus).toBe('SEMANTICALLY_DIVERGENT');
    expect(candidate('project.save').parityStatus).toBe('SHARED_PERSISTENCE_DIVERGENT_EXECUTION');
    expect(readSource('components/editron/editor/version-7.0.0/hooks/use-overlays.tsx'))
      .toContain('setOverlays((prevOverlays)');
    expect(readSource('lib/editron/agent/tools.ts')).toContain('projectService.updateOverlay');
  });

  it('distinguishes a writer-issued R_after fix from the remaining before-snapshot race', () => {
    const undo = candidate('chat.checkpoint.undo');
    expect(undo.revisionSafety.status).toBe('PROJECT_CAS');
    expect(undo.recovery.undo).toBe('PARTIAL');

    const runtime = readSource('lib/editron/agent/chat-ai-edit-transaction-runtime.ts');
    const checkpoints = readSource('lib/editron/services/checkpoint-service.ts');
    expect(runtime).toContain('captureRestorableProjectState(input.project)');
    expect(checkpoints).toContain('await projectService.getProjectRevision(input.userId, input.projectId)');
    expect(checkpoints).toContain('requires a writer-issued rollback receipt');
  });

  it('keeps the generic bridge duration-only while recognizing the repaired chat cut writer', () => {
    const projectService = readSource('lib/editron/services/project-service.ts');
    const updateStart = projectService.indexOf('async updateProject(');
    const updateEnd = projectService.indexOf('async deleteOverlay(', updateStart);
    const updateProjectBody = projectService.slice(updateStart, updateEnd);
    expect(updateProjectBody).toContain('reconcileProjectDurationFromOverlaysV1');
    expect(updateProjectBody).toContain('assertedDurationInFrames');
    expect(updateProjectBody).not.toContain('getDatabase');
    expect(updateProjectBody).not.toContain('updateOne');

    const tools = readSource('lib/editron/agent/tools.ts');
    const cutStart = tools.indexOf('const cutSection = tool(');
    const cutEnd = tools.indexOf('// --- Auto-Edit from Script ---', cutStart);
    const cutSource = tools.slice(cutStart, cutEnd);
    expect(cutSource).toContain('projectService.cutTimelineRangeV1(userId, projectId, {');
    expect(cutSource).toContain("actorKind: 'AGENT'");
    expect(cutSource).toContain('timelineChangeReceipt');
    expect(cutSource).toContain('e instanceof ProjectMutationConflictError');
    expect(cutSource).toContain("nextAction: 'stop'");
    expect(cutSource).not.toContain('projectService.saveProjectWithReceipt(');
    // The frozen V1 candidate remains historical; V8 records the current repair.
    expect(candidate('timeline.cut-range').revisionSafety.status)
      .toBe('WHOLE_STATE_STALE_SNAPSHOT_RISK');
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8.semanticDelta).toMatchObject({
      deltaId: 'core.chat-cut-caller-pinned-project-cas',
      catalogPromotion: false,
    });
  });

  it('records receipt and coordinate-output improvements without false atomic promotion', () => {
    const scriptImport = readSource('app/api/services/editron/projects/import-from-script/route.ts');
    expect(scriptImport).toContain('verifyThinkForgeEditronProductionManifest');
    expect(scriptImport).toContain('projectService.saveProjectWithReceipt');
    expect(scriptImport).not.toContain('getDatabase');

    const timelineCut = readSource('lib/editron/services/timeline-range-cut.ts');
    expect(timelineCut).toContain('TimelineRangeCutCoordinateTransformV1');
    expect(timelineCut).toContain('timelineCoordinateTransform');
    expect(timelineCut).toContain('splitChildren');
    expect(candidate('timeline.cut-range').catalogDisposition).toBe('EXCLUDED_UNSAFE');

    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2.semanticDeltas
      .filter(({ domain }) => domain === 'CORE_PROJECT_TIMELINE_CHECKPOINT')
      .map(({ deltaId }) => deltaId)).toEqual([
      'core.script-import-writer-receipt',
      'core.timeline-cut-coordinate-output',
    ]);
    const cutResolution = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2.semanticDeltas
      .find(({ deltaId }) => deltaId === 'core.timeline-cut-coordinate-output')!.resolution;
    expect(cutResolution.supersededV1Claims)
      .toContain('The cut result does not expose its internal original-to-split-child mapping.');
    expect(cutResolution.remainingGaps)
      .toContain('Carry the caller-pinned expected revision through one canonical project mutation.');
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8.semanticDelta.resolvedGaps)
      .toContain('The chat cut no longer discards the revision paired with its loaded project snapshot.');
    expect(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V8.semanticDelta.remainingGaps)
      .toContain('The operation still has no ProjectService-issued range-aware rebase or durable range-lock command.');
  });

  it('keeps overlay metadata receipts outside transaction authority', () => {
    const metadata = candidate('overlay.atomic-receipt-metadata');
    expect(metadata.atomicity).toBe('NON_CAPABILITY');
    expect(metadata.catalogDisposition).toBe('EXCLUDED_NON_CAPABILITY');
    expect(metadata.revisionSafety.writerReceipt).toBe('OVERLAY_METADATA_RECEIPT_ONLY');
  });

  it('rejects false promotion, missing ownership and evidence-union drift', () => {
    const falseAtomic = structuredClone(reconciliationJson);
    falseAtomic.candidates.find(({ candidateId }) => candidateId === 'overlay.batch-update')!
      .catalogDisposition = 'ATOMIC_CANDIDATE';
    expect(() => parseCap2OwnerReconciliationArtifactV1(falseAtomic)).toThrow();

    const nonCapabilityPromotion = structuredClone(reconciliationJson);
    nonCapabilityPromotion.candidates.find(({ candidateId }) => candidateId === 'project.update-generic')!
      .catalogDisposition = 'WRAPPER_ONLY';
    expect(() => parseCap2OwnerReconciliationArtifactV1(nonCapabilityPromotion)).toThrow();

    const missingOwner = structuredClone(reconciliationJson);
    missingOwner.candidates.find(({ candidateId }) => candidateId === 'overlay.add')!
      .chain.mutationOwners = [];
    expect(() => parseCap2OwnerReconciliationArtifactV1(missingOwner)).toThrow();

    const missingInconsistency = structuredClone(reconciliationJson);
    missingInconsistency.candidates[0].atomicity = 'ATOMIC';
    expect(() => parseCap2OwnerReconciliationArtifactV1(missingInconsistency)).toThrow();

    const evidenceDrift = structuredClone(reconciliationJson);
    evidenceDrift.sourceBinding.evidencePaths.pop();
    expect(() => parseCap2OwnerReconciliationArtifactV1(evidenceDrift)).toThrow();
  });
});
