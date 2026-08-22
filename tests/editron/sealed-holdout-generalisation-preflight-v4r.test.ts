import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

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
import {
  buildSealedHoldoutGeneralisationManifestV4R,
  SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r';
import {
  preflightSealedHoldoutGeneralisationV4R,
  type SealedHoldoutGeneralisationEgressAuthorizationV4R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-preflight-v4r';

async function fixtures() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  const baseManifest = buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
  const implementationBindings = await Promise.all(
    SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R.map(async (path) => ({
      path,
      sha256: await fileSha(path),
    })),
  );
  const generalisationManifest = buildSealedHoldoutGeneralisationManifestV4R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R),
    baseManifest,
    implementationBindings,
  });
  return { baseManifest, generalisationManifest };
}

function authorization(
  generalisationManifestSha256: string,
): SealedHoldoutGeneralisationEgressAuthorizationV4R {
  return {
    operatorId: 'admin',
    generalisationManifestSha256,
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

describe('sealed Stage 2.5 generalisation credential preflight V4R', () => {
  it('captures all 45 current initial requests while making zero inference calls', async () => {
    const { baseManifest, generalisationManifest } = await fixtures();
    const network = providerFetch();
    const result = await preflightSealedHoldoutGeneralisationV4R({
      generalisationManifest,
      baseManifest,
      authorization: authorization(generalisationManifest.manifestSha256),
      environment: environment(),
      fetchImpl: network.fetchImpl,
    });

    expect(result.receipt).toMatchObject({
      generalisationManifestSha256: generalisationManifest.manifestSha256,
      baseManifestSha256: baseManifest.manifestSha256,
      rowSetSha256: generalisationManifest.rowSetSha256,
      routeSetSha256: generalisationManifest.routeSetSha256,
      googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY',
      networkCalls: {
        modelMetadataGets: 3,
        googleCountTokensPosts: 15,
        providerContextEgressCalls: 15,
        inferenceCalls: 0,
      },
      realProofAdapterGate: 'PASS_CURRENT_PROOFS',
      dispatchAuthorized: false,
      assessment: 'PASS_V4R_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE',
      projectReads: 0,
      projectMutations: 0,
      stateEffects: [],
    });
    expect(result.receipt.checks).toHaveLength(45);
    expect(result.requestCaptures).toHaveLength(45);
    expect(new Set(result.requestCaptures.map(({ rowId }) => rowId))).toHaveLength(45);
    expect(new Set(result.requestCaptures.map(({ request }) => request.requestHash)))
      .toHaveLength(45);
    expect(network.calls).toHaveLength(18);
    expect(network.calls.filter(({ url }) => url.endsWith(':countTokens'))).toHaveLength(15);
    expect(network.calls.some(({ url }) => url.endsWith('/responses')
      || url.endsWith('/interactions') || url.includes(':generateContent'))).toBe(false);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('openai-production-test');
    expect(serialized).not.toContain('google-production-test');
    expect(serialized).not.toMatch(/evaluatorOnly|behaviourBrief|successPredicates/);
  });

  it('requires the paid Google credential and exact model identities', async () => {
    const { baseManifest, generalisationManifest } = await fixtures();
    await expect(preflightSealedHoldoutGeneralisationV4R({
      generalisationManifest,
      baseManifest,
      authorization: authorization(generalisationManifest.manifestSha256),
      environment: { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'free-google' },
      fetchImpl: providerFetch().fetchImpl,
    })).rejects.toThrow('SEALED_V4R_PREFLIGHT_PAID_GOOGLE_CREDENTIAL_REQUIRED');

    await expect(preflightSealedHoldoutGeneralisationV4R({
      generalisationManifest,
      baseManifest,
      authorization: authorization(generalisationManifest.manifestSha256),
      environment: environment(),
      fetchImpl: providerFetch(10_000, true).fetchImpl,
    })).rejects.toThrow('SEALED_V4R_PREFLIGHT_MODEL_ACCESS_FAILED');
  });

  it('fails closed when a current request exceeds the input budget', async () => {
    const { baseManifest, generalisationManifest } = await fixtures();
    await expect(preflightSealedHoldoutGeneralisationV4R({
      generalisationManifest,
      baseManifest,
      authorization: authorization(generalisationManifest.manifestSha256),
      environment: environment(),
      fetchImpl: providerFetch(75_000).fetchImpl,
    })).rejects.toThrow('SEALED_V4R_PREFLIGHT_INPUT_BUDGET_EXCEEDED');
  });
});

async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
