import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import reconciliationJson from '@/docs/editron/capability-census/editron-cap2-owner-reconciliation-visual-v1.json';
import inventoryJson from '@/docs/editron/capability-census/editron-cap2-source-surface-inventory-v1.json';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v2';
import {
  CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5,
  getCap2CurrentTruthDomainEvidencePathsV5,
  hashNormalizedCap2SourceSnapshotV5,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v5';
import {
  assertCap2CurrentTruthSourcesMatchV14,
  CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14,
} from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v14';
import { parseCap2OwnerReconciliationArtifactV1 } from '@/lib/editron/research/capability-census/cap2-owner-reconciliation-contract-v1';
import { parseCap2SourceSurfaceInventoryV1 } from '@/lib/editron/research/capability-census/cap2-source-surface-contract-v1';

const REPOSITORY_ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

function candidate(candidateId: string) {
  const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
  const result = artifact.candidates.find((entry) => entry.candidateId === candidateId);
  if (!result) throw new Error(`Missing visual reconciliation candidate ${candidateId}`);
  return result;
}

describe('CAP-2 visual/keyframe/transition/caption owner reconciliation v1', () => {
  it('accepts the closed research artifact without claiming catalog completion', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.domain).toBe('VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER');
    expect(artifact.status).toBe('DOMAIN_RECONCILED_CATALOG_NOT_POPULATED');
    expect(artifact.candidates).toHaveLength(24);
    expect(artifact.candidates.map(({ candidateId }) => candidateId)).toEqual([
      'caption.canonical-install',
      'caption.canonical-refresh',
      'caption.canonical-restyle',
      'caption.fancy-html',
      'caption.manual-create',
      'caption.manual-style',
      'caption.render',
      'keyframe.manual-edit',
      'keyframe.set-one',
      'overlay.render-dispatch',
      'overlay.thumbnail-cache',
      'project.reframe-subject',
      'transition.atomic-form',
      'transition.manual-chat-add',
      'transition.render',
      'visual.apply-camera-shake',
      'visual.apply-fade',
      'visual.apply-filter',
      'visual.apply-speed-ramp',
      'visual.find-moment',
      'visual.move-retime',
      'visual.reorder-layer',
      'visual.resolve-edit',
      'visual.resolve-keyframe',
    ]);
  });

  it('preserves all 27 historical evidence files while V14 binds current source', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.sourceBinding.evidencePaths).toHaveLength(27);
    const binding = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V5.domainBindings
      .find(({ domain }) => domain === 'VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER')!;
    expect(hashNormalizedCap2SourceSnapshotV5(
      getCap2CurrentTruthDomainEvidencePathsV5('VISUAL_KEYFRAME_TRANSITION_CAPTION_RENDER'),
    )).not.toBe(binding.normalizedEvidenceHash);
    expect(binding.reissueStatus).toBe('RECONCILED_CURRENT_TRUTH_V5');
    expect(CAP2_QUEUE5_OVERLAY_WRITER_SOURCE_PATHS_V14).toEqual(
      expect.arrayContaining([
        'lib/editron/agent/tools.ts',
        'lib/editron/services/project-service.ts',
      ]),
    );
    expect(() => assertCap2CurrentTruthSourcesMatchV14()).not.toThrow();

    const refs = artifact.candidates.flatMap(({ evidenceRefs }) => evidenceRefs)
      .concat(artifact.domainConclusions.flatMap(({ evidenceRefs }) => evidenceRefs));
    for (const reference of refs) {
      expect(readSource(reference.path).length, reference.path).toBeGreaterThan(0);
    }
  });

  it('retains every broad source observation as unresolved', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    const inventory = parseCap2SourceSurfaceInventoryV1(inventoryJson);
    expect(artifact.sourceBinding.sourceSurfaceSnapshotHash)
      .toBe(inventory.sourceBinding.sourceSnapshotHash);
    expect(artifact.unresolvedSourceObservationIds).toEqual(inventory.unresolvedSourceIds);
  });

  it('advances only bounded reads and single-CAS visual mutations', () => {
    const artifact = parseCap2OwnerReconciliationArtifactV1(reconciliationJson);
    expect(artifact.candidates
      .filter(({ catalogDisposition }) => catalogDisposition === 'ATOMIC_CANDIDATE')
      .map(({ candidateId }) => candidateId)).toEqual([
      'caption.canonical-install',
      'caption.canonical-restyle',
      'keyframe.set-one',
      'visual.apply-camera-shake',
      'visual.apply-fade',
      'visual.apply-filter',
      'visual.apply-speed-ramp',
      'visual.find-moment',
      'visual.move-retime',
      'visual.reorder-layer',
      'visual.resolve-edit',
      'visual.resolve-keyframe',
    ]);
    expect(artifact.candidates
      .filter(({ atomicity }) => ['COMPOUND_MULTIWRITE', 'NON_CAPABILITY'].includes(atomicity))
      .every(({ catalogDisposition }) => catalogDisposition !== 'ATOMIC_CANDIDATE'))
      .toBe(true);
  });

  it('records transition form fragmentation and partial-commit risk', () => {
    expect(candidate('transition.manual-chat-add').atomicity).toBe('COMPOUND_MULTIWRITE');
    expect(candidate('transition.manual-chat-add').catalogDisposition).toBe('EXCLUDED_UNSAFE');
    expect(candidate('transition.atomic-form').catalogDisposition).toBe('EXCLUDED_NON_CAPABILITY');

    const tools = readSource('lib/editron/agent/tools.ts');
    const transitionStart = tools.indexOf('const addTransitionTool = tool(');
    const transitionEnd = tools.indexOf('// ─── AI Pipeline Scene Tools', transitionStart);
    const transitionBody = tools.slice(transitionStart, transitionEnd);
    expect(transitionBody).toContain('deleteOverlayAtLoadedProjectRevisionV1');
    expect(transitionBody).toContain('updateOverlayAtLoadedProjectRevisionV1');
    expect(transitionBody).toContain('addOverlayAtLoadedProjectRevisionV1');
    expect(transitionBody).toContain('const maxOverlap =');
    expect(transitionBody).not.toContain('atomicTransitionForm: transitionForm');
  });

  it('distinguishes animation keyframes from the thumbnail cache', () => {
    expect(candidate('overlay.thumbnail-cache').atomicity).toBe('NON_CAPABILITY');
    expect(candidate('keyframe.manual-edit').revisionSafety.status).toBe('LOCAL_ONLY');
    expect(candidate('keyframe.set-one').revisionSafety.status).toBe('INTERNAL_READ_THEN_CAS');
    expect(readSource('components/editron/editor/version-7.0.0/hooks/use-keyframes.tsx'))
      .toContain('timeline preview');
    expect(readSource('components/editron/editor/version-7.0.0/components/overlays/shared/keyframe-inspector-panel.tsx'))
      .toContain('keyframeTracks: newTracks');
  });

  it('records caption partial convergence rather than false manual/chat parity', () => {
    expect(candidate('caption.canonical-install').revisionSafety.status).toBe('PROJECT_CAS');
    expect(candidate('caption.canonical-restyle').catalogDisposition).toBe('ATOMIC_CANDIDATE');
    expect(candidate('caption.manual-create').atomicity).toBe('NON_CAPABILITY');
    expect(candidate('caption.fancy-html').parityStatus).toBe('AGENT_ONLY');
  });

  it('guards renderer fallbacks and the unsafe whole-project reframe', () => {
    const transitionRenderer = readSource(
      'components/editron/editor/version-7.0.0/components/overlays/transitions/transition-layer-content.tsx',
    );
    const videoRenderer = readSource(
      'components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content.tsx',
    );
    expect(transitionRenderer).toContain("if (!clipASrc && !clipBSrc)");
    expect(transitionRenderer).toContain("case 'match-cut'");
    expect(videoRenderer).toContain('const fps = 30');
    expect(candidate('project.reframe-subject').revisionSafety.status)
      .toBe('MULTIWRITE_NON_ATOMIC');
  });

  it('records camera-shake baseline preservation without granting certification', () => {
    const visualTools = readSource('lib/editron/agent/chat-visual-tools.ts');
    expect(visualTools).toContain('evaluateAllTracks(nonShakePositionTracks, localFrame)');
    expect(visualTools).toContain('baseX: finiteNumber(replacedPosition.x)');
    expect(visualTools).toContain('baseY: finiteNumber(replacedPosition.y)');
    expect(visualTools).toContain('value: input.baseX, easing: "ease-out"');
    expect(visualTools).toContain('value: input.baseY, easing: "ease-out"');

    const shake = candidate('visual.apply-camera-shake');
    expect(shake.catalogDisposition).toBe('ATOMIC_CANDIDATE');
    expect(shake.revisionSafety.status).toBe('INTERNAL_READ_THEN_CAS');
    expect(shake.chain.proofOwners).toEqual([]);
    const resolution = CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V2.semanticDeltas
      .find(({ deltaId }) => deltaId === 'visual.camera-shake-position-anchor')!;
    expect(resolution.catalogPromotion).toBe(false);
    expect(resolution.resolution.remainingGaps)
      .toContain('Enforce the camera-shake speech, formality, density and impact-sound policy before eligibility.');
  });

  it('rejects false promotion, missing ownership and evidence-union drift', () => {
    const falseAtomic = structuredClone(reconciliationJson);
    falseAtomic.candidates.find(({ candidateId }) => candidateId === 'transition.manual-chat-add')!
      .catalogDisposition = 'ATOMIC_CANDIDATE';
    expect(() => parseCap2OwnerReconciliationArtifactV1(falseAtomic)).toThrow();

    const missingOwner = structuredClone(reconciliationJson);
    missingOwner.candidates.find(({ candidateId }) => candidateId === 'keyframe.set-one')!
      .chain.mutationOwners = [];
    expect(() => parseCap2OwnerReconciliationArtifactV1(missingOwner)).toThrow();

    const evidenceDrift = structuredClone(reconciliationJson);
    evidenceDrift.sourceBinding.evidencePaths.pop();
    expect(() => parseCap2OwnerReconciliationArtifactV1(evidenceDrift)).toThrow();

    const badDomain = structuredClone(reconciliationJson);
    badDomain.domain = 'UNDECLARED_DOMAIN';
    expect(() => parseCap2OwnerReconciliationArtifactV1(badDomain)).toThrow();
  });
});
