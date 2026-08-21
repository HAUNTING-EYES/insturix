import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutRuntimeAccountingBindingV2R,
  SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R,
  type SealedHoldoutRuntimeAccountingApprovalV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-route-binding-v2r';
import { SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-runtime-route-facts-v2r';

const LUNA_ROUTE = route('OPENAI_LUNA', 'openai', 'gpt-5.6-luna');
const TERRA_ROUTE = route('OPENAI_TERRA', 'openai', 'gpt-5.6-terra');
const GOOGLE_ROUTE = route('GOOGLE_FLASH', 'google', 'gemini-3.7-flash');

async function manifest() {
  const bytes = await readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  return buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(bytes).digest('hex'),
  );
}

function route(
  routeId: ProviderNativeRouteV2R['routeId'],
  provider: ProviderNativeRouteV2R['provider'],
  model: ProviderNativeRouteV2R['model'],
): Readonly<ProviderNativeRouteV2R> {
  return { routeId, provider, model, claimedModelIdentity: model, reasoningMode: 'medium' };
}

function request(routeValue: Readonly<ProviderNativeRouteV2R>) {
  const endpoint = routeValue.provider === 'openai'
    ? 'https://api.openai.com/v1/responses'
    : 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const body = { model: routeValue.model, input: [{ role: 'user', content: 'test' }] };
  return {
    provider: routeValue.provider,
    endpoint,
    authMode: routeValue.provider === 'openai' ? 'BEARER' : 'X_GOOG_API_KEY',
    body,
    requestHash: hashCanonicalJsonV1({ endpoint, body }),
  } as Readonly<SerializedProviderNativeTurnV2R>;
}

function approval(input: {
  cohort: Awaited<ReturnType<typeof manifest>>;
  routeValue: Readonly<ProviderNativeRouteV2R>;
  caseId?: string;
}): SealedHoldoutRuntimeAccountingApprovalV2R {
  const caseId = input.caseId ?? 'HOLD-06:C1';
  const taskCase = input.cohort.cases.find((entry) => entry.caseId === caseId);
  if (!taskCase) throw new Error(`TEST_CASE_MISSING:${caseId}`);
  const google = input.routeValue.provider === 'google';
  return {
    version: SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R,
    pricingSnapshotVersion: SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R,
    operatorId: 'admin', approvedAt: '2026-08-22T00:00:00.000Z',
    manifestSha256: input.cohort.manifestSha256,
    caseId, publicCaseSha256: taskCase.publicCaseSha256,
    routeSha256: hashCanonicalJsonV1(input.routeValue),
    counterAction: google
      ? 'GOOGLE_COUNT_TOKENS_CONTEXT_EGRESS'
      : 'LOCAL_OPENAI_O200K_ESTIMATE',
    providerContextEgress: google ? 'ALLOW_GOOGLE_COUNT_TOKENS_ONLY' : 'DENY',
    maxInputTokensPerTurn: 85_000,
    absoluteMaxSpendMicroUsd: 5_000_000,
    inferenceCallsAuthorized: 0,
  };
}

describe('sealed holdout V2R-3 runtime route accounting binding', () => {
  it('binds the official Luna and Terra prices without provider egress', async () => {
    const cohort = await manifest();
    const luna = buildSealedHoldoutRuntimeAccountingBindingV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      approval: approval({ cohort, routeValue: LUNA_ROUTE }),
      now: '2026-08-22T00:00:00.000Z',
    });
    const terra = buildSealedHoldoutRuntimeAccountingBindingV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: TERRA_ROUTE,
      approval: approval({ cohort, routeValue: TERRA_ROUTE }),
      now: '2026-08-22T00:00:00.000Z',
    });
    expect(luna.authorization.pricing).toEqual({
      normalInputNanoUsdPerToken: 200, cachedInputNanoUsdPerToken: 20,
      cacheWriteNanoUsdPerToken: 250, outputNanoUsdPerToken: 1_200,
    });
    expect(terra.authorization.pricing).toEqual({
      normalInputNanoUsdPerToken: 2_000, cachedInputNanoUsdPerToken: 200,
      cacheWriteNanoUsdPerToken: 2_500, outputNanoUsdPerToken: 12_000,
    });
    expect(luna.receipt).toMatchObject({
      providerContextEgress: 'DENY', inferenceCallsAuthorized: 0,
      assessment: 'PASS_ACCOUNTING_BINDING_NO_INFERENCE', stateEffects: [],
    });
    const bound = await luna.countInputTokens(request(LUNA_ROUTE));
    expect(bound.inputTokensUpperBound).toBeGreaterThan(512);
    expect(bound.method).toContain('GPT56_O200K');
  });

  it('uses the official Google counter and binds its response into the receipt', async () => {
    const cohort = await manifest();
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/models/gemini-3.7-flash:countTokens');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'x-goog-api-key': 'secret-google-key',
      });
      return new Response(JSON.stringify({ totalTokens: 1_234 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const binding = buildSealedHoldoutRuntimeAccountingBindingV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: GOOGLE_ROUTE,
      approval: approval({ cohort, routeValue: GOOGLE_ROUTE }),
      googleApiKey: 'secret-google-key', fetchImpl,
      now: '2026-08-22T00:00:00.000Z',
    });
    const bound = await binding.countInputTokens(request(GOOGLE_ROUTE));
    expect(bound.inputTokensUpperBound).toBe(1_932);
    expect(bound.method).toMatch(/^GOOGLE_COUNT_TOKENS_MARGIN_115_PLUS_512_V1:[a-f0-9]{64}$/);
    expect(binding.authorization.pricing).toEqual({
      normalInputNanoUsdPerToken: 750, cachedInputNanoUsdPerToken: 75,
      cacheWriteNanoUsdPerToken: 750, outputNanoUsdPerToken: 3_750,
    });
    expect(binding.receipt).toMatchObject({
      providerContextEgress: 'ALLOW_GOOGLE_COUNT_TOKENS_ONLY',
      pricingValidThrough: '2026-12-31T23:59:59.999Z',
      inferenceCallsAuthorized: 0, secretsPersisted: false,
    });
    expect(JSON.stringify(binding.receipt)).not.toContain('secret-google-key');
  });

  it('rejects route, approval, request, expiry, and counter-response drift', async () => {
    const cohort = await manifest();
    expect(() => buildSealedHoldoutRuntimeAccountingBindingV2R({
      manifest: cohort, caseId: 'HOLD-06:C1',
      route: {
        ...LUNA_ROUTE,
        model: 'gpt-5.6-luna-forged',
      } as unknown as Readonly<ProviderNativeRouteV2R>,
      approval: approval({ cohort, routeValue: LUNA_ROUTE }),
    })).toThrow('SEALED_ROUTE_BINDING_ROUTE_UNSUPPORTED_OR_DRIFTED');

    expect(() => buildSealedHoldoutRuntimeAccountingBindingV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      approval: { ...approval({ cohort, routeValue: LUNA_ROUTE }), manifestSha256: '0'.repeat(64) },
    })).toThrow('SEALED_ROUTE_BINDING_APPROVAL_INVALID');

    expect(() => buildSealedHoldoutRuntimeAccountingBindingV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: GOOGLE_ROUTE,
      approval: approval({ cohort, routeValue: GOOGLE_ROUTE }),
      googleApiKey: 'key', now: '2027-01-01T00:00:00.000Z',
    })).toThrow('SEALED_ROUTE_BINDING_PRICE_SNAPSHOT_EXPIRED:GOOGLE_FLASH');

    const binding = buildSealedHoldoutRuntimeAccountingBindingV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: LUNA_ROUTE,
      approval: approval({ cohort, routeValue: LUNA_ROUTE }),
    });
    await expect(binding.countInputTokens({
      ...request(LUNA_ROUTE), requestHash: '0'.repeat(64),
    })).rejects.toThrow('SEALED_ROUTE_BINDING_REQUEST_DRIFT');

    const google = buildSealedHoldoutRuntimeAccountingBindingV2R({
      manifest: cohort, caseId: 'HOLD-06:C1', route: GOOGLE_ROUTE,
      approval: approval({ cohort, routeValue: GOOGLE_ROUTE }),
      googleApiKey: 'key',
      fetchImpl: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
      now: '2026-08-22T00:00:00.000Z',
    });
    await expect(google.countInputTokens(request(GOOGLE_ROUTE)))
      .rejects.toThrow('SEALED_ROUTE_BINDING_GOOGLE_COUNT_FAILED:200');
  });
});
