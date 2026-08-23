import { describe, expect, it } from 'vitest';

import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v7';
import {
  assertStage25LongFormProviderCohortManifestV1,
  buildStage25LongFormProviderCohortManifestV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v1';
import {
  preflightStage25LongFormProvidersV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-preflight-v1';
import {
  buildStage25LongFormProviderContextV1,
  buildStage25LongFormProviderFinishSchemaV1,
  buildStage25LongFormProviderToolSetV1,
  captureStage25LongFormProviderInitialRequestV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-protocol-v1';

const SOURCE_BINDING = {
  sourceCommit: 'a'.repeat(40),
  holdoutSourceSha256: 'b'.repeat(64),
  compilerSourceSha256: 'c'.repeat(64),
  protocolSourceSha256: 'd'.repeat(64),
};

describe('Stage 2.5 long-form provider zero-inference preflight', () => {
  it('freezes the current three-model roster, CAP-2A V7 and nine rows', () => {
    const manifest = buildStage25LongFormProviderCohortManifestV1(SOURCE_BINDING);
    expect(manifest.routeRoster.map(({ route }) => [route.routeId, route.model]))
      .toEqual([
        ['OPENAI_LUNA', 'gpt-5.6-luna'],
        ['OPENAI_TERRA', 'gpt-5.6-terra'],
        ['GOOGLE_FLASH', 'gemini-3.7-flash'],
      ]);
    expect(manifest.rows).toHaveLength(9);
    expect(manifest.sourceBinding.cap2ManifestSha256)
      .toBe(CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.manifestHash);
    expect(manifest.absoluteMaxSpendUsd).toBeGreaterThan(0);
    expect(manifest.stateEffects).toEqual([]);
  });

  it('uses a control-only planning submission and three bound presentations', () => {
    const schema = buildStage25LongFormProviderFinishSchemaV1();
    const toolSet = buildStage25LongFormProviderToolSetV1();
    const contexts = [1, 2, 3].map(buildStage25LongFormProviderContextV1);
    expect(toolSet.operatorIds).toEqual([]);
    expect(toolSet.operators).toEqual([]);
    expect(toolSet.finishControl.inputSchema).toEqual(schema);
    expect(new Set(contexts.map((context) => context.episodeId)).size).toBe(3);
    expect(contexts.every((context) => context.budget.maxTurns === 1)).toBe(true);
    expect(contexts.every((context) => (
      (context.authorityAndPolicy.stateEffects as unknown[]).length === 0
    ))).toBe(true);
  });

  it('makes durable opaque handoff an explicit hash-bound request mode', async () => {
    const route = buildStage25LongFormProviderCohortManifestV1(SOURCE_BINDING)
      .routeRoster[0].route;
    const direct = await captureStage25LongFormProviderInitialRequestV1({
      route, presentationOrdinal: 1,
    });
    const durable = await captureStage25LongFormProviderInitialRequestV1({
      route, presentationOrdinal: 1, durableMode: true,
    });
    const serialized = JSON.stringify(durable.body);
    expect(durable.requestHash).not.toBe(direct.requestHash);
    expect(serialized).toContain('OPAQUE_RESULT_REFERENCES');
    expect(serialized).toContain('resultReferences');
    expect(serialized).not.toContain('set_keyframes');
  });

  it('captures all nine requests with metadata/count-only network access', async () => {
    const manifest = buildStage25LongFormProviderCohortManifestV1(SOURCE_BINDING);
    const calls: Array<{ url: string; method: string }> = [];
    const result = await preflightStage25LongFormProvidersV1({
      manifest,
      confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin',
      environment: {
        OPENAI_API_KEY: 'test-openai-secret',
        GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-secret',
      },
      fetchImpl: fakeFetch(calls, 12_345),
    });
    expect(result.requestCaptures).toHaveLength(9);
    expect(new Set(result.requestCaptures.map(({ rowId }) => rowId)).size).toBe(9);
    expect(new Set(result.requestCaptures.map(({ request }) => request.requestHash)).size)
      .toBe(9);
    expect(result.receipt).toMatchObject({
      manifestSha256: manifest.manifestSha256,
      googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY',
      networkCalls: {
        modelMetadataGets: 3,
        googleCountTokensPosts: 3,
        inferenceCalls: 0,
      },
      dispatchAuthorized: false,
      projectReads: 0,
      projectMutations: 0,
      assessment: 'PASS_9_INITIAL_REQUESTS_BOUNDED_ZERO_INFERENCE',
    });
    expect(calls).toHaveLength(6);
    expect(calls.every(({ url }) => (
      !url.endsWith('/responses') && !url.endsWith('/interactions')
    ))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('test-openai-secret');
    expect(JSON.stringify(result)).not.toContain('test-google-secret');
  });

  it('rejects manifest drift and non-production Google credentials', async () => {
    const manifest = buildStage25LongFormProviderCohortManifestV1(SOURCE_BINDING);
    const forged = structuredClone(manifest) as unknown as {
      rows: Array<{ rowId: string }>;
    };
    forged.rows[0].rowId = 'forged';
    expect(() => assertStage25LongFormProviderCohortManifestV1(forged))
      .toThrow('STAGE25_LONG_FORM_PROVIDER_MANIFEST_DRIFT');
    await expect(preflightStage25LongFormProvidersV1({
      manifest,
      confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin',
      environment: {
        OPENAI_API_KEY: 'test-openai-secret',
        GEMINI_API_KEY: 'test-non-production-google-secret',
      },
      fetchImpl: fakeFetch([], 12_345),
    })).rejects.toThrow(
      'STAGE25_LONG_FORM_PREFLIGHT_PRODUCTION_GOOGLE_CREDENTIAL_REQUIRED',
    );
  });

  it('fails before authorization when the official Google count exceeds budget', async () => {
    const manifest = buildStage25LongFormProviderCohortManifestV1(SOURCE_BINDING);
    await expect(preflightStage25LongFormProvidersV1({
      manifest,
      confirmedManifestSha256: manifest.manifestSha256,
      operatorId: 'admin',
      environment: {
        OPENAI_API_KEY: 'test-openai-secret',
        GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-secret',
      },
      fetchImpl: fakeFetch([], 1_000_000),
    })).rejects.toThrow('STAGE25_LONG_FORM_PREFLIGHT_INPUT_BUDGET_EXCEEDED');
  });
});

function fakeFetch(
  calls: Array<{ url: string; method: string }>,
  googleTokens: number,
): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    if (method === 'POST' && url.endsWith(':countTokens')) {
      return response({ totalTokens: googleTokens });
    }
    if (method === 'GET' && url.includes('/v1/models/gpt-5.6-')) {
      return response({ id: url.split('/').at(-1) });
    }
    if (method === 'GET' && url.includes('/v1beta/models/gemini-3.7-flash')) {
      return response({ name: 'models/gemini-3.7-flash' });
    }
    throw new Error(`UNEXPECTED_NETWORK_CALL:${method}:${url}`);
  };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}
