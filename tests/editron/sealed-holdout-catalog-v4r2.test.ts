import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2,
  SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2,
  SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V4R2,
  assertSealedHoldoutOperationEvidenceV4R2,
  resolveExactHoldoutTranscriptCutRangeV4R2,
  sealedHoldoutOperatorCatalogIdentityV4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-catalog-v4r2';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import { SealedHoldoutOwnerSessionV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-owner-session-v2r';

async function manifest() {
  const bytes = await readFile(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R);
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

function session(cohort: Awaited<ReturnType<typeof manifest>>, caseId: string) {
  return new SealedHoldoutOwnerSessionV2R({
    manifest: cohort,
    caseId,
    semanticPolicy: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V4R2,
  });
}

describe('sealed holdout V4R2 catalog and evidence policy', () => {
  it('publishes a frozen successor identity and pre-execution evidence policy', () => {
    const identity = sealedHoldoutOperatorCatalogIdentityV4R2();
    expect(identity).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2_1',
      catalogRevision: 'EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2_1',
    });
    expect(identity.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.operationEvidencePolicySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2.operationEvidencePolicy)
      .toEqual(SEALED_HOLDOUT_OPERATION_EVIDENCE_POLICY_V4R2);
    expect(Object.isFrozen(SEALED_HOLDOUT_OPERATOR_CATALOG_V4R2)).toBe(true);
  });

  it('resolves only the exact HOLD-04 occurrence-plus-pause range', async () => {
    const owner = session(await manifest(), 'HOLD-04:C1');
    const read = await owner.execute({
      operatorId: 'find_transcript_moment',
      turn: 1,
      arguments: {
        projectId: 'oe-hold-04',
        query: 'our launch is Friday',
        evidenceIds: ['E1'],
      },
    });
    expect(read.disposition).toBe('OK');
    const resolved = await owner.execute({
      operatorId: 'resolve_transcript_edit',
      turn: 2,
      arguments: {
        projectId: 'oe-hold-04',
        expectedProjectRevision: 'R6',
        query: 'our launch is Friday',
        intent: { action: 'cut_phrase' },
        evidenceIds: ['E1'],
      },
    });
    expect(resolved).toMatchObject({
      disposition: 'OK',
      output: {
        proposedOperation: {
          targetOperatorId: 'cut_section',
          arguments: { targetRange: { startFrame: 120, endFrame: 225 } },
        },
      },
    });
    const cut = await owner.execute({
      operatorId: 'cut_section',
      turn: 3,
      arguments: {
        projectId: 'oe-hold-04',
        expectedProjectRevision: 'R6',
        targetRange: { startFrame: 120, endFrame: 225 },
        evidenceIds: ['E1'],
      },
    });
    expect(cut.disposition).toBe('OK');
  });

  it('rejects noisy transcript candidates before resolution or direct mutation', async () => {
    const owner = session(await manifest(), 'HOLD-04:C2');
    const read = await owner.execute({
      operatorId: 'find_transcript_moment',
      turn: 1,
      arguments: {
        projectId: 'oe-hold-04', query: 'our launch is Friday', evidenceIds: ['E1'],
      },
    });
    expect(read.disposition).toBe('OK');
    const resolved = await owner.execute({
      operatorId: 'resolve_transcript_edit',
      turn: 2,
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
        query: 'our launch is Friday', intent: { action: 'cut_phrase' },
        evidenceIds: ['E1'],
      },
    });
    expect(resolved).toMatchObject({
      disposition: 'UNVERIFIABLE',
      output: { code: 'SEALED_V4R2_EVIDENCE_TRANSCRIPT_EVIDENCE_AMBIGUOUS' },
    });
    const guessedCut = await owner.execute({
      operatorId: 'cut_section',
      turn: 3,
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
        targetRange: { startFrame: 118, endFrame: 226 }, evidenceIds: ['E1'],
      },
    });
    expect(guessedCut.disposition).toBe('UNVERIFIABLE');
    expect(owner.snapshot()).toMatchObject({ currentProjectRevision: 'R6', stateEffects: [] });
  });

  it('rejects generated composition when protected-face evidence is withheld', async () => {
    const cohort = await manifest();
    const owner = session(cohort, 'HOLD-03:C2');
    const read = await owner.execute({
      operatorId: 'find_visual_moment', turn: 1,
      arguments: {
        projectId: 'oe-hold-03', query: 'reference layout', evidenceIds: ['E1'],
      },
    });
    expect(read.disposition).toBe('OK');
    const timelineRead = await owner.execute({
      operatorId: 'get_timeline_view', turn: 2,
      arguments: { projectId: 'oe-hold-03', evidenceIds: ['E3'] },
    });
    expect(timelineRead.disposition).toBe('OK');
    const assets = (cohort.cases.find(({ caseId }) => caseId === 'HOLD-03:C2')!
      .publicCase.media as Array<{ assetId: string }>).map(({ assetId }) => assetId);
    const generated = await owner.execute({
      operatorId: 'generated_composition_program', turn: 3,
      arguments: {
        projectId: 'oe-hold-03', expectedProjectRevision: 'R12', assetIds: assets,
        targetRange: { startFrame: 90, endFrame: 270 }, evidenceIds: ['E1', 'E3'],
      },
    });
    expect(generated).toMatchObject({
      disposition: 'UNVERIFIABLE',
      output: {
        code: 'SEALED_V4R2_EVIDENCE_REQUIRED_KIND_MISSING_OR_DUPLICATED',
      },
    });
  });

  it('accepts generated composition only after all three evidence owners resolve', async () => {
    const cohort = await manifest();
    const owner = session(cohort, 'HOLD-03:C1');
    expect((await owner.execute({
      operatorId: 'find_visual_moment', turn: 1,
      arguments: {
        projectId: 'oe-hold-03', query: 'layout and faces', evidenceIds: ['E1', 'E2'],
      },
    })).disposition).toBe('OK');
    expect((await owner.execute({
      operatorId: 'get_timeline_view', turn: 2,
      arguments: { projectId: 'oe-hold-03', evidenceIds: ['E3'] },
    })).disposition).toBe('OK');
    const assets = (cohort.cases.find(({ caseId }) => caseId === 'HOLD-03:C1')!
      .publicCase.media as Array<{ assetId: string }>).map(({ assetId }) => assetId);
    const generated = await owner.execute({
      operatorId: 'generated_composition_program', turn: 3,
      arguments: {
        projectId: 'oe-hold-03', expectedProjectRevision: 'R12', assetIds: assets,
        targetRange: { startFrame: 90, endFrame: 270 }, evidenceIds: ['E1', 'E2', 'E3'],
      },
    });
    expect(generated.disposition).toBe('OK');
  });

  it('rejects reframe when only authored-layout evidence is available', async () => {
    const owner = session(await manifest(), 'HOLD-05:C2');
    const read = await owner.execute({
      operatorId: 'get_timeline_view', turn: 1,
      arguments: {
        projectId: 'oe-hold-05', evidenceIds: ['E2'],
      },
    });
    expect(read.disposition).toBe('OK');
    const reframe = await owner.execute({
      operatorId: 'reframe_project', turn: 2,
      arguments: {
        projectId: 'oe-hold-05', expectedProjectRevision: 'R14',
        reframePlan: {
          targetAspectRatio: '9:16', trackingMode: 'FOLLOW_SPATIAL_EVIDENCE',
          preserveAuthoredLayout: true,
        },
        evidenceIds: ['E2'],
      },
    });
    expect(reframe.disposition).toBe('UNVERIFIABLE');
    expect(owner.snapshot()).toMatchObject({ currentProjectRevision: 'R14', stateEffects: [] });
  });

  it('accepts subject-aware reframe after spatial and authored-layout evidence resolve', async () => {
    const owner = session(await manifest(), 'HOLD-05:C1');
    expect((await owner.execute({
      operatorId: 'find_visual_moment', turn: 1,
      arguments: { projectId: 'oe-hold-05', query: 'subject track', evidenceIds: ['E1'] },
    })).disposition).toBe('OK');
    expect((await owner.execute({
      operatorId: 'get_timeline_view', turn: 2,
      arguments: { projectId: 'oe-hold-05', evidenceIds: ['E2'] },
    })).disposition).toBe('OK');
    const reframe = await owner.execute({
      operatorId: 'reframe_project', turn: 3,
      arguments: {
        projectId: 'oe-hold-05', expectedProjectRevision: 'R14',
        reframePlan: {
          targetAspectRatio: '9:16', trackingMode: 'FOLLOW_SPATIAL_EVIDENCE',
          preserveAuthoredLayout: true,
        },
        evidenceIds: ['E1', 'E2'],
      },
    });
    expect(reframe.disposition).toBe('OK');
  });

  it('rejects forged evidence bindings in the pure policy owner', () => {
    expect(() => assertSealedHoldoutOperationEvidenceV4R2({
      caseId: 'HOLD-04:C1', operatorId: 'cut_section', operatorKind: 'MUTATION',
      arguments: { targetRange: { startFrame: 120, endFrame: 225 } },
      evidenceRefs: ['E1', 'FORGED'],
      observations: [{
        evidenceRef: 'E1', kind: 'TRANSCRIPT',
        value: { firstOccurrence: [120, 192], pause: [192, 225],
          secondOccurrence: [225, 297] },
      }],
    })).toThrow('SEALED_V4R2_EVIDENCE_REFERENCE_BINDING_INVALID');
    expect(() => resolveExactHoldoutTranscriptCutRangeV4R2([{
      evidenceRef: 'E1', kind: 'TRANSCRIPT',
      value: { firstOccurrenceCandidates: [[118, 194], [121, 193]] },
    }])).toThrow('SEALED_V4R2_EVIDENCE_TRANSCRIPT_EVIDENCE_AMBIGUOUS');
  });
});
