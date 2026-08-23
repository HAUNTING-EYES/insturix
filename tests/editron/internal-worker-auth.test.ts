import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: any) => handler),
}));

vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: mocks.verifySignatureAppRouter,
}));

import {
  INTERNAL_WORKER_AUTH_NOT_CONFIGURED,
  isInternalQStashWorkerAuthConfigured,
  withInternalQStashWorkerAuth,
} from '../../lib/editron/security/internal-worker-auth';

describe('internal QStash worker authorization', () => {
  beforeEach(() => {
    mocks.verifySignatureAppRouter.mockReset();
    mocks.verifySignatureAppRouter.mockImplementation((handler: any) => handler);
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects missing or whitespace signing keys before the handler can run', async () => {
    const handler = vi.fn(async () => new Response('should not run'));
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '   ');

    const response = await withInternalQStashWorkerAuth(handler, 'phase0-rendered-evidence')(
      new Request('http://localhost/api/internal/workers/phase0-rendered-evidence') as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: INTERNAL_WORKER_AUTH_NOT_CONFIGURED,
        routeId: 'phase0-rendered-evidence',
      },
    });
    expect(mocks.verifySignatureAppRouter).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(isInternalQStashWorkerAuthConfigured({
      QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
      QSTASH_NEXT_SIGNING_KEY: '   ',
    })).toBe(false);
  });

  it('uses the configured key pair to wrap the handler at request time', async () => {
    const handler = vi.fn(async () => new Response('verified'));
    const response = await withInternalQStashWorkerAuth(handler, 'phase0-rendered-evidence')(
      new Request('http://localhost/api/internal/workers/phase0-rendered-evidence') as never,
    );

    expect(await response.text()).toBe('verified');
    expect(mocks.verifySignatureAppRouter).toHaveBeenCalledWith(handler, {
      currentSigningKey: 'current-signing-key',
      nextSigningKey: 'next-signing-key',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
