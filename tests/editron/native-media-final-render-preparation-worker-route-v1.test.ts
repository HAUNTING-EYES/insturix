import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));

import { NextRequest } from 'next/server';

import {
  createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNNER_NOT_CONFIGURED_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESPONSE_VERSION_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_ROUTE_ID_V1,
} from '@/lib/editron/services/native-media-final-render-preparation-worker-route-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-preparation-durable-dispatch-v1';

describe('native final-render preparation signed worker ingress v1', () => {
  beforeEach(() => {
    auth.verifySignatureAppRouter.mockReset();
    auth.verifySignatureAppRouter.mockImplementation((handler: unknown) => handler);
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
  });

  it('fails before body parsing when the product runner is absent', async () => {
    const handler = createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1();
    const response = await handler(request(message()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_RESPONSE_VERSION_V1,
      error: { code: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RUNNER_NOT_CONFIGURED_V1 },
    });
  });

  it('authenticates at request time and does not run without both signing keys', async () => {
    const run = vi.fn(async () => completed());
    const handler = createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1({ run });
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await handler(request(message()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED',
        routeId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_ROUTE_ID_V1,
      },
    });
    expect(run).not.toHaveBeenCalled();
    expect(auth.verifySignatureAppRouter).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('rejects invalid JSON and any field beyond version and jobId', async () => {
    const run = vi.fn(async () => completed());
    const handler = createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1({ run });
    const invalidJson = await handler(new NextRequest('https://editron.example.test/worker', {
      method: 'POST', body: '{', headers: { 'content-type': 'application/json' },
    }));
    expect(invalidJson.status).toBe(400);
    const extra = await handler(request({ ...message(), sourceUrl: 'https://forbidden.test/a.mov' }));
    expect(extra.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('passes only job and worker identity to the composed runner', async () => {
    const run = vi.fn(async () => completed());
    const handler = createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1({
      run,
      workerId: 'exact-render-worker-1',
    });
    const response = await handler(request(message('dwj_exact_1')));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      jobId: 'dwj_exact_1',
      result: { kind: 'completed', disposition: 'PASS' },
    });
    expect(run).toHaveBeenCalledWith({
      jobId: 'dwj_exact_1', workerId: 'exact-render-worker-1',
    });
    expect(auth.verifySignatureAppRouter).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ kind: 'retry_wait', jobId: 'dwj_exact_1', errorCode: 'RETRY' }, 503],
    [{ kind: 'lease_lost', reason: 'lease' }, 503],
    [{ kind: 'skipped', reason: 'retry_not_due' }, 503],
    [{ kind: 'dead_letter', jobId: 'dwj_exact_1', errorCode: 'STOP' }, 200],
    [{ kind: 'skipped', reason: 'terminal' }, 200],
  ] as const)('maps durable result %j to HTTP %i without an invented delay',
    async (result, status) => {
      const handler = createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1({
        run: async () => result,
      });
      const response = await handler(request(message()));
      expect(response.status).toBe(status);
      expect(response.headers.get('retry-after')).toBeNull();
    });

  it('returns 404 for an unknown job and 503 for an unavailable runner', async () => {
    const notFound = createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1({
      run: async () => ({ kind: 'skipped', reason: 'not_found' }),
    });
    expect((await notFound(request(message()))).status).toBe(404);

    const unavailable = createAuthenticatedNativeMediaFinalRenderPreparationWorkerV1({
      run: async () => { throw new Error('composition unavailable'); },
    });
    expect((await unavailable(request(message()))).status).toBe(503);
  });
});

function completed() {
  return {
    kind: 'completed' as const,
    jobId: 'dwj_exact_1',
    disposition: 'PASS' as const,
    receiptSha256: 'a'.repeat(64),
  };
}

function message(jobId = 'dwj_exact_1') {
  return {
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1,
    jobId,
  };
}

function request(body: unknown) {
  return new NextRequest('https://editron.example.test/worker', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
