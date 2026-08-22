import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  preflightSealedHoldoutCredentialsV2R,
  type SealedHoldoutBenchmarkEgressAuthorizationV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-credential-preflight-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import { preflightSealedHoldoutCohortV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-preflight-v2r';
import type { HoldoutMediaManifestV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';

async function fixtures() {
  const [source, mediaBytes] = await Promise.all([
    readFile(path.resolve(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R)),
    readFile(path.resolve('.calibration-temp/open-ended-planner-v2/holdout-media-v2r-r4-20260822/manifest.json')),
  ]);
  const manifest = buildSealedHoldoutCohortManifestV2R(
    createHash('sha256').update(source).digest('hex'),
  );
  const mediaManifest = JSON.parse(mediaBytes.toString('utf8')) as HoldoutMediaManifestV2R;
  return {
    manifest,
    localPreflight: preflightSealedHoldoutCohortV2R({ manifest, mediaManifest }),
  };
}

function authorization(manifestSha256: string): SealedHoldoutBenchmarkEgressAuthorizationV2R {
  return {
    operatorId: 'admin', manifestSha256,
    permittedNetworkActions: ['MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS'],
    inferenceCalls: 0,
  };
}

function environment() {
  return {
    OPENAI_API_KEY: 'openai-production-test',
    GOOGLE_GENERATIVE_AI_API_KEY: 'google-production-test',
    GEMINI_API_KEY: 'google-free-test',
  };
}

function providerFetch(totalTokens = 10_000, wrongModel = false) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET' });
    if (url.endsWith(':countTokens')) {
      return new Response(JSON.stringify({ totalTokens }), { status: 200 });
    }
    const model = decodeURIComponent(url.split('/').at(-1) ?? '');
    return new Response(JSON.stringify(model.startsWith('gemini-')
      ? { name: `models/${wrongModel ? 'wrong-model' : model}` }
      : { id: wrongModel ? 'wrong-model' : model }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('sealed holdout credential and initial-request preflight V2R', () => {
  it('captures and bounds all 96 fair initial requests with zero inference', async () => {
    const { manifest, localPreflight } = await fixtures();
    const network = providerFetch();
    const result = await preflightSealedHoldoutCredentialsV2R({
      manifest, localPreflight, authorization: authorization(manifest.manifestSha256),
      environment: environment(), fetchImpl: network.fetchImpl,
    });
    expect(result.receipt).toMatchObject({
      assessment: 'PASS_INITIAL_REQUESTS_BOUNDED_PROOF_AND_RUNTIME_GUARDS_PENDING',
      googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY',
      networkCalls: {
        modelMetadataGets: 3, googleCountTokensPosts: 32,
        providerContextEgressCalls: 32, inferenceCalls: 0,
      },
      secretsPersisted: false, projectReads: 0, projectMutations: 0,
      runtimePerTurnTokenGuardRequired: true,
      realProofAdapterGate: 'PENDING', dispatchAuthorized: false,
    });
    expect(result.receipt.checks).toHaveLength(96);
    expect(result.requestCaptures).toHaveLength(96);
    expect(network.calls).toHaveLength(35);
    expect(network.calls.filter(({ url }) => url.endsWith(':countTokens'))).toHaveLength(32);
    expect(network.calls.some(({ url }) => url.endsWith('/responses')
      || url.endsWith('/interactions'))).toBe(false);
    const h01 = result.receipt.checks.filter((check) => check.caseId === 'HOLD-01:C1');
    expect(new Set(h01.map((check) => check.operatorOrderSha256))).toHaveLength(1);
    expect(new Set(result.receipt.checks.map((check) => check.operatorOrderSha256)).size)
      .toBeGreaterThan(8);
    expect(new Set(result.receipt.checks.map((check) => check.model)))
      .toEqual(new Set(['gpt-5.6-luna', 'gpt-5.6-terra', 'gemini-3.7-flash']));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/evaluatorOnly|behaviourBrief|successPredicates|C4_NOISY/);
    expect(serialized).not.toContain('openai-production-test');
    expect(serialized).not.toContain('google-production-test');
  });

  it('requires the paid production Google credential source', async () => {
    const { manifest, localPreflight } = await fixtures();
    await expect(preflightSealedHoldoutCredentialsV2R({
      manifest, localPreflight, authorization: authorization(manifest.manifestSha256),
      environment: { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'free-google' },
      fetchImpl: providerFetch().fetchImpl,
    })).rejects.toThrow('SEALED_CREDENTIAL_PREFLIGHT_PAID_GOOGLE_CREDENTIAL_REQUIRED');
  });

  it('fails before dispatch when model metadata identity is wrong', async () => {
    const { manifest, localPreflight } = await fixtures();
    await expect(preflightSealedHoldoutCredentialsV2R({
      manifest, localPreflight, authorization: authorization(manifest.manifestSha256),
      environment: environment(), fetchImpl: providerFetch(10_000, true).fetchImpl,
    })).rejects.toThrow('SEALED_CREDENTIAL_PREFLIGHT_MODEL_ACCESS_FAILED');
  });

  it('fails when an initial provider request exceeds the frozen input bound', async () => {
    const { manifest, localPreflight } = await fixtures();
    await expect(preflightSealedHoldoutCredentialsV2R({
      manifest, localPreflight, authorization: authorization(manifest.manifestSha256),
      environment: environment(), fetchImpl: providerFetch(75_000).fetchImpl,
    })).rejects.toThrow('SEALED_CREDENTIAL_PREFLIGHT_INPUT_BUDGET_EXCEEDED');
  });
});
