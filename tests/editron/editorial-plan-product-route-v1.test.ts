import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));
vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: auth.verifySignatureAppRouter,
}));

import { NextRequest } from 'next/server';

import {
  createEditorialPlanProductRouteV1,
} from '@/lib/editron/services/editorial-plan-product-route-v1';

describe('editorial plan product route', () => {
  beforeEach(() => {
    vi.resetModules();
    auth.verifySignatureAppRouter.mockReset();
    auth.verifySignatureAppRouter.mockImplementation(
      (handler: unknown) => handler,
    );
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed before root composition when exact route config is absent', async () => {
    const createExecutionRoot = vi.fn();
    const reportConfigurationFailure = vi.fn();
    const handler = createEditorialPlanProductRouteV1({
      environment: providerEnvironment(),
      createExecutionRoot,
      reportConfigurationFailure,
    });

    const response = await handler(request({}) as NextRequest);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'EDITORIAL_PLAN_EXECUTION_OWNER_NOT_CONFIGURED' },
    });
    expect(createExecutionRoot).not.toHaveBeenCalled();
    expect(reportConfigurationFailure).toHaveBeenCalledWith(
      'EDITRON_PROVIDER_NATIVE_STORAGE_READ_TIMEOUT_MS_INVALID',
    );
  });

  it('requires both exact provider credential families before a job can be claimed', async () => {
    const createExecutionRoot = vi.fn();
    const reportConfigurationFailure = vi.fn();
    const handler = createEditorialPlanProductRouteV1({
      environment: {
        ...providerEnvironment(),
        EDITRON_PROVIDER_NATIVE_STORAGE_READ_TIMEOUT_MS: '12000',
        GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      },
      createExecutionRoot,
      reportConfigurationFailure,
    });

    const response = await handler(request({}) as NextRequest);

    expect(response.status).toBe(503);
    expect(createExecutionRoot).not.toHaveBeenCalled();
    expect(reportConfigurationFailure).toHaveBeenCalledWith(
      'PROVIDER_NATIVE_LIVE_SECRET_MISSING:GOOGLE_GENERATIVE_AI_API_KEY_OR_GEMINI_API_KEY_OR_GOOGLE_API_KEY',
    );
  });

  it('composes the exact owners without performing product I/O', async () => {
    const executionOwner = {
      ownerId: 'root-owner', ownerVersion: 'v1',
      assertDefinitionSupported: vi.fn(), execute: vi.fn(),
    };
    const terminalSettlementOwner = { settleTerminal: vi.fn() };
    const createExecutionRoot = vi.fn(() => ({
      authority: 'PRODUCT_COMPOSITION_NO_CANONICAL_PROJECT_MUTATION' as const,
      supportedOperatorIds: ['cut_section', 'set_keyframes'] as const,
      executionOwner,
      terminalSettlementOwner,
    }));
    const environment = {
      ...providerEnvironment(),
      EDITRON_PROVIDER_NATIVE_STORAGE_READ_TIMEOUT_MS: '12000',
    };
    const handler = createEditorialPlanProductRouteV1({
      environment,
      createExecutionRoot,
      projectService: { loadProjectForMutation: vi.fn() },
      budgetOwner: {} as never,
      customerChargeOwner: {} as never,
    });

    const response = await handler(request({}) as NextRequest);

    expect(response.status).toBe(400);
    expect(createExecutionRoot).toHaveBeenCalledOnce();
    expect(createExecutionRoot).toHaveBeenCalledWith(expect.objectContaining({
      canonicalMedia: { storageReadTimeoutMs: 12_000 },
      provider: { environment },
    }));
    expect(executionOwner.execute).not.toHaveBeenCalled();
    expect(terminalSettlementOwner.settleTerminal).not.toHaveBeenCalled();
  });

  it('exports only the valid Next route symbols and performs no network I/O', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'openai-key');
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'google-key');
    vi.stubEnv('EDITRON_PROVIDER_NATIVE_STORAGE_READ_TIMEOUT_MS', '12000');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const route = await import(
      '@/app/api/internal/workers/editorial-plan/route'
    );

    expect(Object.keys(route).sort()).toEqual(['POST', 'runtime']);
    expect(route.runtime).toBe('nodejs');
    expect(typeof route.POST).toBe('function');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

function providerEnvironment() {
  return {
    OPENAI_API_KEY: 'openai-key',
    GOOGLE_GENERATIVE_AI_API_KEY: 'google-key',
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    'https://editron.example/api/internal/workers/editorial-plan',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
