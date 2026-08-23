import { readFileSync, writeFileSync } from 'node:fs';

import { hashCanonicalJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/contracts-v1';
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
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import { buildProviderNativeToolSetV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
  type ProviderNativeToolExecutionV2R,
} from '../../../lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import { projectProposalStateV2R }
  from '../../../lib/editron/research/open-ended-planner/project-service-proposal-state-v2r';
import type { Project, ProjectRevisionV1 }
  from '../../../lib/editron/services/project-service';
import type { DurableWorkflowJobRecordV1 }
  from '../../../lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '../../../lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './stateful-mongo-collection';

type JsonRecord = Record<string, unknown>;
type StoredState = Readonly<{
  version: 'EDITRON_PROJECTSERVICE_PROCESS_RECOVERY_V2R_1';
  authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION';
  preparePid: number;
  canonicalProject: JsonRecord;
  canonicalStateSha256: string;
  jobRecord: JsonRecord;
  envelopeSha256: string;
}>;

const START = new Date('2026-08-23T18:00:00.000Z');
const RESUME_AT = new Date(START.getTime() + 5 * 60 * 1000 + 1);
const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
} as const;
const ELIGIBLE = ['find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake'] as const;
const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'projectservice-process-recovery-1',
  objective: 'Align cuts and emphasize the final measured music hit.',
  activeTarget: { taskId: 'PROJECTSERVICE-PROCESS-RECOVERY' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'canonical-r7' },
  projectState: { projectId: 'project-1', projectRevision: 'canonical-r7' },
  evidence: [{ evidenceId: 'ev-audio-1', kind: 'MEASURED_AUDIO' }],
  preservationRules: ['Never replay provider calls or mutate the canonical project.'],
  authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY', completeCapabilityDossier: {
    plannerRecordSupplements: [
      { selectableOperatorId: 'sync_cuts_to_beats', inputOrigins: { beatPlan: [{
        origin: 'OPERATOR_OUTPUT', operatorId: 'find_audio_moment', outputField: 'result',
      }] } },
      { selectableOperatorId: 'apply_camera_shake', inputOrigins: {
        expectedProjectRevision: [{ origin: 'OPERATOR_OUTPUT',
          operatorId: 'sync_cuts_to_beats', outputField: 'receipt.projectRevision' }],
        overlayId: [{ origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
          outputField: 'result.finalHitOverlayId' }],
        targetFrame: [{ origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
          outputField: 'result.finalStrongPeakFrame' }],
      } },
    ],
  } },
  budget: { maxTurns: 5, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};
const BEAT_PLAN = {
  schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1', assetId: 'music-1',
  measuredEvidenceReceiptHash: 'a'.repeat(64),
  strongPeakFrames: [119, 239, 359, 479], finalStrongPeakFrame: 479,
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
  const toolSet = buildOpaqueResultReferenceToolSetV2R(
    buildProviderNativeToolSetV2R(ELIGIBLE),
  );
  const created = await store.createOrGet(buildProviderNativeEpisodeDurableJobInputV2R({
    tenantId: 'tenant-1', userId: 'user-1', orgId: 'org-1', projectId: 'project-1',
    parentCommandId: null, parentReceiptId: null, idempotencyKey: CONTEXT.episodeId,
    identity: { route: ROUTE, episodeId: CONTEXT.episodeId,
      contextSha256: hashCanonicalJsonV1(CONTEXT), toolSetSha256: toolSet.toolSetSha256 },
    maxAttempts: 3,
  }), START);
  const claim = await store.claim({ jobId: created.job.jobId, workerId: 'prefix', now: START });
  if (claim.kind !== 'claimed') fail('PREFIX_CLAIM_FAILED');
  const cloneOwner = createCloneOwner(canonical, { replay: false });
  const clone = await cloneOwner.resolve(scope(bootstrapCheckpoint()));
  let invocation = 0;
  try {
    await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context: CONTEXT, eligibleOperatorIds: ELIGIBLE,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke: async () => invocation++ === 0 ? findResponse() : syncResponse(),
      executeIsolated: clone.isolatedClone.executeIsolated,
      onTurnCommitted: async ({ checkpoint }) => {
        const recovery = await clone.isolatedClone.captureProposalRecoveryState?.(checkpoint);
        if (!recovery) fail('PREFIX_RECOVERY_MISSING');
        await persistProviderNativeEpisodeCheckpointV2R({
          store, jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
          leaseToken: claim.leaseToken, expectedSequence: 0, checkpoint,
          proposalRecoveryState: recovery, now: new Date(START.getTime() + 1),
        });
        throw new Error('EXPECTED_PROCESS_BOUNDARY');
      },
    });
    fail('PREFIX_DID_NOT_INTERRUPT');
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'EXPECTED_PROCESS_BOUNDARY') throw error;
  }
  if (invocation !== 2) fail('PREFIX_PROVIDER_CALL_COUNT');
  const canonicalStateSha256 = hashCanonicalJsonV1(projectProposalStateV2R(canonical));
  const material = {
    version: 'EDITRON_PROJECTSERVICE_PROCESS_RECOVERY_V2R_1' as const,
    authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION' as const,
    preparePid: process.pid,
    canonicalProject: json(canonical), canonicalStateSha256,
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
  const projectClone = createCloneOwner(canonical, {
    replay: true,
    onReplay: () => { counts.replay += 1; },
    onExecute: () => { counts.execute += 1; },
  });
  const resolver = createProviderNativeDurableOwnerArtifactResolverV2R({
    episodeDefinition: { resolve: async () => ({ context: CONTEXT,
      eligibleOperatorIds: ELIGIBLE }) },
    projectClone,
    transport: { resolve: async () => async (request) => {
      counts.provider += 1;
      return counts.provider === 1 ? shakeResponse(request) : finishResponse();
    } },
  });
  const record = reviveJob(state.jobRecord);
  const result = await runProviderNativeEpisodeDurableWorkerV2R({
    store, jobId: record.jobId, workerId: 'suffix', artifactResolver: resolver,
    clock: () => RESUME_AT,
  });
  if (result.kind !== 'completed') fail(`WORKER_${result.kind.toUpperCase()}`);
  const persisted = await store.getAuthorized({
    jobId: record.jobId, tenantId: 'tenant-1', userId: 'user-1',
  });
  if (!persisted) fail('PERSISTED_JOB_MISSING');
  const durable = restoreProviderNativeEpisodeDurableStateV2R(persisted);
  const canonicalStateAfter = hashCanonicalJsonV1(projectProposalStateV2R(canonical));
  const material = {
    version: 'EDITRON_PROJECTSERVICE_PROCESS_RECOVERY_RESULT_V2R_1',
    authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION',
    processes: { preparePid: state.preparePid, resumePid: process.pid,
      separateOperatingSystemProcesses: state.preparePid !== process.pid },
    execution: { prefixProviderCalls: 2, suffixProviderCalls: counts.provider,
      prefixWriterReplays: counts.replay, suffixWriterExecutions: counts.execute,
      paidInferenceCalls: 0 },
    proposal: { canonicalStateSha256Before: state.canonicalStateSha256,
      canonicalStateSha256After: canonicalStateAfter,
      canonicalUnchanged: state.canonicalStateSha256 === canonicalStateAfter,
      recoveredWriterCount: durable.proposalRecoveryState?.operations.length,
      finalWorkingRevision: durable.proposalRecoveryState?.isolatedWorkingProjectRevision,
      proposalReceiptSha256: result.proposalReceiptSha256 },
    durable: { status: persisted.status, resumeSequence: persisted.resumeState?.sequence,
      disposition: result.durableDisposition },
    whatHasNotBeenChecked: ['LIVE_ATLAS', 'QSTASH_DELIVERY', 'AUTHENTICATED_INGRESS',
      'PAID_PROVIDER_RESUME', 'RENDERED_ACCEPTANCE'],
  };
  write(outputPath, { ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function createCloneOwner(canonical: Project, hooks: Readonly<{
  replay: boolean; onReplay?: () => void; onExecute?: () => void;
}>) {
  const mutate = (call: Readonly<{ operatorId: string }>, clone: Project,
    recorded?: Readonly<ProviderNativeToolExecutionV2R>) => {
    if (call.operatorId === 'find_audio_moment') return execution({
      result: BEAT_PLAN, evidence: { evidenceId: 'ev-audio-1' },
    });
    if (call.operatorId === 'sync_cuts_to_beats') {
      (clone.overlays[0].styles as JsonRecord).beatAligned = true;
      return recorded ?? execution({ receipt: { status: 'PASS', projectRevision: 'local-r43' },
        result: { alignedBoundaries: [119, 239, 359, 479],
          finalHitOverlayId: 'overlay-video-1', finalStrongPeakFrame: 479 } });
    }
    if (call.operatorId === 'apply_camera_shake') {
      (clone.overlays[0].styles as JsonRecord).shake = 'restrained-impact';
      return execution({ receipt: { status: 'PASS', projectRevision: 'local-r44' } });
    }
    return fail(`OPERATOR_${call.operatorId}`);
  };
  return createProviderNativeProjectServiceCloneOwnerV2R({
    projectService: { loadProjectForMutation: async () => snapshot(canonical) },
    isolatedOperatorOwner: {
      execute: async ({ call, project: clone }) => {
        hooks.onExecute?.();
        return mutate(call, clone);
      },
      ...(hooks.replay ? { replayCommitted: async ({ call, project: clone,
        recordedExecution }: { call: { operatorId: string }; project: Project;
          recordedExecution: Readonly<ProviderNativeToolExecutionV2R> }) => {
        hooks.onReplay?.();
        return mutate(call, clone, recordedExecution);
      } } : {}),
    },
  });
}

function bootstrapCheckpoint() {
  return createProviderNativeEpisodeResumeCheckpointV2R({ route: ROUTE,
    episodeId: CONTEXT.episodeId, contextSha256: hashCanonicalJsonV1(CONTEXT),
    toolSetSha256: buildOpaqueResultReferenceToolSetV2R(
      buildProviderNativeToolSetV2R(ELIGIBLE)).toolSetSha256,
    completedTurns: [{ turn: 1, marker: 'clone-scope-bootstrap-non-writer' }] });
}
function scope(checkpoint: ReturnType<typeof bootstrapCheckpoint>) {
  return { tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1', checkpoint };
}
function findResponse() { return call('find', 'find_audio_moment',
  { projectId: 'project-1', query: 'measured strong music impacts' }); }
function syncResponse() { return call('sync', 'sync_cuts_to_beats', {
  projectId: 'project-1', expectedProjectRevision: 'canonical-r7',
  overlayIds: ['overlay-video-1'], beatSyncConstraints: { maxSnapFrames: 8,
    minClipFrames: 20, maxConsecutiveBeatCuts: 4,
    protectedAudioRange: { startFrame: 0, endFrame: 90 },
    protectedBoundaryToleranceFrames: 3,
    sourceDurationFramesByAssetId: { 'asset-1': 600 }, requireSourceHandles: true },
  evidenceIds: ['ev-audio-1'], argumentReferences: [{ targetField: 'beatPlan',
    resultReferenceId: 'result_t1_1' }],
}); }
function shakeResponse(_request: Readonly<SerializedProviderNativeTurnV2R>) {
  return call('shake', 'apply_camera_shake', { projectId: 'project-1',
    effectPlan: { goal: 'Emphasize the final measured impact',
      formIntent: 'restrained-impact' }, argumentReferences: [
      { targetField: 'expectedProjectRevision', resultReferenceId: 'result_t2_1' },
      { targetField: 'overlayId', resultReferenceId: 'result_t2_2' },
      { targetField: 'targetFrame', resultReferenceId: 'result_t2_3' },
    ] });
}
function finishResponse() { return call('finish', 'finish_editron_research_episode', {
  disposition: 'READY_FOR_PROOF', reasonCodes: ['MODEL_READY_FOR_PROOF'],
  evidenceIds: [], summary: 'Ready for rendered proof.',
}); }
function call(id: string, name: string, args: JsonRecord) { return { status: 200, body: {
  id: `response-${id}`, model: ROUTE.model, status: 'completed', output: [{
    type: 'function_call', call_id: id, name, arguments: JSON.stringify(args),
  }],
} }; }
function execution(output: JsonRecord): Readonly<ProviderNativeToolExecutionV2R> {
  return { authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION', disposition: 'OK',
    output, evidenceIds: ['ev-audio-1'] };
}
function project(): Project { return { projectId: 'project-1', userId: 'user-1',
  name: 'Project', overlays: [{ id: 'overlay-video-1', type: 'video', startFrame: 0,
    endFrame: 600, styles: { opacity: 1 } } as unknown as Project['overlays'][number]],
  aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 }, fps: 30,
  durationInFrames: 600, createdAt: new Date('2026-08-23T17:00:00.000Z'),
  updatedAt: new Date('2026-08-23T17:30:00.000Z'), projectRevision: 7,
  visibility: 'private' }; }
function snapshot(value: Project): { project: Project; revision: ProjectRevisionV1 } {
  return { project: structuredClone(value), revision: { schemaVersion: 1,
    value: 7, compatibilityUpdatedAt: '2026-08-23T17:30:00.000Z' } };
}
function reviveProject(value: JsonRecord): Project {
  const result = structuredClone(value) as unknown as Project;
  result.createdAt = new Date(result.createdAt); result.updatedAt = new Date(result.updatedAt);
  return result; }
function reviveJob(value: JsonRecord): DurableWorkflowJobRecordV1 { const result = structuredClone(value);
  for (const field of ['leaseExpiresAt', 'nextAttemptAt', 'cancelRequestedAt', 'createdAt',
    'updatedAt', 'expiresAt'] as const) if (typeof result[field] === 'string') result[field] = new Date(result[field]);
  const resume = result.resumeState as JsonRecord | null;
  if (resume && typeof resume.committedAt === 'string') resume.committedAt = new Date(resume.committedAt);
  return result as unknown as DurableWorkflowJobRecordV1; }
function verifyStoredState(state: StoredState) { const material = { ...state } as JsonRecord;
  delete material.envelopeSha256; if (state.envelopeSha256 !== hashCanonicalJsonV1(material)) fail('STATE_INVALID'); }
function json(value: unknown): JsonRecord { return JSON.parse(JSON.stringify(value)) as JsonRecord; }
function read(path: string): JsonRecord { return JSON.parse(readFileSync(path, 'utf8')) as JsonRecord; }
function write(path: string, value: unknown) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function fail(code: string): never { throw new Error(`PROJECTSERVICE_PROCESS_${code}`); }

void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1; });
