import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutGeneralisationManifestV4R2,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2';
import {
  buildSealedHoldoutGeneralisationManifestV4R3,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r3';
import {
  assertSealedHoldoutRouteHealthReceiptV4R3,
  preflightSealedHoldoutRouteHealthV4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-route-health-v4r3';

describe('sealed holdout V4R3 route-health preflight', () => {
  it('binds only V4R3 authority and records three zero-inference healthy routes', async () => {
    const input = fixture();
    const network = providerFetch();
    const receipt = await preflightSealedHoldoutRouteHealthV4R3({
      ...input, environment: environment(), fetchImpl: network.fetchImpl,
    });

    expect(receipt).toMatchObject({
      assessment: 'PASS_ALL_ROUTES_HEALTHY_NO_DISPATCH',
      availableRouteIds: ['OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH'],
      unavailableRouteIds: [],
      networkCalls: { modelMetadataGets: 3, inferenceCalls: 0 },
      secretsPersisted: false,
      projectReads: 0,
      projectMutations: 0,
      dispatchAuthorized: false,
      stateEffects: [],
    });
    expect(network.calls).toHaveLength(3);
    expect(network.calls.every(({ method }) => method === 'GET')).toBe(true);
    expect(network.calls.some(({ url }) => /\/responses$|\/interactions$/.test(url))).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('openai-production-test');
    expect(JSON.stringify(receipt)).not.toContain('google-production-test');
  });

  it('records a rate-limited route as unavailable and never grants dispatch', async () => {
    const input = fixture();
    const network = providerFetch({ 'gemini-3.7-flash': { status: 429 } });
    const receipt = await preflightSealedHoldoutRouteHealthV4R3({
      ...input, environment: environment(), fetchImpl: network.fetchImpl,
    });

    expect(receipt).toMatchObject({
      assessment: 'UNAVAILABLE_ROUTES_NO_DISPATCH',
      availableRouteIds: ['OPENAI_LUNA', 'OPENAI_TERRA'],
      unavailableRouteIds: ['GOOGLE_FLASH'],
      dispatchAuthorized: false,
    });
    expect(receipt.routeHealth.find(({ routeId }) => routeId === 'GOOGLE_FLASH')).toMatchObject({
      availability: 'UNAVAILABLE_RATE_LIMITED',
      retryDisposition: 'RETRY_LATER_WITH_FRESH_HEALTH_CHECK',
      responseStatus: 429,
    });
  });

  it('rejects V4R2 predecessor substitution before it can make a metadata request', async () => {
    const input = fixture();
    const network = providerFetch();
    await expect(preflightSealedHoldoutRouteHealthV4R3({
      ...input,
      manifest: input.predecessorManifest as unknown as typeof input.manifest,
      environment: environment(),
      fetchImpl: network.fetchImpl,
    })).rejects.toThrow('SEALED_GENERALISATION_V4R3_MANIFEST_DRIFT');
    expect(network.calls).toEqual([]);
  });

  it('rejects a self-rehashed route-health receipt that grants dispatch', async () => {
    const input = fixture();
    const receipt = await preflightSealedHoldoutRouteHealthV4R3({
      ...input, environment: environment(), fetchImpl: providerFetch().fetchImpl,
    });
    const forged = structuredClone(receipt) as unknown as Record<string, unknown>;
    forged.dispatchAuthorized = true;
    const { receiptSha256: _ignored, ...material } = forged;
    forged.receiptSha256 = hashCanonicalJsonV1(material);

    expect(() => assertSealedHoldoutRouteHealthReceiptV4R3({
      ...input,
      value: forged,
    })).toThrow('SEALED_V4R3_ROUTE_HEALTH_RECEIPT_INVALID');
  });

  it('rejects a self-rehashed receipt that relabels a rate limit', async () => {
    const input = fixture();
    const receipt = await preflightSealedHoldoutRouteHealthV4R3({
      ...input,
      environment: environment(),
      fetchImpl: providerFetch({ 'gemini-3.7-flash': { status: 429 } }).fetchImpl,
    });
    const forged = structuredClone(receipt) as unknown as {
      routeHealth: Array<Record<string, unknown>>;
      receiptSha256: string;
    };
    const google = forged.routeHealth.find(({ routeId }) => routeId === 'GOOGLE_FLASH');
    google!.availability = 'UNAVAILABLE_CREDENTIAL_OR_ACCESS';
    google!.retryDisposition = 'REPAIR_CREDENTIAL_OR_ROUTE_THEN_RECHECK';
    const { receiptSha256: _ignored, ...material } = forged;
    forged.receiptSha256 = hashCanonicalJsonV1(material);

    expect(() => assertSealedHoldoutRouteHealthReceiptV4R3({
      ...input,
      value: forged,
    })).toThrow('SEALED_V4R3_ROUTE_HEALTH_RECEIPT_INVALID');
  });

  it('rejects malformed nested receipt material with the canonical error', async () => {
    const input = fixture();
    const receipt = await preflightSealedHoldoutRouteHealthV4R3({
      ...input, environment: environment(), fetchImpl: providerFetch().fetchImpl,
    });
    const forged = structuredClone(receipt) as unknown as Record<string, unknown>;
    forged.networkCalls = null;
    const { receiptSha256: _ignored, ...material } = forged;
    forged.receiptSha256 = hashCanonicalJsonV1(material);

    expect(() => assertSealedHoldoutRouteHealthReceiptV4R3({
      ...input,
      value: forged,
    })).toThrow('SEALED_V4R3_ROUTE_HEALTH_RECEIPT_INVALID');
  });
});

function fixture() {
  const baseManifest = buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const predecessorManifest = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
    baseManifest,
  });
  const manifest = buildSealedHoldoutGeneralisationManifestV4R3({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R3),
    baseManifest,
    predecessorManifest,
  });
  return { baseManifest, predecessorManifest, manifest };
}

function environment() {
  return {
    OPENAI_API_KEY: 'openai-production-test',
    GOOGLE_GENERATIVE_AI_API_KEY: 'google-production-test',
  };
}

function providerFetch(scenarios: Record<string, Readonly<{
  status?: number;
  returnedIdentity?: string;
}>> = {}) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET' });
    const model = decodeURIComponent(url.split('/').at(-1) ?? '');
    const scenario = scenarios[model] ?? {};
    const status = scenario.status ?? 200;
    const isGoogle = model.startsWith('gemini-');
    const identity = scenario.returnedIdentity
      ?? (isGoogle ? `models/${model}` : model);
    return new Response(JSON.stringify(isGoogle ? { name: identity } : { id: identity }), {
      status,
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
