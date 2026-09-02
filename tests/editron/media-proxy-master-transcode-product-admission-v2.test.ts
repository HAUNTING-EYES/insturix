import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { createMediaProxyMasterR2ProductPublicationPoliciesV2 }
  from '@/lib/editron/services/media-proxy-master-r2-product-publication-policy-v2';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import type { MediaProxyMasterTranscodeQStashPublisherV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-dispatch-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v2';
import { createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-reservation-v2';
import { createMediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-registry-v1';
import { createMediaProxyMasterTranscodeRetryPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-v1';
import { admitMediaProxyMasterTranscodeProductV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-product-admission-v2';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';
import { StatefulMongoCollection }
  from './helpers/stateful-mongo-collection';

const NOW = new Date('2026-08-30T00:10:00.000Z');
type FixtureV2 = ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>;
type PublishInputV2 = Parameters<
  MediaProxyMasterTranscodeQStashPublisherV1['publishJSON']
>[0];
type PublishResultV2 = ReturnType<
  MediaProxyMasterTranscodeQStashPublisherV1['publishJSON']
>;

describe('media proxy/master transcode product admission V2', () => {
  it('reserves, persists and dispatches V2 exactly once across replay', async () => {
    const setup = setupAdmission();
    const publishJSON = vi.fn<[PublishInputV2], PublishResultV2>(
      async () => ({ messageId: 'proxy-v2-message-1' }),
    );

    const first = await admitMediaProxyMasterTranscodeProductV2(
      admissionRequest(setup),
      dependencies(setup, { publishJSON }),
    );
    expect(first).toMatchObject({
      disposition: 'SCHEDULED',
      created: true,
      delivery: 'CONFIRMED',
      messageId: 'proxy-v2-message-1',
    });
    const second = await admitMediaProxyMasterTranscodeProductV2(
      admissionRequest(setup),
      dependencies(setup, { publishJSON }),
    );
    expect(second).toMatchObject({
      disposition: 'SCHEDULED',
      jobId: first.jobId,
      reservationId: first.reservationId,
      created: false,
      delivery: 'ALREADY_CONFIRMED',
      messageId: 'proxy-v2-message-1',
    });
    expect(publishJSON).toHaveBeenCalledOnce();
    expect(publishJSON.mock.calls[0]?.[0].body).toEqual({ jobId: first.jobId });
    expect(setup.finance.records.size).toBe(1);
    await expect(setup.jobStore.getAuthorized({
      jobId: first.jobId,
      tenantId: 'tenant-a',
      userId: 'user-a',
    })).resolves.toMatchObject({
      status: 'queued',
      dispatchMessageId: 'proxy-v2-message-1',
      input: {
        schemaId:
          'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V2',
        payload: {
          commandSha256: setup.seed.base.command.commandSha256,
          publicationPolicy: setup.policies.publicationPolicy,
          preparedArtifactPolicy: setup.policies.preparedArtifactPolicy,
          runtimePolicy: setup.seed.base.runtimePolicy,
        },
      },
    });
  });

  it('rejects authorization scope drift before reservation or job creation', async () => {
    const setup = setupAdmission();
    const publishJSON = vi.fn();

    await expect(admitMediaProxyMasterTranscodeProductV2({
      ...admissionRequest(setup),
      tenantId: 'tenant-b',
    }, dependencies(setup, { publishJSON }))).rejects.toThrow(
      'MEDIA_PROXY_MASTER_TRANSCODE_ADMISSION_V2_FINANCE_AUTHORIZATION_SCOPE_MISMATCH',
    );
    expect(setup.finance.records.size).toBe(0);
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('rejects deployment storage substitution before reservation', async () => {
    const setup = setupAdmission();
    const foreignSinglePut =
      createMediaProxyMasterR2PrivatePublicationPolicyV1({
        bucketName: 'editron-media-proxy-private-foreign',
        storagePolicyVersion: 'private-proxy-media-v1',
        browserRouteExposure: 'NO_BROWSER_ROUTE',
      });

    await expect(admitMediaProxyMasterTranscodeProductV2(
      admissionRequest(setup),
      {
        ...dependencies(setup),
        createPrivateRuntime: () => ({
          proxyMasterTranscodePublication: {
            publicationPolicy: foreignSinglePut,
          },
        }),
      },
    )).rejects.toThrow(
      'MEDIA_PROXY_MASTER_TRANSCODE_ADMISSION_V2_FINANCE_AUTHORIZATION_SCOPE_MISMATCH',
    );
    expect(setup.finance.records.size).toBe(0);
  });

  it('requires the active operational policy before Finance lookup', async () => {
    const setup = setupAdmission();
    const current = setup.seed.base.operationalPolicies;
    const replacement = createMediaProxyMasterTranscodeRetryPolicyV1({
      durableJob: current.retry.durableJob,
      qstashDelivery: current.retry.qstashDelivery,
      workerRetry: {
        ...current.retry.workerRetry,
        baseDelayMs: current.retry.workerRetry.baseDelayMs + 1,
      },
    });
    const policyRegistry =
      createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
        activeRetryPolicy: replacement,
        activeHeartbeatPolicy: current.heartbeat,
        retainedRetryPolicies: [current.retry],
        retainedHeartbeatPolicies: [],
      });

    await expect(admitMediaProxyMasterTranscodeProductV2(
      admissionRequest(setup),
      { ...dependencies(setup), policyRegistry },
    )).rejects.toThrow(
      'MEDIA_PROXY_MASTER_TRANSCODE_ADMISSION_V2_OPERATIONAL_POLICY_NOT_ACTIVE',
    );
    expect(setup.finance.policyResolve).not.toHaveBeenCalled();
  });

  it('leaves the V2 job recoverable when delivery configuration is absent', async () => {
    const setup = setupAdmission();
    const result = await admitMediaProxyMasterTranscodeProductV2(
      admissionRequest(setup),
      { ...dependencies(setup), environment: {} },
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
      input: {
        schemaId:
          'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V2',
      },
    });
    expect(setup.finance.records.has(result.reservationId)).toBe(true);
  });
});

function setupAdmission() {
  const seed = buildMediaProxyMasterTranscodeV2Fixture();
  const policies = createMediaProxyMasterR2ProductPublicationPoliciesV2(
    seed.contract.payload.publicationPolicy.singlePut.policy,
  );
  const authorization =
    createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2({
      policy: seed.base.policy,
      evidence: {
        tenantId: 'tenant-a',
        userId: 'user-a',
        orgId: null,
        assetId: 'asset-a',
        command: seed.base.command,
        runtimePolicy: seed.base.runtimePolicy,
        publicationPolicy: policies.publicationPolicy,
        preparedArtifactPolicy: policies.preparedArtifactPolicy,
      },
      approvedBy: 'finance-admin',
      approvedAt: '2026-08-30T00:05:00.000Z',
      expiresAt: '2026-08-30T01:00:00.000Z',
    });
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    seed,
    policies,
    authorization,
    jobStore: new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    ),
    finance: finance(seed),
    policyRegistry:
      createMediaProxyMasterTranscodeOperationalPolicyRegistryV1({
        activeRetryPolicy: seed.base.operationalPolicies.retry,
        activeHeartbeatPolicy: seed.base.operationalPolicies.heartbeat,
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
    createPrivateRuntime: () => ({
      proxyMasterTranscodePublication: {
        publicationPolicy: setup.policies.publicationPolicy.singlePut.policy,
      },
    }),
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

function admissionRequest(setup: ReturnType<typeof setupAdmission>) {
  return {
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command: setup.seed.base.command,
    runtimePolicy: setup.seed.base.runtimePolicy,
    authorization: setup.authorization,
  };
}

function finance(seed: FixtureV2) {
  const records = new Map<
    string,
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2
  >();
  const transaction = {
    get: async (id: string) => records.get(id) ?? null,
    insert: async (
      record: MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2,
    ) => {
      if (records.has(record.reservationId)) throw new Error('DUPLICATE');
      records.set(record.reservationId, record);
    },
    replace: async () => {
      throw new Error('SETTLEMENT_NOT_EXPECTED');
    },
  };
  const policyResolve = vi.fn(async () => seed.base.policy);
  const policyLocator = { resolve: policyResolve };
  const ledgerOwner =
    createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2({
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
