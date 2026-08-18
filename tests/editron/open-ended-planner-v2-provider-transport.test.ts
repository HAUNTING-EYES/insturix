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
      model: 'gpt-5.6-luna-test', requestedModel: 'gpt-5.6-luna',
      providerModel: 'gpt-5.6-luna-2026-08-07', providerSystemFingerprint: 'fp-test',
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

  it('performs exactly one repair for malformed JSON with its own declared budget', async () => {
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
    // V2-1R per-attempt budget law: the repair attempt receives its own declared
    // budget freshly allocated from the stage budget, not the residue of attempt 1.
    const budget = textPacket().packet.stageBudget;
    expect(record(requests[1]).max_output_tokens).toBe(budget.maxVisibleOutputTokens + budget.maxReasoningTokens);
    expect(record(requests[1]).max_output_tokens).toBe(record(requests[0]).max_output_tokens);
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
    const budget = textPacket().packet.stageBudget;
    let preflightCalls = 0;
    const preflight = await run({
      preflightInputTokens: [budget.maxInputTokens + 1, 100],
      fetchImpl: async () => { preflightCalls += 1; return jsonResponse(openAI(JSON.stringify(validArtifact()))); },
    });
    expect(preflightCalls).toBe(0);
    expect(preflight.attempts[0]).toMatchObject({ disposition: 'BUDGET_EXCEEDED', parseStatus: 'PREFLIGHT_BLOCKED' });

    const usageDrift = await run({
      fetchImpl: async () => jsonResponse(openAI(JSON.stringify(validArtifact()), { inputTokens: budget.maxInputTokens + 1 })),
    });
    expect(usageDrift.disposition).toBe('BUDGET_EXCEEDED');
    expect(usageDrift.attempts[0].schemaDiagnostics).toContain('INPUT_TOKEN_LIMIT');

    const times = [0, budget.maxWallClockMs + 1];
    const wallDrift = await run({
      nowMs: () => times.shift() ?? budget.maxWallClockMs + 1,
      fetchImpl: async () => jsonResponse(openAI(JSON.stringify(validArtifact()))),
    });
    expect(wallDrift.disposition).toBe('BUDGET_EXCEEDED');
    expect(wallDrift.attempts[0].schemaDiagnostics).toContain('WALL_CLOCK_LIMIT');
  });

  it('gives a slow first attempt no power to starve the repair wall clock (V2-1R)', async () => {
    const wall = textPacket().packet.stageBudget.maxWallClockMs;
    let calls = 0;
    let clock = 0;
    const result = await run({
      nowMs: () => clock,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          clock += Math.floor(wall * 0.9); // slow, but inside attempt 1's own declared budget
          return jsonResponse(openAI('not-json'));
        }
        clock += Math.floor(wall * 0.5); // the repair needs half of a full declared budget
        return jsonResponse(openAI(JSON.stringify(validArtifact())));
      },
    });
    expect(calls).toBe(2);
    // Under the pre-V2R shared pool, attempt 2 would inherit only ~10% of the wall
    // clock and this 50% repair would be recorded BUDGET_EXCEEDED / WALL_CLOCK_LIMIT
    // (the DEV-01 Luna false-timeout). With per-attempt budgets the repair receives
    // its own full declaration and is accepted.
    expect(result.attempts[1]).toMatchObject({ disposition: 'ARTIFACT_ACCEPTED' });
    expect(result.disposition).toBe('ARTIFACT_ACCEPTED');
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
      'MISSING_PROVIDER_MODEL_IDENTITY', 'MISSING_VISIBLE_OUTPUT_TOKENS', 'MISSING_REASONING_TOKENS',
    ]));
  });

  it('prices cache writes separately and rejects unpriceable or overlapping cache telemetry', async () => {
    const priced = await run({
      pricing: {
        inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1,
        cacheWriteUsdPerMillion: 1.25, outputUsdPerMillion: 1,
      },
      fetchImpl: async () => jsonResponse(openAI(JSON.stringify(validArtifact()), {
        cachedInputTokens: 20, cacheWriteInputTokens: 10,
      })),
    });
    expect(priced.disposition).toBe('ARTIFACT_ACCEPTED');
    expect(priced.attempts[0].providerCostUsd).toBe(0.0001145);

    const missingRate = await run({
      fetchImpl: async () => jsonResponse(openAI(JSON.stringify(validArtifact()), { cacheWriteInputTokens: 10 })),
    });
    expect(missingRate.disposition).toBe('TELEMETRY_UNVERIFIABLE');
    expect(missingRate.attempts[0].schemaDiagnostics).toContain('MISSING_CACHE_WRITE_PRICE');

    const overlap = await run({
      pricing: { inputUsdPerMillion: 1, cacheWriteUsdPerMillion: 1.25, outputUsdPerMillion: 1 },
      fetchImpl: async () => jsonResponse(openAI(JSON.stringify(validArtifact()), {
        cachedInputTokens: 95, cacheWriteInputTokens: 10,
      })),
    });
    expect(overlap.disposition).toBe('TELEMETRY_UNVERIFIABLE');
    expect(overlap.attempts[0].schemaDiagnostics).toContain('CACHE_INPUT_CATEGORIES_EXCEED_INPUT');
  });

  it('uses the most expensive input class for worst-case preflight', async () => {
    const budget = textPacket().packet.stageBudget;
    const exceedingCacheWriteRate = (budget.maxProviderCostUsd * 1_000_000 / 1_000) + 1;
    let calls = 0;
    const result = await run({
      pricing: {
        inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1,
        cacheWriteUsdPerMillion: exceedingCacheWriteRate, outputUsdPerMillion: 1,
      },
      preflightInputTokens: [1000, 100],
      fetchImpl: async () => { calls += 1; return jsonResponse(openAI(JSON.stringify(validArtifact()))); },
    });
    expect(calls).toBe(0);
    expect(result.disposition).toBe('BUDGET_EXCEEDED');
    expect(result.attempts[0].schemaDiagnostics).toContain('PREFLIGHT_COST_LIMIT');
  });

  it('charges dynamic provider counting against the same wall-clock budget', async () => {
    const budget = textPacket().packet.stageBudget;
    let calls = 0;
    const times = [0, budget.maxWallClockMs + 1];
    const result = await run({
      preflightInputTokens: async () => 100,
      nowMs: () => times.shift() ?? budget.maxWallClockMs + 1,
      fetchImpl: async () => { calls += 1; return jsonResponse(openAI(JSON.stringify(validArtifact()))); },
    });
    expect(calls).toBe(0);
    expect(result.disposition).toBe('BUDGET_EXCEEDED');
    expect(result.attempts[0]).toMatchObject({
      parseStatus: 'PREFLIGHT_BLOCKED', latencyMs: budget.maxWallClockMs + 1,
    });
    expect(result.attempts[0].schemaDiagnostics).toContain('WALL_CLOCK_LIMIT');
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
    artifactType: 'ReferenceBlueprintV2', taskId: 'DEV-01',
    globalEditorialLanguage: [], recurringDesignGrammar: [], uniqueMoments: [], targetClaims: [],
    temporalStructure: [], uncertainties: [], evidenceIds: [],
  };
}
function openAI(text: string, overrides: {
  status?: string;
  incompleteReason?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
} = {}) {
  const reasoningTokens = 10;
  const visibleTokens = 20;
  const inputTokens = overrides.inputTokens ?? 100;
  return {
    id: 'resp-test', model: 'gpt-5.6-luna-2026-08-07', system_fingerprint: 'fp-test',
    status: overrides.status ?? 'completed',
    ...(overrides.incompleteReason ? { incomplete_details: { reason: overrides.incompleteReason } } : {}),
    output: [{ content: [{ type: 'output_text', text }] }],
    usage: {
      input_tokens: inputTokens, output_tokens: visibleTokens + reasoningTokens,
      ...((overrides.cachedInputTokens !== undefined || overrides.cacheWriteInputTokens !== undefined) ? {
        input_tokens_details: {
          ...(overrides.cachedInputTokens !== undefined ? { cached_tokens: overrides.cachedInputTokens } : {}),
          ...(overrides.cacheWriteInputTokens !== undefined ? { cache_write_tokens: overrides.cacheWriteInputTokens } : {}),
        },
      } : {}),
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
