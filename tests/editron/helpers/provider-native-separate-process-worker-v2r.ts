import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

import {
  buildProviderNativeEpisodeDurableJobInputV2R,
  persistProviderNativeEpisodeCheckpointV2R,
} from '../../../lib/editron/research/open-ended-planner/provider-native-episode-durable-job-v2r';
import { runProviderNativeEpisodeDurableWorkerV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-episode-durable-worker-v2r';
import { createProviderNativeDurableOwnerArtifactResolverV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-episode-owner-artifact-resolver-v2r';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-episode-resume-v2r';
import { runProviderNativeToolEpisodeV2R }
  from '../../../lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { hashCanonicalJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/contracts-v1';
import { buildStage25ProviderDependencyCohortManifestV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-v1';
import { Stage25ProviderDependencyOwnerV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-provider-dependency-owner-v1';
import type { Stage25ProviderDependencyReplaySourceV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-provider-dependency-resume-replay-v1';
import type { DurableWorkflowJobRecordV1 }
  from '../../../lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '../../../lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './stateful-mongo-collection';

type JsonRecord = Record<string, unknown>;
type Fixture = Readonly<{
  source: Stage25ProviderDependencyReplaySourceV1;
  rawResponsesJsonSha256: string;
  rawResponsesDeflateRawBase64: string;
}>;
type ProcessState = Readonly<{
  version: 'EDITRON_PROVIDER_NATIVE_SEPARATE_PROCESS_STATE_V2R_1';
  authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION';
  preparePid: number;
  fixtureSourceSha256: string;
  jobRecord: JsonRecord;
  ownerSnapshot: JsonRecord;
  envelopeSha256: string;
}>;

const START = new Date('2026-08-23T15:00:00.000Z');
const RESUME_AT = new Date(START.getTime() + 5 * 60 * 1000 + 1);

async function main(): Promise<void> {
  const [mode, statePath, resultPath] = process.argv.slice(2);
  if (!statePath || !['prepare', 'resume'].includes(mode)) fail('ARGUMENTS_INVALID');
  if (mode === 'prepare') await prepare(statePath);
  else if (resultPath) await resume(statePath, resultPath);
  else fail('RESULT_PATH_REQUIRED');
}

async function prepare(outputPath: string): Promise<void> {
  const { fixture, responses, manifest, route, presentation } = loadBoundFixture();
  const owner = new Stage25ProviderDependencyOwnerV1();
  let calls = 0;
  let checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null = null;
  try {
    await runProviderNativeToolEpisodeV2R({
      route, context: manifest.context,
      eligibleOperatorIds: presentation.operatorOrder,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke: async (request) => {
        const index = calls++;
        equal(request.requestHash, fixture.source.requestHashes[index], 'PREFIX_REQUEST');
        return { status: 200, body: responses[index] };
      },
      executeIsolated: (call) => owner.execute(call),
      onTurnCommitted: ({ checkpoint: next }) => {
        if (next.nextTurn !== fixture.source.prefixTurnCount + 1) return;
        checkpoint = next;
        throw new Error('EXPECTED_PROCESS_BOUNDARY');
      },
    });
    fail('PREFIX_DID_NOT_INTERRUPT');
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'EXPECTED_PROCESS_BOUNDARY') throw error;
  }
  const boundCheckpoint = requireCheckpoint(checkpoint);
  if (calls !== fixture.source.prefixTurnCount) fail('PREFIX_CALL_COUNT_INVALID');
  const ownerSnapshot = owner.snapshot() as JsonRecord;
  equal(text(ownerSnapshot.currentProjectRevision), 'R43', 'PREFIX_REVISION');

  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  const created = await store.createOrGet(buildProviderNativeEpisodeDurableJobInputV2R({
    tenantId: 'tenant-stage25', userId: 'user-stage25', orgId: 'org-stage25',
    projectId: 'project-42', parentCommandId: null, parentReceiptId: null,
    idempotencyKey: boundCheckpoint.episodeId,
    identity: {
      route: boundCheckpoint.route, episodeId: boundCheckpoint.episodeId,
      contextSha256: boundCheckpoint.contextSha256,
      toolSetSha256: boundCheckpoint.toolSetSha256,
    },
    maxAttempts: 3,
  }), START);
  const claim = await store.claim({
    jobId: created.job.jobId, workerId: 'separate-process-prefix', now: START,
  });
  if (claim.kind !== 'claimed') fail('PREFIX_JOB_CLAIM_FAILED');
  await persistProviderNativeEpisodeCheckpointV2R({
    store, jobId: created.job.jobId, tenantId: 'tenant-stage25',
    userId: 'user-stage25', leaseToken: claim.leaseToken,
    expectedSequence: 0, checkpoint: boundCheckpoint,
    now: new Date(START.getTime() + 1),
  });
  const jobRecord = jsonRecord(collection.snapshot()[0]);
  const material = {
    version: 'EDITRON_PROVIDER_NATIVE_SEPARATE_PROCESS_STATE_V2R_1' as const,
    authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION' as const,
    preparePid: process.pid,
    fixtureSourceSha256: hashCanonicalJsonV1(fixture.source),
    jobRecord, ownerSnapshot,
  };
  writeJson(outputPath, { ...material, envelopeSha256: hashCanonicalJsonV1(material) });
}

async function resume(inputPath: string, outputPath: string): Promise<void> {
  const state = readJson(inputPath) as unknown as ProcessState;
  verifyState(state);
  const { fixture, responses, manifest, route, presentation } = loadBoundFixture();
  equal(state.fixtureSourceSha256, hashCanonicalJsonV1(fixture.source), 'FIXTURE_SOURCE');
  const record = reviveJobRecord(state.jobRecord);
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>([record]);
  const store = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
  const owner = Stage25ProviderDependencyOwnerV1.restore(state.ownerSnapshot);
  let suffixCalls = 0;
  const resolver = createProviderNativeDurableOwnerArtifactResolverV2R({
    episodeDefinition: { resolve: async () => ({
      context: manifest.context, eligibleOperatorIds: presentation.operatorOrder,
    }) },
    projectClone: { resolve: async () => ({
      currentRevision: {
        origin: 'PROJECTSERVICE_CURRENT_REVISION_READ',
        projectRevision: text(state.ownerSnapshot.currentProjectRevision),
        readReceiptId: 'stage25-separate-process-revision-read',
        readReceiptSha256: hashCanonicalJsonV1({
          projectId: 'project-42', revision: state.ownerSnapshot.currentProjectRevision,
          snapshotSha256: state.ownerSnapshot.snapshotSha256,
        }),
      },
      isolatedClone: {
        origin: 'PROJECTSERVICE_REVISION_CLONE',
        projectRevision: text(state.ownerSnapshot.currentProjectRevision),
        stateSha256: text(state.ownerSnapshot.afterStateHash),
        executeIsolated: (call) => owner.execute(call),
      },
    }) },
    transport: { resolve: async (input) => {
      equal(input.route.routeId, route.routeId, 'ROUTE');
      return async () => {
        const index = fixture.source.prefixTurnCount + suffixCalls++;
        if (index >= responses.length) fail('SUFFIX_INVOKE_OVERFLOW');
        return { status: 200, body: responses[index] };
      };
    } },
  });
  const result = await runProviderNativeEpisodeDurableWorkerV2R({
    store, jobId: record.jobId, workerId: 'separate-process-suffix',
    artifactResolver: resolver, clock: () => RESUME_AT,
  });
  if (result.kind !== 'completed') fail(`WORKER_NOT_COMPLETED:${result.kind}`);
  if (suffixCalls !== responses.length - fixture.source.prefixTurnCount) {
    fail('SUFFIX_CALL_COUNT_INVALID');
  }
  const finalOwner = owner.snapshot();
  equal(text(finalOwner.afterStateHash), fixture.source.ownerAfterStateSha256, 'FINAL_STATE');
  equal(text(finalOwner.currentProjectRevision), fixture.source.ownerFinalProjectRevision,
    'FINAL_REVISION');
  const persisted = await store.getAuthorized({
    jobId: record.jobId, tenantId: 'tenant-stage25', userId: 'user-stage25',
  });
  const material = {
    version: 'EDITRON_PROVIDER_NATIVE_SEPARATE_PROCESS_RESULT_V2R_1',
    authority: 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION',
    processes: { preparePid: state.preparePid, resumePid: process.pid,
      separateOperatingSystemProcesses: state.preparePid !== process.pid },
    replay: {
      prefixProviderCalls: fixture.source.prefixTurnCount,
      suffixCapturedResponseCalls: suffixCalls,
      paidInferenceCalls: 0,
      prefixMutationsReplayed: false,
      finalProjectRevision: finalOwner.currentProjectRevision,
      finalOwnerStateSha256: finalOwner.afterStateHash,
    },
    durable: {
      workerResultKind: result.kind,
      disposition: result.durableDisposition,
      episodeReceiptSha256: result.episodeReceipt.receiptSha256,
      resumedReceiptSha256: result.resumedReceiptSha256,
      persistedStatus: persisted?.status,
      persistedResumeSequence: persisted?.resumeState?.sequence,
    },
    whatHasNotBeenChecked: [
      'LIVE_ATLAS', 'QSTASH_DELIVERY', 'AUTHENTICATED_INGRESS',
      'REAL_PROJECTSERVICE_CLONE', 'PAID_PROVIDER_RESUME', 'RENDERED_ACCEPTANCE',
    ],
    stateEffects: [],
  };
  writeJson(outputPath, { ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function loadBoundFixture() {
  const fixture = readJson(path.join(process.cwd(), 'tests/fixtures/editron/',
    'provider-native-luna-p1-v3r3-raw-responses.json')) as unknown as Fixture;
  const payload = inflateRawSync(Buffer.from(
    fixture.rawResponsesDeflateRawBase64, 'base64',
  )).toString('utf8');
  equal(createHash('sha256').update(payload).digest('hex'),
    fixture.rawResponsesJsonSha256, 'RAW_RESPONSES');
  const responses = JSON.parse(payload) as unknown[];
  responses.forEach((value, index) => equal(hashCanonicalJsonV1(value),
    fixture.source.rawResponseSha256s[index], `RAW_RESPONSE_${index + 1}`));
  const manifest = buildStage25ProviderDependencyCohortManifestV1({
    sourceCommit: fixture.source.sourceCommit,
    evaluatorSourceSha256: fixture.source.evaluatorSourceSha256,
  });
  equal(manifest.manifestSha256, fixture.source.manifestSha256, 'MANIFEST');
  const route = manifest.routes.find((entry) =>
    entry.route.routeId === fixture.source.routeId)?.route ?? fail('ROUTE_NOT_FOUND');
  const presentation = manifest.presentations.find((entry) =>
    entry.ordinal === fixture.source.presentationOrdinal) ?? fail('PRESENTATION_NOT_FOUND');
  return { fixture, responses, manifest, route, presentation };
}

function verifyState(state: ProcessState): void {
  const material = { ...state } as JsonRecord;
  delete material.envelopeSha256;
  if (state.version !== 'EDITRON_PROVIDER_NATIVE_SEPARATE_PROCESS_STATE_V2R_1'
    || state.authority !== 'RESEARCH_ONLY_ZERO_INFERENCE_NO_PROJECT_MUTATION'
    || state.envelopeSha256 !== hashCanonicalJsonV1(material)) fail('STATE_INVALID');
}
function reviveJobRecord(value: JsonRecord): DurableWorkflowJobRecordV1 {
  const record = structuredClone(value);
  for (const field of ['leaseExpiresAt', 'nextAttemptAt', 'cancelRequestedAt',
    'createdAt', 'updatedAt', 'expiresAt'] as const) {
    if (typeof record[field] === 'string') record[field] = new Date(record[field]);
  }
  const resumeState = record.resumeState as JsonRecord | null;
  if (resumeState && typeof resumeState.committedAt === 'string') {
    resumeState.committedAt = new Date(resumeState.committedAt);
  }
  return record as unknown as DurableWorkflowJobRecordV1;
}
function requireCheckpoint(value: unknown): Readonly<ProviderNativeEpisodeResumeCheckpointV2R> {
  return value && typeof value === 'object'
    ? value as Readonly<ProviderNativeEpisodeResumeCheckpointV2R>
    : fail('CHECKPOINT_MISSING');
}
function jsonRecord(value: unknown): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}
function readJson(filePath: string): JsonRecord {
  return JSON.parse(readFileSync(filePath, 'utf8')) as JsonRecord;
}
function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function equal(actual: string, expected: string, code: string): void {
  if (actual !== expected) fail(`${code}_MISMATCH`);
}
function fail(code: string): never {
  throw new Error(`PROVIDER_NATIVE_SEPARATE_PROCESS_${code}`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
