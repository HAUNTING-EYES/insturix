import { readFileSync, writeFileSync } from 'node:fs';

import { hashEditronCanonicalJsonV1 }
  from '../../../lib/editron/services/canonical-json-v1';
import { resolveEditorialPlanDurableJobV1 }
  from '../../../lib/editron/services/editorial-plan-durable-job-resolver-v1';
import type {
  EditorialPlanExecutionDefinitionRecordV1,
  EditorialPlanRevisionRecordV1,
} from '../../../lib/editron/services/editorial-plan-store-v1';
import type { DurableWorkflowJobRecordV1 }
  from '../../../lib/editron/services/durable-workflow-job-v1';
import {
  createEditorialPlanDurableFixtureStoresV1,
  createPreparedEditorialPlanDurableFixtureV1,
  EDITORIAL_PLAN_FIXTURE_RECLAIM_V1,
  EDITORIAL_PLAN_FIXTURE_START_V1,
} from './editorial-plan-durable-fixture-v1';

type JsonRecord = Record<string, unknown>;
type ProcessState = Readonly<{
  version: 'EDITRON_EDITORIAL_PLAN_SEPARATE_PROCESS_STATE_V1_1';
  authority: 'ZERO_INFERENCE_NO_PROJECT_MUTATION';
  preparePid: number;
  records: Readonly<{
    plans: readonly JsonRecord[];
    definitions: readonly JsonRecord[];
    jobs: readonly JsonRecord[];
  }>;
  identity: Readonly<{
    jobId: string;
    activePlanRevisionSha256: string;
    definitionId: string;
    firstLeaseToken: string;
  }>;
  envelopeSha256: string;
}>;

async function main(): Promise<void> {
  const [mode, statePath, resultPath] = process.argv.slice(2);
  if (!statePath || !['prepare', 'resume'].includes(mode)) fail('ARGUMENTS_INVALID');
  if (mode === 'prepare') await prepare(statePath);
  else if (resultPath) await resume(statePath, resultPath);
  else fail('RESULT_PATH_REQUIRED');
}

async function prepare(outputPath: string): Promise<void> {
  const setup = await createPreparedEditorialPlanDurableFixtureV1();
  const claim = await setup.jobStore.claim({
    jobId: setup.jobId, workerId: 'product-process-a',
    now: EDITORIAL_PLAN_FIXTURE_START_V1,
  });
  if (claim.kind !== 'claimed') fail('PREPARE_CLAIM_FAILED');
  const material = {
    version: 'EDITRON_EDITORIAL_PLAN_SEPARATE_PROCESS_STATE_V1_1' as const,
    authority: 'ZERO_INFERENCE_NO_PROJECT_MUTATION' as const,
    preparePid: process.pid,
    records: {
      plans: jsonRecords(setup.plans.snapshot()),
      definitions: jsonRecords(setup.definitions.snapshot()),
      jobs: jsonRecords(setup.jobs.snapshot()),
    },
    identity: {
      jobId: setup.jobId,
      activePlanRevisionSha256: setup.active.revisionSha256,
      definitionId: setup.definition.definitionId,
      firstLeaseToken: claim.leaseToken,
    },
  };
  writeJson(outputPath, { ...material, envelopeSha256: hashEditronCanonicalJsonV1(material) });
}

async function resume(inputPath: string, outputPath: string): Promise<void> {
  const state = readJson(inputPath) as unknown as ProcessState;
  verifyState(state);
  const stores = createEditorialPlanDurableFixtureStoresV1({
    plans: state.records.plans.map(revivePlanRecord),
    definitions: state.records.definitions.map(reviveDefinitionRecord),
    jobs: state.records.jobs.map(reviveJobRecord),
  });
  const jobStore = stores.jobStoreFactory();
  const reclaimed = await jobStore.claim({
    jobId: state.identity.jobId, workerId: 'product-process-b',
    now: EDITORIAL_PLAN_FIXTURE_RECLAIM_V1,
  });
  if (reclaimed.kind !== 'claimed') {
    const disposition = reclaimed.kind === 'skipped' ? reclaimed.reason : reclaimed.kind;
    fail(`RECLAIM_${disposition.toUpperCase()}`);
  }
  let oldLeaseRejected = false;
  try {
    await jobStore.heartbeat({
      jobId: state.identity.jobId,
      leaseToken: state.identity.firstLeaseToken,
      now: EDITORIAL_PLAN_FIXTURE_RECLAIM_V1,
    });
  } catch (error) {
    oldLeaseRejected = error instanceof Error
      && error.message === 'DURABLE_JOB_LEASE_LOST';
  }
  if (!oldLeaseRejected) fail('OLD_LEASE_ACCEPTED');
  const resolved = await resolveEditorialPlanDurableJobV1({
    planStore: stores.planStore(), job: reclaimed.job,
  });
  const duplicate = await jobStore.claim({
    jobId: state.identity.jobId, workerId: 'duplicate-delivery',
    now: EDITORIAL_PLAN_FIXTURE_RECLAIM_V1,
  });
  if (duplicate.kind !== 'skipped' || duplicate.reason !== 'lease_held') {
    fail('DUPLICATE_DELIVERY_NOT_SUPPRESSED');
  }
  const material = {
    version: 'EDITRON_EDITORIAL_PLAN_SEPARATE_PROCESS_RESULT_V1_1',
    authority: 'ZERO_INFERENCE_NO_PROJECT_MUTATION',
    processes: {
      preparePid: state.preparePid, resumePid: process.pid,
      separateOperatingSystemProcesses: state.preparePid !== process.pid,
    },
    recovery: {
      jobId: state.identity.jobId,
      attemptCount: reclaimed.job.attemptCount,
      planRevisionSha256: resolved.plan.revisionSha256,
      nodeId: resolved.node.nodeId,
      definitionId: resolved.definition.definitionId,
      oldLeaseRejected,
      duplicateDeliveryDisposition: duplicate.reason,
    },
    providerInferenceCalls: 0,
    projectServiceReads: 0,
    stateEffects: [],
    whatHasNotBeenChecked: [
      'LIVE_ATLAS', 'QSTASH_DELIVERY', 'AUTHENTICATED_INGRESS',
      'PROJECTSERVICE_CLONE_OR_MUTATION', 'PROVIDER_INFERENCE',
    ],
  };
  writeJson(outputPath, { ...material, receiptSha256: hashEditronCanonicalJsonV1(material) });
}

function verifyState(state: ProcessState): void {
  const material = { ...state } as JsonRecord;
  delete material.envelopeSha256;
  if (state.version !== 'EDITRON_EDITORIAL_PLAN_SEPARATE_PROCESS_STATE_V1_1'
    || state.authority !== 'ZERO_INFERENCE_NO_PROJECT_MUTATION'
    || state.preparePid === process.pid
    || state.envelopeSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('STATE_INVALID');
  }
}

function revivePlanRecord(value: JsonRecord): EditorialPlanRevisionRecordV1 {
  return reviveStoredAt(value) as unknown as EditorialPlanRevisionRecordV1;
}
function reviveDefinitionRecord(value: JsonRecord): EditorialPlanExecutionDefinitionRecordV1 {
  return reviveStoredAt(value) as unknown as EditorialPlanExecutionDefinitionRecordV1;
}
function reviveStoredAt(value: JsonRecord): JsonRecord {
  const record = structuredClone(value);
  if (typeof record.storedAt === 'string') record.storedAt = new Date(record.storedAt);
  return record;
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
function jsonRecords(values: readonly unknown[]): JsonRecord[] {
  return JSON.parse(JSON.stringify(values)) as JsonRecord[];
}
function readJson(filePath: string): JsonRecord {
  return JSON.parse(readFileSync(filePath, 'utf8')) as JsonRecord;
}
function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function fail(code: string): never {
  throw new Error(`EDITORIAL_PLAN_SEPARATE_PROCESS_${code}`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
