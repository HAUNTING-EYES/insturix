import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3,
  authorizeSealedHoldoutH04CutPlanV4R3,
  buildSealedHoldoutOwnerSemanticPolicyV4R3,
  sealedHoldoutOperatorCatalogIdentityV4R3,
  type SealedHoldoutH04CutPlanAuthorizationV4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-catalog-v4r3';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
  type SealedHoldoutCohortManifestV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import { SealedHoldoutOwnerSessionV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-owner-session-v2r';

type JsonRecord = Record<string, unknown>;
type Execution = Awaited<ReturnType<SealedHoldoutOwnerSessionV2R['execute']>>;

async function manifest(): Promise<Readonly<SealedHoldoutCohortManifestV2R>> {
  const bytes = await readFile(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R);
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

function session(
  cohort: Readonly<SealedHoldoutCohortManifestV2R>,
  caseId: string,
  authorizations: readonly Readonly<SealedHoldoutH04CutPlanAuthorizationV4R3>[] = [],
) {
  return new SealedHoldoutOwnerSessionV2R({
    manifest: cohort,
    caseId,
    semanticPolicy: buildSealedHoldoutOwnerSemanticPolicyV4R3({
      manifest: cohort,
      h04CutPlanAuthorizations: authorizations,
    }),
  });
}

function writerRevision(execution: Execution): string {
  const receipt = execution.output.receipt as JsonRecord | undefined;
  const revision = receipt?.projectRevision;
  if (typeof revision !== 'string' || !revision) throw new Error('WRITER_REVISION_MISSING');
  return revision;
}

async function resolveH02Evidence(owner: SealedHoldoutOwnerSessionV2R) {
  expect((await owner.execute({
    operatorId: 'find_visual_moment', turn: 1,
    arguments: { projectId: 'oe-hold-02', query: 'source windows', evidenceIds: ['E1'] },
  })).disposition).toBe('OK');
  expect((await owner.execute({
    operatorId: 'read_project_file', turn: 2,
    arguments: { projectId: 'oe-hold-02', evidenceIds: ['E2'] },
  })).disposition).toBe('OK');
}

async function resolveH04Evidence(owner: SealedHoldoutOwnerSessionV2R) {
  expect((await owner.execute({
    operatorId: 'find_transcript_moment', turn: 1,
    arguments: {
      projectId: 'oe-hold-04', query: 'our launch is Friday', evidenceIds: ['E1'],
    },
  })).disposition).toBe('OK');
}

describe('sealed holdout V4R3 successor evidence contract', () => {
  it('publishes a frozen successor identity without changing production authority', () => {
    const identity = sealedHoldoutOperatorCatalogIdentityV4R3();
    expect(identity).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3_1',
      catalogRevision: 'EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3_1',
    });
    expect(identity.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.derivedFromCatalogSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3)).toBe(true);
  });

  it('blocks an H02 blanket range and permits only exact owner-resolved windows', async () => {
    const owner = session(await manifest(), 'HOLD-02:C1');
    await resolveH02Evidence(owner);
    const unsafe = await owner.execute({
      operatorId: 'add_overlay', turn: 3,
      arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: 'R4',
        assetId: 'h02-process', sourceRange: { startFrame: 0, endFrame: 570 },
        targetRange: { startFrame: 0, endFrame: 570 }, evidenceIds: ['E1', 'E2'],
      },
    });
    expect(unsafe.disposition).toBe('UNVERIFIABLE');
    expect(owner.snapshot()).toMatchObject({ currentProjectRevision: 'R4', stateEffects: [] });

    const open = await owner.execute({
      operatorId: 'add_overlay', turn: 4,
      arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
        sourceRange: { startFrame: 30, endFrame: 105 },
        targetRange: { startFrame: 0, endFrame: 75 }, evidenceIds: ['E1', 'E2'],
      },
    });
    expect(open.disposition).toBe('OK');
    const process = await owner.execute({
      operatorId: 'add_overlay', turn: 5,
      arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: writerRevision(open),
        assetId: 'h02-process', sourceRange: { startFrame: 0, endFrame: 90 },
        targetRange: { startFrame: 75, endFrame: 165 }, evidenceIds: ['E1', 'E2'],
      },
    });
    expect(process.disposition).toBe('OK');
    const close = await owner.execute({
      operatorId: 'add_overlay', turn: 6,
      arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: writerRevision(process),
        assetId: 'h02-door', sourceRange: { startFrame: 240, endFrame: 315 },
        targetRange: { startFrame: 165, endFrame: 240 }, evidenceIds: ['E1', 'E2'],
      },
    });
    expect(close.disposition).toBe('OK');
    expect(owner.snapshot()).toMatchObject({
      currentProjectRevision: writerRevision(close), stateEffects: [],
    });
  });

  it('blocks H02 mutation when the callback role is ambiguous', async () => {
    const owner = session(await manifest(), 'HOLD-02:C2');
    await resolveH02Evidence(owner);
    const mutation = await owner.execute({
      operatorId: 'add_overlay', turn: 3,
      arguments: {
        projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
        sourceRange: { startFrame: 30, endFrame: 105 },
        targetRange: { startFrame: 0, endFrame: 75 }, evidenceIds: ['E1', 'E2'],
      },
    });
    expect(mutation.disposition).toBe('UNVERIFIABLE');
    expect(owner.snapshot()).toMatchObject({ currentProjectRevision: 'R4', stateEffects: [] });
  });

  it('authorizes only complete H04 plans with exact transcript evidence', async () => {
    const cohort = await manifest();
    expect(() => authorizeSealedHoldoutH04CutPlanV4R3({
      manifest: cohort, caseId: 'HOLD-04:C1', evidenceRefs: ['E1'],
      currentTimelineCuts: [{ startFrame: 120, endFrame: 192 }],
    })).toThrow();
    expect(() => authorizeSealedHoldoutH04CutPlanV4R3({
      manifest: cohort, caseId: 'HOLD-04:C1', evidenceRefs: ['E1'],
      currentTimelineCuts: [{ startFrame: 120, endFrame: 226 }],
    })).toThrow();
    expect(() => authorizeSealedHoldoutH04CutPlanV4R3({
      manifest: cohort, caseId: 'HOLD-04:C2', evidenceRefs: ['E1'],
      currentTimelineCuts: [{ startFrame: 120, endFrame: 225 }],
    })).toThrow('SEALED_V4R2_EVIDENCE_TRANSCRIPT_EVIDENCE_AMBIGUOUS');
  });

  it('executes an equivalent ordered H04 partition and blocks missing or reordered plans', async () => {
    const cohort = await manifest();
    const authorization = authorizeSealedHoldoutH04CutPlanV4R3({
      manifest: cohort, caseId: 'HOLD-04:C1', evidenceRefs: ['E1'],
      currentTimelineCuts: [
        { startFrame: 120, endFrame: 192 },
        { startFrame: 120, endFrame: 153 },
      ],
    });
    const owner = session(cohort, 'HOLD-04:C1', [authorization]);
    await resolveH04Evidence(owner);
    const unbound = await owner.execute({
      operatorId: 'cut_section', turn: 2,
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
        targetRange: { startFrame: 120, endFrame: 192 }, evidenceIds: ['E1'],
      },
    });
    expect(unbound.disposition).toBe('UNVERIFIABLE');
    expect(owner.snapshot()).toMatchObject({ currentProjectRevision: 'R6', stateEffects: [] });
    const first = await owner.execute({
      operatorId: 'cut_section', turn: 3,
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
        targetRange: { startFrame: 120, endFrame: 192 }, evidenceIds: ['E1'],
        editPlanRef: authorization.authorizationRef,
      },
    });
    expect(first.disposition).toBe('OK');
    const second = await owner.execute({
      operatorId: 'cut_section', turn: 4,
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: writerRevision(first),
        targetRange: { startFrame: 120, endFrame: 153 }, evidenceIds: ['E1'],
        editPlanRef: authorization.authorizationRef,
      },
    });
    expect(second.disposition).toBe('OK');
    const repeated = await owner.execute({
      operatorId: 'cut_section', turn: 5,
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: writerRevision(second),
        targetRange: { startFrame: 120, endFrame: 153 }, evidenceIds: ['E1'],
        editPlanRef: authorization.authorizationRef,
      },
    });
    expect(repeated.disposition).toBe('UNVERIFIABLE');
    expect(owner.snapshot()).toMatchObject({
      currentProjectRevision: writerRevision(second), stateEffects: [],
    });

    const reordered = session(cohort, 'HOLD-04:C1', [authorization]);
    await resolveH04Evidence(reordered);
    expect((await reordered.execute({
      operatorId: 'cut_section', turn: 2,
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
        targetRange: { startFrame: 120, endFrame: 153 }, evidenceIds: ['E1'],
        editPlanRef: authorization.authorizationRef,
      },
    })).disposition).toBe('UNVERIFIABLE');
    expect(reordered.snapshot()).toMatchObject({ currentProjectRevision: 'R6', stateEffects: [] });
  });

  it('binds resolver-issued one-cut plans and rejects forged authorization receipts', async () => {
    const cohort = await manifest();
    const owner = session(cohort, 'HOLD-04:C1');
    await resolveH04Evidence(owner);
    const resolved = await owner.execute({
      operatorId: 'resolve_transcript_edit', turn: 2,
      arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
        query: 'our launch is Friday', intent: { action: 'cut_phrase' }, evidenceIds: ['E1'],
      },
    });
    expect(resolved.disposition).toBe('OK');
    const proposed = resolved.output.proposedOperation as JsonRecord;
    const proposedArguments = proposed.arguments as JsonRecord;
    expect(proposedArguments.editPlanRef).toMatch(/^OE-H04-PLAN-/);
    expect((await owner.execute({
      operatorId: 'cut_section', turn: 3, arguments: proposedArguments,
    })).disposition).toBe('OK');

    const authorization = authorizeSealedHoldoutH04CutPlanV4R3({
      manifest: cohort, caseId: 'HOLD-04:C1', evidenceRefs: ['E1'],
      currentTimelineCuts: [{ startFrame: 120, endFrame: 225 }],
    });
    const forged = { ...authorization, authorizationRef: `${authorization.authorizationRef}-forged` };
    expect(() => buildSealedHoldoutOwnerSemanticPolicyV4R3({
      manifest: cohort, h04CutPlanAuthorizations: [forged],
    })).toThrow('SEALED_V4R3_EVIDENCE_H04_CUT_PLAN_AUTHORIZATION_FORGED');
  });
});
