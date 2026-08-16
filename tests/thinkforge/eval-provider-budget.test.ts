import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeThinkForgeEvalProviderDispatch,
  runWithThinkForgeEvalProviderBudget,
  ThinkForgeEvalBudgetExceededError,
  ThinkForgeEvalProviderBudget,
} from '../../lib/thinkforge/eval/provider-budget';
import {
  runEvalPrompt,
  type EvalProviderConfig,
} from '../../scripts/prompt-optimization/thinkforge-eval-provider-adapter';

const deepSeekConfig: EvalProviderConfig = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: 'test-key',
  temperature: 0,
  maxOutputTokens: 128,
  budgetRole: 'judge',
};

function createBudget(overrides: Partial<ConstructorParameters<typeof ThinkForgeEvalProviderBudget>[0]> = {}) {
  return new ThinkForgeEvalProviderBudget({
    maxProviderRequests: 4,
    maxWriterRequests: 2,
    maxJudgeRequests: 3,
    maxOutputTokens: 512,
    maxEstimatedCostUsd: 1,
    costSafetyMultiplier: 2,
    ...overrides,
  });
}

describe('ThinkForge eval provider budget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_ATTEMPTS;
    delete process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_BASE_MS;
    delete process.env.EVAL_PRICE_OPENROUTER_INPUT_PER_1M;
    delete process.env.EVAL_PRICE_OPENROUTER_OUTPUT_PER_1M;
  });

  it('rejects a role overrun before recording or dispatching the next request', async () => {
    const budget = createBudget({ maxWriterRequests: 1 });

    await runWithThinkForgeEvalProviderBudget(budget, async () => {
      authorizeThinkForgeEvalProviderDispatch({
        role: 'writer',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        label: 'writer/initial',
        inputTokenUpperBound: 500,
        maxOutputTokens: 100,
      });
      expect(() => authorizeThinkForgeEvalProviderDispatch({
        role: 'writer',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        label: 'writer/repair',
        inputTokenUpperBound: 500,
        maxOutputTokens: 100,
      })).toThrowError(ThinkForgeEvalBudgetExceededError);
    });

    expect(budget.snapshot()).toMatchObject({
      providerRequests: 1,
      writerRequests: 1,
      judgeRequests: 0,
      reservedOutputTokens: 100,
    });
  });

  it('fails closed when a provider price is unknown', async () => {
    const budget = createBudget();

    await expect(runWithThinkForgeEvalProviderBudget(budget, async () => {
      authorizeThinkForgeEvalProviderDispatch({
        role: 'judge',
        provider: 'openrouter',
        model: 'vendor/unpriced-model',
        label: 'judge/unpriced',
        inputTokenUpperBound: 100,
        maxOutputTokens: 100,
      });
    })).rejects.toThrow('price_unknown:openrouter/vendor/unpriced-model');
    expect(budget.snapshot().providerRequests).toBe(0);
  });

  it('counts every transient retry as a separate provider request', async () => {
    process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_ATTEMPTS = '3';
    process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_BASE_MS = '0';
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'temporarily overloaded' } }), {
        status: 503,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"overall":95}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }), { status: 200 }));
    const budget = createBudget();

    await runWithThinkForgeEvalProviderBudget(budget, () => (
      runEvalPrompt(deepSeekConfig, 'Public synthetic quality-judge prompt.')
    ));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(budget.snapshot()).toMatchObject({
      providerRequests: 2,
      writerRequests: 0,
      judgeRequests: 2,
      reservedOutputTokens: 256,
    });
  });

  it('stops a retry storm before the first over-budget fetch', async () => {
    process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_ATTEMPTS = '3';
    process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_BASE_MS = '0';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify({ error: { message: 'temporarily overloaded' } }), { status: 503 })
    ));
    const budget = createBudget({
      maxProviderRequests: 2,
      maxJudgeRequests: 2,
      maxOutputTokens: 256,
    });

    await expect(runWithThinkForgeEvalProviderBudget(budget, () => (
      runEvalPrompt(deepSeekConfig, 'Public synthetic quality-judge prompt.')
    ))).rejects.toThrow('provider_requests:3/2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(budget.snapshot().providerRequests).toBe(2);
  });

  it('does not leak a completed budget scope into later provider calls', async () => {
    const budget = createBudget();
    await runWithThinkForgeEvalProviderBudget(budget, async () => {
      authorizeThinkForgeEvalProviderDispatch({
        role: 'judge',
        provider: 'deepseek',
        model: 'deepseek-chat',
        label: 'judge/scoped',
        inputTokenUpperBound: 100,
        maxOutputTokens: 50,
      });
    });

    authorizeThinkForgeEvalProviderDispatch({
      role: 'judge',
      provider: 'openrouter',
      model: 'vendor/unpriced-model',
      label: 'judge/outside-scope',
      inputTokenUpperBound: 100,
      maxOutputTokens: 50,
    });

    expect(budget.snapshot().providerRequests).toBe(1);
  });
});
