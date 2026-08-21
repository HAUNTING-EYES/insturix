import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { deepFreezeV1, hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import {
  assertProviderNativeHandoffOrderManifestV2R,
  buildProviderNativeHandoffOrderManifestV2R,
  evaluateProviderNativeHandoffOrderEpisodeV2R,
  preflightProviderNativeHandoffOrderV2R,
  PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_SHA256_V2R,
  PROVIDER_NATIVE_HANDOFF_ORDER_OPERATOR_ORDER_V2R,
  type ProviderNativeHandoffOrderManifestV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-handoff-order-experiment-v2r';
import { resolveProviderNativeCredentialsV2R } from '@/lib/editron/research/open-ended-planner/provider-native-live-transport-v2r';
import { buildV2RBenchmarkTaskRegistryV2 } from '@/lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';

type JsonRecord = Record<string, unknown>;

let manifest: Readonly<ProviderNativeHandoffOrderManifestV2R>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({
    audioBytes, analyzerSourceBytes,
  });
  manifest = buildProviderNativeHandoffOrderManifestV2R(
    buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured }),
  );
});

describe('provider-native DEV-03 handoff and order experiment V2R', () => {
  it('freezes two arms, three current routes, and a deliberately non-causal tool order', () => {
    expect(manifest.routes.map(({ route }) => route.model)).toEqual([
      'gpt-5.6-luna', 'gpt-5.6-terra', 'gemini-3.7-flash',
    ]);
    expect(manifest.arms).toEqual([
      'DIRECT_ARGUMENTS', 'OPAQUE_RESULT_REFERENCES',
    ]);
    expect(manifest.episodeOperatorOrder).toEqual(
      PROVIDER_NATIVE_HANDOFF_ORDER_OPERATOR_ORDER_V2R,
    );
    expect(manifest.episodeOperatorOrder.indexOf('sync_cuts_to_beats'))
      .toBeLessThan(manifest.episodeOperatorOrder.indexOf('find_audio_moment'));
    expect(manifest.requiredCausalOrder).toEqual([
      'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake',
    ]);
    expect(manifest.repetitionsPerRouteArm).toBe(3);
    expect(manifest.evaluatorSourceSha256)
      .toBe(PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_SHA256_V2R);
    expect(manifest.evaluatorPolicySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.absoluteMaxSpendUsd).toBeGreaterThan(0);
    expect(manifest.stateEffects).toEqual([]);
  });

  it('rejects a rehashed attempt to change the frozen operator permutation', () => {
    const { manifestSha256: _manifestSha256, ...material } = manifest;
    const tamperedMaterial = {
      ...material,
      episodeOperatorOrder: [...manifest.episodeOperatorOrder].reverse(),
    };
    const tampered = deepFreezeV1({
      ...tamperedMaterial,
      manifestSha256: hashCanonicalJsonV1(tamperedMaterial),
    });
    expect(() => assertProviderNativeHandoffOrderManifestV2R(tampered))
      .toThrow('PROVIDER_NATIVE_HANDOFF_ORDER_MANIFEST_DRIFT');

    const sourceTamperedMaterial = {
      ...material,
      evaluatorSourceSha256: '0'.repeat(64),
    };
    expect(() => assertProviderNativeHandoffOrderManifestV2R({
      ...sourceTamperedMaterial,
      manifestSha256: hashCanonicalJsonV1(sourceTamperedMaterial),
    })).toThrow('PROVIDER_NATIVE_HANDOFF_ORDER_MANIFEST_DRIFT');
  });

  it('preflights both exact request arms without inference and selects the paid Google key', async () => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith(':countTokens')) {
        return new Response(JSON.stringify({ totalTokens: 1_000 }), { status: 200 });
      }
      const model = decodeURIComponent(url.split('/').at(-1) ?? '');
      return new Response(JSON.stringify(model.startsWith('gemini-')
        ? { name: `models/${model}` }
        : { id: model }), { status: 200 });
    }) as unknown as typeof fetch;

    const receipt = await preflightProviderNativeHandoffOrderV2R({
      manifest,
      environment: {
        OPENAI_API_KEY: 'openai-test',
        GOOGLE_GENERATIVE_AI_API_KEY: 'google-paid-test',
        GEMINI_API_KEY: 'google-free-test',
      },
      fetchImpl,
    });

    expect(receipt).toMatchObject({
      assessment: 'PASS_READY',
      googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY',
      networkCalls: { modelMetadataGets: 3, googleCountTokensPosts: 2, inferenceCalls: 0 },
      secretsPersisted: false,
      stateEffects: [],
    });
    expect(records(receipt.checks)).toHaveLength(6);
    const direct = records(receipt.checks).find(({ routeId, arm }) => (
      routeId === 'OPENAI_LUNA' && arm === 'DIRECT_ARGUMENTS'
    ));
    const opaque = records(receipt.checks).find(({ routeId, arm }) => (
      routeId === 'OPENAI_LUNA' && arm === 'OPAQUE_RESULT_REFERENCES'
    ));
    expect(direct?.requestSha256).not.toBe(opaque?.requestSha256);
    expect(requests.some((url) => url.endsWith('/interactions'))).toBe(false);
  });

  it('requires correct first-attempt order, rendered proof, and exact opaque binding', () => {
    const receipt = episodeReceipt([
      turn('find_audio_moment'),
      turn('sync_cuts_to_beats', [{
        targetField: 'beatPlan', sourceOperatorId: 'find_audio_moment',
        sourceOutputField: 'result', resultReferenceId: 'result_t1_2',
      }]),
      turn('apply_camera_shake'),
    ]);
    expect(evaluateProviderNativeHandoffOrderEpisodeV2R(
      receipt, 'OPAQUE_RESULT_REFERENCES', manifest.requiredCausalOrder,
    )).toMatchObject({
      assessment: 'PASS', firstAttemptOrderPass: true,
      successfulOrderPass: true, referenceHandoffPass: true,
      renderedProductPass: true, noProjectMutation: true,
    });

    const wrongOrder = episodeReceipt([
      turn('sync_cuts_to_beats', [], 'FAIL'),
      turn('find_audio_moment'),
      turn('sync_cuts_to_beats', [{
        targetField: 'beatPlan', sourceOperatorId: 'find_audio_moment',
        sourceOutputField: 'result', resultReferenceId: 'result_t2_2',
      }]),
      turn('apply_camera_shake'),
    ]);
    expect(evaluateProviderNativeHandoffOrderEpisodeV2R(
      wrongOrder, 'OPAQUE_RESULT_REFERENCES', manifest.requiredCausalOrder,
    )).toMatchObject({
      assessment: 'FAIL', firstAttemptOrderPass: false,
      successfulOrderPass: true, referenceHandoffPass: true,
      reasonCodes: ['FIRST_ATTEMPT_CAUSAL_ORDER_FAILED'],
    });

    expect(evaluateProviderNativeHandoffOrderEpisodeV2R(
      episodeReceipt([
        turn('find_audio_moment'), turn('sync_cuts_to_beats'),
        turn('apply_camera_shake'),
      ]),
      'DIRECT_ARGUMENTS',
      manifest.requiredCausalOrder,
    )).toMatchObject({ assessment: 'PASS', referenceHandoffPass: true });
  });

  it('keeps provider and render infrastructure failures out of model FAIL counts', () => {
    const provider = episodeReceipt([]);
    provider.providerEpisode = {
      turns: [], terminal: { disposition: 'PROVIDER_RATE_LIMIT' },
    };
    provider.productOutcome = 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE';
    expect(evaluateProviderNativeHandoffOrderEpisodeV2R(
      provider, 'DIRECT_ARGUMENTS', manifest.requiredCausalOrder,
    )).toMatchObject({ assessment: 'PROVIDER_INFRASTRUCTURE_UNVERIFIABLE' });

    const render = episodeReceipt([
      turn('find_audio_moment'), turn('sync_cuts_to_beats'),
      turn('apply_camera_shake'),
    ]);
    render.productOutcome = 'FAIL';
    render.execution = { proofAttempts: [{ error: 'NetworkError: A network error occurred.' }] };
    expect(evaluateProviderNativeHandoffOrderEpisodeV2R(
      render, 'DIRECT_ARGUMENTS', manifest.requiredCausalOrder,
    )).toMatchObject({ assessment: 'RENDER_INFRASTRUCTURE_UNVERIFIABLE' });
  });

  it('makes the paid Google credential precedence explicit without persisting keys', () => {
    const selected = resolveProviderNativeCredentialsV2R({
      OPENAI_API_KEY: 'openai-test',
      GOOGLE_GENERATIVE_AI_API_KEY: 'paid',
      GEMINI_API_KEY: 'free',
      GOOGLE_API_KEY: 'legacy',
    });
    expect(selected).toEqual({
      openAiKey: 'openai-test', googleKey: 'paid',
      googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });
  });
});

function turn(
  operatorId: string,
  bindings: readonly JsonRecord[] = [],
  disposition: 'OK' | 'FAIL' = 'OK',
): JsonRecord {
  return {
    modelCall: { name: operatorId },
    execution: { disposition },
    argumentReferenceBindings: bindings,
  };
}

function episodeReceipt(turns: readonly JsonRecord[]): JsonRecord {
  return {
    providerEpisode: { turns },
    productOutcome: 'PASS',
    stateEffects: [],
  };
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : [];
}
