import { describe, expect, it, vi } from 'vitest';

import {
  dispatchEditorialPlanProductJobV1,
  resolveEditorialPlanProductDispatchConfigurationV1,
  type EditorialPlanProductDispatchEnvironmentV1,
  type EditorialPlanQStashPublisherV1,
} from '@/lib/editron/services/editorial-plan-product-dispatch-v1';
import {
  createPreparedEditorialPlanDurableFixtureV1 as prepared,
  EDITORIAL_PLAN_FIXTURE_START_V1 as NOW,
} from './helpers/editorial-plan-durable-fixture-v1';

const ENV: EditorialPlanProductDispatchEnvironmentV1 = {
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
  VERCEL_URL: 'editron-preview.example.test',
};
const DELIVERY_POLICY = Object.freeze({
  retries: 2, retryDelayMs: 30_000, timeoutSeconds: 300,
});

describe('editorial plan product dispatch', () => {
  it('fails closed before binding work when durable transport is incomplete', async () => {
    const createOrGet = vi.fn();
    await expect(dispatchEditorialPlanProductJobV1({
      actor: { tenantId: 'tenant-a', userId: 'user-a' },
      request: request({}),
      planStore: {
        getRevisionAuthorized: vi.fn(), getLatestAuthorized: vi.fn(),
        getExecutionDefinitionAuthorized: vi.fn(),
      },
      jobStore: { createOrGet, recordDispatch: vi.fn() },
      deliveryPolicy: DELIVERY_POLICY,
      env: { ...ENV, QSTASH_NEXT_SIGNING_KEY: undefined },
      publisher: publisher('message-unused'),
    })).rejects.toThrow(
      'EDITORIAL_PLAN_PRODUCT_DISPATCH_MISSING_QSTASH_SIGNING_KEYS',
    );
    expect(createOrGet).not.toHaveBeenCalled();
  });

  it('publishes only the job identity to the fixed worker and records delivery', async () => {
    const setup = await prepared();
    const publishJSON = vi.fn(async () => ({ messageId: 'message-1' }));
    const result = await dispatch(setup, { publishJSON });
    expect(result).toEqual({
      state: 'dispatched', jobId: setup.jobId,
      created: false, messageId: 'message-1',
    });
    expect(publishJSON).toHaveBeenCalledWith({
      url: 'https://editron-preview.example.test/api/internal/workers/editorial-plan',
      body: {
        version: 'EDITRON_EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_V1_1',
        jobId: setup.jobId,
      },
      retries: 2,
      retryDelay: '30000',
      timeout: 300,
      deduplicationId: setup.jobId,
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      dispatchTransport: 'qstash', dispatchMessageId: 'message-1', dispatchCount: 1,
    });
  });

  it('returns the durable receipt without publishing an idempotent replay', async () => {
    const setup = await prepared();
    const publishJSON = vi.fn(async () => ({ messageId: 'message-1' }));
    await dispatch(setup, { publishJSON });
    await expect(dispatch(setup, { publishJSON })).resolves.toMatchObject({
      state: 'already_dispatched', jobId: setup.jobId, messageId: 'message-1',
    });
    expect(publishJSON).toHaveBeenCalledTimes(1);
  });

  it('keeps an unacknowledged publish retryable without inventing success', async () => {
    const setup = await prepared();
    await expect(dispatch(setup, { publishJSON: vi.fn(async () => ({})) }))
      .resolves.toMatchObject({
        state: 'dispatch_unconfirmed', reason: 'QSTASH_MESSAGE_ID_MISSING',
      });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'queued', dispatchMessageId: null, dispatchCount: 0,
    });
    await expect(dispatch(setup, publisher('message-retry'))).resolves.toMatchObject({
      state: 'dispatched', messageId: 'message-retry',
    });
  });

  it('distinguishes rejected publish from delivered-but-unrecorded ambiguity', async () => {
    const rejected = await prepared();
    await expect(dispatch(rejected, {
      publishJSON: vi.fn(async () => { throw new Error('network reset'); }),
    })).resolves.toMatchObject({
      state: 'dispatch_unconfirmed', reason: 'QSTASH_PUBLISH_REJECTED',
    });

    const unknown = await prepared();
    const result = await dispatchEditorialPlanProductJobV1({
      ...dispatchInput(unknown),
      jobStore: {
        createOrGet: unknown.jobStore.createOrGet.bind(unknown.jobStore),
        recordDispatch: vi.fn(async () => { throw new Error('mongo timeout'); }),
      },
      publisher: publisher('message-maybe-delivered'),
    });
    expect(result).toMatchObject({
      state: 'delivery_unknown', messageId: 'message-maybe-delivered',
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED',
    });
  });

  it('records a late acknowledgement after the signed worker has already claimed', async () => {
    const setup = await prepared();
    const publishJSON = vi.fn(async () => {
      const claimed = await setup.jobStore.claim({
        jobId: setup.jobId, workerId: 'fast-worker', now: NOW,
      });
      expect(claimed.kind).toBe('claimed');
      return { messageId: 'message-fast' };
    });
    await expect(dispatch(setup, { publishJSON })).resolves.toMatchObject({
      state: 'dispatched', messageId: 'message-fast',
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'running', dispatchMessageId: 'message-fast', dispatchCount: 1,
    });
  });

  it('binds authenticated actor scope instead of trusting copied request scope', async () => {
    const setup = await prepared();
    const publishJSON = vi.fn(async () => ({ messageId: 'message-never' }));
    await expect(dispatchEditorialPlanProductJobV1({
      ...dispatchInput(setup),
      actor: { tenantId: 'tenant-b', userId: 'user-a' },
      publisher: { publishJSON },
    })).rejects.toThrow('PLAN_JOB_PLAN_REVISION_NOT_FOUND');
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('rejects insecure or path-bearing app origins', () => {
    expect(resolveEditorialPlanProductDispatchConfigurationV1({
      ...ENV, VERCEL_URL: undefined, NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })).toMatchObject({ configured: false, reason: 'INVALID_PUBLIC_ORIGIN' });
    expect(resolveEditorialPlanProductDispatchConfigurationV1({
      ...ENV, VERCEL_URL: undefined,
      NEXT_PUBLIC_APP_URL: 'https://app.insturix.example/path',
    })).toMatchObject({ configured: false, reason: 'INVALID_PUBLIC_ORIGIN' });
  });
});

function publisher(messageId: string): EditorialPlanQStashPublisherV1 {
  return { publishJSON: vi.fn(async () => ({ messageId })) };
}

function dispatch(
  setup: Awaited<ReturnType<typeof prepared>>,
  qstash: EditorialPlanQStashPublisherV1,
) {
  return dispatchEditorialPlanProductJobV1({
    ...dispatchInput(setup), publisher: qstash,
  });
}

function dispatchInput(setup: Awaited<ReturnType<typeof prepared>>) {
  return {
    deliveryPolicy: DELIVERY_POLICY,
    actor: { tenantId: setup.active.tenantId, userId: setup.active.userId },
    request: request({
      projectId: setup.active.projectId,
      planId: setup.active.planId,
      planRevision: setup.active.planRevision,
      planRevisionSha256: setup.active.revisionSha256,
      nodeId: setup.active.nodes[0].nodeId,
      nodeVersion: setup.active.nodes[0].nodeVersion,
    }),
    planStore: setup.planStore(), jobStore: setup.jobStore, env: ENV, now: NOW,
  };
}

function request(overrides: Record<string, unknown>) {
  return {
    projectId: 'project-a', planId: 'plan-a', planRevision: 2,
    planRevisionSha256: 'a'.repeat(64), nodeId: 'root', nodeVersion: 2,
    parentCommandId: 'command-a', parentReceiptId: 'receipt-a', maxAttempts: 3,
    ...overrides,
  };
}

function currentJob(setup: Awaited<ReturnType<typeof prepared>>) {
  return setup.jobStore.getAuthorized({
    jobId: setup.jobId,
    tenantId: setup.active.tenantId,
    userId: setup.active.userId,
  });
}
