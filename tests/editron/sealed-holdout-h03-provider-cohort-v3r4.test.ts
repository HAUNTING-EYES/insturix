import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  runProviderNativeNoSpendPreflightV2R,
  type ProviderNativeCohortManifestV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-cohort-manifest-v2r';
import { buildSealedH03ProviderOperatorInputV3R4 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r4';
import {
  assertSealedH03ProviderCohortManifestV3R4,
  type SealedH03ProviderCohortManifestV3R4,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-v3r4';
import { runSealedH03ProviderNoInferencePreflightV3R4 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-preflight-v3r4';

type FetchCall = { url: string; init?: RequestInit };
let providerManifest: Readonly<ProviderNativeCohortManifestV2R>;
let manifest: Readonly<SealedH03ProviderCohortManifestV3R4>;
let operatorInput: Awaited<ReturnType<typeof buildSealedH03ProviderOperatorInputV3R4>>;

beforeAll(async () => {
  operatorInput = await buildSealedH03ProviderOperatorInputV3R4();
  providerManifest = operatorInput.providerManifest;
  manifest = operatorInput.cohortManifest;
});

describe('sealed H03 provider cohort V3R4', () => {
  it('freezes CAP V6, corrected contracts, three routes and eighteen rows', () => {
    expect(assertSealedH03ProviderCohortManifestV3R4(manifest)).toBe(manifest);
    expect(manifest.rows).toHaveLength(18);
    expect(manifest.cap2CurrentTruthBinding).toMatchObject({
      artifactType: 'EditronCapabilityCurrentTruthReissueAuditV6',
      manifestSha256: '2549623eaca44feabf15aa53d8dd93c02804b37406db69879fd047981d2f9ce9',
      sourceCommit: 'd84b54159bbcb2f247e7688571a18ecba5ef3b36',
      runtimeAuthorityDenied: true,
    });
    expect(manifest.sourceRequestIdentity.correctedProviderContract).toMatchObject({
      modelApiSurfaceVersion: 'EDITRON_GENERATED_COMPOSITION_MODEL_API_SURFACE_V2',
      modelSourceContractVersion: 'EDITRON_OE_SEALED_H03_MODEL_SOURCE_CONTRACT_V3R_2',
      renderedAcceptanceContractVersion: 'EDITRON_OE_SEALED_H03_RENDERED_ACCEPTANCE_V3R_2',
    });
    expect(manifest.implementationBindings).toHaveLength(9);
    expect(manifest.sandboxWorkerImplementationSha256)
      .toBe('acbd1e6b8dcd30443b9bb919dc15cf2d8d501b2cee0ba8c460af972b3b5046f0');
    expect((manifest.providerRouteManifest.routes as Array<{ route: { model: string } }> )
      .map(({ route }) => route.model)).toEqual([
      'gpt-5.6-luna', 'gpt-5.6-terra', 'gemini-3.7-flash',
    ]);
    expect(manifest.absoluteMaxSpendUsd).toBe(11.673);
    expect(manifest.contractSource.sha256)
      .toBe('f508621ce867b02153f40bd28308e71299948c7a2aa71ec61b2325af92c8dcea');
    expect(manifest.manifestSha256)
      .toBe('1b3658cc69ac41fe57b7e99b19c95b8cc1351a33e9e63b8ccf5fa5fc1f1affb9');
    expect(operatorInput.sourceRequest.packet.packetHash)
      .toBe('1080c6695444f1a8e728e8d80e2eded43a83fc4430b06d2ffa06b1b29dad9f01');
  });

  it('rejects recomputed CAP, implementation and sandbox-worker forgery', () => {
    for (const mutate of [
      (value: any) => { value.cap2CurrentTruthBinding.manifestSha256 = 'f'.repeat(64); },
      (value: any) => { value.implementationBindings[0].sha256 = 'e'.repeat(64); },
      (value: any) => { value.sandboxWorkerImplementationSha256 = 'd'.repeat(64); },
    ]) {
      const forged = structuredClone(manifest) as any;
      mutate(forged);
      rehash(forged);
      expect(() => assertSealedH03ProviderCohortManifestV3R4(forged)).toThrow();
    }
  });
});

describe('sealed H03 provider zero-inference preflight V3R4', () => {
  it('binds the corrected packet, counts Google officially and makes no inference call', async () => {
    const calls: FetchCall[] = [];
    const environment = providerEnvironment();
    const infrastructure = await runProviderNativeNoSpendPreflightV2R({
      manifest: providerManifest, environment, fetchImpl: fakeProviderFetch(calls),
    });
    const receipt = await runSealedH03ProviderNoInferencePreflightV3R4({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: operatorInput.sourceRequest, environment,
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
    expect(receipt.dispatchAssessment).toBe('PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION');
    expect(calls.filter(({ url }) => url.endsWith(':countTokens'))).toHaveLength(7);
    expect(calls.some(({ url }) => /:generateContent$|\/responses$|\/interactions$/.test(url)))
      .toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('openai-test');
    expect(JSON.stringify(receipt)).not.toContain('google-test');
  });

  it('rejects forged source identity, stale infrastructure and input overflow', async () => {
    const environment = providerEnvironment();
    const infrastructure = await runProviderNativeNoSpendPreflightV2R({
      manifest: providerManifest, environment, fetchImpl: fakeProviderFetch([]),
    });
    const forged = structuredClone(operatorInput.sourceRequest) as any;
    forged.ownerAuthorizationOutputSha256 = 'f'.repeat(64);
    await expect(runSealedH03ProviderNoInferencePreflightV3R4({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: forged, environment, fetchImpl: fakeProviderFetch([]),
    })).rejects.toThrow('SEALED_H03_V3R4_PREFLIGHT_SOURCE_IDENTITY_DRIFT');
    await expect(runSealedH03ProviderNoInferencePreflightV3R4({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: operatorInput.sourceRequest, environment,
      fetchImpl: fakeProviderFetch([]), nowUnixSeconds: Math.floor(Date.now() / 1000) + 4_000,
    })).rejects.toThrow('SEALED_H03_V3R4_PREFLIGHT_INFRASTRUCTURE_RECEIPT_INVALID');
    await expect(runSealedH03ProviderNoInferencePreflightV3R4({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: operatorInput.sourceRequest, environment,
      fetchImpl: fakeProviderFetch([], { googleTokens: 50_000 }),
    })).rejects.toThrow('SEALED_H03_V3R4_PREFLIGHT_INPUT_BUDGET_EXCEEDED:GOOGLE_FLASH');
  });
});

function providerEnvironment(): Record<string, string> {
  return { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test',
    VERCEL_OIDC_TOKEN: testOidc() };
}
function testOidc(expiresInSeconds = 3_600): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  })}.test`;
}
function fakeProviderFetch(calls: FetchCall[], options: { googleTokens?: number } = {}): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith(':countTokens')) return response({ totalTokens: options.googleTokens ?? 12_000 });
    if (url.includes('/v1/models/gpt-5.6-luna')) return response({ id: 'gpt-5.6-luna' });
    if (url.includes('/v1/models/gpt-5.6-terra')) return response({ id: 'gpt-5.6-terra' });
    if (url.includes('/v1beta/models/gemini-3.7-flash')) return response({ name: 'models/gemini-3.7-flash' });
    return response({ error: 'unexpected endpoint' }, 500);
  }) as typeof fetch;
}
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status,
    headers: { 'content-type': 'application/json' } });
}
function rehash(value: any): void {
  const { manifestSha256: _old, ...material } = value;
  value.manifestSha256 = hashCanonicalJsonV1(material);
}
