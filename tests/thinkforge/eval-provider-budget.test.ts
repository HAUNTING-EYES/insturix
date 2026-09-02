import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeThinkForgeEvalProviderDispatch,
  estimateThinkForgeEvalProviderCost,
  runWithThinkForgeEvalProviderBudget,
  ThinkForgeEvalBudgetExceededError,
  ThinkForgeEvalProviderBudget,
} from '../../lib/thinkforge/eval/provider-budget';
import {
  assertEvalProviderCredentialHealthy,
  runEvalPrompt,
  type EvalProviderConfig,
} from '../../scripts/prompt-optimization/thinkforge-eval-provider-adapter';
import {
  assertThinkForgeBlindHeldoutCorpusReady,
  buildThinkForgeWriterEvalRequestEnvelope,
  fingerprintThinkForgeStructuredWriterOutput,
  fingerprintThinkForgeVisiblePublishableOutput,
  getThinkForgeWriterEvalCorpusManifest,
  resolveEvalWriterTimeoutMs,
} from '../../scripts/prompt-optimization/eval-thinkforge-writers';
import type { PostWriterResult } from '../../lib/thinkforge/agents/post-writer-agent';

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
    maxContextCacheRequests: 4,
    maxOutputTokens: 512,
    maxEstimatedCostUsd: 1,
    costSafetyMultiplier: 2,
    ...overrides,
  });
}

describe('ThinkForge eval provider budget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_ATTEMPTS;
    delete process.env.THINKFORGE_EVAL_TRANSIENT_RETRY_BASE_MS;
    delete process.env.EVAL_PRICE_OPENROUTER_INPUT_PER_1M;
    delete process.env.EVAL_PRICE_OPENROUTER_OUTPUT_PER_1M;
  });

  it('fails provider credential preflight before a paid cohort can loop', async () => {
    const providerFetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', providerFetch);

    await expect(assertEvalProviderCredentialHealthy({
      provider: 'gemini',
      model: 'models/gemini-3.6-flash',
      apiKey: 'invalid-key',
    })).rejects.toThrow('gemini credential preflight failed (401)');
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it('checks independent judge credentials without generating content', async () => {
    const providerFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', providerFetch);

    await expect(assertEvalProviderCredentialHealthy(deepSeekConfig)).resolves.toBeUndefined();
    expect(providerFetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
        signal: expect.any(AbortSignal),
      }),
    );
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
      contextCacheRequests: 0,
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

  it('prices Gemini 3.6 Flash before a paid eval is dispatched', () => {
    expect(estimateThinkForgeEvalProviderCost({
      provider: 'gemini',
      model: 'models/gemini-3.6-flash',
      usage: {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      },
    })).toEqual({
      estimatedCostUsd: 4.5,
      note: 'builtin:google_gemini_3_6_flash_standard_2026_08_30',
    });
  });

  it('preflights cache and writer requests without consuming the runtime budget', () => {
    const budget = createBudget({ maxProviderRequests: 3, maxContextCacheRequests: 2 });
    const planned = budget.assertCanCoverEnvelope([
      {
        role: 'context_cache',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        label: 'cache/lookup',
        inputTokenUpperBound: 0,
        maxOutputTokens: 0,
      },
      {
        role: 'context_cache',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        label: 'cache/create',
        inputTokenUpperBound: 1_000,
        maxOutputTokens: 0,
      },
      {
        role: 'writer',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        label: 'writer/initial',
        inputTokenUpperBound: 2_000,
        maxOutputTokens: 100,
      },
    ]);

    expect(planned).toMatchObject({
      providerRequests: 3,
      writerRequests: 1,
      judgeRequests: 0,
      contextCacheRequests: 2,
      reservedOutputTokens: 100,
    });
    expect(budget.snapshot()).toMatchObject({
      providerRequests: 0,
      writerRequests: 0,
      contextCacheRequests: 0,
      reservedOutputTokens: 0,
    });
  });

  it.each([
    [{ maxProviderRequests: 1 }, 'provider_requests:2/1'],
    [{ maxOutputTokens: 99 }, 'output_tokens:100/99'],
    [{ maxEstimatedCostUsd: 0 }, 'estimated_usd:'],
  ] as const)('fails the whole envelope before dispatch when a cap is insufficient', (overrides, reason) => {
    const budget = createBudget(overrides);
    expect(() => budget.assertCanCoverEnvelope([
      {
        role: 'context_cache',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        label: 'cache/create',
        inputTokenUpperBound: 1_000,
        maxOutputTokens: 0,
      },
      {
        role: 'writer',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        label: 'writer/initial',
        inputTokenUpperBound: 2_000,
        maxOutputTokens: 100,
      },
    ])).toThrow(reason);
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

describe('ThinkForge writer paid-run preflight', () => {
  it('gives the complete writer workflow the production execution envelope', () => {
    expect(resolveEvalWriterTimeoutMs({})).toBe(300_000);
    expect(resolveEvalWriterTimeoutMs({
      THINKFORGE_EVAL_REQUEST_TIMEOUT_MS: '90000',
    })).toBe(300_000);
    expect(resolveEvalWriterTimeoutMs({
      THINKFORGE_EVAL_WRITER_TIMEOUT_MS: '420000',
    })).toBe(420_000);
    expect(() => resolveEvalWriterTimeoutMs({
      THINKFORGE_EVAL_WRITER_TIMEOUT_MS: '90.5',
    })).toThrow('THINKFORGE_EVAL_WRITER_TIMEOUT_MS must be a positive whole number');
  });

  it('keeps tuned regressions separate and exposes fifteen genuinely blind cases', () => {
    const manifest = getThinkForgeWriterEvalCorpusManifest();

    expect(manifest.knownRegressionCaseIds).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(manifest.blindHeldoutCaseIds).toEqual([
      19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
    ]);
    expect(manifest).toMatchObject({
      requiredBlindHeldoutCases: 15,
      blindHeldoutShortfall: 0,
      promotionReady: true,
    });
    expect(assertThinkForgeBlindHeldoutCorpusReady).not.toThrow();
  });

  it('enumerates writer repair, cache lookup/create, and judge retry requests', () => {
    const manifest = getThinkForgeWriterEvalCorpusManifest();
    const dispatches = buildThinkForgeWriterEvalRequestEnvelope({
      caseIds: manifest.blindHeldoutCaseIds,
      runIds: Array.from({ length: 10 }, (_, index) => index + 1),
      judge: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        maxOutputTokens: 2_000,
        retryAttempts: 3,
      },
    });
    const budget = new ThinkForgeEvalProviderBudget({
      maxProviderRequests: 1_350,
      maxWriterRequests: 300,
      maxJudgeRequests: 450,
      maxContextCacheRequests: 600,
      maxOutputTokens: 10_000_000,
      maxEstimatedCostUsd: 1_000,
      costSafetyMultiplier: 2,
    });
    const planned = budget.assertCanCoverEnvelope(dispatches);

    expect(planned).toMatchObject({
      providerRequests: 1_350,
      writerRequests: 300,
      judgeRequests: 450,
      contextCacheRequests: 600,
    });
    expect(planned.reservedOutputTokens).toBeGreaterThan(1_000_000);
    expect(planned.estimatedCostUpperBoundUsd).toBeGreaterThan(0);
    expect(budget.snapshot().providerRequests).toBe(0);
  });

  it('uses visible publishable copy for diversity while retaining a forensic structure hash', () => {
    const first = {
      content: 'A visible operator post.',
      hashtags: ['#Operations'],
      contentAnalysis: {
        tone: 'direct',
        vibe: 'practical',
        theme: 'ownership',
        qualityScore: 91,
        violations: [],
      },
      clickatron: { singleImagePrompt: 'Hidden visual prompt A.' },
      metadata: { platform: 'linkedin', charCount: 24 },
    } as PostWriterResult;
    const hiddenMetadataChanged = {
      ...first,
      contentAnalysis: { ...first.contentAnalysis, qualityScore: 99 },
      clickatron: { singleImagePrompt: 'Hidden visual prompt B.' },
    } as PostWriterResult;
    const visibleCopyChanged = {
      ...hiddenMetadataChanged,
      content: 'A meaningfully different operator post.',
    } as PostWriterResult;

    expect(fingerprintThinkForgeVisiblePublishableOutput(first, 'post'))
      .toBe(fingerprintThinkForgeVisiblePublishableOutput(hiddenMetadataChanged, 'post'));
    expect(fingerprintThinkForgeStructuredWriterOutput(first))
      .not.toBe(fingerprintThinkForgeStructuredWriterOutput(hiddenMetadataChanged));
    expect(fingerprintThinkForgeVisiblePublishableOutput(first, 'post'))
      .not.toBe(fingerprintThinkForgeVisiblePublishableOutput(visibleCopyChanged, 'post'));
  });
});
