import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));

import { NextRequest } from 'next/server';

import {
  EditorialPlanDurableRetryableErrorV1,
  type EditorialPlanDurableExecutionOwnerV1,
  type EditorialPlanDurableTerminalSettlementOwnerV1,
} from '@/lib/editron/services/editorial-plan-durable-worker-v1';
import {
  createAuthenticatedEditorialPlanProductWorkerV1,
} from '@/lib/editron/services/editorial-plan-product-worker-v1';
import {
  createPreparedEditorialPlanDurableFixtureV1 as prepared,
  createEditorialPlanDurableFixtureStoresV1,
  EDITORIAL_PLAN_FIXTURE_START_V1 as NOW,
} from './helpers/editorial-plan-durable-fixture-v1';

describe('editorial plan product worker', () => {
  beforeEach(() => {
    auth.verifySignatureAppRouter.mockReset();
    auth.verifySignatureAppRouter.mockImplementation((handler: unknown) => handler);
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects missing signing keys before parsing or claiming a job', async () => {
    const setup = await prepared();
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
    const response = await invoke(setup, owner(), message(setup.jobId));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED' },
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'queued', attemptCount: 0,
    });
  });

  it('refuses to consume work until an explicit execution owner is composed', async () => {
    const setup = await prepared();
    const response = await invoke(setup, undefined, message(setup.jobId));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'EDITORIAL_PLAN_EXECUTION_OWNER_NOT_CONFIGURED' },
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'queued', attemptCount: 0,
    });
  });

  it('refuses to consume work without the terminal settlement owner', async () => {
    const setup = await prepared();
    const response = await invoke(setup, owner(), message(setup.jobId), null);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'EDITORIAL_PLAN_TERMINAL_SETTLEMENT_OWNER_NOT_CONFIGURED' },
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'queued', attemptCount: 0,
    });
  });

  it('rejects malformed or widened queue messages before execution', async () => {
    const setup = await prepared();
    const executionOwner = owner();
    const malformed = await invoke(setup, executionOwner, {
      ...message(setup.jobId), projectId: 'copied-project',
    });
    expect(malformed.status).toBe(400);
    expect(executionOwner.execute).not.toHaveBeenCalled();
    await expect(currentJob(setup)).resolves.toMatchObject({ attemptCount: 0 });
  });

  it('runs the sole lifecycle owner and completes one signed delivery', async () => {
    const setup = await prepared();
    const executionOwner = owner();
    const settlement = settlementOwner();
    const response = await invoke(
      setup, executionOwner, message(setup.jobId), settlement,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true, jobId: setup.jobId,
      result: { kind: 'completed', disposition: 'PASS' },
    });
    expect(auth.verifySignatureAppRouter).toHaveBeenCalledTimes(1);
    expect(executionOwner.execute).toHaveBeenCalledTimes(1);
    expect(settlement.settleTerminal).toHaveBeenCalledTimes(1);
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'completed', attemptCount: 1,
      terminalReceipt: { disposition: 'PASS' },
    });

    const replay = await invoke(
      setup, executionOwner, message(setup.jobId), settlement,
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      result: { kind: 'skipped', reason: 'terminal' },
    });
    expect(executionOwner.execute).toHaveBeenCalledTimes(1);
    expect(settlement.settleTerminal).toHaveBeenCalledTimes(2);
  });

  it('redrives settlement after a post-completion crash without rerunning edits', async () => {
    const setup = await prepared();
    const executionOwner = owner();
    const settleTerminal = vi.fn()
      .mockRejectedValueOnce(new Error('wallet temporarily unavailable'))
      .mockResolvedValueOnce(undefined);
    const settlement = { settleTerminal };

    const first = await invoke(
      setup, executionOwner, message(setup.jobId), settlement,
    );
    expect(first.status).toBe(503);
    await expect(first.json()).resolves.toMatchObject({
      error: { code: 'EDITORIAL_PLAN_WORKER_UNAVAILABLE' },
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'completed', terminalReceipt: { disposition: 'PASS' },
    });
    expect(executionOwner.execute).toHaveBeenCalledTimes(1);

    const redelivery = await invoke(
      setup, executionOwner, message(setup.jobId), settlement,
    );
    expect(redelivery.status).toBe(200);
    await expect(redelivery.json()).resolves.toMatchObject({
      result: { kind: 'skipped', reason: 'terminal' },
    });
    expect(settleTerminal).toHaveBeenCalledTimes(2);
    expect(executionOwner.execute).toHaveBeenCalledTimes(1);
  });

  it('settles a non-retryable dead letter exactly after its terminal transition', async () => {
    const setup = await prepared();
    const executionOwner = owner(async () => {
      throw new Error('permanent execution failure');
    });
    const settlement = settlementOwner();
    const response = await invoke(
      setup, executionOwner, message(setup.jobId), settlement,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { kind: 'dead_letter', errorCode: 'PLAN_EXECUTION_FAILED' },
    });
    expect(settlement.settleTerminal).toHaveBeenCalledTimes(1);
    expect(settlement.settleTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'dead_letter' }),
    );
  });

  it('settles an already-cancelled job without invoking the execution owner', async () => {
    const setup = await prepared();
    const executionOwner = owner();
    const settlement = settlementOwner();
    await setup.jobStore.requestCancellation({
      jobId: setup.jobId, tenantId: setup.active.tenantId,
      userId: setup.active.userId, requestedBy: setup.active.userId,
      reason: 'cancel before execution', now: NOW,
    });
    const response = await invoke(
      setup, executionOwner, message(setup.jobId), settlement,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { kind: 'skipped', reason: 'terminal' },
    });
    expect(settlement.settleTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
    );
    expect(executionOwner.execute).not.toHaveBeenCalled();
  });

  it('returns a retryable transport response when lifecycle parks the job', async () => {
    const setup = await prepared();
    const executionOwner = owner(async () => {
      throw new EditorialPlanDurableRetryableErrorV1(
        'TEMPORARY_PROVIDER_FAILURE',
        'temporary provider failure',
        { turn: 1 },
      );
    });
    const response = await invoke(setup, executionOwner, message(setup.jobId));
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    await expect(response.json()).resolves.toMatchObject({
      result: {
        kind: 'retry_wait', errorCode: 'TEMPORARY_PROVIDER_FAILURE',
      },
    });
    await expect(currentJob(setup)).resolves.toMatchObject({
      status: 'retry_wait', attemptCount: 1,
    });
  });

  it('returns a bounded not-found response for a valid unknown job identity', async () => {
    const stores = createEditorialPlanDurableFixtureStoresV1();
    const handler = createAuthenticatedEditorialPlanProductWorkerV1({
      executionOwner: owner(), jobStore: stores.jobStoreFactory(),
      terminalSettlementOwner: settlementOwner(),
      planStore: stores.planStore(), workerId: 'worker-a', clock: () => NOW,
    });
    const response = await handler(request(message('dwj_missing')) as NextRequest);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'EDITORIAL_PLAN_WORKER_JOB_NOT_FOUND' },
    });
  });
});

function owner(
  execute: EditorialPlanDurableExecutionOwnerV1['execute'] = vi.fn(async () => ({
    disposition: 'PASS' as const,
    receiptId: 'owner-receipt-1', receiptSha256: 'a'.repeat(64),
    proofReferences: [{
      proofId: 'proof-1', proofSha256: 'b'.repeat(64), disposition: 'PASS' as const,
    }],
  })),
): EditorialPlanDurableExecutionOwnerV1 {
  return {
    ownerId: 'test-owner', ownerVersion: 'v1',
    assertDefinitionSupported: vi.fn(), execute: vi.fn(execute),
  };
}

function invoke(
  setup: Awaited<ReturnType<typeof prepared>>,
  executionOwner: EditorialPlanDurableExecutionOwnerV1 | undefined,
  body: unknown,
  terminalSettlementOwner: EditorialPlanDurableTerminalSettlementOwnerV1 | null =
    settlementOwner(),
) {
  const handler = createAuthenticatedEditorialPlanProductWorkerV1({
    executionOwner, jobStore: setup.jobStore, planStore: setup.planStore(),
    workerId: 'worker-a', clock: () => NOW, retryDelayMs: 30_000,
    ...(terminalSettlementOwner ? { terminalSettlementOwner } : {}),
  });
  return handler(request(body) as NextRequest);
}

function settlementOwner(): EditorialPlanDurableTerminalSettlementOwnerV1 {
  return { settleTerminal: vi.fn(async () => undefined) };
}

function request(body: unknown): NextRequest {
  return new NextRequest('https://editron.example/api/internal/workers/editorial-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function message(jobId: string) {
  return {
    version: 'EDITRON_EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_V1_1',
    jobId,
  };
}

function currentJob(setup: Awaited<ReturnType<typeof prepared>>) {
  return setup.jobStore.getAuthorized({
    jobId: setup.jobId,
    tenantId: setup.active.tenantId,
    userId: setup.active.userId,
  });
}
