import { describe, expect, it, vi } from 'vitest';

import { buildDev02GeneratedCompositionModelPacketV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-model-candidate-v1';
import {
  buildGeneratedCompositionAssessmentFailureV1,
  buildGeneratedCompositionModelBenchmarkPlanV1,
  runGeneratedCompositionSourceProviderCallV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-model-benchmark-v1';

const API_HASH = 'a'.repeat(64);
const candidate = {
  artifactType: 'GeneratedCompositionSourceCandidateV1',
  taskId: 'DEV-02',
  source: 'export const GeneratedComposition = () => null;',
};

describe('open-ended planner V2 generated-composition model benchmark', () => {
  it('freezes Luna, Terra, Gemini Flash, and Qwen through their authorized routes', async () => {
    const first = await buildGeneratedCompositionModelBenchmarkPlanV1(API_HASH);
    const second = await buildGeneratedCompositionModelBenchmarkPlanV1(API_HASH);
    expect(first).toEqual(second);
    expect(first.routes.map(({ routeId, requestModel }) => [routeId, requestModel])).toEqual([
      ['OPENAI_LUNA', 'gpt-5.6-luna'],
      ['OPENAI_TERRA', 'gpt-5.6-terra'],
      ['GOOGLE_FLASH', 'gemini-3.6-flash'],
      ['QWEN_3_8_MAX', 'qwen/qwen3.8-max'],
    ]);
    expect(first.spend.absoluteMaxSpendUsd).toBe(6);
    expect(first.exclusions).toEqual([]);
  });

  it('uses Google countTokens before the correctly named generation request', async () => {
    const plan = await buildGeneratedCompositionModelBenchmarkPlanV1(API_HASH);
    const route = plan.routes.find(({ routeId }) => routeId === 'GOOGLE_FLASH')!;
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith(':countTokens')) return new Response(JSON.stringify({ totalTokens: 1_000 }), { status: 200 });
      return new Response(JSON.stringify({
        responseId: 'google-response-1', modelVersion: 'gemini-3.6-flash',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(candidate) }] } }],
        usageMetadata: { promptTokenCount: 1_000, candidatesTokenCount: 50, thoughtsTokenCount: 0, totalTokenCount: 1_050 },
      }), { status: 200 });
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const result = await runGeneratedCompositionSourceProviderCallV1({
      artifact: buildDev02GeneratedCompositionModelPacketV1({ apiImplementationHash: API_HASH }),
      route, apiKey: 'test-key', fetchImpl,
    });
    expect(result.run.disposition).toBe('ARTIFACT_ACCEPTED');
    expect(result.preflightCounts).toEqual([expect.objectContaining({ method: 'GOOGLE_COUNT_TOKENS', inputTokens: 1_000 })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/models/gemini-3.6-flash:generateContent');
  });

  it('hash-binds bounded assessment failures without project state effects', () => {
    const input = {
      routeId: 'OPENAI_LUNA' as const,
      candidateOrdinal: 0 as const,
      failureStage: 'SANDBOX_RENDER' as const,
      observedAt: '2026-08-14T12:00:00.000Z',
      programHash: 'b'.repeat(64),
      sourceBundleHash: 'c'.repeat(64),
      diagnostics: ['takeoverProgress is outside [0,1]'],
    };
    const first = buildGeneratedCompositionAssessmentFailureV1(input);
    const second = buildGeneratedCompositionAssessmentFailureV1(input);
    expect(first).toEqual(second);
    expect(first.failureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.stateEffects).toEqual([]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => buildGeneratedCompositionAssessmentFailureV1({ ...input, diagnostics: [] })).toThrow(
      'MODEL_BENCHMARK_FAILURE_DIAGNOSTIC_COUNT_INVALID',
    );
    expect(() => buildGeneratedCompositionAssessmentFailureV1({ ...input, programHash: 'not-a-hash' })).toThrow(
      'MODEL_BENCHMARK_FAILURE_IDENTITY_INVALID',
    );
    expect(() => buildGeneratedCompositionAssessmentFailureV1({ ...input, observedAt: 'not-a-timestamp' })).toThrow(
      'MODEL_BENCHMARK_FAILURE_TIMESTAMP_INVALID',
    );
    expect(() => buildGeneratedCompositionAssessmentFailureV1({ ...input, diagnostics: ['x'.repeat(2_001)] })).toThrow(
      'MODEL_BENCHMARK_FAILURE_DIAGNOSTIC_INVALID',
    );
  });
});
