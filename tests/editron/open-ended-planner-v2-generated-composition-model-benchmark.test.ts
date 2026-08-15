import { describe, expect, it, vi } from 'vitest';

import { buildDev02GeneratedCompositionModelPacketV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-model-candidate-v1';
import {
  buildGeneratedCompositionAssessmentFailureV1,
  buildGeneratedCompositionBenchmarkExecutionV1,
  buildGeneratedCompositionBenchmarkSandboxResourcesV1,
  buildGeneratedCompositionModelBenchmarkPlanV1,
  assertGeneratedCompositionDirectExecutionV1,
  classifyGeneratedCompositionBenchmarkExecutionErrorV1,
  runGeneratedCompositionSourceProviderCallV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-model-benchmark-v1';
import { GeneratedCompositionSandboxExecutionErrorV1 } from '@/lib/editron/research/open-ended-planner/generated-composition-sandbox-runner-v1';
import { DEV02_GENERATED_COMPOSITION_PROGRAM_V1 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

const API_HASH = 'a'.repeat(64);
const candidate = {
  artifactType: 'GeneratedCompositionSourceCandidateV1',
  taskId: 'DEV-02',
  source: 'export const GeneratedComposition = () => null;',
};

describe('open-ended planner V2 generated-composition model benchmark', () => {
  it('freezes direct Luna, Terra, and Gemini routes plus the separate Qwen agent-shell lane', async () => {
    const first = await buildGeneratedCompositionModelBenchmarkPlanV1(API_HASH);
    const second = await buildGeneratedCompositionModelBenchmarkPlanV1(API_HASH);
    expect(first).toEqual(second);
    expect(first.routes.map(({ routeId, requestModel }) => [routeId, requestModel])).toEqual([
      ['OPENAI_LUNA', 'gpt-5.6-luna'],
      ['OPENAI_TERRA', 'gpt-5.6-terra'],
      ['GOOGLE_FLASH', 'gemini-3.7-flash'],
      ['QWEN_3_8_MAX', 'qwen3.8-max'],
    ]);
    expect(first.executionLanes).toEqual({
      directProviderRouteIds: ['OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH'],
      agentShellRouteIds: ['QWEN_3_8_MAX'],
    });
    expect(first.spend).toMatchObject({
      absoluteMaxSpendUsd: 4.5,
      nonUsdRouteIds: ['QWEN_3_8_MAX'],
      nonUsdDisposition: 'TOKEN_PLAN_CREDITS_NO_COMPARABLE_USD_TELEMETRY',
    });
    expect(first.routes.find(({ routeId }) => routeId === 'QWEN_3_8_MAX')).toMatchObject({
      executionAdapter: 'OPENCODE_AGENT_SHELL',
      provider: 'alibaba-token-plan',
      credentialEnvironmentVariable: 'QWEN_API_KEY',
      pricing: null,
    });
    expect(first.exclusions).toEqual([]);
  });

  it('uses Google countTokens before the correctly named generation request', async () => {
    const plan = await buildGeneratedCompositionModelBenchmarkPlanV1(API_HASH);
    const route = plan.routes.find(({ routeId }) => routeId === 'GOOGLE_FLASH')!;
    if (route.executionAdapter !== 'DIRECT_PROVIDER') throw new Error('expected direct Google route');
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith(':countTokens')) return new Response(JSON.stringify({ totalTokens: 1_000 }), { status: 200 });
      return new Response(JSON.stringify({
        responseId: 'google-response-1', modelVersion: 'gemini-3.7-flash-08-2026',
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
    expect(String(fetchMock.mock.calls[1][0])).toContain('/models/gemini-3.7-flash:generateContent');
  });

  it('creates immutable canonical identities for selected repeated trials', async () => {
    const plan = await buildGeneratedCompositionModelBenchmarkPlanV1(API_HASH);
    const execution = buildGeneratedCompositionBenchmarkExecutionV1(plan, {
      trialId: 'v2-2-dev02-01',
      routeIds: ['OPENAI_TERRA', 'OPENAI_LUNA'],
    });
    expect(execution.routeIds).toEqual(['OPENAI_LUNA', 'OPENAI_TERRA']);
    expect(execution.executionAdapter).toBe('DIRECT_PROVIDER');
    expect(execution.maximumAuthorizedSpendUsd).toBe(3);
    expect(execution.evidenceDirectoryName).toBe(`evidence-${plan.planHash.slice(0, 16)}-v2-2-dev02-01`);
    expect(execution.executionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(execution)).toBe(true);
    expect(() => assertGeneratedCompositionDirectExecutionV1(plan, execution)).not.toThrow();

    const qwenExecution = buildGeneratedCompositionBenchmarkExecutionV1(plan, {
      trialId: 'v2-2-dev02-qwen-01',
      routeIds: ['QWEN_3_8_MAX'],
    });
    expect(qwenExecution.executionAdapter).toBe('OPENCODE_AGENT_SHELL');
    expect(qwenExecution.maximumAuthorizedSpendUsd).toBe(0);
    expect(() => assertGeneratedCompositionDirectExecutionV1(plan, qwenExecution)).toThrow(
      'MODEL_BENCHMARK_AGENT_SHELL_ROUTE_REQUIRES_SEPARATE_RUNNER',
    );
    expect(() => buildGeneratedCompositionBenchmarkExecutionV1(plan, {
      trialId: 'v2-2-dev02-mixed-01',
      routeIds: ['OPENAI_LUNA', 'QWEN_3_8_MAX'],
    })).toThrow('MODEL_BENCHMARK_EXECUTION_ADAPTER_MIXED');

    expect(() => buildGeneratedCompositionBenchmarkExecutionV1(plan, {
      trialId: '../overwrite', routeIds: ['OPENAI_LUNA'],
    })).toThrow('MODEL_BENCHMARK_TRIAL_ID_INVALID');
    expect(() => buildGeneratedCompositionBenchmarkExecutionV1(plan, {
      trialId: 'v2-2-dev02-02', routeIds: [],
    })).toThrow('MODEL_BENCHMARK_ROUTE_SELECTION_EMPTY');
    expect(() => buildGeneratedCompositionBenchmarkExecutionV1(plan, {
      trialId: 'v2-2-dev02-02', routeIds: ['OPENAI_LUNA', 'OPENAI_LUNA'],
    })).toThrow('MODEL_BENCHMARK_ROUTE_SELECTION_DUPLICATE');
    expect(() => buildGeneratedCompositionBenchmarkExecutionV1(plan, {
      trialId: 'v2-2-dev02-02', routeIds: ['NOT_A_ROUTE'],
    })).toThrow('MODEL_BENCHMARK_ROUTE_SELECTION_UNKNOWN');
  });

  it('hash-binds bounded assessment failures without project state effects', () => {
    const input = {
      routeId: 'OPENAI_LUNA' as const,
      candidateOrdinal: 0 as const,
      failureStage: 'SANDBOX_RENDER' as const,
      failureClass: 'RENDER_FAIL' as const,
      observedAt: '2026-08-14T12:00:00.000Z',
      programHash: 'b'.repeat(64),
      sourceBundleHash: 'c'.repeat(64),
      diagnostics: ['takeoverProgress is outside [0,1]'],
    };
    const first = buildGeneratedCompositionAssessmentFailureV1(input);
    const second = buildGeneratedCompositionAssessmentFailureV1(input);
    expect(first).toEqual(second);
    expect(first.failureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.failureClass).toBe('RENDER_FAIL');
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

  it('derives sandbox resources from the verified program and preserves execution failure classes', () => {
    const resources = buildGeneratedCompositionBenchmarkSandboxResourcesV1(DEV02_GENERATED_COMPOSITION_PROGRAM_V1);
    expect(resources).toEqual({
      wallTimeMs: 180_000,
      maxCpuMs: 120_000,
      vcpus: 1,
      memoryMiB: 2_048,
      maxOutputBytes: DEV02_GENERATED_COMPOSITION_PROGRAM_V1.resourceBudget.maxOutputBytes,
    });
    const underprovisioned = structuredClone(DEV02_GENERATED_COMPOSITION_PROGRAM_V1);
    underprovisioned.resourceBudget.maxMemoryMiB = 1_024;
    expect(() => buildGeneratedCompositionBenchmarkSandboxResourcesV1(underprovisioned)).toThrow(
      'MODEL_BENCHMARK_PROGRAM_MEMORY_BELOW_SANDBOX_ALLOCATION',
    );
    expect(classifyGeneratedCompositionBenchmarkExecutionErrorV1(
      new GeneratedCompositionSandboxExecutionErrorV1('TIMEOUT', 'sandbox exceeded its wall limit'),
    )).toBe('TIMEOUT');
    expect(classifyGeneratedCompositionBenchmarkExecutionErrorV1(new Error('unknown host failure')))
      .toBe('SANDBOX_INFRASTRUCTURE_FAIL');
  });
});
