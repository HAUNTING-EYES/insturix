import { readFileSync, writeFileSync } from 'node:fs';

import { hashCanonicalJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/contracts-v1';
import type { ProviderNativeDurableOutcomeProofReceiptV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-durable-outcome-proof-v2r';
import {
  buildProviderNativeEpisodeDurableJobInputV2R,
  persistProviderNativeEpisodeCheckpointV2R,
  restoreProviderNativeEpisodeDurableStateV2R,
} from '../../../lib/editron/research/open-ended-planner/provider-native-episode-durable-job-v2r';
import { runProviderNativeEpisodeDurableWorkerV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-episode-durable-worker-v2r';
import { createProviderNativeDurableOwnerArtifactResolverV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-episode-owner-artifact-resolver-v2r';
import { createProviderNativeEpisodeResumeCheckpointV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import {
  createProviderNativeProjectServiceCloneOwnerV2R,
  type ProjectServiceIsolatedOperatorOwnerV2R,
} from '../../../lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCutOwnerV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-project-service-cut-owner-v2r';
import { createProviderNativeProjectServiceCutProofOwnerV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-project-service-cut-proof-owner-v2r';
import { createProviderNativeProjectServiceKeyframeOwnerV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-project-service-keyframe-owner-v2r';
import { projectProposalStateV2R }
  from '../../../lib/editron/research/open-ended-planner/project-service-proposal-state-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import { buildProviderNativeToolSetV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
} from '../../../lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import type { Phase0RenderedStillEvidence }
  from '../../../lib/editron/services/phase0-rendered-evidence-worker';
import type { Project, ProjectRevisionV1 }
  from '../../../lib/editron/services/project-service';
import type { DurableWorkflowJobRecordV1 }
  from '../../../lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '../../../lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './stateful-mongo-collection';

type JsonRecord = Record<string, unknown>;
type StoredState = Readonly<{
  version: 'EDITRON_CUT_FOCAL_PROCESS_RECOVERY_V2R_1';
  authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION';
  preparePid: number;
  canonicalProject: JsonRecord;
  canonicalStateSha256: string;
  jobRecord: JsonRecord;
  envelopeSha256: string;
}>;

const START = new Date('2026-08-23T20:00:00.000Z');
const RESUME_AT = new Date(START.getTime() + 5 * 60 * 1000 + 1);
const REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: '2026-08-23T19:30:00.000Z',
};
const BASE_REVISION = `project-revision-v1:${hashCanonicalJsonV1(REVISION)}`;
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const ELIGIBLE = ['cut_section', 'set_keyframes'] as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'cut-focal-process-recovery-1',
  objective: 'Remove the supplied dead-air range, then apply the supplied focal push-in.',
  activeTarget: { taskId: 'CUT-FOCAL-PROCESS-RECOVERY' },
  revisionBinding: {
    projectId: 'project-1',
    expectedProjectRevision: BASE_REVISION,
  },
  projectState: { projectId: 'project-1', projectRevision: BASE_REVISION },
  evidence: [
    { evidenceId: 'ev-cut', kind: 'BOUND_TIMELINE_RANGE' },
    { evidenceId: 'ev-focal', kind: 'BOUND_VISUAL_FORM' },
  ],
  preservationRules: [
    'Never replay provider calls or mutate the canonical project.',
    'The focal mutation must consume the cut writer revision through an opaque result reference.',
  ],
  authorityAndPolicy: {
    mutation: 'ISOLATED_CLONE_ONLY',
    completeCapabilityDossier: { plannerRecordSupplements: [{
      selectableOperatorId: 'set_keyframes',
      inputOrigins: { expectedProjectRevision: [{
        origin: 'OPERATOR_OUTPUT',
        operatorId: 'cut_section',
        outputField: 'receipt.projectRevision',
      }] },
    }] },
  },
  budget: { maxTurns: 3, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};

async function main(): Promise<void> {
  const [mode, statePath, resultPath] = process.argv.slice(2);
  if (!statePath || !['prepare', 'resume'].includes(mode)) fail('ARGUMENTS_INVALID');
  if (mode === 'prepare') await prepare(statePath);
  else if (resultPath) await resume(statePath, resultPath);
  else fail('RESULT_PATH_REQUIRED');
}

async function prepare(outputPath: string): Promise<void> {
  const canonical = project();
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  const toolSet = buildToolSet();
  const created = await store.createOrGet(buildProviderNativeEpisodeDurableJobInputV2R({
    tenantId: 'tenant-1', userId: 'user-1', orgId: 'org-1', projectId: 'project-1',
    parentCommandId: null, parentReceiptId: null,
    idempotencyKey: CONTEXT.episodeId,
    identity: {
      route: ROUTE, episodeId: CONTEXT.episodeId,
      contextSha256: hashCanonicalJsonV1(CONTEXT),
      toolSetSha256: toolSet.toolSetSha256,
    },
    maxAttempts: 3,
  }), START);
  const claim = await store.claim({
    jobId: created.job.jobId, workerId: 'prefix', now: START,
  });
  if (claim.kind !== 'claimed') fail('PREFIX_CLAIM_FAILED');
  const clone = await createCloneOwner(canonical, {}).resolve(scope());
  let providerCalls = 0;
  try {
    await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: CONTEXT,
      eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke: async () => {
        providerCalls += 1;
        return cutResponse();
      },
      executeIsolated: clone.isolatedClone.executeIsolated,
      onTurnCommitted: async ({ checkpoint }) => {
        const recovery = await clone.isolatedClone.captureProposalRecoveryState?.(checkpoint);
        if (!recovery) fail('PREFIX_RECOVERY_MISSING');
        await persistProviderNativeEpisodeCheckpointV2R({
          store,
          jobId: created.job.jobId,
          tenantId: 'tenant-1',
          userId: 'user-1',
          leaseToken: claim.leaseToken,
          expectedSequence: 0,
          checkpoint,
          proposalRecoveryState: recovery,
          now: new Date(START.getTime() + 1),
        });
        throw new Error('EXPECTED_PROCESS_BOUNDARY');
      },
    });
    fail('PREFIX_DID_NOT_INTERRUPT');
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'EXPECTED_PROCESS_BOUNDARY') {
      throw error;
    }
  }
  if (providerCalls !== 1) fail('PREFIX_PROVIDER_CALL_COUNT');
  const canonicalStateSha256 = hashCanonicalJsonV1(projectProposalStateV2R(canonical));
  const material = {
    version: 'EDITRON_CUT_FOCAL_PROCESS_RECOVERY_V2R_1' as const,
    authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION' as const,
    preparePid: process.pid,
    canonicalProject: json(canonical),
    canonicalStateSha256,
    jobRecord: json(collection.snapshot()[0]),
  };
  write(outputPath, { ...material, envelopeSha256: hashCanonicalJsonV1(material) });
}

async function resume(inputPath: string, outputPath: string): Promise<void> {
  const state = read(inputPath) as unknown as StoredState;
  verifyStoredState(state);
  const canonical = reviveProject(state.canonicalProject);
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>([
    reviveJob(state.jobRecord),
  ]);
  const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  const counts = { replay: 0, execute: 0, provider: 0 };
  const outcomeObservation: {
    proof?: Readonly<ProviderNativeDurableOutcomeProofReceiptV2R>;
    project?: Readonly<Project>;
  } = {};
  const projectClone = createCloneOwner(canonical, {
    onReplay: () => { counts.replay += 1; },
    onExecute: () => { counts.execute += 1; },
    onProof: (proof, finalProject) => {
      outcomeObservation.proof = proof;
      outcomeObservation.project = finalProject;
    },
  });
  const resolver = createProviderNativeDurableOwnerArtifactResolverV2R({
    episodeDefinition: {
      resolve: async () => ({ context: CONTEXT, eligibleOperatorIds: ELIGIBLE }),
    },
    projectClone,
    transport: { resolve: async () => async (request) => {
      counts.provider += 1;
      return counts.provider === 1 ? focalResponse(request) : finishResponse();
    } },
  });
  const record = reviveJob(state.jobRecord);
  const result = await runProviderNativeEpisodeDurableWorkerV2R({
    store,
    jobId: record.jobId,
    workerId: 'suffix',
    artifactResolver: resolver,
    clock: () => RESUME_AT,
  });
  if (result.kind !== 'completed') {
    const code = 'errorCode' in result ? `_${result.errorCode}` : '';
    fail(`WORKER_${result.kind.toUpperCase()}${code}`);
  }
  const observedProof = outcomeObservation.proof;
  const observedProject = outcomeObservation.project;
  if (!observedProof || !observedProject) fail('OUTCOME_OBSERVATION_MISSING');
  const persisted = await store.getAuthorized({
    jobId: record.jobId, tenantId: 'tenant-1', userId: 'user-1',
  });
  if (!persisted) fail('PERSISTED_JOB_MISSING');
  const durable = restoreProviderNativeEpisodeDurableStateV2R(persisted);
  const canonicalStateAfter = hashCanonicalJsonV1(projectProposalStateV2R(canonical));
  const productOverlay = observedProject.overlays.find(({ id }) => id === 104);
  if (!productOverlay) fail('FINAL_PRODUCT_OVERLAY_MISSING');
  const material = {
    version: 'EDITRON_CUT_FOCAL_PROCESS_RECOVERY_RESULT_V2R_1',
    authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION',
    processes: {
      preparePid: state.preparePid,
      resumePid: process.pid,
      separateOperatingSystemProcesses: state.preparePid !== process.pid,
    },
    execution: {
      prefixProviderCalls: 1,
      suffixProviderCalls: counts.provider,
      prefixWriterReplays: counts.replay,
      suffixWriterExecutions: counts.execute,
      paidInferenceCalls: 0,
    },
    proposal: {
      canonicalStateSha256Before: state.canonicalStateSha256,
      canonicalStateSha256After: canonicalStateAfter,
      canonicalUnchanged: state.canonicalStateSha256 === canonicalStateAfter,
      recoveredWriterCount: durable.proposalRecoveryState?.operations.length,
      finalWorkingRevision: durable.proposalRecoveryState?.isolatedWorkingProjectRevision,
      proposalReceiptSha256: result.proposalReceiptSha256,
      finalProject: {
        durationInFrames: observedProject.durationInFrames,
        productFrom: productOverlay.from,
        transformOrigin: (productOverlay.styles as unknown as JsonRecord | undefined)
          ?.transformOrigin,
        scaleTrack: productOverlay.keyframeTracks?.find(({ property }) => property === 'scale'),
      },
    },
    proof: {
      receiptSha256: result.outcomeProofReceiptSha256,
      disposition: observedProof.disposition,
      obligations: observedProof.obligations,
    },
    durable: {
      status: persisted.status,
      resumeSequence: persisted.resumeState?.sequence,
      disposition: result.durableDisposition,
    },
    whatHasNotBeenChecked: [
      'LIVE_ATLAS', 'QSTASH_DELIVERY', 'AUTHENTICATED_INGRESS',
      'PAID_PROVIDER_RESUME', 'LIVE_RENDERED_ACCEPTANCE', 'CANONICAL_APPLY_RELOAD',
    ],
  };
  write(outputPath, { ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function createCloneOwner(canonical: Project, hooks: Readonly<{
  onReplay?: () => void;
  onExecute?: () => void;
  onProof?: (
    proof: Readonly<ProviderNativeDurableOutcomeProofReceiptV2R>,
    project: Readonly<Project>,
  ) => void;
}>) {
  const cut = createProviderNativeProjectServiceCutOwnerV2R();
  const keyframes = createProviderNativeProjectServiceKeyframeOwnerV2R();
  const dispatcher = dispatch(cut, keyframes, hooks);
  const proofOwner = createProviderNativeProjectServiceCutProofOwnerV2R({
    buildRenderedEvidence: async (_project, options) => skippedEvidence(
      options?.requestedSampleFrames ?? [],
    ),
    now: () => RESUME_AT.toISOString(),
  });
  return createProviderNativeProjectServiceCloneOwnerV2R({
    projectService: { loadProjectForMutation: async () => snapshot(canonical) },
    isolatedOperatorOwner: dispatcher,
    isolatedOutcomeProofOwner: {
      prove: async (input) => {
        const proof = await proofOwner.prove(input);
        hooks.onProof?.(proof, structuredClone(input.project));
        return proof;
      },
    },
  });
}

function dispatch(
  cut: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>,
  keyframes: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>,
  hooks: Readonly<{ onReplay?: () => void; onExecute?: () => void }>,
): Readonly<ProjectServiceIsolatedOperatorOwnerV2R> {
  const owner = (operatorId: string) => operatorId === 'cut_section' ? cut : keyframes;
  return {
    execute: async (input) => {
      hooks.onExecute?.();
      return owner(input.call.operatorId).execute(input);
    },
    replayCommitted: async (input) => {
      hooks.onReplay?.();
      return owner(input.call.operatorId).replayCommitted!(input);
    },
  };
}

function buildToolSet() {
  return buildOpaqueResultReferenceToolSetV2R(
    buildProviderNativeToolSetV2R(ELIGIBLE),
  );
}

function scope() {
  return {
    tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1',
    checkpoint: createProviderNativeEpisodeResumeCheckpointV2R({
      route: ROUTE,
      episodeId: CONTEXT.episodeId,
      contextSha256: hashCanonicalJsonV1(CONTEXT),
      toolSetSha256: buildToolSet().toolSetSha256,
      completedTurns: [{ turn: 1, marker: 'clone-scope-bootstrap-non-writer' }],
    }),
  };
}

function cutResponse() {
  return call('cut', 'cut_section', {
    projectId: 'project-1', expectedProjectRevision: BASE_REVISION,
    targetRange: { startFrame: 40, endFrame: 50 },
    evidenceIds: ['ev-cut'],
  });
}

function focalResponse(_request: Readonly<SerializedProviderNativeTurnV2R>) {
  return call('focal', 'set_keyframes', {
    projectId: 'project-1',
    overlayId: 104,
    keyframes: [
      { frame: 0, value: 1, easing: 'ease-in-out' },
      { frame: 30, value: 1.08, easing: 'ease-out' },
    ],
    focalPoint: { x: 0.74, y: 0.5 },
    evidenceIds: ['ev-focal'],
    argumentReferences: [{
      targetField: 'expectedProjectRevision',
      resultReferenceId: 'result_t1_1',
    }],
  });
}

function finishResponse() {
  return call('finish', 'finish_editron_research_episode', {
    disposition: 'READY_FOR_PROOF',
    reasonCodes: ['MODEL_READY_FOR_PROOF'],
    evidenceIds: [],
    summary: 'Ready for system-owned rendered proof.',
  });
}

function call(id: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${id}`, model: ROUTE.model, status: 'completed', output: [{
      type: 'function_call', call_id: id, name, arguments: JSON.stringify(args),
    }],
  } };
}

function skippedEvidence(frames: number[]): Phase0RenderedStillEvidence {
  const capturedAt = RESUME_AT.toISOString();
  return {
    version: 'editron-phase0-rendered-still-evidence-v1',
    status: 'skipped', statusReason: 'zero-network-process-recovery-fixture',
    source: 'phase0-rendered-evidence-worker', projectId: 'project-1',
    capturedAt, completedAt: capturedAt,
    functionName: null, serveUrl: null, region: 'test', sampleLimit: frames.length,
    requestedSampleFrames: frames, renderedFrames: [], failedFrames: [],
    artifactPackStatus: 'not-renderable',
    artifactPackIssues: ['zero-network-process-recovery-fixture'],
  };
}

function project(): Project {
  return {
    projectId: 'project-1', userId: 'user-1', name: 'Cut focal process project',
    overlays: [
      { id: 101, type: 'video', assetId: 'opening', src: '/opening.mp4', row: 0,
        from: 0, durationInFrames: 100, sourceStartFrame: 0, videoStartTime: 0,
        styles: { opacity: 1 } },
      { id: 104, type: 'video', assetId: 'product', src: '/product.mp4', row: 0,
        from: 100, durationInFrames: 120, sourceStartFrame: 0, videoStartTime: 0,
        styles: { opacity: 1 } },
    ] as unknown as Project['overlays'],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 },
    fps: 30, durationInFrames: 220,
    createdAt: new Date('2026-08-23T19:00:00.000Z'),
    updatedAt: new Date(REVISION.compatibilityUpdatedAt),
    projectRevision: REVISION.value, visibility: 'private',
  };
}

function snapshot(value: Project): { project: Project; revision: ProjectRevisionV1 } {
  return { project: structuredClone(value), revision: REVISION };
}

function reviveProject(value: JsonRecord): Project {
  const result = structuredClone(value) as unknown as Project;
  result.createdAt = new Date(result.createdAt);
  result.updatedAt = new Date(result.updatedAt);
  return result;
}

function reviveJob(value: JsonRecord): DurableWorkflowJobRecordV1 {
  const result = structuredClone(value);
  for (const field of [
    'leaseExpiresAt', 'nextAttemptAt', 'cancelRequestedAt',
    'createdAt', 'updatedAt', 'expiresAt',
  ] as const) {
    if (typeof result[field] === 'string') result[field] = new Date(result[field]);
  }
  const resume = result.resumeState as JsonRecord | null;
  if (resume && typeof resume.committedAt === 'string') {
    resume.committedAt = new Date(resume.committedAt);
  }
  return result as unknown as DurableWorkflowJobRecordV1;
}

function verifyStoredState(state: StoredState) {
  const material = { ...state } as JsonRecord;
  delete material.envelopeSha256;
  if (state.envelopeSha256 !== hashCanonicalJsonV1(material)) fail('STATE_INVALID');
}

function json(value: unknown): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function read(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, 'utf8')) as JsonRecord;
}

function write(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fail(code: string): never {
  throw new Error(`CUT_FOCAL_PROCESS_${code}`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
