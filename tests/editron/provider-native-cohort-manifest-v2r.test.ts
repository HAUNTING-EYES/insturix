import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { buildCanonicalDev03MeasuredEvidenceV2 } from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { DEV01_PROVIDER_NATIVE_AUDIO_PROOF_REQUIREMENTS_V2R } from '@/lib/editron/research/open-ended-planner/dev01-stage6-render-proof-validator-v2';
import {
  assertProviderNativeCohortManifestV2R,
  buildProviderNativeCohortManifestV2R,
  runProviderNativeNoSpendPreflightV2R,
  type ProviderNativeCohortManifestV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-cohort-manifest-v2r';
import { buildV2RBenchmarkTaskRegistryV2 } from '@/lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';
import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

type FetchCall = { url: string; init?: RequestInit };

let manifest: Readonly<ProviderNativeCohortManifestV2R>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const registry = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
  manifest = buildProviderNativeCohortManifestV2R(registry);
});

describe('provider-native cohort manifest V2R', () => {
  it('freezes three current routes, six cases, exact tool/context hashes, and no Qwen route', () => {
    const replay = assertProviderNativeCohortManifestV2R(manifest);
    expect(replay.routes.map(({ route }) => [route.routeId, route.model, route.provider])).toEqual([
      ['OPENAI_LUNA', 'gpt-5.6-luna', 'openai'],
      ['OPENAI_TERRA', 'gpt-5.6-terra', 'openai'],
      ['GOOGLE_FLASH', 'gemini-3.7-flash', 'google'],
    ]);
    expect(replay.cases.map(({ caseId }) => caseId)).toEqual([
      'DEV-01:BASELINE', 'DEV-01:VISUAL_EVIDENCE_WITHHELD', 'DEV-02:BASELINE',
      'DEV-03:BASELINE', 'DEV-03:BEAT_EVIDENCE_WITHHELD', 'DEV-04:BASELINE',
    ]);
    expect(JSON.stringify(replay)).not.toMatch(/qwen/i);
    expect(replay.experimentId).toBe('EDITRON_OE_V2R_PROVIDER_NATIVE_V27_CANDIDATE');
    expect(replay.cases.every(({ context }) => context.episodeId.startsWith('V27:'))).toBe(true);
    expect(Object.fromEntries(replay.cases.map(({ caseId, connectorVersion }) => [caseId, connectorVersion])))
      .toEqual({
        'DEV-01:BASELINE': 'EDITRON_PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_V2R_5',
        'DEV-01:VISUAL_EVIDENCE_WITHHELD': 'EDITRON_PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_V2R_5',
        'DEV-02:BASELINE': 'EDITRON_PROVIDER_NATIVE_DEV02_CONNECTED_EPISODE_V2R_6',
        'DEV-03:BASELINE': 'EDITRON_PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_V2R_5',
        'DEV-03:BEAT_EVIDENCE_WITHHELD': 'EDITRON_PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_V2R_5',
        'DEV-04:BASELINE': 'EDITRON_PROVIDER_NATIVE_DEV04_CONNECTED_EPISODE_V2R_3',
      });
    expect(replay.completeCapabilityDossier.operatorCount).toBe(40);
    expect(replay.cases.every(({ toolSetSha256, contextSha256 }) => (
      /^[a-f0-9]{64}$/.test(toolSetSha256) && /^[a-f0-9]{64}$/.test(contextSha256)
    ))).toBe(true);
    expect(replay.absoluteMaxSpendUsd).toBeGreaterThan(0);
  });

  it('records DEV-02 as argument-bound only after connecting source synthesis and hybrid proof', () => {
    const dev02 = manifest.cases.find(({ caseId }) => caseId === 'DEV-02:BASELINE');
    expect(dev02?.connectorDisposition).toBe('ARGUMENT_BOUND_ISOLATED_EXECUTOR_READY');
    expect(dev02?.callableOperatorIds).toContain('generated_composition_program');
    expect(dev02?.context.activeTarget).toHaveProperty('referenceBlueprint');
    expect(dev02?.context.activeTarget.referenceBlueprintIdentity).toEqual(
      DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1,
    );
    expect(DEV02_GENERATED_COMPOSITION_REFERENCE_BINDING_V1.blueprintHash).toBe(
      hashCanonicalJsonV1(DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1),
    );
    expect(dev02?.context.activeTarget.researchExecutionAvailability).toEqual({
      operatorId: 'generated_composition_program',
      disposition: 'ARGUMENT_BOUND_ISOLATED_EXECUTOR_READY',
      productSupportStatus: 'RESEARCH_ONLY_NOT_IMPLEMENTED',
      authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION',
      stateEffects: [],
    });
    expect(dev02?.connectorOwnerRefs).toContain(
      'provider-native-dev02-connected-episode-v2r.ts#runProviderNativeDev02ConnectedEpisodeV2R',
    );
    expect(manifest.blockerCodes).toEqual([]);
    expect(manifest.dispatchGate).toBe(
      'BLOCKED_UNTIL_EVERY_NON_GAP_CASE_HAS_ARGUMENT_BOUND_ISOLATED_EXECUTOR',
    );
  });

  it('discloses DEV-01 audio proof thresholds before provider inference', () => {
    const dev01Cases = manifest.cases.filter(({ taskId }) => taskId === 'DEV-01');
    const audioOwnerContracts = dev01Cases.map(({ context }) => (
      context.activeTarget.audioFormOwnerContract as Readonly<{
        currentBaseVolume: number;
        optionalOwnerDefaults: Readonly<{ duckLevel: number }>;
        duckLevelSemantics: string;
      }>
    ));
    expect(dev01Cases).toHaveLength(2);
    expect(dev01Cases.every(({ context }) => (
      hashCanonicalJsonV1(context.activeTarget.audioProofRequirements)
        === hashCanonicalJsonV1(DEV01_PROVIDER_NATIVE_AUDIO_PROOF_REQUIREMENTS_V2R)
    ))).toBe(true);
    expect(DEV01_PROVIDER_NATIVE_AUDIO_PROOF_REQUIREMENTS_V2R).toMatchObject({
      minimumEffectiveDuckReductionDb: 1,
      maximumRenderedToExpectedDeviationDb: 0.75,
    });
    expect(audioOwnerContracts.every((contract) => (
      contract.currentBaseVolume === 0.355
      && contract.optionalOwnerDefaults.duckLevel === 0.089
      && contract.duckLevelSemantics
        === 'ABSOLUTE_LINEAR_BGM_OUTPUT_GAIN_DURING_MEASURED_SPEECH'
    ))).toBe(true);
  });

  it('records every executable case as argument-bound and keeps DEV-04 as an honest gap', () => {
    const connected = manifest.cases.filter(({ taskId }) => taskId !== 'DEV-04');
    expect(connected).toHaveLength(5);
    expect(connected.every(({ connectorDisposition }) => (
      connectorDisposition === 'ARGUMENT_BOUND_ISOLATED_EXECUTOR_READY'
    ))).toBe(true);
    expect(manifest.blockerCodes).toEqual([]);
    expect(manifest.cases.find(({ caseId }) => caseId === 'DEV-04:BASELINE'))
      .toMatchObject({
        connectorDisposition: 'EXPECTED_CAPABILITY_GAP_NO_EXECUTION',
        connectorOwnerRefs: [
          'provider-native-dev04-connected-episode-v2r.ts#runProviderNativeDev04ConnectedEpisodeV2R',
        ],
      });
  });

  it('uses the verified current pricing snapshot including OpenAI cache-write rates', () => {
    const byId = new Map(manifest.routes.map(({ route, pricing }) => [route.routeId, pricing]));
    expect(byId.get('OPENAI_LUNA')).toEqual({
      inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02,
      cacheWriteUsdPerMillion: 0.25, outputUsdPerMillion: 1.2,
    });
    expect(byId.get('OPENAI_TERRA')).toEqual({
      inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.2,
      cacheWriteUsdPerMillion: 2.5, outputUsdPerMillion: 12,
    });
  });

  it('rejects manifest mutation even when a caller casts away readonly', () => {
    const tampered = JSON.parse(JSON.stringify(manifest)) as ProviderNativeCohortManifestV2R;
    (tampered.cases[0] as { maxInputTokensPerTurn: number }).maxInputTokensPerTurn = 1;
    expect(() => assertProviderNativeCohortManifestV2R(tampered))
      .toThrow('PROVIDER_NATIVE_COHORT_MANIFEST_HASH_DRIFT');
  });
});

describe('provider-native zero-inference preflight V2R', () => {
  it('checks model access and official Gemini token counts without an inference call', async () => {
    const calls: FetchCall[] = [];
    const receipt = await runProviderNativeNoSpendPreflightV2R({
      manifest,
      environment: providerEnvironment(),
      fetchImpl: fakeProviderFetch(calls),
    });
    expect(receipt.checks).toHaveLength(18);
    expect(receipt.infrastructureAssessment).toBe('PASS');
    expect(receipt.dispatchAssessment).toBe('PASS_READY');
    expect(receipt.networkCalls).toEqual({
      modelMetadataGets: 3, googleCountTokensPosts: 6, inferenceCalls: 0,
    });
    expect(receipt.sandboxCredential).toMatchObject({
      kind: 'VERCEL_OIDC', assessment: 'PASS_FRESHNESS_ONLY', minimumRemainingSeconds: 300,
    });
    expect(calls).toHaveLength(9);
    expect(calls.some(({ url }) => /\/responses$|\/interactions$/.test(url))).toBe(false);
    expect(calls.filter(({ url }) => url.endsWith(':countTokens'))).toHaveLength(6);
    const googleBody = JSON.parse(String(calls.find(({ url }) => url.endsWith(':countTokens'))?.init?.body));
    const serializedInteraction = googleBody.contents[0].parts[0].text;
    expect(serializedInteraction).toContain('gemini-3.7-flash');
    expect(serializedInteraction).toContain('finish_editron_research_episode');
    expect(serializedInteraction).toContain('tools');
    expect(JSON.stringify(receipt)).not.toContain('openai-test');
    expect(JSON.stringify(receipt)).not.toContain('google-test');
  });

  it('fails closed when either provider credential is missing', async () => {
    await expect(runProviderNativeNoSpendPreflightV2R({
      manifest,
      environment: { OPENAI_API_KEY: 'openai-test', VERCEL_OIDC_TOKEN: testOidc() },
      fetchImpl: fakeProviderFetch([]),
    })).rejects.toThrow('PROVIDER_NATIVE_PREFLIGHT_SECRET_MISSING:GEMINI_API_KEY_OR_GOOGLE_API_KEY');
  });

  it('fails closed on a provider-native model identity mismatch', async () => {
    await expect(runProviderNativeNoSpendPreflightV2R({
      manifest,
      environment: providerEnvironment(),
      fetchImpl: fakeProviderFetch([], { wrongLunaIdentity: true }),
    })).rejects.toThrow('PROVIDER_NATIVE_PREFLIGHT_MODEL_IDENTITY_DRIFT:OPENAI_LUNA');
  });

  it('fails closed when the official Gemini count exceeds the frozen input budget', async () => {
    await expect(runProviderNativeNoSpendPreflightV2R({
      manifest,
      environment: providerEnvironment(),
      fetchImpl: fakeProviderFetch([], { googleTokens: 100_000 }),
    })).rejects.toThrow('PROVIDER_NATIVE_PREFLIGHT_INPUT_BUDGET_EXCEEDED:GOOGLE_FLASH');
  });

  it('fails closed before inference when the Vercel sandbox credential is expired', async () => {
    await expect(runProviderNativeNoSpendPreflightV2R({
      manifest,
      environment: providerEnvironment(testOidc(1)),
      fetchImpl: fakeProviderFetch([]),
    })).rejects.toThrow('PROVIDER_NATIVE_PREFLIGHT_VERCEL_OIDC_EXPIRED_OR_NEAR_EXPIRY');
  });
});

function providerEnvironment(vercelOidcToken = testOidc()): Record<string, string> {
  return {
    OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'google-test',
    VERCEL_OIDC_TOKEN: vercelOidcToken,
  };
}

function testOidc(expiresInSeconds = 3600): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.test-signature`;
}

function fakeProviderFetch(
  calls: FetchCall[],
  options: { wrongLunaIdentity?: boolean; googleTokens?: number } = {},
): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith(':countTokens')) {
      return jsonResponse({ totalTokens: options.googleTokens ?? 12_000 });
    }
    if (url.includes('/v1/models/gpt-5.6-luna')) {
      return jsonResponse({ id: options.wrongLunaIdentity ? 'gpt-5.6-terra' : 'gpt-5.6-luna' });
    }
    if (url.includes('/v1/models/gpt-5.6-terra')) return jsonResponse({ id: 'gpt-5.6-terra' });
    if (url.includes('/v1beta/models/gemini-3.7-flash')) {
      return jsonResponse({ name: 'models/gemini-3.7-flash' });
    }
    return jsonResponse({ error: 'unexpected endpoint' }, 500);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
