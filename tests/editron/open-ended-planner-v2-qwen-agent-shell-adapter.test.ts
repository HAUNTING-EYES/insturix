import { describe, expect, it, vi } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import {
  runQwenProviderStageV2,
} from '@/lib/editron/research/open-ended-planner/qwen-agent-shell-adapter-v2';
import {
  executeQwenDirectProviderV2,
  type QwenProviderExecutorV2,
} from '@/lib/editron/research/open-ended-planner/qwen-direct-provider-v2';
import {
  buildDevelopmentReferenceImageSequenceStageOnePacketV2,
  buildDev01TruthfulStageOneTextPacketV2,
  type HashedStagePacketV2,
} from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import { sha256TextV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';

const canonical = getCanonicalDev01Stage123V2().referenceBlueprints.BASELINE;
const textPacket = buildDev01TruthfulStageOneTextPacketV2('BASELINE');

describe('open-ended planner V2 Qwen provider adapter', () => {
  it('accepts only a schema-valid artifact bound to the exact packet', async () => {
    const executeMock = vi.fn(async (input: Parameters<QwenProviderExecutorV2>[0]) => {
      expect(input.prompt).toContain(textPacket.packetHash);
      expect(input.prompt).toContain(textPacket.transportHash);
      expect(input.prompt).not.toContain('test-secret');
      expect(input.attachmentPaths).toEqual([]);
      expect(input.reasoningBudgetTokens).toBe(textPacket.packet.stageBudget.maxReasoningTokens);
      expect(input.visibleOutputBudgetTokens).toBe(textPacket.packet.stageBudget.maxVisibleOutputTokens);
      return {
        ...execution(events(canonical), 824),
        providerResponseHash: 'native-envelope-sha256',
      };
    });
    const execute = executeMock as QwenProviderExecutorV2;

    const run = await runQwenProviderStageV2({
      artifact: textPacket,
      apiKey: 'test-secret',
      budgetMode: 'FAIR_STAGE_BUDGET',
      execute,
    });

    expect(run).toMatchObject({
      packetHash: textPacket.packetHash,
      disposition: 'ARTIFACT_ACCEPTED',
      artifact: canonical,
    });
    expect(run.attempts).toHaveLength(1);
    expect(run.attempts[0]).toMatchObject({
      provider: 'alibaba-token-plan-direct',
      requestedModel: 'qwen3.8-max',
      providerModel: null,
      providerCostUsd: null,
      parseStatus: 'SCHEMA_VALID',
      rawResponse: JSON.stringify(canonical),
    });
    expect(run.attempts[0].rawResponseHash).toBe(
      sha256TextV1(run.attempts[0].rawResponse as string),
    );
    expect(run.attempts[0].providerResponseEnvelopeHash).toBe('native-envelope-sha256');
    expect(run.attempts[0].providerResponseEnvelopeHash).not.toBe(
      run.attempts[0].rawResponseHash,
    );
  });

  it('sends signed stage budgets as native Qwen request limits', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const result = await executeQwenDirectProviderV2({
      prompt: 'return JSON',
      attempt: 1,
      attachmentPaths: [],
      workingDirectory: '.',
      apiKey: 'test-secret',
      timeoutMs: 10_000,
      reasoningBudgetTokens: 3_000,
      visibleOutputBudgetTokens: 6_000,
    }, async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return qwenStreamResponse([{
        id: 'qwen-request-1', model: 'qwen3.8-max', usage: null,
        choices: [{ finish_reason: 'stop', delta: { content: '{"ok":true}' } }],
      }, {
        id: 'qwen-request-1', model: 'qwen3.8-max', choices: [],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 25,
          total_tokens: 65,
          prompt_tokens_details: { cached_tokens: 5 },
          completion_tokens_details: { reasoning_tokens: 15 },
        },
      }], true, 47);
    });

    expect(requestBody).toMatchObject({
      model: 'qwen3.8-max',
      max_tokens: 9_000,
      thinking_budget: 3_000,
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(JSON.stringify(requestBody)).not.toContain('test-secret');
    expect(result).toMatchObject({
      exitCode: 0,
      timedOut: false,
      transportKind: 'ALIBABA_DIRECT_CHAT_COMPLETIONS',
      providerModel: 'qwen3.8-max',
      providerRequestId: 'qwen-request-1',
    });
    expect(result.stdout).toContain('"reasoning":15');
    expect(result.stdout).toContain('"output":10');
  });

  it('fails closed when a completed provider stream omits usage evidence', async () => {
    const result = await executeQwenDirectProviderV2({
      prompt: 'return JSON', attempt: 1, attachmentPaths: [], workingDirectory: '.',
      apiKey: 'test-secret', timeoutMs: 10_000,
      reasoningBudgetTokens: 3_000, visibleOutputBudgetTokens: 6_000,
    }, async () => qwenStreamResponse([{
      id: 'qwen-request-2', model: 'qwen3.8-max', usage: null,
      choices: [{ finish_reason: 'stop', delta: { content: '{"ok":true}' } }],
    }]));

    expect(result).toMatchObject({
      exitCode: 1,
      timedOut: false,
      failureDisposition: 'PROVIDER_ERROR',
    });
    expect(result.stderr).toContain('QWEN_STREAM_USAGE_MISSING');
  });

  it('permits one schema repair in the same shell session and no third attempt', async () => {
    const prompts: string[] = [];
    const sessions: Array<string | undefined> = [];
    const executeMock = vi.fn(async (input: Parameters<QwenProviderExecutorV2>[0]) => {
      prompts.push(input.prompt);
      sessions.push(input.sessionId);
      return input.attempt === 1
        ? execution(eventsText('{broken', 'session-repair'), 500)
        : execution(events(canonical, 'session-repair'), 700);
    });
    const execute = executeMock as QwenProviderExecutorV2;

    const run = await runQwenProviderStageV2({
      artifact: textPacket,
      apiKey: 'test-secret',
      budgetMode: 'FAIR_STAGE_BUDGET',
      execute,
    });

    expect(run.disposition).toBe('ARTIFACT_ACCEPTED');
    expect(run.attempts.map(({ disposition }) => disposition)).toEqual([
      'MALFORMED_JSON',
      'ARTIFACT_ACCEPTED',
    ]);
    expect(run.attempts.map(({ rawResponse }) => rawResponse)).toEqual([
      '{broken', JSON.stringify(canonical),
    ]);
    for (const attempt of run.attempts) {
      expect(attempt.rawResponseHash).toBe(sha256TextV1(attempt.rawResponse as string));
    }
    expect(sessions).toEqual([undefined, 'session-repair']);
    expect(prompts[1]).toContain('INVALID_JSON');
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed on timeout, schema mismatch, and fair-budget overrun', async () => {
    const timeout = await runWith(() => Promise.resolve({
      ...execution('', 90_000), timedOut: true, exitCode: null,
    }));
    expect(timeout.disposition).toBe('PROVIDER_TIMEOUT');

    const invalid = await runWith(() => Promise.resolve(execution(events({
      ...canonical,
      taskId: 'DEV-99',
    }), 500)));
    expect(invalid.disposition).toBe('SCHEMA_INVALID');
    expect(invalid.attempts).toHaveLength(2);

    const overBudget = await runWith(() => Promise.resolve(execution(
      events(canonical, 'session-budget', { input: 30_001 }),
      500,
    )));
    expect(overBudget.disposition).toBe('BUDGET_EXCEEDED');
    expect(overBudget.attempts[0].schemaDiagnostics).toContain('INPUT_TOKEN_LIMIT');
    expect(overBudget.attempts[0]).toMatchObject({
      preflightInputTokens: null,
      inputTokens: 30_001,
    });
  });

  it('records a shell launch failure instead of aborting the cohort', async () => {
    const run = await runWith(() => Promise.reject(new Error('spawn EINVAL')));
    expect(run.disposition).toBe('PROVIDER_ERROR');
    expect(run.attempts).toHaveLength(1);
    expect(run.attempts[0].schemaDiagnostics).toEqual([
      'QWEN_EXECUTION_FAILED:spawn EINVAL',
    ]);
    expect(run.attempts[0]).toMatchObject({ rawResponse: null, rawResponseHash: null });
  });

  it('keeps slow but valid output separate in asynchronous quality diagnostics', async () => {
    const run = await runQwenProviderStageV2({
      artifact: textPacket,
      apiKey: 'test-secret',
      budgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
      diagnosticTimeoutOverrideMs: 900_000,
      execute: (input) => {
        expect(input.timeoutMs).toBe(900_000);
        expect(input.reasoningBudgetTokens).toBe(textPacket.packet.stageBudget.maxReasoningTokens * 8);
        expect(input.visibleOutputBudgetTokens).toBe(textPacket.packet.stageBudget.maxVisibleOutputTokens);
        return Promise.resolve(execution(
          events(canonical, 'session-diagnostic', { input: 49_000 }),
          120_000,
        ));
      },
    });
    expect(run.disposition).toBe('ARTIFACT_ACCEPTED');
    expect(run.attempts[0].detail).toContain('ASYNC_QUALITY_DIAGNOSTIC');
  });

  it('rejects diagnostic timeout drift and never weakens the fair-score clock', async () => {
    const execute = vi.fn() as unknown as QwenProviderExecutorV2;
    await expect(runQwenProviderStageV2({
      artifact: textPacket, apiKey: 'test-secret', budgetMode: 'FAIR_STAGE_BUDGET',
      diagnosticTimeoutOverrideMs: 900_000, execute,
    })).rejects.toThrow('QWEN_DIAGNOSTIC_TIMEOUT_REQUIRES_ASYNC_MODE');
    await expect(runQwenProviderStageV2({
      artifact: textPacket, apiKey: 'test-secret', budgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
      diagnosticTimeoutOverrideMs: 900_001, execute,
    })).rejects.toThrow('QWEN_DIAGNOSTIC_TIMEOUT_INVALID');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects attachment drift before launching the shell', async () => {
    const packet = buildDevelopmentReferenceImageSequenceStageOnePacketV2('DEV-02', 'BASELINE');
    const drifted = {
      ...packet,
      transportAttachments: packet.transportAttachments.map((attachment, index) => index
        ? attachment
        : { ...attachment, bytes: attachment.bytes + 1 }),
    } as HashedStagePacketV2;
    const executeMock = vi.fn();
    const execute = executeMock as QwenProviderExecutorV2;
    await expect(runQwenProviderStageV2({
      artifact: drifted,
      apiKey: 'test-secret',
      budgetMode: 'FAIR_STAGE_BUDGET',
      execute,
    })).rejects.toThrow(/QWEN_AGENT_SHELL_ATTACHMENT_DRIFT/);
    expect(executeMock).not.toHaveBeenCalled();
  });
});

function runWith(execute: QwenProviderExecutorV2) {
  return runQwenProviderStageV2({
    artifact: textPacket,
    apiKey: 'test-secret',
    budgetMode: 'FAIR_STAGE_BUDGET',
    execute,
  });
}

function events(
  artifact: unknown,
  sessionId = 'session-test',
  tokenOverrides: Partial<TokenFixture> = {},
): string {
  return eventsText(JSON.stringify(artifact), sessionId, tokenOverrides);
}

function eventsText(
  text: string,
  sessionId = 'session-test',
  tokenOverrides: Partial<TokenFixture> = {},
): string {
  const tokens = { input: 1_000, output: 500, reasoning: 100, total: 1_600,
    cache: { read: 0, write: 0 }, ...tokenOverrides };
  if (!('total' in tokenOverrides)) {
    tokens.total = tokens.input + tokens.output + tokens.reasoning;
  }
  return [
    JSON.stringify({ type: 'text', sessionID: sessionId, part: { text } }),
    JSON.stringify({ type: 'step_finish', sessionID: sessionId, part: { tokens, reason: 'stop' } }),
  ].join('\n');
}

interface TokenFixture {
  input: number;
  output: number;
  reasoning: number;
  total: number;
  cache: { read: number; write: number };
}

function execution(stdout: string, latencyMs: number) {
  return { stdout, stderr: '', exitCode: 0, timedOut: false, latencyMs };
}

function qwenStreamResponse(
  frames: readonly Record<string, unknown>[],
  complete = true,
  splitAt?: number,
): Response {
  const text = `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')}${
    complete ? 'data: [DONE]\n\n' : ''}`;
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (splitAt !== undefined) controller.enqueue(bytes.slice(0, splitAt));
      controller.enqueue(splitAt === undefined ? bytes : bytes.slice(splitAt));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
