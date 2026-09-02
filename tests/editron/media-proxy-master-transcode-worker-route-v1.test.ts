import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));

import { NextRequest } from 'next/server';

import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESPONSE_VERSION_V1,
  createAuthenticatedMediaProxyMasterTranscodeWorkerV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-worker-route-v1';

describe('media proxy/master transcode worker route V1', () => {
  beforeEach(() => {
    auth.verifySignatureAppRouter.mockReset();
    auth.verifySignatureAppRouter.mockImplementation(
      (handler: unknown) => handler,
    );
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'test-current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'test-next-signing-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects invalid JSON and every field beyond jobId before runtime', async () => {
    const run = vi.fn();
    const handler = createAuthenticatedMediaProxyMasterTranscodeWorkerV1({
      run,
      workerId: 'worker-route-1',
    });

    const invalidJson = await handler(rawRequest('{'));
    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'MEDIA_PROXY_MASTER_TRANSCODE_WORKER_BODY_INVALID' },
    });

    const extraField = await handler(request({
      jobId: 'proxy_job_1',
      sourceUrl: 'https://must-not-enter.example/master.mov',
    }));
    expect(extraField.status).toBe(400);
    await expect(extraField.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'MEDIA_PROXY_MASTER_TRANSCODE_WORKER_MESSAGE_INVALID' },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('passes only stable job and worker identities to the product runtime', async () => {
    const run = vi.fn(async () => ({
      kind: 'completed' as const,
      jobId: 'proxy_job_1',
      disposition: 'PASS' as const,
      receiptSha256: 'a'.repeat(64),
    }));
    const handler = createAuthenticatedMediaProxyMasterTranscodeWorkerV1({
      run,
      workerId: 'worker-route-1',
    });

    const response = await handler(request({ jobId: 'proxy_job_1' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      version:
        MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESPONSE_VERSION_V1,
      jobId: 'proxy_job_1',
      result: {
        kind: 'completed',
        jobId: 'proxy_job_1',
        disposition: 'PASS',
        receiptSha256: 'a'.repeat(64),
      },
    });
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith({
      jobId: 'proxy_job_1',
      workerId: 'worker-route-1',
    });
  });

  it('returns retryable HTTP evidence for durable retry states', async () => {
    const results = [
      {
        kind: 'retry_wait' as const,
        jobId: 'proxy_job_1',
        errorCode: 'PROXY_RUNTIME_UNAVAILABLE',
      },
      { kind: 'lease_lost' as const, reason: 'lease changed' },
      { kind: 'skipped' as const, reason: 'retry_not_due' },
    ];

    for (const result of results) {
      const handler = createAuthenticatedMediaProxyMasterTranscodeWorkerV1({
        run: async () => result,
        workerId: 'worker-route-1',
      });
      const response = await handler(request({ jobId: 'proxy_job_1' }));
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('30');
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        jobId: 'proxy_job_1',
        result,
      });
    }
  });

  it('acknowledges terminal duplicates but does not conceal a missing job', async () => {
    const terminalHandler = createAuthenticatedMediaProxyMasterTranscodeWorkerV1({
      run: async () => ({ kind: 'skipped', reason: 'terminal' }),
      workerId: 'worker-route-1',
    });
    const terminal = await terminalHandler(request({ jobId: 'proxy_job_1' }));
    expect(terminal.status).toBe(200);
    await expect(terminal.json()).resolves.toMatchObject({
      success: true,
      result: { kind: 'skipped', reason: 'terminal' },
    });

    const missingHandler = createAuthenticatedMediaProxyMasterTranscodeWorkerV1({
      run: async () => ({ kind: 'skipped', reason: 'not_found' }),
      workerId: 'worker-route-1',
    });
    const missing = await missingHandler(request({ jobId: 'proxy_job_1' }));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'MEDIA_PROXY_MASTER_TRANSCODE_WORKER_JOB_NOT_FOUND' },
    });
  });

  it('sanitizes runtime outages and keeps delivery retryable', async () => {
    const handler = createAuthenticatedMediaProxyMasterTranscodeWorkerV1({
      run: async () => {
        throw new Error('secret storage endpoint must not escape');
      },
      workerId: 'worker-route-1',
    });
    const response = await handler(request({ jobId: 'proxy_job_1' }));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      version:
        MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_RESPONSE_VERSION_V1,
      error: { code: 'MEDIA_PROXY_MASTER_TRANSCODE_WORKER_UNAVAILABLE' },
    });
    expect(JSON.stringify(body)).not.toContain('secret storage endpoint');
  });

  it('checks QStash signing configuration at request time', async () => {
    const run = vi.fn(async () => ({
      kind: 'skipped' as const,
      reason: 'terminal',
    }));
    const handler = createAuthenticatedMediaProxyMasterTranscodeWorkerV1({
      run,
      workerId: 'worker-route-1',
    });
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');

    const response = await handler(request({ jobId: 'proxy_job_1' }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_WORKER_AUTH_NOT_CONFIGURED' },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('exports a lazy Node route without storage or network work', async () => {
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const route = await import(
      '@/app/api/internal/workers/media-proxy-master-transcode/route'
    );
    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime']);
    expect(route.runtime).toBe('nodejs');
    expect(route.maxDuration).toBe(300);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

function request(body: unknown): NextRequest {
  return rawRequest(JSON.stringify(body));
}

function rawRequest(body: string): NextRequest {
  return new NextRequest(
    'https://editron.example/api/internal/workers/media-proxy-master-transcode',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    },
  );
}
