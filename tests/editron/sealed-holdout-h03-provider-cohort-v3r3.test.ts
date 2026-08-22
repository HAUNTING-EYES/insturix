import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { buildCanonicalDev03MeasuredEvidenceV2 }
  from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildProviderNativeCohortManifestV2R,
  runProviderNativeNoSpendPreflightV2R,
  type ProviderNativeCohortManifestV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-cohort-manifest-v2r';
import {
  assertSealedH03ProviderCohortManifestV3R3,
  buildSealedH03ProviderCohortManifestV3R3,
  SEALED_H03_PROVIDER_COHORT_PATH_V3R3,
  type SealedH03ProviderCohortManifestV3R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-v3r3';
import { buildSealedH03GeneratedCompositionModelPacketV3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-model-candidate-v3r';
import { runSealedH03ProviderNoInferencePreflightV3R3 }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-preflight-v3r3';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import { SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-target-contract-v3r';
import { buildV2RBenchmarkTaskRegistryV2 }
  from '@/lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';

type JsonRecord = Record<string, unknown>;
type FetchCall = { url: string; init?: RequestInit };

let providerManifest: Readonly<ProviderNativeCohortManifestV2R>;
let manifest: Readonly<SealedH03ProviderCohortManifestV3R3>;
let implementationBindings: readonly Readonly<{ path: string; sha256: string }>[];

beforeAll(async () => {
  providerManifest = await buildProviderManifest();
  implementationBindings = await Promise.all(implementationPaths().map(async (filePath) => ({
    path: filePath,
    sha256: await fileSha(filePath),
  })));
  manifest = buildSealedH03ProviderCohortManifestV3R3({
    contractSourceSha256: await fileSha(SEALED_H03_PROVIDER_COHORT_PATH_V3R3),
    baseManifest: await baseManifest(),
    providerManifest,
    implementationBindings,
  });
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
      sourceRequest: await sourceRequest(),
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
    const forgedSource = await sourceRequest();
    forgedSource.ownerAuthorizationOutputSha256 = 'f'.repeat(64);
    await expect(runSealedH03ProviderNoInferencePreflightV3R3({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: forgedSource, environment, fetchImpl: fakeProviderFetch([]),
    })).rejects.toThrow('SEALED_H03_PROVIDER_PREFLIGHT_SOURCE_IDENTITY_DRIFT');

    await expect(runSealedH03ProviderNoInferencePreflightV3R3({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: await sourceRequest(), environment, fetchImpl: fakeProviderFetch([]),
      nowUnixSeconds: Math.floor(Date.now() / 1000) + 4_000,
    })).rejects.toThrow('SEALED_H03_PROVIDER_PREFLIGHT_INFRASTRUCTURE_RECEIPT_INVALID');

    await expect(runSealedH03ProviderNoInferencePreflightV3R3({
      manifest, providerManifest, providerInfrastructureReceipt: infrastructure,
      sourceRequest: await sourceRequest(), environment,
      fetchImpl: fakeProviderFetch([], { googleTokens: 50_000 }),
    })).rejects.toThrow('SEALED_H03_PROVIDER_PREFLIGHT_INPUT_BUDGET_EXCEEDED:GOOGLE_FLASH');
  });
});

async function buildProviderManifest() {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({
    audioBytes, analyzerSourceBytes,
  });
  return buildProviderNativeCohortManifestV2R(
    buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured }),
  );
}

async function baseManifest() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  return buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
}

async function sourceRequest() {
  const apiImplementationHash = implementationBindings.find(({ path: filePath }) => (
    filePath.endsWith('/generated-composition-api-v1.tsx')
  ))?.sha256 ?? '';
  const argumentsValue = generatedArguments();
  const packet = buildSealedH03GeneratedCompositionModelPacketV3R({
    apiImplementationHash,
    sourceAArtifactSha256:
      'sha256:cb54ba193dad9159cdd0856ce39280855af4adb1c3d4f8de50fd13fc2a1bef25',
    sourceBArtifactSha256:
      'sha256:3bc9ff365921e4a3043490f05c7e6bee68d4e067a3ead8e6013f981aebbbff6f',
    orchestratorArguments: argumentsValue,
  });
  return {
    apiImplementationHash,
    sourceAArtifactSha256:
      'sha256:cb54ba193dad9159cdd0856ce39280855af4adb1c3d4f8de50fd13fc2a1bef25',
    sourceBArtifactSha256:
      'sha256:3bc9ff365921e4a3043490f05c7e6bee68d4e067a3ead8e6013f981aebbbff6f',
    arguments: argumentsValue,
    orchestratorSpecSha256: hashCanonicalJsonV1(argumentsValue),
    ownerAuthorizationOutputSha256:
      '5ca2f52ad9865f526b7a4ae8ff9955d8496b0901726487fb59e45fa14ffddb9a',
    packet,
  };
}

function generatedArguments(): JsonRecord {
  return {
    projectId: 'oe-hold-03', expectedProjectRevision: 'R12',
    assetIds: ['h03-a', 'h03-b'],
    targetRange: { startFrame: 90, endFrame: 270 },
    referenceBlueprintId: SEALED_H03_REFERENCE_BLUEPRINT_ID_V3R,
    layoutSpec: { panelCount: 6, geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS', gutters: true, titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 } },
    motionSpec: { entryFrames: [0, 24], stableFrames: [24, 150], exitFrames: [150, 180], relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE' },
    typographySpec: { text: 'EVENT\nMOMENT', alignment: 'CENTER', fontAssetId: 'font-noto-sans-v27-regular' },
    constraints: { referencePixelsForbidden: true, preserveOutsideRange: true, returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 }, titleFaceOverlapMaximumPixels: 0 },
    evidenceIds: ['E1', 'E2', 'E3'],
  };
}

function implementationPaths(): string[] {
  return [
    'lib/editron/research/open-ended-planner/generated-composition-api-v1.tsx',
    'lib/editron/research/open-ended-planner/generated-composition-program-verifier-v1.ts',
    'lib/editron/research/open-ended-planner/provider-native-generated-source-adapter-v2r.ts',
    'lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v3r2.ts',
    'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-source-adapter-v3r2.ts',
    'lib/editron/research/open-ended-planner/sealed-holdout-h03-source-executor-v3r2.ts',
  ];
}
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
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(path.resolve(filePath))).digest('hex');
}
function rehash(value: any): void {
  const { manifestSha256: _old, ...material } = value;
  value.manifestSha256 = hashCanonicalJsonV1(material);
}
