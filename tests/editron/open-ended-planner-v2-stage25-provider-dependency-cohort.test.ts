import { describe, expect, it, vi } from 'vitest';

import {
  assertStage25ProviderDependencyCohortManifestV1,
  buildStage25ProviderDependencyCohortManifestV1,
  preflightStage25ProviderDependencyCohortV1,
} from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-v1';

const SOURCE_COMMIT = 'a'.repeat(40);
const EVALUATOR_SHA256 = 'b'.repeat(64);

describe('Stage 2.5 provider dependency cohort', () => {
  it('freezes three canonical routes and three distinct tool presentations', () => {
    const manifest = buildStage25ProviderDependencyCohortManifestV1({
      sourceCommit: SOURCE_COMMIT,
      evaluatorSourceSha256: EVALUATOR_SHA256,
    });
    expect(manifest.routes.map(({ route }) => `${route.routeId}:${route.model}`)).toEqual([
      'OPENAI_LUNA:gpt-5.6-luna',
      'OPENAI_TERRA:gpt-5.6-terra',
      'GOOGLE_FLASH:gemini-3.7-flash',
    ]);
    expect(manifest).toMatchObject({
      repetitionsPerRoute: 3,
      rowCount: 9,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      stateEffects: [],
    });
    expect(new Set(manifest.presentations.map(
      ({ operatorOrderSha256 }) => operatorOrderSha256,
    )).size).toBe(3);
    expect(new Set(manifest.presentations.map(
      ({ toolSetSha256 }) => toolSetSha256,
    )).size).toBe(3);
    expect(assertStage25ProviderDependencyCohortManifestV1(manifest))
      .toEqual(manifest);
  });

  it('rejects a copied or edited cohort manifest', () => {
    const manifest = buildStage25ProviderDependencyCohortManifestV1({
      sourceCommit: SOURCE_COMMIT,
      evaluatorSourceSha256: EVALUATOR_SHA256,
    });
    expect(() => assertStage25ProviderDependencyCohortManifestV1({
      ...manifest,
      maxInputTokensPerTurn: 59_999,
    })).toThrow('MANIFEST_DRIFT');
  });

  it('performs metadata and token checks without inference or state effects', async () => {
    const manifest = buildStage25ProviderDependencyCohortManifestV1({
      sourceCommit: SOURCE_COMMIT,
      evaluatorSourceSha256: EVALUATOR_SHA256,
    });
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith(':countTokens')) {
        return jsonResponse({ totalTokens: 12_000 });
      }
      const model = url.split('/').at(-1) ?? '';
      return jsonResponse(model.startsWith('gemini-')
        ? { name: `models/${model}` }
        : { id: model });
    }) as unknown as typeof fetch;
    const receipt = await preflightStage25ProviderDependencyCohortV1({
      manifest,
      environment: {
        OPENAI_API_KEY: 'test-openai',
        GOOGLE_GENERATIVE_AI_API_KEY: 'test-google',
      },
      fetchImpl,
    });
    expect(receipt).toMatchObject({
      assessment: 'PASS_READY',
      networkCalls: {
        modelMetadataGets: 3,
        googleCountTokensPosts: 3,
        inferenceCalls: 0,
      },
      secretsPersisted: false,
      stateEffects: [],
    });
    expect(Array.isArray(receipt.checks) ? receipt.checks : []).toHaveLength(9);
    expect(urls.filter((url) => url.endsWith(':countTokens'))).toHaveLength(3);
    expect(urls.some((url) => url.endsWith('/responses'))).toBe(false);
    expect(urls.some((url) => url.endsWith('/interactions'))).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('test-openai');
    expect(JSON.stringify(receipt)).not.toContain('test-google');
  });

  it('fails before network access when a cohort credential is missing', async () => {
    const manifest = buildStage25ProviderDependencyCohortManifestV1({
      sourceCommit: SOURCE_COMMIT,
      evaluatorSourceSha256: EVALUATOR_SHA256,
    });
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(preflightStage25ProviderDependencyCohortV1({
      manifest,
      environment: { OPENAI_API_KEY: 'test-openai' },
      fetchImpl,
    })).rejects.toThrow('PROVIDER_NATIVE_LIVE_SECRET_MISSING');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
