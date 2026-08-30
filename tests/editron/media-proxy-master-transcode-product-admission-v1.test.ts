import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import type { MediaProxyMasterTranscodeQStashPublisherV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-dispatch-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v1';
import { createMediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-registry-v1';
import { createMediaProxyMasterTranscodeRetryPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-v1';
import { admitMediaProxyMasterTranscodeProductV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-product-admission-v1';
import { StatefulMongoCollection }
  from './helpers/stateful-mongo-collection';
import {
  buildMediaProxyMasterTranscodeBudgetFixtureV1,
} from './helpers/media-proxy-master-transcode-budget-fixture';

const NOW = new Date('2026-08-30T00:10:00.000Z');
type PublishInputV1 = Parameters<
  MediaProxyMasterTranscodeQStashPublisherV1['publishJSON']
>[0];
type PublishResultV1 = ReturnType<
  MediaProxyMasterTranscodeQStashPublisherV1['publishJSON']
>;

describe('media proxy/master transcode product admission V1', () => {
  it('reserves, persists and dispatches once across exact replay', async () => {
    const setup = setupAdmission();
    const publishJSON = vi.fn<[PublishInputV1], PublishResultV1>(
      async () => ({ messageId: 'proxy-message-1' }),
    );

    const first = await admitMediaProxyMasterTranscodeProductV1(
      admissionRequest(setup.budget),
      dependencies(setup, { publishJSON }),
    );
    expect(first).toMatchObject({
      disposition: 'SCHEDULED',
      created: true,
      delivery: 'CONFIRMED',
      messageId: 'proxy-message-1',
    });
    const second = await admitMediaProxyMasterTranscodeProductV1(
      admissionRequest(setup.budget),
      dependencies(setup, { publishJSON }),
    );
    expect(second).toMatchObject({
      disposition: 'SCHEDULED',
      jobId: first.jobId,
      reservationId: first.reservationId,
      created: false,
      delivery: 'ALREADY_CONFIRMED',
      messageId: 'proxy-message-1',
    });
    expect(publishJSON).toHaveBeenCalledOnce();
    expect(setup.finance.records.size).toBe(1);
    await expect(setup.jobStore.getAuthorized({
      jobId: first.jobId,
      tenantId: 'tenant-a',
      userId: 'user-a',
    })).resolves.toMatchObject({
      status: 'queued',
      dispatchMessageId: 'proxy-message-1',
      input: {
        payload: {
          commandSha256: setup.budget.command.commandSha256,
          publicationPolicy: setup.budget.publicationPolicy,
          runtimePolicy: setup.budget.runtimePolicy,
        },
      },
    });
  });

  it('rejects authorization scope drift before reservation or job creation', async () => {
    const setup = setupAdmission();
    const publishJSON = vi.fn();
    await expect(admitMediaProxyMasterTranscodeProductV1({
      ...admissionRequest(setup.budget),
      tenantId: 'tenant-b',
    }, dependencies(setup, { publishJSON }))).rejects.toThrow(
      'MEDIA_PROXY_MASTER_TRANSCODE_ADMISSION_FINANCE_AUTHORIZATION_SCOPE_MISMATCH',
    );
    expect(setup.finance.records.size).toBe(0);
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('requires active operational policy rather than a retained policy', async () => {
    const setup = setupAdmission();
    const replacement = createMediaProxyMasterTranscodeRetryPolicyV1({
      durableJob: setup.budget.operationalPolicies.retry.durableJob,
      qstashDelivery: setup.budget.operationalPolicies.retry.qstashDelivery,
      workerRetry: {
        ...setup.budget.operationalPolicies.retry.workerRetry,
        baseDelayMs: 2_000,
      },
    });
    const policyRegistry =
      createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
        activeRetryPolicy: replacement,
        activeHeartbeatPolicy: setup.budget.operationalPolicies.heartbeat,
        retainedRetryPolicies: [setup.budget.operationalPolicies.retry],
        retainedHeartbeatPolicies: [],
      });

    await expect(admitMediaProxyMasterTranscodeProductV1(
      admissionRequest(setup.budget),
      { ...dependencies(setup), policyRegistry },
    )).rejects.toThrow(
      'MEDIA_PROXY_MASTER_TRANSCODE_ADMISSION_OPERATIONAL_POLICY_NOT_ACTIVE',
    );
    expect(setup.finance.policyResolve).not.toHaveBeenCalled();
    expect(setup.finance.records.size).toBe(0);
  });

  it('fails before Finance when the deployment registry is absent', async () => {
    const setup = setupAdmission();
    await expect(admitMediaProxyMasterTranscodeProductV1(
      admissionRequest(setup.budget),
      {
        environment: deliveryEnvironment(),
        jobStore: setup.jobStore,
        finance: setup.finance,
        createPrivateRuntime: () => privateRuntime(setup.budget),
        clock: () => NOW,
      },
    )).rejects.toThrow(
      'MEDIA_PROXY_MASTER_TRANSCODE_ADMISSION_OPERATIONAL_POLICY_MISSING_REGISTRY',
    );
    expect(setup.finance.policyResolve).not.toHaveBeenCalled();
  });

  it('keeps a persisted job recoverable when dispatch configuration is absent', async () => {
    const setup = setupAdmission();
    const result = await admitMediaProxyMasterTranscodeProductV1(
      admissionRequest(setup.budget),
      {
        ...dependencies(setup),
        environment: {},
      },
    );
    expect(result).toMatchObject({
      disposition: 'DELIVERY_DEFERRED',
      created: true,
      reason: 'DISPATCH_CONFIGURATION_UNAVAILABLE',
    });
    await expect(setup.jobStore.getAuthorized({
      jobId: result.jobId,
      tenantId: 'tenant-a',
      userId: 'user-a',
    })).resolves.toMatchObject({
      status: 'queued',
      dispatchMessageId: null,
    });
    expect(setup.finance.records.has(result.reservationId)).toBe(true);
  });
});

function setupAdmission() {
  const budget = buildMediaProxyMasterTranscodeBudgetFixtureV1();
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    budget,
    jobStore: new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    ),
    finance: finance(budget),
    policyRegistry:
      createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
        activeRetryPolicy: budget.operationalPolicies.retry,
        activeHeartbeatPolicy: budget.operationalPolicies.heartbeat,
        retainedRetryPolicies: [],
        retainedHeartbeatPolicies: [],
      }),
  };
}

function dependencies(
  setup: ReturnType<typeof setupAdmission>,
  publisher?: Readonly<MediaProxyMasterTranscodeQStashPublisherV1>,
) {
  return {
    environment: deliveryEnvironment(),
    jobStore: setup.jobStore,
    finance: setup.finance,
    policyRegistry: setup.policyRegistry,
    createPrivateRuntime: () => privateRuntime(setup.budget),
    ...(publisher ? { publisher } : {}),
    clock: () => NOW,
  };
}

function deliveryEnvironment() {
  return {
    QSTASH_TOKEN: 'qstash-token',
    QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
    QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
    VERCEL_URL: 'editron.example.test',
  };
}

function privateRuntime(
  budget: ReturnType<typeof buildMediaProxyMasterTranscodeBudgetFixtureV1>,
) {
  return {
    proxyMasterTranscodePublication: {
      publicationPolicy: budget.publicationPolicy,
    },
  };
}

function admissionRequest(
  budget: ReturnType<typeof buildMediaProxyMasterTranscodeBudgetFixtureV1>,
) {
  return {
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command: budget.command,
    runtimePolicy: budget.runtimePolicy,
    authorization: budget.authorization,
  };
}

function finance(
  budget: ReturnType<typeof buildMediaProxyMasterTranscodeBudgetFixtureV1>,
) {
  const records = new Map<
    string,
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  >();
  const transaction = {
    get: async (id: string) => records.get(id) ?? null,
    insert: async (
      record: MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
    ) => {
      if (records.has(record.reservationId)) throw new Error('DUPLICATE');
      records.set(record.reservationId, record);
    },
    replace: async () => {
      throw new Error('SETTLEMENT_NOT_EXPECTED');
    },
  };
  const policyResolve = vi.fn(async () => budget.policy);
  const policyLocator = { resolve: policyResolve };
  const ledgerOwner =
    createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1({
      ledger: {
        transact: async <T>(
          operation: (value: typeof transaction) => Promise<T>,
        ) => operation(transaction),
        get: async (id) => records.get(id) ?? null,
      },
      policyLocator,
      now: () => NOW.toISOString(),
    });
  return { policyLocator, ledgerOwner, policyResolve, records };
}
