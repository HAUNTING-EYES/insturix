import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  runProviderNativeNoSpendPreflightV2R,
  type ProviderNativeCohortManifestV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-cohort-manifest-v2r';
import { buildSealedH03ProviderOperatorInputV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3';
import {
  assertSealedH03ProviderCohortManifestV3R3,
  type SealedH03ProviderCohortManifestV3R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-v3r3';
import { runSealedH03ProviderNoInferencePreflightV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-preflight-v3r3';

type FetchCall = { url: string; init?: RequestInit };

let providerManifest: Readonly<ProviderNativeCohortManifestV2R>;
let manifest: Readonly<SealedH03ProviderCohortManifestV3R3>;
let operatorInput: Awaited<ReturnType<typeof buildSealedH03ProviderOperatorInputV3R3>>;

beforeAll(async () => {
  operatorInput = await buildSealedH03ProviderOperatorInputV3R3();
  providerManifest = operatorInput.providerManifest;
  manifest = operatorInput.cohortManifest;
});

describe('sealed H03 provider cohort V3R3', () => {
  it('freezes V5, three routes, two explicit budget arms and eighteen rows', () => {
    expect(assertSealedH03ProviderCohortManifestV3R3(manifest)).toBe(manifest);
    expect(manifest.rows).toHaveLength(18);
    expect(manifest.budgetArms).toEqual([
      expect.objectContaining({ armId: 'PRODUCTION_BUDGET', maximumProviderHttpRequests: 2 }),
      expect.objectContaining({ armId: 'CAPABILITY_CEILING', maximumProviderHttpRequests: 4 }),
    ]);
    expect((manifest.providerRouteManifest.routes as Array<{ route: { model: string } }>)
      .map(({ route }) => route.model)).toEqual([
      'gpt-5.6-luna', 'gpt-5.6-terra', 'gemini-3.7-flash',
    ]);
    expect(manifest.cap2CurrentTruthBinding).toMatchObject({
      artifactType: 'EditronCapabilityCurrentTruthReissueAuditV5',
      runtimeAuthorityDenied: true,
    });
    expect(manifest.absoluteMaxSpendUsd).toBe(11.673);
    expect(manifest.contractSource.sha256)
      .toBe('cc9b801ebddc68f2aa427493bc3baca35e913fdee15f88ab2b362902ca6b5fe9');
    expect(manifest.manifestSha256)
      .toBe('6fec9b9ef6c8fb9e816f7dd6c2f78cab137872b7dc37d7abd2f86b08db3315a2');
  });

  it('rejects CAP, budget-arm and implementation forgery even when rehashed', () => {
    const forgedCap = structuredClone(manifest) as any;
    forgedCap.cap2CurrentTruthBinding.manifestSha256 = 'f'.repeat(64);
    rehash(forgedCap);
    expect(() => assertSealedH03ProviderCohortManifestV3R3(forgedCap))
      .toThrow('SEALED_H03_PROVIDER_COHORT_DRIFT');

    const forgedBudget = structuredClone(manifest) as any;
    forgedBudget.budgetArms[0].maximumProviderHttpRequests = 99;
    rehash(forgedBudget);
    expect(() => assertSealedH03ProviderCohortManifestV3R3(forgedBudget))
      .toThrow('SEALED_H03_PROVIDER_COHORT_DRIFT');

    const forgedImplementation = structuredClone(manifest) as any;
    forgedImplementation.implementationBindings[0].sha256 = 'e'.repeat(64);
    rehash(forgedImplementation);
    expect(() => assertSealedH03ProviderCohortManifestV3R3(forgedImplementation))
      .toThrow('SEALED_H03_PROVIDER_IMPLEMENTATION_BINDING_DRIFT');
  });
});

describe('sealed H03 provider zero-inference preflight V3R3', () => {
  it('binds the exact owner request, counts Google officially and makes no inference call', async () => {
    const calls: FetchCall[] = [];
    const environment = providerEnvironment();
    const infrastructure = await runProviderNativeNoSpendPreflightV2R({
      manifest: providerManifest,
      environment,
      fetchImpl: fakeProviderFetch(calls),
    });
    const receipt = await runSealedH03ProviderNoInferencePreflightV3R3({
      manifest,
      providerManifest,
      providerInfrastructureReceipt: infrastructure,
      sourceRequest: operatorInput.sourceRequest,
      environment,
      fetchImpl: fakeProviderFetch(calls),
    });
    expect(receipt.checks).toHaveLength(6);
    expect(receipt.plannedRowCount).toBe(18);
    expect(receipt.networkCalls).toEqual({
      inheritedModelMetadataGets: 3,
      inheritedGoogleCountTokensPosts: 6,
      h03GoogleCountTokensPosts: 1,
      inferenceCalls: 0,
    });
    expect(receipt.dispatchAssessment)
      .toBe('PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION');
    expect(calls.filter(({ url }) => url.endsWith(':countTokens'))).toHaveLength(7);
    expect(calls.some(({ url }) => /:generateContent$|\/responses$|\/interactions$/.test(url)))
      .toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('openai-test');
    expect(JSON.stringify(receipt)).not.toContain('google-test');
  });

  it('rejects forged source identity, stale infrastructure and input overflow', async () => {
    const environment = providerEnvironment();
    const infrastructure = await runProviderNativeNoSpendPreflightV2R({
      manifest: providerManifest,
      environment,
      fetchImpl: fakeProviderFetch([]),
    });
    const forgedSource = structuredClone(operatorInput.sourceRequest) as any;
    forgedSource.ownerAuthorizationOutputSha256 = 'f'.repeat(64);
    await expect(runSealedH03ProviderNoInferencePreflightV3R3({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: forgedSource, environment, fetchImpl: fakeProviderFetch([]),
    })).rejects.toThrow('SEALED_H03_PROVIDER_PREFLIGHT_SOURCE_IDENTITY_DRIFT');

    await expect(runSealedH03ProviderNoInferencePreflightV3R3({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: operatorInput.sourceRequest,
      environment, fetchImpl: fakeProviderFetch([]),
      nowUnixSeconds: Math.floor(Date.now() / 1000) + 4_000,
    })).rejects.toThrow('SEALED_H03_PROVIDER_PREFLIGHT_INFRASTRUCTURE_RECEIPT_INVALID');

    await expect(runSealedH03ProviderNoInferencePreflightV3R3({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: operatorInput.sourceRequest, environment,
      fetchImpl: fakeProviderFetch([], { googleTokens: 50_000 }),
    })).rejects.toThrow('SEALED_H03_PROVIDER_PREFLIGHT_INPUT_BUDGET_EXCEEDED:GOOGLE_FLASH');
  });
});

function providerEnvironment(): Record<string, string> {
  return {
    OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test',
    VERCEL_OIDC_TOKEN: testOidc(),
  };
}
function testOidc(expiresInSeconds = 3_600): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.test`;
}
function fakeProviderFetch(
  calls: FetchCall[],
  options: { googleTokens?: number } = {},
): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith(':countTokens')) {
      return response({ totalTokens: options.googleTokens ?? 12_000 });
    }
    if (url.includes('/v1/models/gpt-5.6-luna')) return response({ id: 'gpt-5.6-luna' });
    if (url.includes('/v1/models/gpt-5.6-terra')) return response({ id: 'gpt-5.6-terra' });
    if (url.includes('/v1beta/models/gemini-3.7-flash')) {
      return response({ name: 'models/gemini-3.7-flash' });
    }
    return response({ error: 'unexpected endpoint' }, 500);
  }) as typeof fetch;
}
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}
function rehash(value: any): void {
  const { manifestSha256: _old, ...material } = value;
  value.manifestSha256 = hashCanonicalJsonV1(material);
}
