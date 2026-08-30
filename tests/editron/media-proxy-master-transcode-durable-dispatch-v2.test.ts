import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  dispatchMediaProxyMasterTranscodeDurableJobV2,
  recoverMediaProxyMasterTranscodeDurableJobsV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-dispatch-v2';
import type { MediaProxyMasterTranscodeQStashPublisherV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-dispatch-v1';
import { createMediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-registry-v1';
import { createMediaProxyMasterTranscodeRetryPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-v1';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T21:00:00.000Z');
const ENV = {
  QSTASH_TOKEN: 'test-qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'test-current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'test-next-signing-key',
  VERCEL_URL: 'editron-preview.example.test',
};
type PublishInputV2 = Parameters<
  MediaProxyMasterTranscodeQStashPublisherV1['publishJSON']
>[0];
type PublishResultV2 = ReturnType<
  MediaProxyMasterTranscodeQStashPublisherV1['publishJSON']
>;

describe('MediaProxyMasterTranscodeDurableDispatchV2', () => {
  it('fails before V2 job creation when signed delivery is incomplete', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const createOrGet = vi.fn();
    await expect(dispatchMediaProxyMasterTranscodeDurableJobV2({
      request: jobRequest(fixture),
      jobStore: { createOrGet, recordDispatch: vi.fn() },
      policyRegistry: policyRegistry(fixture),
      env: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
      publisher: { publishJSON: vi.fn() },
    })).rejects.toThrow('DISPATCH_V2_MISSING_QSTASH_SIGNING_KEYS');
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it('publishes jobId only, records V2 delivery, and deduplicates replay', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const setup = jobStore();
    const publishJSON = vi.fn<[PublishInputV2], PublishResultV2>(
      async () => ({ messageId: 'message-v2' }),
    );
    const first = await dispatchMediaProxyMasterTranscodeDurableJobV2({
      request: jobRequest(fixture),
      jobStore: setup.store,
      policyRegistry: policyRegistry(fixture),
      env: ENV,
      publisher: { publishJSON },
      now: START,
    });
    expect(first).toMatchObject({
      state: 'dispatched', created: true, messageId: 'message-v2',
    });
    expect(publishJSON.mock.calls[0]?.[0]).toMatchObject({
      body: { jobId: first.jobId },
      url: 'https://editron-preview.example.test/api/internal/workers/media-proxy-master-transcode',
    });
    await expect(setup.store.getForWorkerExecution({
      jobId: first.jobId,
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_proxy_master_trusted_transcode',
      inputSchemaId:
        'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V2',
    })).resolves.toMatchObject({ dispatchMessageId: 'message-v2' });

    await expect(dispatchMediaProxyMasterTranscodeDurableJobV2({
      request: jobRequest(fixture),
      jobStore: setup.store,
      policyRegistry: policyRegistry(fixture),
      env: ENV,
      publisher: { publishJSON },
      now: START,
    })).resolves.toMatchObject({ state: 'already_dispatched' });
    expect(publishJSON).toHaveBeenCalledOnce();
  });

  it('recovers only stale V2 jobs and excludes V1-shaped candidates', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const setup = jobStore();
    const created = await setup.store.createOrGet({
      ...createInput(fixture),
    }, START);
    const v1Shaped = {
      ...created.job,
      jobId: 'dwj_v1_shaped_candidate',
      input: {
        ...created.job.input,
        schemaId:
          'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V1_1',
      },
    };
    const publishJSON = vi.fn(async () => ({ messageId: 'recovered-v2' }));
    const result = await recoverMediaProxyMasterTranscodeDurableJobsV2({
      jobStore: {
        listRecoverable: vi.fn(async () => [created.job, v1Shaped]),
        recordDispatch: setup.store.recordDispatch.bind(setup.store),
      },
      staleBefore: new Date(START.getTime() + 1),
      now: new Date(START.getTime() + 2),
      policyRegistry: policyRegistry(fixture),
      env: ENV,
      publisher: { publishJSON },
    });
    expect(result).toMatchObject({ scanned: 2, eligible: 1, skipped: 1 });
    expect(result.results).toEqual([{
      state: 'dispatched',
      jobId: created.job.jobId,
      messageId: 'recovered-v2',
    }]);
  });

  it('rejects active operational-policy substitution before admission', async () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const createOrGet = vi.fn();
    const current = fixture.base.operationalPolicies;
    const foreignRetry = createMediaProxyMasterTranscodeRetryPolicyV1({
      durableJob: current.retry.durableJob,
      qstashDelivery: {
        ...current.retry.qstashDelivery,
        retryDelayMs: current.retry.qstashDelivery.retryDelayMs + 1,
      },
      workerRetry: current.retry.workerRetry,
    });
    const foreignRegistry =
      createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
        activeRetryPolicy: foreignRetry,
        activeHeartbeatPolicy: current.heartbeat,
        retainedRetryPolicies: [],
        retainedHeartbeatPolicies: [],
      });
    await expect(dispatchMediaProxyMasterTranscodeDurableJobV2({
      request: jobRequest(fixture),
      jobStore: { createOrGet, recordDispatch: vi.fn() },
      policyRegistry: foreignRegistry,
      env: ENV,
      publisher: { publishJSON: vi.fn() },
    })).rejects.toThrow('OPERATIONAL_POLICY_BINDING_MISMATCH');
    expect(createOrGet).not.toHaveBeenCalled();
  });
});

function jobRequest(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  const {
    version: _version,
    commandSha256: _commandSha256,
    ...request
  } = fixture.contract.payload;
  return request;
}

function createInput(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  const contract = fixture.contract;
  return {
    tenantId: contract.payload.tenantId,
    userId: contract.payload.userId,
    orgId: contract.payload.orgId,
    projectId: null,
    operationOwner: 'MEDIA_ASSETS',
    operationKind: 'media_proxy_master_trusted_transcode',
    operationId: contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: contract.payload.version,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: contract.payload.budgetReservation,
    maxAttempts: contract.payload.runtimePolicy.lifecycle.maxAttempts,
    expiresAt: new Date(
      START.getTime() + contract.payload.runtimePolicy.lifecycle.retentionMs,
    ),
  };
}

function policyRegistry(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  return createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
    activeRetryPolicy: fixture.base.operationalPolicies.retry,
    activeHeartbeatPolicy: fixture.base.operationalPolicies.heartbeat,
    retainedRetryPolicies: [],
    retainedHeartbeatPolicies: [],
  });
}

function jobStore() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    store: new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    ),
  };
}
