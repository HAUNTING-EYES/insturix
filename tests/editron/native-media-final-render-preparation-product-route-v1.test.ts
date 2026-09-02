import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
const runtime = vi.hoisted(() => ({
  run: vi.fn(),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));
vi.mock(
  '@/lib/editron/services/native-media-final-render-preparation-product-runtime-v1',
  () => ({
    runNativeMediaFinalRenderPreparationProductRuntimeV1: runtime.run,
  }),
);

import { NextRequest } from 'next/server';

import { NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1 }
  from '@/lib/editron/services/native-media-final-render-preparation-durable-dispatch-v1';
import {
  createNativeMediaFinalRenderPreparationProductRouteV1,
} from '@/lib/editron/services/native-media-final-render-preparation-product-route-v1';

describe('native final-render preparation product route v1', () => {
  beforeEach(() => {
    vi.resetModules();
    auth.verifySignatureAppRouter.mockReset();
    auth.verifySignatureAppRouter.mockImplementation(
      (handler: unknown) => handler,
    );
    runtime.run.mockReset();
    runtime.run.mockResolvedValue(completed());
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('binds the signed ingress to the sole product runtime', async () => {
    const handler = createNativeMediaFinalRenderPreparationProductRouteV1({
      workerId: 'exact-render-worker-1',
    });

    const response = await handler(request(message()));

    expect(response.status).toBe(200);
    expect(runtime.run).toHaveBeenCalledWith({
      jobId: 'dwj_exact_1', workerId: 'exact-render-worker-1',
    });
    expect(auth.verifySignatureAppRouter).toHaveBeenCalledOnce();
  });

  it('keeps authentication ahead of the composed runtime', async () => {
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = createNativeMediaFinalRenderPreparationProductRouteV1();

    const response = await handler(request(message()));

    expect(response.status).toBe(503);
    expect(runtime.run).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('exports only the static Next route contract without product I/O', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const route = await import(
      '@/app/api/internal/workers/native-media-final-render-preparation/route'
    );

    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime']);
    expect(route.runtime).toBe('nodejs');
    expect(route.maxDuration).toBe(800);
    expect(typeof route.POST).toBe('function');
    expect(runtime.run).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
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

function message() {
  return {
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1,
    jobId: 'dwj_exact_1',
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    'https://editron.example/api/internal/workers/native-media-final-render-preparation',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
