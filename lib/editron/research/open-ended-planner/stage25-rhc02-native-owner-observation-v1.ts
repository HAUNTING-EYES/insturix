import {
  buildRhc02PreviewFixtureV1,
  type Rhc02PreviewFixtureIdentityV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-preview-fixture-v1';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { projectProposalStateV2R } from './project-service-proposal-state-v2r';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from './provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceOperatorDispatcherV2R }
  from './provider-native-project-service-operator-dispatcher-v2r';
import { STAGE25_HELDOUT_ROUTE_FREEZE_V1 }
  from './stage25-heldout-route-freeze-v1';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';
import type { Project, ProjectRevisionV1 }
  from '../../services/project-service';

type JsonRecord = Record<string, unknown>;

export const STAGE25_RHC02_NATIVE_OWNER_OBSERVATION_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC02_NATIVE_OWNER_OBSERVATION_V1' as const;

export const STAGE25_RHC02_NATIVE_OWNER_IMPLEMENTATION_BINDING_V1 = deepFreezeV1({
  dependencyCommit: '01ddd8925035665233580d541b9b8e858f132a4a',
  formOwnerSha256: '3bfce721bb5d6820837e8618e4e0d35876292bc6cfea364194c60a3420bac080',
  overlayOwnerSha256: '3e78da2f6198c04da7122cbeb8f3f14a0db4fc68cdb04df40b44ce918c12c623',
  dispatcherSha256: '30e10c0f5e95f4807f53bfb2b2cf1c279e3ad4571cb8e58bf29dfc146754923b',
});

/**
 * Issues current owner evidence without changing the historical V1 safe-stop.
 * Two image calls use one isolated proposal; the exact-font title uses a fresh
 * proposal so its safe-stop cannot leave a partial candidate behind.
 */
export async function executeStage25Rhc02NativeOwnerObservationV1(
  identity: Rhc02PreviewFixtureIdentityV1,
) {
  const task = STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks
    .find(({ taskId }) => taskId === 'RHC-02') ?? fail('TASK_MISSING');
  const fixture = buildRhc02PreviewFixtureV1(identity);
  const evidenceFactIds = new Set(fixture.evidencePack.facts.map(({ factId }) => factId));
  const stillEvidenceIds = [
    'rhc02-source-rhc02-still-a',
    'rhc02-source-rhc02-still-b',
  ] as const;
  if (stillEvidenceIds.some((evidenceId) => !evidenceFactIds.has(evidenceId))) {
    fail('STILL_EVIDENCE_MISSING');
  }
  if (!evidenceFactIds.has('rhc02-font')) fail('FONT_EVIDENCE_MISSING');

  const imagePlan = await observeImagePlan(stillEvidenceIds);
  const title = await observeExactFontTitle();
  const material = {
    version: STAGE25_RHC02_NATIVE_OWNER_OBSERVATION_VERSION_V1,
    artifactType: 'Stage25Rhc02NativeOwnerObservationV1' as const,
    authority: 'CURRENT_RHC02_ISOLATED_OWNER_OBSERVATION_NO_CANONICAL_MUTATION' as const,
    taskId: 'RHC-02' as const,
    taskSha256: String(task.taskSha256),
    fixtureSha256: fixture.fixtureSha256,
    implementationBinding: STAGE25_RHC02_NATIVE_OWNER_IMPLEMENTATION_BINDING_V1,
    dispatcherProfile: 'RHC02_OVERLAY_RESEARCH_V1' as const,
    immutableAudioBaselineHash: hashCanonicalJsonV1(fixture.audioBaseline),
    imagePlan,
    exactFontTitle: title,
    currentTruth: {
      isolatedRevisionIssuedOverlayWriter: true as const,
      bothStillImageFormsAccepted: true as const,
      exactNativeFontFileBinding: false as const,
      nativeRouteCapabilityAvailable: false as const,
      capabilityGapCodes: ['NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE'] as const,
    },
    externalCalls: {
      providerInferenceCalls: 0 as const,
      renderCalls: 0 as const,
      databaseCalls: 0 as const,
      canonicalProjectMutationWrites: 0 as const,
    },
    proofCeiling: 'ISOLATED_OWNER_AND_FORM_PROOF_NOT_RENDER_OR_PRODUCT_MUTATION' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
}

async function observeImagePlan(evidenceIds: readonly [string, string]) {
  const probe = await createProbe('image-plan');
  const calls = [
    {
      type: 'image', assetId: 'rhc02-still-a',
      start: 300, duration: 90, row: 2, x: 0, y: 0, width: 540, height: 1920,
      styles: { objectFit: 'cover', opacity: 1 }, evidenceIds: [evidenceIds[0]],
    },
    {
      type: 'image', assetId: 'rhc02-still-b',
      start: 300, duration: 90, row: 1, x: 540, y: 0, width: 540, height: 1920,
      styles: { objectFit: 'cover', opacity: 1 }, evidenceIds: [evidenceIds[1]],
    },
  ] as const;
  const executions: ProviderNativeToolExecutionV2R[] = [];
  let expectedProjectRevision = probe.resolved.currentRevision.projectRevision;
  for (const [index, argumentsValue] of calls.entries()) {
    const execution = await probe.resolved.isolatedClone.executeIsolated({
      operatorId: 'add_overlay',
      turn: index + 1,
      arguments: {
        projectId: probe.canonical.projectId,
        expectedProjectRevision,
        ...argumentsValue,
      },
    });
    if (execution.disposition !== 'OK') fail('IMAGE_EXECUTION_NOT_OK');
    expectedProjectRevision = receiptRevision(execution);
    executions.push(execution as ProviderNativeToolExecutionV2R);
  }
  const proposal = await requiredFinalizer(probe.resolved)();
  if (!proposal.canonicalUnchanged
    || proposal.changedPaths.join('|') !== '$.overlays[2]|$.overlays[3]'
    || probe.canonicalBeforeSha256
      !== hashCanonicalJsonV1(projectProposalStateV2R(probe.canonical))) {
    fail('IMAGE_PROPOSAL_DRIFT');
  }
  const observations = executions.map((execution, index) => {
    const proof = executionProof(execution);
    if (proof.overlayType !== 'image'
      || proof.projectFrameRange === undefined
      || proof.canonicalMutationOwnerCalled !== false) {
      fail('IMAGE_EXECUTION_PROOF_INVALID');
    }
    return {
      operationId: index === 0 ? 'rhc02-add-still-a' : 'rhc02-add-still-b',
      executionSha256: hashCanonicalJsonV1(execution),
      writerProjectRevision: receiptRevision(execution),
      overlayId: proof.overlayId,
      resolvedPosition: proof.resolvedPosition,
      changedPaths: proof.changedPaths,
    };
  });
  return deepFreezeV1({
    disposition: 'OK' as const,
    observations,
    proposalReceiptSha256: proposal.receiptSha256,
    proposalChangedPaths: proposal.changedPaths,
    canonicalUnchanged: proposal.canonicalUnchanged,
    immutableAudioOverlayPaths: ['$.overlays[0]', '$.overlays[1]'] as const,
    isolatedSnapshotReads: probe.snapshotReads(),
  });
}

async function observeExactFontTitle() {
  const probe = await createProbe('exact-font-title');
  const execution = await probe.resolved.isolatedClone.executeIsolated({
    operatorId: 'add_overlay',
    turn: 1,
    arguments: {
      projectId: probe.canonical.projectId,
      expectedProjectRevision: probe.resolved.currentRevision.projectRevision,
      type: 'text', text: 'How we shipped it', start: 300, duration: 90,
      row: 0, x: 108, y: 786, width: 864, height: 348,
      styles: {
        fontFamily: 'Noto Sans', fontSize: 76, fontWeight: 700,
        textAlign: 'center', color: '#FFFFFF',
        backgroundColor: 'rgba(0,0,0,0.58)', opacity: 1,
      },
      evidenceIds: ['rhc02-font'],
    },
  });
  const proposal = await requiredFinalizer(probe.resolved)();
  const code = String((execution.output as JsonRecord).code ?? '');
  if (execution.disposition !== 'UNVERIFIABLE'
    || code !== 'PROJECTSERVICE_ISOLATED_OVERLAY_FORM_INPUT_INVALID'
    || proposal.changedPaths.length
    || !proposal.canonicalUnchanged
    || probe.canonicalBeforeSha256
      !== hashCanonicalJsonV1(projectProposalStateV2R(probe.canonical))) {
    fail('TITLE_SAFE_STOP_DRIFT');
  }
  return deepFreezeV1({
    disposition: execution.disposition,
    code,
    executionSha256: hashCanonicalJsonV1(execution),
    proposalReceiptSha256: proposal.receiptSha256,
    proposalChangedPaths: proposal.changedPaths,
    canonicalUnchanged: proposal.canonicalUnchanged,
    isolatedSnapshotReads: probe.snapshotReads(),
  });
}

async function createProbe(label: string) {
  const canonical = probeProject();
  const revision = probeRevision(canonical);
  const canonicalBeforeSha256 = hashCanonicalJsonV1(projectProposalStateV2R(canonical));
  let reads = 0;
  const owner = createProviderNativeProjectServiceCloneOwnerV2R({
    projectService: {
      loadProjectForMutation: async () => {
        reads += 1;
        return { project: structuredClone(canonical), revision: structuredClone(revision) };
      },
    },
    isolatedOperatorOwner: createProviderNativeProjectServiceOperatorDispatcherV2R({
      profile: 'RHC02_OVERLAY_RESEARCH_V1',
    }),
  });
  const resolved = await owner.resolveFresh!({
    tenantId: 'stage25-rhc02-owner-observation',
    userId: canonical.userId,
    projectId: canonical.projectId,
    episodeId: `stage25-rhc02-${label}`,
  });
  return { canonical, canonicalBeforeSha256, resolved, snapshotReads: () => reads };
}

function probeProject(): Project {
  const timestamp = new Date('2026-08-27T04:00:00.000Z');
  const base = {
    from: 270, durationInFrames: 150, left: 0, top: 0,
    width: 1080, height: 1920, rotation: 0, isDragging: false,
  };
  return {
    projectId: 'stage25-rhc02-preview', userId: 'stage25-rhc02-owner-observation',
    name: 'RHC-02 native owner observation',
    overlays: [
      {
        ...base, id: 1, row: 0, type: 'video', assetId: 'rhc02-interview',
        sourceStartFrame: 270, sourceEndFrame: 420, styles: { opacity: 1, volume: 1 },
        content: 'rhc02-interview',
      },
      {
        ...base, id: 2, row: 1, type: 'sound', assetId: 'rhc02-room-tone',
        startFromSound: 9, styles: { volume: 0.15 }, content: 'rhc02-room-tone',
      },
    ] as unknown as Project['overlays'],
    aspectRatio: '9:16', playerDimensions: { width: 1080, height: 1920 },
    fps: 30, durationInFrames: 420, createdAt: timestamp, updatedAt: timestamp,
    projectRevision: 1, visibility: 'private',
  };
}

function probeRevision(project: Project): ProjectRevisionV1 {
  return {
    schemaVersion: 1,
    value: project.projectRevision ?? 0,
    compatibilityUpdatedAt: project.updatedAt.toISOString(),
  };
}

function executionProof(execution: Readonly<ProviderNativeToolExecutionV2R>): JsonRecord {
  const receipt = execution.output.receipt;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    fail('EXECUTION_RECEIPT_INVALID');
  }
  const proof = (receipt as JsonRecord).proof;
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
    fail('EXECUTION_PROOF_INVALID');
  }
  return proof as JsonRecord;
}

function receiptRevision(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  const receipt = execution.output.receipt as JsonRecord | undefined;
  const revision = receipt?.projectRevision;
  if (typeof revision !== 'string' || !revision.trim()) fail('WRITER_REVISION_INVALID');
  return revision;
}

function requiredFinalizer(resolved: Awaited<ReturnType<
  NonNullable<ReturnType<typeof createProviderNativeProjectServiceCloneOwnerV2R>['resolveFresh']>
>>) {
  return resolved.isolatedClone.finalizeProposalReceipt
    ?? fail('PROPOSAL_FINALIZER_MISSING');
}

function fail(code: string): never {
  throw new Error(`STAGE25_RHC02_NATIVE_OWNER_OBSERVATION_${code}`);
}
