import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';

import type { ProjectGeneratedCompositionDraftV1 }
  from '../../services/project-generated-composition-entry-v1';
import { PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1 }
  from '../../services/project-generated-composition-state-v1';
import type { ProjectGeneratedCompositionStateV1 }
  from '../../services/project-generated-composition-state-v1';
import type {
  Project,
  ProjectMutationReceiptV1,
  ProjectService,
  ProjectTimelineRangeChangeReceiptV1,
} from '../../services/project-service';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

type ProjectServiceConflictOwnerV1 = Pick<
  ProjectService,
  | 'acquireTimelineRangeCutLockV1'
  | 'captureMutationReceipts'
  | 'cutTimelineRangeV1'
  | 'loadProjectForMutation'
  | 'prepareProjectGeneratedCompositionV1'
  | 'releaseTimelineRangeCutLockV1'
  | 'updateOverlayAtRevisionV1'
>;

export interface Stage25ProjectServiceConflictProbeStoreV1 {
  installProject(project: Project): Promise<void>;
  readProject(userId: string, projectId: string): Promise<Project | null>;
  deleteProjects(userId: string, projectIds: readonly string[]): Promise<void>;
  countProjects(userId: string, projectIds: readonly string[]): Promise<number>;
}

export interface Stage25ProjectServiceConflictProofEnvironmentV1 {
  persistenceKind: 'IN_MEMORY_STATEFUL_TEST_DOUBLE' | 'REAL_MONGODB_SINGLE_NODE';
  topology: 'IN_PROCESS_SINGLE_OWNER' | 'LOOPBACK_STANDALONE_MONGOD';
  gcsImportDisposition:
    | 'TEST_MODULE_MOCK_NO_GCS_IMPORT'
    | 'INERT_IMPORT_ENV_NO_GCS_METHOD_CALL';
  networkBoundary: 'IN_PROCESS_ONLY' | 'LOOPBACK_MONGODB_ONLY';
  serverVersion: string;
  storageEngine: string;
  sourceCommit: string;
  projectServiceSha256: string;
  proofOwnerSha256: string;
  runnerSha256: string | null;
}

export const STAGE25_PROJECT_SERVICE_CONFLICT_PRODUCT_PROOF_VERSION_V1 =
  'EDITRON_OE_STAGE25_PROJECT_SERVICE_CONFLICT_PRODUCT_PROOF_V1' as const;

const INITIAL_REVISION = 7;
const INITIAL_UPDATED_AT = '2026-08-27T20:00:00.000Z';
const FORGED_STATE_TOKEN = `gcp-state-v1:${'9'.repeat(64)}`;

export async function executeStage25ProjectServiceConflictProductProofV1(input: {
  owner: ProjectServiceConflictOwnerV1;
  store: Stage25ProjectServiceConflictProbeStoreV1;
  environment: Readonly<Stage25ProjectServiceConflictProofEnvironmentV1>;
  executionId: string;
  createdAt: string;
  userId: string;
  projectIdPrefix: string;
}) {
  assertExecutionInput(input);
  const projectIds = {
    disjoint: `${input.projectIdPrefix}-disjoint`,
    overlap: `${input.projectIdPrefix}-overlap`,
    locks: `${input.projectIdPrefix}-locks`,
    invalidInputs: `${input.projectIdPrefix}-invalid-inputs`,
    staleEvidence: `${input.projectIdPrefix}-stale-evidence`,
  } as const;
  const allProjectIds = Object.values(projectIds);
  let cleanupVerified = false;

  try {
    const disjoint = await proveDisjointSafeRebase(input, projectIds.disjoint);
    const overlap = await proveOverlappingEditBlocks(input, projectIds.overlap);
    const locks = await proveLockLifecycle(input, projectIds.locks);
    const invalidInputs = await proveInvalidInputsBlock(input, projectIds.invalidInputs);
    const staleEvidence = await proveStaleEvidenceBlocks(input, projectIds.staleEvidence);

    await input.store.deleteProjects(input.userId, allProjectIds);
    const remainingFixtureProjects = await input.store.countProjects(
      input.userId,
      allProjectIds,
    );
    if (remainingFixtureProjects !== 0) fail('FIXTURE_CLEANUP_INCOMPLETE');
    cleanupVerified = true;

    const realMongo = input.environment.persistenceKind === 'REAL_MONGODB_SINGLE_NODE';
    const gates = [
      gate('DISJOINT_STALE_CUT_SAFE_REBASED', disjoint.rebaseDisposition === 'SAFE_REBASED'),
      gate('DISJOINT_USER_WORK_PRESERVED', disjoint.userEditPreserved),
      gate('DURABLE_RELOAD_MATCHES_COMMITTED_STATE', disjoint.durableReloadMatches),
      gate('OVERLAPPING_STALE_CUT_BLOCKED_NO_WRITE', overlap.noWriteAfterBlock),
      gate('CUT_LOCK_ACQUIRE_RELEASE_REACQUIRE_CONSUME', locks.lifecycleComplete),
      gate('STALE_REVISION_BLOCKED_NO_WRITE', invalidInputs.staleRevisionNoWrite),
      gate('INVALID_RANGE_BLOCKED_NO_WRITE', invalidInputs.invalidRangeNoWrite),
      gate('STALE_EVIDENCE_TOKEN_BLOCKED_NO_WRITE', staleEvidence.staleTokenNoWrite),
      gate('EXACT_EVIDENCE_TOKEN_REPAIR_ACCEPTED', staleEvidence.exactTokenRepairAccepted),
      gate('TRUTHFUL_RIPPLE_AND_INVALIDATION_RECEIPT', disjoint.receiptTruthComplete),
      gate('ISOLATED_FIXTURES_DELETED', remainingFixtureProjects === 0),
    ];
    if (gates.some(({ status }) => status !== 'PASS')) fail('GATE_FAILED');

    const material = {
      schemaVersion: 1 as const,
      artifactType: 'Stage25ProjectServiceConflictProductProofReceiptV1' as const,
      version: STAGE25_PROJECT_SERVICE_CONFLICT_PRODUCT_PROOF_VERSION_V1,
      authority: realMongo
        ? 'REAL_PROJECTSERVICE_OWNER_WITH_ISOLATED_DURABLE_MONGODB_FIXTURES' as const
        : 'PROJECTSERVICE_ORCHESTRATION_TEST_WITH_STATEFUL_PERSISTENCE_DOUBLE' as const,
      assessment: realMongo
        ? 'PASS_BOUNDED_REAL_MONGODB_PROJECTSERVICE_CONFLICT_LOCK_REBASE' as const
        : 'PASS_ORCHESTRATION_TEST_ONLY' as const,
      execution: {
        executionId: input.executionId,
        createdAt: input.createdAt,
        environment: input.environment,
      },
      scope: {
        projectServiceOwnerRef:
          'lib/editron/services/project-service.ts#ProjectService',
        participatingTimelineWriters: [
          {
            method: 'ProjectService.updateOverlayAtRevisionV1',
            operation: 'UPDATE_OVERLAY',
            rangeDeclaration: 'EXACT_OVERLAY_BEFORE_AFTER_UNION',
            actorIdentity: 'USER',
          },
          {
            method: 'ProjectService.cutTimelineRangeV1',
            operation: 'CUT_TIMELINE_RANGE',
            rangeDeclaration: 'EXACT_COMPLETE_PRE_CUT_RIPPLE_TAIL',
            actorIdentity: 'AGENT',
          },
        ],
        evidenceWriter:
          'ProjectService.prepareProjectGeneratedCompositionV1',
        projectIdsSha256: hashCanonicalJsonV1(allProjectIds),
      },
      scenarios: { disjoint, overlap, locks, invalidInputs, staleEvidence },
      gates,
      cleanup: {
        fixtureProjectCount: allProjectIds.length,
        remainingFixtureProjects,
        disposition: 'DELETED_AND_VERIFIED_ABSENT' as const,
      },
      externalEffects: {
        providerInferenceCalls: 0 as const,
        providerSpendUsd: 0 as const,
        historicalPaidCohortRowsExecuted: 0 as const,
        nonFixtureProjectWrites: 0 as const,
        nonLoopbackNetworkCalls: 0 as const,
      },
      limitations: [
        'The range lock is cut-specific; this does not certify a generic lock honored by every writer.',
        'The bounded conflict trial includes UPDATE_OVERLAY and CUT_TIMELINE_RANGE, not every ProjectService writer.',
        'Downstream invalidation remains truthfully UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN.',
        realMongo
          ? 'The durable proof uses an isolated loopback single-node mongod, not Atlas, a replica set, or a multi-user deployed product.'
          : 'The focused test uses a stateful persistence double and is not durable-database evidence.',
        'Generated-composition evidence covers canonical prepare/revise token binding, not render finalization.',
      ],
    };
    const receipt = deepFreezeV1({
      ...material,
      receiptSha256: hashCanonicalJsonV1(material),
    });
    assertStage25ProjectServiceConflictProductProofReceiptV1(receipt);
    return receipt;
  } finally {
    if (!cleanupVerified) {
      await input.store.deleteProjects(input.userId, allProjectIds);
    }
  }
}

async function proveDisjointSafeRebase(
  input: Parameters<typeof executeStage25ProjectServiceConflictProductProofV1>[0],
  projectId: string,
) {
  await input.store.installProject(projectFixture(input.userId, projectId));
  const initial = await input.owner.loadProjectForMutation(input.userId, projectId);
  const userMutation = await input.owner.captureMutationReceipts(() => (
    input.owner.updateOverlayAtRevisionV1(input.userId, projectId, {
      expectedRevision: initial.revision,
      actorKind: 'USER',
      overlayId: 2,
      updates: { content: 'preserve this concurrent user edit' },
    })
  ));
  assertOneMutationReceipt(userMutation.receipts, projectId, 8);
  const afterUser = requiredProject(await input.store.readProject(input.userId, projectId));
  const updateReceipt = lastTimelineReceipt(afterUser, 'UPDATE_OVERLAY');
  assertExactOverlayReceipt(updateReceipt, { startFrame: 0, endFrame: 20 });

  const cutCapture = await input.owner.captureMutationReceipts(() => (
    input.owner.cutTimelineRangeV1(input.userId, projectId, {
      expectedRevision: initial.revision,
      actorKind: 'AGENT',
      startFrame: 30,
      endFrame: 60,
    })
  ));
  assertOneMutationReceipt(cutCapture.receipts, projectId, 9);
  const cut = cutCapture.value;
  const durable = requiredProject(await input.store.readProject(input.userId, projectId));
  const reloaded = await input.owner.loadProjectForMutation(input.userId, projectId);
  const preservedOverlay = durable.overlays.find(({ id }) => id === 2);
  const receiptTruthComplete = assertCutReceiptTruth(cut.timelineChangeReceipt);
  const durableReloadMatches = projectStateSha256(durable)
    === projectStateSha256(reloaded.project);
  if (cut.rebase.disposition !== 'SAFE_REBASED'
    || cut.rebase.requestedRevision.value !== 7
    || cut.rebase.appliedBaseRevision.value !== 8
    || cut.rebase.traversedReceiptIds.length !== 1
    || cut.rebase.traversedReceiptIds[0] !== updateReceipt.receiptId
    || durable.projectRevision !== 9
    || durable.durationInFrames !== 210
    || preservedOverlay?.type !== OverlayType.TEXT
    || preservedOverlay.content !== 'preserve this concurrent user edit'
    || !durableReloadMatches) {
    fail('DISJOINT_SAFE_REBASE_PROOF_FAILED');
  }

  return {
    initialRevision: initial.revision.value,
    concurrentEditRevision: userMutation.receipts[0]!.revision.value,
    committedCutRevision: cut.mutationReceipt.revision.value,
    updateReceipt: timelineReceiptProjection(updateReceipt),
    cutReceipt: timelineReceiptProjection(cut.timelineChangeReceipt),
    rebaseDisposition: cut.rebase.disposition,
    traversedReceiptIds: [...cut.rebase.traversedReceiptIds],
    userEditPreserved: true as const,
    durableReloadMatches,
    receiptTruthComplete,
    finalProjectStateSha256: projectStateSha256(durable),
  };
}

async function proveOverlappingEditBlocks(
  input: Parameters<typeof executeStage25ProjectServiceConflictProductProofV1>[0],
  projectId: string,
) {
  await input.store.installProject(projectFixture(input.userId, projectId, 35));
  const initial = await input.owner.loadProjectForMutation(input.userId, projectId);
  await input.owner.updateOverlayAtRevisionV1(input.userId, projectId, {
    expectedRevision: initial.revision,
    actorKind: 'USER',
    overlayId: 2,
    updates: { from: 0, durationInFrames: 20 },
  });
  const before = requiredProject(await input.store.readProject(input.userId, projectId));
  const blocked = await captureBlockedAttempt(input.owner, () => (
    input.owner.cutTimelineRangeV1(input.userId, projectId, {
      expectedRevision: initial.revision,
      actorKind: 'AGENT',
      startFrame: 30,
      endFrame: 60,
    })
  ));
  const after = requiredProject(await input.store.readProject(input.userId, projectId));
  const noWriteAfterBlock = projectStateSha256(before) === projectStateSha256(after)
    && blocked.emittedMutationReceiptCount === 0;
  if (blocked.code !== 'PROJECT_TIMELINE_REBASE_BLOCKED'
    || blocked.reason !== 'OVERLAPPING_UPDATE'
    || !noWriteAfterBlock) {
    fail('OVERLAPPING_EDIT_BLOCK_PROOF_FAILED');
  }
  return {
    blocked,
    blockedProjectStateSha256: projectStateSha256(before),
    noWriteAfterBlock,
  };
}

async function proveLockLifecycle(
  input: Parameters<typeof executeStage25ProjectServiceConflictProductProofV1>[0],
  projectId: string,
) {
  await input.store.installProject(projectFixture(input.userId, projectId));
  const initial = await input.owner.loadProjectForMutation(input.userId, projectId);
  const firstAcquire = await input.owner.acquireTimelineRangeCutLockV1(
    input.userId,
    projectId,
    {
      expectedRevision: initial.revision,
      actorKind: 'AGENT',
      startFrame: 30,
      endFrame: 240,
    },
  );
  const locked = requiredProject(await input.store.readProject(input.userId, projectId));
  const wrongOwnerRelease = await captureBlockedAttempt(input.owner, () => (
    input.owner.releaseTimelineRangeCutLockV1(input.userId, projectId, {
      expectedRevision: firstAcquire.mutationReceipt.revision,
      actorKind: 'USER',
      lockId: firstAcquire.lock.lockId,
    })
  ));
  const overlappingAcquire = await captureBlockedAttempt(input.owner, () => (
    input.owner.acquireTimelineRangeCutLockV1(input.userId, projectId, {
      expectedRevision: firstAcquire.mutationReceipt.revision,
      actorKind: 'USER',
      startFrame: 20,
      endFrame: 50,
    })
  ));
  const afterBlocked = requiredProject(await input.store.readProject(input.userId, projectId));
  if (projectStateSha256(locked) !== projectStateSha256(afterBlocked)) {
    fail('LOCK_BLOCKED_ATTEMPT_MUTATED_STATE');
  }

  const release = await input.owner.releaseTimelineRangeCutLockV1(
    input.userId,
    projectId,
    {
      expectedRevision: firstAcquire.mutationReceipt.revision,
      actorKind: 'AGENT',
      lockId: firstAcquire.lock.lockId,
    },
  );
  const released = requiredProject(await input.store.readProject(input.userId, projectId));
  const releasedLockUse = await captureBlockedAttempt(input.owner, () => (
    input.owner.cutTimelineRangeV1(input.userId, projectId, {
      expectedRevision: release.revision,
      actorKind: 'AGENT',
      startFrame: 30,
      endFrame: 60,
      rangeCutLockId: firstAcquire.lock.lockId,
    })
  ));
  const afterReleasedLockUse = requiredProject(
    await input.store.readProject(input.userId, projectId),
  );
  if (projectStateSha256(released) !== projectStateSha256(afterReleasedLockUse)) {
    fail('RELEASED_LOCK_ATTEMPT_MUTATED_STATE');
  }

  const secondAcquire = await input.owner.acquireTimelineRangeCutLockV1(
    input.userId,
    projectId,
    {
      expectedRevision: release.revision,
      actorKind: 'AGENT',
      startFrame: 30,
      endFrame: 240,
    },
  );
  const cut = await input.owner.cutTimelineRangeV1(input.userId, projectId, {
    expectedRevision: secondAcquire.mutationReceipt.revision,
    actorKind: 'AGENT',
    startFrame: 30,
    endFrame: 60,
    rangeCutLockId: secondAcquire.lock.lockId,
  });
  const final = requiredProject(await input.store.readProject(input.userId, projectId));
  const lifecycleComplete = wrongOwnerRelease.code === 'PROJECT_TIMELINE_RANGE_LOCKED'
    && overlappingAcquire.code === 'PROJECT_TIMELINE_RANGE_LOCKED'
    && releasedLockUse.code === 'PROJECT_TIMELINE_RANGE_LOCKED'
    && wrongOwnerRelease.emittedMutationReceiptCount === 0
    && overlappingAcquire.emittedMutationReceiptCount === 0
    && releasedLockUse.emittedMutationReceiptCount === 0
    && firstAcquire.mutationReceipt.revision.value === 8
    && release.revision.value === 9
    && secondAcquire.mutationReceipt.revision.value === 10
    && cut.mutationReceipt.revision.value === 11
    && final.projectRevision === 11
    && final.timelineRangeCutLocks?.length === 0;
  if (!lifecycleComplete) fail('LOCK_LIFECYCLE_PROOF_FAILED');
  return {
    firstLockIdSha256: hashCanonicalJsonV1(firstAcquire.lock.lockId),
    wrongOwnerRelease,
    overlappingAcquire,
    releasedRevision: release.revision.value,
    releasedLockUse,
    secondLockIdSha256: hashCanonicalJsonV1(secondAcquire.lock.lockId),
    consumedByCutRevision: cut.mutationReceipt.revision.value,
    lifecycleComplete,
    finalProjectStateSha256: projectStateSha256(final),
  };
}

async function proveInvalidInputsBlock(
  input: Parameters<typeof executeStage25ProjectServiceConflictProductProofV1>[0],
  projectId: string,
) {
  await input.store.installProject(projectFixture(input.userId, projectId));
  const initial = await input.owner.loadProjectForMutation(input.userId, projectId);
  await input.owner.updateOverlayAtRevisionV1(input.userId, projectId, {
    expectedRevision: initial.revision,
    actorKind: 'USER',
    overlayId: 2,
    updates: { content: 'advance revision before stale command' },
  });
  const beforeStale = requiredProject(await input.store.readProject(input.userId, projectId));
  const staleRevision = await captureBlockedAttempt(input.owner, () => (
    input.owner.acquireTimelineRangeCutLockV1(input.userId, projectId, {
      expectedRevision: initial.revision,
      actorKind: 'AGENT',
      startFrame: 30,
      endFrame: 240,
    })
  ));
  const afterStale = requiredProject(await input.store.readProject(input.userId, projectId));
  const staleRevisionNoWrite = staleRevision.code === 'PROJECT_REVISION_CONFLICT'
    && staleRevision.emittedMutationReceiptCount === 0
    && projectStateSha256(beforeStale) === projectStateSha256(afterStale);

  const current = await input.owner.loadProjectForMutation(input.userId, projectId);
  const invalidRange = await captureBlockedAttempt(input.owner, () => (
    input.owner.cutTimelineRangeV1(input.userId, projectId, {
      expectedRevision: current.revision,
      actorKind: 'AGENT',
      startFrame: 60,
      endFrame: 60,
    })
  ));
  const afterInvalidRange = requiredProject(
    await input.store.readProject(input.userId, projectId),
  );
  const invalidRangeNoWrite = invalidRange.emittedMutationReceiptCount === 0
    && projectStateSha256(afterStale) === projectStateSha256(afterInvalidRange);
  if (!staleRevisionNoWrite || !invalidRangeNoWrite) {
    fail('INVALID_INPUT_NO_WRITE_PROOF_FAILED');
  }
  return {
    staleRevision,
    staleRevisionNoWrite,
    invalidRange,
    invalidRangeNoWrite,
    finalProjectStateSha256: projectStateSha256(afterInvalidRange),
  };
}

async function proveStaleEvidenceBlocks(
  input: Parameters<typeof executeStage25ProjectServiceConflictProductProofV1>[0],
  projectId: string,
) {
  await input.store.installProject(projectFixture(input.userId, projectId));
  const initial = await input.owner.loadProjectForMutation(input.userId, projectId);
  const draft = generatedCompositionDraft(projectId, input.userId);
  const insert = await input.owner.captureMutationReceipts(() => (
    input.owner.prepareProjectGeneratedCompositionV1(input.userId, projectId, {
      kind: 'INSERT',
      expectedRevision: initial.revision,
      draft,
    })
  ));
  assertOneMutationReceipt(insert.receipts, projectId, 8);
  const currentToken = insert.value.entry.candidateState?.stateIdentity.token;
  if (!currentToken) fail('GENERATED_INSERT_TOKEN_MISSING');
  const beforeStale = requiredProject(await input.store.readProject(input.userId, projectId));
  const staleToken = await captureBlockedAttempt(input.owner, () => (
    input.owner.prepareProjectGeneratedCompositionV1(input.userId, projectId, {
      kind: 'REVISE',
      expectedRevision: insert.value.receipt.revision,
      expectedBaseStateToken: FORGED_STATE_TOKEN,
      draft,
    })
  ));
  const afterStale = requiredProject(await input.store.readProject(input.userId, projectId));
  const staleTokenNoWrite = staleToken.code
      === 'PROJECT_GENERATED_COMPOSITION_STATE_CONFLICT'
    && staleToken.emittedMutationReceiptCount === 0
    && projectStateSha256(beforeStale) === projectStateSha256(afterStale);

  const repaired = await input.owner.captureMutationReceipts(() => (
    input.owner.prepareProjectGeneratedCompositionV1(input.userId, projectId, {
      kind: 'REVISE',
      expectedRevision: insert.value.receipt.revision,
      expectedBaseStateToken: currentToken,
      draft,
    })
  ));
  assertOneMutationReceipt(repaired.receipts, projectId, 9);
  const repairedState = repaired.value.entry.candidateState;
  const exactTokenRepairAccepted = Boolean(repairedState
    && repairedState.stateIdentity.token !== currentToken
    && insert.value.entry.candidateState
    && revisionMaterialSha256(
      insert.value.entry.candidateState,
    ) === revisionMaterialSha256(repairedState));
  if (!staleTokenNoWrite || !exactTokenRepairAccepted) {
    fail('STALE_EVIDENCE_PROOF_FAILED');
  }
  return {
    insertRevision: insert.value.receipt.revision.value,
    insertedStateTokenSha256: hashCanonicalJsonV1(currentToken),
    staleToken,
    staleTokenNoWrite,
    repairRevision: repaired.value.receipt.revision.value,
    repairedStateTokenSha256: hashCanonicalJsonV1(
      repairedState!.stateIdentity.token,
    ),
    exactTokenRepairAccepted,
    finalProjectStateSha256: projectStateSha256(
      requiredProject(await input.store.readProject(input.userId, projectId)),
    ),
  };
}

async function captureBlockedAttempt(
  owner: ProjectServiceConflictOwnerV1,
  operation: () => Promise<unknown>,
) {
  let emitted: readonly ProjectMutationReceiptV1[] = [];
  try {
    await owner.captureMutationReceipts(operation, (receipts) => {
      emitted = receipts;
    });
  } catch (error) {
    const record = errorRecord(error);
    return {
      ...record,
      emittedMutationReceiptCount: emitted.length,
    };
  }
  fail('UNSAFE_OPERATION_WAS_NOT_BLOCKED');
}

function projectFixture(
  userId: string,
  projectId: string,
  movableOverlayStart = 0,
): Project {
  return {
    projectId,
    userId,
    name: 'Stage 2.5 ProjectService conflict product proof',
    overlays: [
      {
        id: 1,
        type: OverlayType.VIDEO,
        from: 0,
        row: 0,
        durationInFrames: 240,
        height: 1080,
        left: 0,
        top: 0,
        width: 1920,
        isDragging: false,
        rotation: 0,
        content: 'stage25-conflict-source.mp4',
        styles: {},
        sourceStartFrame: 100,
        videoStartTime: 100,
      },
      {
        id: 2,
        type: OverlayType.TEXT,
        from: movableOverlayStart,
        row: 1,
        durationInFrames: 20,
        height: 80,
        left: 100,
        top: 100,
        width: 640,
        isDragging: false,
        rotation: 0,
        content: 'before concurrent edit',
        styles: textStyles(),
      },
      {
        id: 3,
        type: OverlayType.TEXT,
        from: 180,
        row: 1,
        durationInFrames: 30,
        height: 80,
        left: 100,
        top: 200,
        width: 640,
        isDragging: false,
        rotation: 0,
        content: 'ripple tail',
        styles: textStyles(),
      },
    ],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 240,
    createdAt: new Date(INITIAL_UPDATED_AT),
    updatedAt: new Date(INITIAL_UPDATED_AT),
    projectRevision: INITIAL_REVISION,
    timelineRangeChangeReceipts: [],
    timelineRangeCutLocks: [],
    generatedCompositions: [],
    visibility: 'private',
  };
}

function textStyles() {
  return {
    fontSize: '48px',
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: 'transparent',
    fontFamily: 'Arial',
    fontStyle: 'normal',
    textDecoration: 'none',
  };
}

function generatedCompositionDraft(
  projectId: string,
  userId: string,
): ProjectGeneratedCompositionDraftV1 {
  return {
    schemaVersion: 1,
    contractVersion: PROJECT_GENERATED_COMPOSITION_STATE_VERSION_V1,
    kind: 'generated-composition',
    compositionId: 'stage25-conflict-evidence-card',
    programRef: {
      artifactType: 'GeneratedCompositionProgramV1',
      contractVersion: 'EDITRON_GENERATED_COMPOSITION_PROGRAM_V1',
      programId: 'stage25-conflict-evidence-program',
      boundProjectId: projectId,
      programArtifact: artifact('program', 'a'),
      sourceBundleArtifact: artifact('source-bundle', 'b'),
      generator: { kind: 'HUMAN_AUTHORED', authorId: userId },
      allowedApi: {
        apiId: 'editron-gcp',
        apiVersion: '1',
        runtimeDigest: digest('c'),
      },
    },
    referenceBinding: null,
    placement: {
      projectTimebase: timebase(`${projectId}:timeline`, 'PROJECT', projectId),
      compositionTimebase: timebase(
        'stage25-conflict-evidence-card:local',
        'COMPOSITION',
        'stage25-conflict-evidence-card',
      ),
      projectRange: { startTick: '0', endExclusiveTick: '60' },
      compositionRange: { startTick: '0', endExclusiveTick: '60' },
      headHandleTicks: '0',
      tailHandleTicks: '0',
      handlePolicy: 'LOCKED_BOUNDARY_NO_TRIM',
    },
    canvas: {
      width: 1920,
      height: 1080,
      pixelAspectRatio: { numerator: '1', denominator: '1' },
      colorIntent: 'SDR_BT709',
    },
    sourceBindings: [],
    dependencyBindings: [],
    fontBindings: [],
    exposedControls: [],
    output: {
      kind: 'OPAQUE_NESTED_COMPOSITION',
      representation: 'EDITABLE_PROGRAM_AND_PROXY',
      flatteningDisposition: 'EXPLICIT_HANDOFF_ONLY',
      audioDisposition: 'CUE_HANDOFF_ONLY',
    },
    audioCueIntents: [],
  };
}

function artifact(artifactId: string, fill: string) {
  return { artifactId, version: 'v1', digest: digest(fill) };
}

function digest(fill: string) {
  return { algorithm: 'sha-256' as const, value: fill.repeat(64) };
}

function timebase(
  timebaseId: string,
  scope: 'PROJECT' | 'COMPOSITION',
  scopeId: string,
) {
  return {
    timebaseId,
    version: 'v1',
    scope,
    scopeId,
    rate: { numerator: '30', denominator: '1' },
  };
}

function assertExecutionInput(input: {
  environment: Stage25ProjectServiceConflictProofEnvironmentV1;
  executionId: string;
  createdAt: string;
  userId: string;
  projectIdPrefix: string;
}): void {
  const realMongo = input.environment.persistenceKind === 'REAL_MONGODB_SINGLE_NODE';
  const environmentPairingValid = realMongo
    ? input.environment.topology === 'LOOPBACK_STANDALONE_MONGOD'
      && input.environment.gcsImportDisposition
        === 'INERT_IMPORT_ENV_NO_GCS_METHOD_CALL'
      && input.environment.networkBoundary === 'LOOPBACK_MONGODB_ONLY'
    : input.environment.topology === 'IN_PROCESS_SINGLE_OWNER'
      && input.environment.gcsImportDisposition === 'TEST_MODULE_MOCK_NO_GCS_IMPORT'
      && input.environment.networkBoundary === 'IN_PROCESS_ONLY';
  if (!environmentPairingValid
    || !/^[A-Za-z0-9_-]{8,100}$/.test(input.executionId)
    || !/^[A-Za-z0-9_-]{8,100}$/.test(input.userId)
    || !/^[A-Za-z0-9_-]{8,100}$/.test(input.projectIdPrefix)
    || Number.isNaN(new Date(input.createdAt).getTime())
    || !/^[a-f0-9]{7,64}$/.test(input.environment.sourceCommit)
    || !isSha256(input.environment.projectServiceSha256)
    || !isSha256(input.environment.proofOwnerSha256)
    || (input.environment.runnerSha256 !== null
      && !isSha256(input.environment.runnerSha256))) {
    fail('EXECUTION_INPUT_INVALID');
  }
}

function assertOneMutationReceipt(
  receipts: readonly ProjectMutationReceiptV1[],
  projectId: string,
  revision: number,
): void {
  if (receipts.length !== 1
    || receipts[0]?.projectId !== projectId
    || receipts[0].revision.value !== revision) {
    fail('MUTATION_RECEIPT_CHAIN_INVALID');
  }
}

function assertExactOverlayReceipt(
  receipt: ProjectTimelineRangeChangeReceiptV1,
  expectedRange: { startFrame: number; endFrame: number },
): void {
  if (receipt.rangeObservation !== 'EXACT'
    || receipt.actorKind !== 'USER'
    || receipt.timelineCoordinateTransform !== null
    || receipt.ripple !== null
    || hashCanonicalJsonV1(receipt.writeFrameRangesBefore)
      !== hashCanonicalJsonV1([expectedRange])
    || receipt.downstreamInvalidation.status
      !== 'UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN') {
    fail('UPDATE_OVERLAY_RANGE_RECEIPT_INVALID');
  }
}

function assertCutReceiptTruth(receipt: ProjectTimelineRangeChangeReceiptV1): true {
  const expectedWrite = [{ startFrame: 30, endFrame: 240 }];
  const expectedAffected = [{ startFrame: 30, endFrame: 210 }];
  if (receipt.operation !== 'CUT_TIMELINE_RANGE'
    || receipt.actorKind !== 'AGENT'
    || receipt.rangeObservation !== 'EXACT'
    || hashCanonicalJsonV1(receipt.writeFrameRangesBefore)
      !== hashCanonicalJsonV1(expectedWrite)
    || hashCanonicalJsonV1(receipt.affectedFrameRangesAfter)
      !== hashCanonicalJsonV1(expectedAffected)
    || receipt.ripple?.kind !== 'REMOVE_AND_SHIFT_LEFT'
    || receipt.ripple.deltaFrames !== -30
    || receipt.timelineCoordinateTransform?.removedRange.startFrame !== 30
    || receipt.timelineCoordinateTransform.removedRange.endFrame !== 60
    || receipt.downstreamInvalidation.status
      !== 'UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN'
    || hashCanonicalJsonV1(
      receipt.downstreamInvalidation.affectedFrameRangesBefore,
    ) !== hashCanonicalJsonV1(expectedWrite)) {
    fail('CUT_RANGE_EFFECT_RECEIPT_INVALID');
  }
  return true;
}

function timelineReceiptProjection(receipt: ProjectTimelineRangeChangeReceiptV1) {
  return {
    receiptId: receipt.receiptId,
    operation: receipt.operation,
    actorKind: receipt.actorKind,
    beforeRevision: receipt.beforeProjectRevision.value,
    afterRevision: receipt.afterProjectRevision.value,
    readFrameRangesBefore: receipt.readFrameRangesBefore,
    writeFrameRangesBefore: receipt.writeFrameRangesBefore,
    affectedFrameRangesAfter: receipt.affectedFrameRangesAfter,
    affectedOverlayRefs: receipt.affectedOverlayRefs,
    rangeObservation: receipt.rangeObservation,
    timelineCoordinateTransform: receipt.timelineCoordinateTransform,
    ripple: receipt.ripple,
    downstreamInvalidation: receipt.downstreamInvalidation,
  };
}

function lastTimelineReceipt(
  project: Project,
  operation: ProjectTimelineRangeChangeReceiptV1['operation'],
): ProjectTimelineRangeChangeReceiptV1 {
  const receipt = [...(project.timelineRangeChangeReceipts ?? [])]
    .reverse()
    .find((candidate) => candidate.operation === operation);
  if (!receipt) fail(`TIMELINE_RECEIPT_MISSING_${operation}`);
  return receipt;
}

function projectStateSha256(project: Project): string {
  const plain = JSON.parse(JSON.stringify({
    projectId: project.projectId,
    userId: project.userId,
    overlays: project.overlays,
    durationInFrames: project.durationInFrames,
    projectRevision: project.projectRevision,
    updatedAt: project.updatedAt,
    timelineRangeChangeReceipts: project.timelineRangeChangeReceipts ?? [],
    timelineRangeCutLocks: project.timelineRangeCutLocks ?? [],
    generatedCompositions: project.generatedCompositions ?? [],
  })) as JsonRecord;
  return hashCanonicalJsonV1(plain);
}

function revisionMaterialSha256(
  state: ProjectGeneratedCompositionStateV1,
): string {
  const material = JSON.parse(JSON.stringify(state)) as JsonRecord;
  delete material.stateIdentity;
  delete material.renderArtifacts;
  delete material.verificationDisposition;
  delete material.proof;
  return hashCanonicalJsonV1(material);
}

function requiredProject(project: Project | null): Project {
  if (!project) fail('FIXTURE_PROJECT_MISSING');
  return project;
}

function errorRecord(error: unknown) {
  const record = isRecord(error) ? error : {};
  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    code: typeof record.code === 'string' ? record.code : null,
    reason: typeof record.reason === 'string' ? record.reason : null,
    currentRevision: revisionValue(record.currentRevision),
    blockingLockCount: Array.isArray(record.blockingLockIds)
      ? record.blockingLockIds.length
      : 0,
    messageSha256: hashCanonicalJsonV1(
      error instanceof Error ? error.message : String(error),
    ),
  };
}

function revisionValue(value: unknown): number | null {
  return isRecord(value) && typeof value.value === 'number' ? value.value : null;
}

function gate(gateId: string, passed: boolean) {
  return { gateId, status: passed ? 'PASS' as const : 'FAIL' as const };
}

export function assertStage25ProjectServiceConflictProductProofReceiptV1(
  value: unknown,
): void {
  if (!isRecord(value)) fail('RECEIPT_NOT_OBJECT');
  const { receiptSha256, ...unsigned } = value;
  const gates = Array.isArray(value.gates) ? value.gates : [];
  const cleanup = isRecord(value.cleanup) ? value.cleanup : {};
  const effects = isRecord(value.externalEffects) ? value.externalEffects : {};
  if (value.schemaVersion !== 1
    || value.artifactType !== 'Stage25ProjectServiceConflictProductProofReceiptV1'
    || value.version !== STAGE25_PROJECT_SERVICE_CONFLICT_PRODUCT_PROOF_VERSION_V1
    || (value.assessment !== 'PASS_ORCHESTRATION_TEST_ONLY'
      && value.assessment
        !== 'PASS_BOUNDED_REAL_MONGODB_PROJECTSERVICE_CONFLICT_LOCK_REBASE')
    || gates.length !== 11
    || gates.some((entry) => !isRecord(entry) || entry.status !== 'PASS')
    || cleanup.disposition !== 'DELETED_AND_VERIFIED_ABSENT'
    || cleanup.remainingFixtureProjects !== 0
    || effects.providerInferenceCalls !== 0
    || effects.providerSpendUsd !== 0
    || effects.historicalPaidCohortRowsExecuted !== 0
    || effects.nonFixtureProjectWrites !== 0
    || effects.nonLoopbackNetworkCalls !== 0
    || !isSha256(receiptSha256)
    || receiptSha256 !== hashCanonicalJsonV1(unsigned)) {
    fail('RECEIPT_INVALID');
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function fail(code: string): never {
  throw new Error(`STAGE25_PROJECT_SERVICE_CONFLICT_PRODUCT_PROOF_${code}`);
}
