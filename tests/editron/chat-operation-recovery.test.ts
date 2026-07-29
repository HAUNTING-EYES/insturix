import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  buildCheckpointId: vi.fn(),
  getCheckpoint: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/agent/chat-ai-edit-transaction-runtime', () => ({
  buildChatEditCheckpointId: mocks.buildCheckpointId,
}));
vi.mock('@/lib/editron/services/checkpoint-service', () => ({
  checkpointService: { getCheckpoint: mocks.getCheckpoint },
}));

import { GET } from '@/app/api/services/editron/chat/operation-status/route';
import {
  describeRecoveredChatEditOperation,
  recoverChatEditOperation,
  type ChatEditOperationStatusResponse,
} from '@/lib/editron/agent/chat-operation-recovery';

const identity = {
  projectId: 'project_1',
  sessionId: 'session_1',
  operationId: 'operation_123',
};

function routeRequest(overrides: Partial<typeof identity> = {}): NextRequest {
  const query = new URLSearchParams({ ...identity, ...overrides });
  return new NextRequest(
    `https://app.example.com/api/services/editron/chat/operation-status?${query}`,
  );
}

function statusResponse(
  operationStatus: ChatEditOperationStatusResponse['operationStatus'],
): Response {
  return Response.json({
    success: true,
    ...identity,
    operationStatus,
    mutatingToolNames: ['add_overlay'],
    beforeCheckpointId: 'checkpoint_before',
    ...(operationStatus === 'completed'
      ? { afterCheckpointId: 'checkpoint_after' }
      : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: 'user_1' });
  mocks.buildCheckpointId.mockReturnValue('checkpoint_before');
  mocks.getCheckpoint.mockResolvedValue({
    ...identity,
    userId: 'user_1',
    checkpointId: 'checkpoint_before',
    operationStatus: 'completed',
    mutatingToolNames: ['add_overlay'],
    afterCheckpointId: 'checkpoint_after',
  });
});

describe('chat edit operation status route', () => {
  it('requires auth and rejects malformed operation identities before lookup', async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await GET(routeRequest())).status).toBe(401);

    mocks.auth.mockResolvedValueOnce({ userId: 'user_1' });
    expect((await GET(routeRequest({ operationId: 'short' }))).status).toBe(400);
    expect(mocks.getCheckpoint).not.toHaveBeenCalled();
  });

  it('returns only the authenticated operation receipt with no-store semantics', async () => {
    const response = await GET(routeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.buildCheckpointId).toHaveBeenCalledWith({
      ...identity,
      userId: 'user_1',
    }, 'before');
    expect(mocks.getCheckpoint).toHaveBeenCalledWith('checkpoint_before', 'user_1');
    await expect(response.json()).resolves.toEqual({
      success: true,
      ...identity,
      operationStatus: 'completed',
      mutatingToolNames: ['add_overlay'],
      beforeCheckpointId: 'checkpoint_before',
      afterCheckpointId: 'checkpoint_after',
    });
  });

  it('does not disclose missing or identity-mismatched operations', async () => {
    mocks.getCheckpoint.mockResolvedValueOnce(null);
    expect((await GET(routeRequest())).status).toBe(404);

    mocks.getCheckpoint.mockResolvedValueOnce({
      ...identity,
      projectId: 'another_project',
      operationStatus: 'completed',
    });
    expect((await GET(routeRequest())).status).toBe(409);
  });
});

describe('chat edit operation recovery', () => {
  it('retries a not-yet-visible receipt and returns the durable terminal result', async () => {
    let clock = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(statusResponse('running'))
      .mockResolvedValueOnce(statusResponse('completed'));

    const result = await recoverChatEditOperation(identity, {
      fetchImpl,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      timeoutMs: 1_000,
      initialDelayMs: 10,
      maxDelayMs: 20,
    });

    expect(result).toMatchObject({
      status: 'completed',
      polls: 3,
      snapshot: {
        operationStatus: 'completed',
        afterCheckpointId: 'checkpoint_after',
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('retries a transient status transport failure without replaying the edit', async () => {
    let clock = 0;
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(statusResponse('completed'));

    const result = await recoverChatEditOperation(identity, {
      fetchImpl,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      timeoutMs: 100,
      initialDelayMs: 10,
    });

    expect(result).toMatchObject({ status: 'completed', polls: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports a still-running operation without replaying it when the recovery deadline expires', async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async () => statusResponse('running'));

    const result = await recoverChatEditOperation(identity, {
      fetchImpl,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      timeoutMs: 25,
      initialDelayMs: 10,
      maxDelayMs: 20,
    });

    expect(result).toMatchObject({
      status: 'running',
      snapshot: { operationStatus: 'running' },
    });
    expect(describeRecoveredChatEditOperation(result, new Error('terminated')))
      .toContain('still processing on the server');
  });

  it('fails closed when status lookup is not authorized', async () => {
    await expect(recoverChatEditOperation(identity, {
      fetchImpl: vi.fn(async () => new Response(null, { status: 401 })),
      timeoutMs: 0,
    })).rejects.toThrow('not authorized');
  });
});
