import { describe, expect, it } from 'vitest';

import {
  runProviderStageV2,
  type ProviderPricingV2,
} from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import {
  buildDevelopmentStageOnePacketsV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import benchmarkJson from '@/tests/fixtures/editron/open-ended-planner-v2/benchmark-contract-v2.json';

describe('open-ended planner V2 provider transport', () => {
  it('accepts a schema-valid artifact with complete immutable telemetry', async () => {
    const result = await run({ fetchImpl: async () => jsonResponse(openAI(JSON.stringify(validArtifact()))) });
    expect(result.disposition).toBe('ARTIFACT_ACCEPTED');
    expect(result.attempts).toHaveLength(1);
    expect(result.artifact).toEqual(validArtifact());
    const record = result.attempts[0];
    for (const field of benchmarkJson.requiredTelemetry) expect(record).toHaveProperty(field);
    expect(record).toMatchObject({
      providerRequestId: 'resp-test', inputTokens: 100, cachedInputTokens: null,
      visibleOutputTokens: 20, reasoningTokens: 10, totalTokens: 130,
      finishReason: 'completed', truncated: false, parseStatus: 'SCHEMA_VALID',
    });
    expect(record.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('maps provider refusal, timeout, and invalid HTTP bodies without repair', async () => {
    const refusal = await run({ fetchImpl: async () => new Response('{}', { status: 403 }) });
    expect(refusal.disposition).toBe('PROVIDER_REFUSAL');
    expect(refusal.attempts).toHaveLength(1);

    const timeoutError = new Error('deadline');
    timeoutError.name = 'TimeoutError';
    const timeout = await run({ fetchImpl: async () => { throw timeoutError; } });
    expect(timeout.disposition).toBe('PROVIDER_TIMEOUT');
    expect(timeout.attempts).toHaveLength(1);

    const invalidBody = await run({ fetchImpl: async () => new Response('not-provider-json', { status: 200 }) });
    expect(invalidBody.disposition).toBe('PROVIDER_ERROR');
    expect(invalidBody.attempts[0].schemaDiagnostics).toContain('NON_JSON_PROVIDER_BODY');
  });

  it('records truncation from the native finish reason and does not hide-retry it', async () => {
    let calls = 0;
    const result = await run({
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(openAI('{', { status: 'incomplete', incompleteReason: 'max_output_tokens' }));
      },
    });
    expect(calls).toBe(1);
    expect(result.disposition).toBe('TRUNCATED');
    expect(result.attempts[0]).toMatchObject({ finishReason: 'max_output_tokens', truncated: true });
  });

  it('performs exactly one budget-consuming repair for malformed JSON', async () => {
    const requests: Record<string, unknown>[] = [];
    const result = await run({
      fetchImpl: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse(openAI(requests.length === 1 ? 'not-json' : JSON.stringify(validArtifact())));
      },
    });
    expect(requests).toHaveLength(2);
    expect(result.attempts.map(({ disposition }) => disposition)).toEqual(['MALFORMED_JSON', 'ARTIFACT_ACCEPTED']);
    const repairPrompt = inputText(requests[1]);
    expect(repairPrompt).toContain('INVALID_JSON');
    expect(repairPrompt).toContain('not-json');
    expect(record(requests[1]).max_output_tokens).toBeLessThan(record(requests[0]).max_output_tokens as number);
  });

  it('repairs a schema-invalid artifact once and preserves its diagnostics', async () => {
    let calls = 0;
    const result = await run({
      fetchImpl: async (_url, init) => {
        calls += 1;
        if (calls === 2) expect(inputText(JSON.parse(String(init?.body)) as Record<string, unknown>)).toContain('$.artifactType:CONST');
        return jsonResponse(openAI(calls === 1 ? JSON.stringify({ artifactType: 'WrongType' }) : JSON.stringify(validArtifact())));
      },
    });
    expect(calls).toBe(2);
    expect(result.attempts[0]).toMatchObject({ disposition: 'SCHEMA_INVALID', parseStatus: 'SCHEMA_INVALID' });
    expect(result.disposition).toBe('ARTIFACT_ACCEPTED');
  });

  it('never exceeds two attempts when repair also fails', async () => {
    let calls = 0;
    const result = await run({ fetchImpl: async () => { calls += 1; return jsonResponse(openAI('still-not-json')); } });
    expect(calls).toBe(2);
    expect(result.attempts).toHaveLength(2);
    expect(result.disposition).toBe('MALFORMED_JSON');
  });

  it('blocks preflight and post-response budget drift', async () => {
    let preflightCalls = 0;
    const preflight = await run({
      preflightInputTokens: [6001, 100],
      fetchImpl: async () => { preflightCalls += 1; return jsonResponse(openAI(JSON.stringify(validArtifact()))); },
    });
    expect(preflightCalls).toBe(0);
    expect(preflight.attempts[0]).toMatchObject({ disposition: 'BUDGET_EXCEEDED', parseStatus: 'PREFLIGHT_BLOCKED' });

    const usageDrift = await run({
      fetchImpl: async () => jsonResponse(openAI(JSON.stringify(validArtifact()), { inputTokens: 6001 })),
    });
    expect(usageDrift.disposition).toBe('BUDGET_EXCEEDED');
    expect(usageDrift.attempts[0].schemaDiagnostics).toContain('INPUT_TOKEN_LIMIT');

    const times = [0, 30_001];
    const wallDrift = await run({
      nowMs: () => times.shift() ?? 30_001,
      fetchImpl: async () => jsonResponse(openAI(JSON.stringify(validArtifact()))),
    });
    expect(wallDrift.disposition).toBe('BUDGET_EXCEEDED');
    expect(wallDrift.attempts[0].schemaDiagnostics).toContain('WALL_CLOCK_LIMIT');
  });

  it('rejects missing native usage as unverifiable without manufacturing zeroes', async () => {
    const result = await run({
      fetchImpl: async () => jsonResponse({
        id: 'resp-missing', status: 'completed',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(validArtifact()) }] }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });
    expect(result.disposition).toBe('TELEMETRY_UNVERIFIABLE');
    expect(result.attempts[0]).toMatchObject({ visibleOutputTokens: null, reasoningTokens: null, providerCostUsd: null });
    expect(result.attempts[0].schemaDiagnostics).toEqual(expect.arrayContaining([
      'MISSING_VISIBLE_OUTPUT_TOKENS', 'MISSING_REASONING_TOKENS',
    ]));
  });

  it('marks unsupported multimodal routes NOT_APPLICABLE before fetch', async () => {
    let calls = 0;
    const result = await runProviderStageV2({
      artifact: multimodalPacket(), route: route(), pricing: pricing(), preflightInputTokens: [100, 100],
      fetchImpl: async () => { calls += 1; return jsonResponse({}); },
      readAttachmentBytes: async () => { throw new Error('must not read unsupported bytes'); },
    });
    expect(calls).toBe(0);
    expect(result.disposition).toBe('NOT_APPLICABLE');
    expect(result.attempts[0].schemaDiagnostics).toContain('UNSUPPORTED_MODALITY');
  });
});

function run(overrides: Partial<Parameters<typeof runProviderStageV2>[0]> = {}) {
  return runProviderStageV2({
    artifact: textPacket(), route: route(), pricing: pricing(), preflightInputTokens: [100, 100],
    fetchImpl: async () => { throw new Error('A fake fetch implementation is required'); },
    ...overrides,
  });
}

function textPacket(): HashedStagePacketV2 {
  const value = buildDevelopmentStageOnePacketsV2().find(({ packet }) =>
    packet.taskId === 'DEV-01' && packet.conditionId === 'BASELINE' && packet.inputArm === 'TEXT_EVIDENCE_ONLY');
  if (!value) throw new Error('Missing DEV-01 text packet');
  return value;
}
function multimodalPacket(): HashedStagePacketV2 {
  const value = buildDevelopmentStageOnePacketsV2().find(({ packet }) =>
    packet.taskId === 'DEV-01' && packet.conditionId === 'BASELINE' && packet.inputArm === 'MULTIMODAL');
  if (!value) throw new Error('Missing DEV-01 multimodal packet');
  return value;
}
function route() {
  return { kind: 'openai' as const, apiKey: 'test-key', model: 'gpt-5.6-luna', modelSnapshot: 'gpt-5.6-luna-test', reasoningMode: 'medium' };
}
function pricing(): ProviderPricingV2 { return { inputUsdPerMillion: 1, outputUsdPerMillion: 1 }; }
function validArtifact() {
  return {
    artifactType: 'ReferenceBlueprintV2', taskId: 'DEV-01', observableTargets: [], temporalStructure: [],
    layoutAndMotion: [], audioIntent: [], uncertainties: [], evidenceIds: [],
  };
}
function openAI(text: string, overrides: { status?: string; incompleteReason?: string; inputTokens?: number } = {}) {
  const reasoningTokens = 10;
  const visibleTokens = 20;
  const inputTokens = overrides.inputTokens ?? 100;
  return {
    id: 'resp-test', status: overrides.status ?? 'completed',
    ...(overrides.incompleteReason ? { incomplete_details: { reason: overrides.incompleteReason } } : {}),
    output: [{ content: [{ type: 'output_text', text }] }],
    usage: {
      input_tokens: inputTokens, output_tokens: visibleTokens + reasoningTokens,
      output_tokens_details: { reasoning_tokens: reasoningTokens },
      total_tokens: inputTokens + visibleTokens + reasoningTokens,
    },
  };
}
function jsonResponse(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200 }); }
function inputText(body: Record<string, unknown>): string {
  const input = body.input as Array<{ content: Array<{ type: string; text?: string }> }>;
  return input[0].content.find(({ type }) => type === 'input_text')?.text ?? '';
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
