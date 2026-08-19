import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveCompletedGenerationDelivery,
  resolveThinkForgeGenerationFailureMessage,
  shouldProbeThinkForgeGeneration,
  shouldScheduleThinkForgeGenerationPolling,
} from '@/lib/thinkforge/client-generation-lifecycle';
import type { Trend, TrendQuery, TrendsProvider } from '@/lib/calos/trends';
import { runThinkingAgent } from '@/lib/thinkforge/agents/thinking-agent';
import { retryOnceOnOverload } from '@/lib/thinkforge/services/retry-on-overload';
import { resolveThinkForgeTrendContext } from '@/lib/thinkforge/services/trend-context';

const optionalWorkMocks = vi.hoisted(() => ({
  createModelByTier: vi.fn(() => ({ modelId: 'fixture-thinking-model' })),
  generateText: vi.fn(),
  getThinkForgeE2EWriterFixture: vi.fn(() => null),
  readAiSdkUsage: vi.fn(async () => undefined),
  recordThinkForgeDirectCost: vi.fn(async () => undefined),
}));

const lifecycleMocks = vi.hoisted(() => {
  class GenerationStateConflictError extends Error {}

  return {
    auth: vi.fn(),
    getActiveGeneration: vi.fn(),
    getScript: vi.fn(),
    getSession: vi.fn(),
    updateGenerationState: vi.fn(),
    GenerationStateConflictError,
  };
});
const longFormLifecycleMocks = vi.hoisted(() => ({
  cancelByGenerationAuthorized: vi.fn(),
  getByGenerationAuthorized: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: lifecycleMocks.auth }));
vi.mock('ai', () => ({ generateText: optionalWorkMocks.generateText }));
vi.mock('@/lib/thinkforge/agents/model-factory', () => ({
  createModelByTier: optionalWorkMocks.createModelByTier,
  ModelTier: { Structural: 'structural' },
}));
vi.mock('@/lib/thinkforge/services/provider-cost-telemetry', () => ({
  readAiSdkUsage: optionalWorkMocks.readAiSdkUsage,
  recordThinkForgeDirectCost: optionalWorkMocks.recordThinkForgeDirectCost,
}));
vi.mock('@/lib/thinkforge/testing/structured-writer-fixtures', () => ({
  getThinkForgeE2EWriterFixture: optionalWorkMocks.getThinkForgeE2EWriterFixture,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  GenerationStateConflictError: lifecycleMocks.GenerationStateConflictError,
  getActiveGeneration: lifecycleMocks.getActiveGeneration,
  getScript: lifecycleMocks.getScript,
  getSession: lifecycleMocks.getSession,
  updateGenerationState: lifecycleMocks.updateGenerationState,
}));
vi.mock('@/lib/thinkforge/long-form/script-generation-job-store', () => ({
  longFormScriptGenerationJobStore: longFormLifecycleMocks,
}));

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

async function loadGenerationRoutes() {
  const [{ GET: getStatus }, { POST: stopGeneration }] = await Promise.all([
    import('@/app/api/services/thinkforge/generation/status/route'),
    import('@/app/api/services/thinkforge/generation/stop/route'),
  ]);
  return { getStatus, stopGeneration };
}

function statusRequest(sessionId = 'session_requested') {
  return new Request(
    `http://localhost/api/services/thinkforge/generation/status?sessionId=${encodeURIComponent(sessionId)}`,
  );
}

function stopRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/services/thinkforge/generation/stop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function overloadError(): Error & { status: number } {
  return Object.assign(new Error('provider temporarily overloaded'), { status: 503 });
}

describe('ThinkForge optional pre-generation cancellation', () => {
  beforeEach(() => {
    optionalWorkMocks.createModelByTier.mockClear();
    optionalWorkMocks.generateText.mockReset();
    optionalWorkMocks.getThinkForgeE2EWriterFixture.mockReset().mockReturnValue(null);
    optionalWorkMocks.readAiSdkUsage.mockReset().mockResolvedValue(undefined);
    optionalWorkMocks.recordThinkForgeDirectCost.mockReset().mockResolvedValue(undefined);
  });

  it('checks cancellation before dispatching the thinking provider', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('caller disconnected', 'AbortError'));

    await expect(runThinkingAgent({ userPrompt: 'Draft a video script' }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });

    expect(optionalWorkMocks.createModelByTier).not.toHaveBeenCalled();
    expect(optionalWorkMocks.generateText).not.toHaveBeenCalled();
  });

  it('prevents writer and commit when an aborted thinking provider still resolves', async () => {
    const controller = new AbortController();
    const abortReason = new DOMException('caller disconnected', 'AbortError');
    const writer = vi.fn(async () => undefined);
    const commit = vi.fn(async () => undefined);
    let markDispatched!: () => void;
    let resolveThinking!: (result: { text: string }) => void;
    const dispatched = new Promise<void>((resolve) => {
      markDispatched = resolve;
    });

    optionalWorkMocks.generateText.mockImplementationOnce(
      () => {
        markDispatched();
        return new Promise<{ text: string }>((resolve) => {
          resolveThinking = resolve;
        });
      },
    );

    const generation = (async () => {
      await runThinkingAgent({ userPrompt: 'Draft a video script' }, controller.signal);
      await writer();
      await commit();
    })();

    await dispatched;
    controller.abort(abortReason);
    resolveThinking({ text: '- Build a concise narrative' });

    await expect(generation).rejects.toMatchObject({ name: 'AbortError' });
    expect(optionalWorkMocks.generateText).toHaveBeenCalledWith(expect.objectContaining({
      abortSignal: controller.signal,
      maxRetries: 0,
      maxOutputTokens: 200,
    }));
    expect(optionalWorkMocks.generateText.mock.calls.at(-1)?.[0]).not.toHaveProperty('maxTokens');
    expect(optionalWorkMocks.recordThinkForgeDirectCost).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('prevents writer and commit when cancellation happens during trend resolution', async () => {
    const controller = new AbortController();
    const abortReason = new DOMException('caller disconnected', 'AbortError');
    const writer = vi.fn(async () => undefined);
    const commit = vi.fn(async () => undefined);
    let resolveProvider!: (trends: Trend[]) => void;
    let markProviderStarted!: (query: TrendQuery) => void;
    const providerStarted = new Promise<TrendQuery>((resolve) => {
      markProviderStarted = resolve;
    });
    const getTrends = vi.fn<[TrendQuery], Promise<Trend[]>>((query) => {
      markProviderStarted(query);
      return new Promise<Trend[]>((resolve) => {
        resolveProvider = resolve;
      });
    });
    const provider: TrendsProvider = {
      name: 'delayed-fixture',
      available: () => true,
      getTrends,
    };

    const generation = (async () => {
      await resolveThinkForgeTrendContext(
        {
          userPrompt: 'Use a current trend in this LinkedIn post',
          project: { platform: 'linkedin', idea: 'Workflow proof' },
          contentPath: 'post',
          abortSignal: controller.signal,
        },
        { provider },
      );
      await writer();
      await commit();
    })();

    const query = await providerStarted;
    expect(query.abortSignal).toBe(controller.signal);
    controller.abort(abortReason);
    resolveProvider([
      { title: 'Proof-led workflow posts', platform: 'linkedin' },
    ]);

    await expect(generation).rejects.toMatchObject({ name: 'AbortError' });
    expect(writer).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('preserves graceful degradation for ordinary optional failures', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    optionalWorkMocks.generateText.mockRejectedValueOnce(new Error('thinking unavailable'));
    const getTrends = vi.fn<[TrendQuery], Promise<Trend[]>>(
      async () => Promise.reject(new Error('trends unavailable')),
    );

    try {
      await expect(runThinkingAgent({ userPrompt: 'Draft a video script' }))
        .resolves.toBe('');
      await expect(resolveThinkForgeTrendContext(
        {
          userPrompt: 'Use a current trend in this LinkedIn post',
          project: { platform: 'linkedin' },
        },
        {
          provider: {
            name: 'failed-fixture',
            available: () => true,
            getTrends,
          },
        },
      )).resolves.toMatchObject({
        metadata: { provider: 'failed-fixture', status: 'failed', error: 'trends unavailable' },
      });
    } finally {
      warning.mockRestore();
    }

    expect(optionalWorkMocks.recordThinkForgeDirectCost).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', action: 'thinking_agent' }),
    );
  });
});

describe('ThinkForge generation lifecycle', () => {
  it('retries the failing provider operation exactly once on a temporary overload', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(overloadError())
      .mockResolvedValueOnce('generated');

    await expect(retryOnceOnOverload(operation, 0)).resolves.toBe('generated');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry contract failures or loop after a second overload', async () => {
    const contractFailure = vi.fn().mockRejectedValue(new Error('document contract failed'));
    const repeatedOverload = vi.fn()
      .mockRejectedValueOnce(overloadError())
      .mockRejectedValueOnce(overloadError());

    await expect(retryOnceOnOverload(contractFailure, 0)).rejects.toThrow('document contract failed');
    await expect(retryOnceOnOverload(repeatedOverload, 0)).rejects.toMatchObject({ status: 503 });
    expect(contractFailure).toHaveBeenCalledTimes(1);
    expect(repeatedOverload).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch provider work when the request is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('caller disconnected', 'AbortError'));
    const operation = vi.fn().mockResolvedValue('must not run');

    await expect(retryOnceOnOverload(operation, 0, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it('cancels overload backoff without dispatching the retry', async () => {
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue(overloadError());
    const pending = retryOnceOnOverload(operation, 10_000, controller.signal);
    await Promise.resolve();
    controller.abort(new DOMException('caller disconnected', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('uses atomic ownership and terminal transitions in persistence', () => {
    const source = read('lib/thinkforge/services/db.ts');

    expect(source).toContain("'activeGeneration.id': generationId");
    expect(source).toContain("'activeGeneration.status': 'running'");
    expect(source).toContain('claimGenerationCommit');
    expect(source).toContain("'activeGeneration.commitClaimedAt': { $exists: false }");
    expect(source).not.toContain('const updatedGen = {');
  });

  it('makes refunds idempotent by the original charge transaction', () => {
    const source = read('lib/services/creditsService.ts');

    expect(source).toContain("type: 'refund'");
    expect(source).toContain("'metadata.originalTransactionId': options.originalTransactionId");
    expect(source).toContain('return { success: true, duplicate: true');
  });

  it('reserves billing before streaming and gates AI persistence on commit ownership', () => {
    const route = read('app/api/services/thinkforge/chat/route.ts');
    const service = read('lib/thinkforge/services/chat-service.ts');

    expect(route).toContain('const deduction = await creditCheck.deduct()');
    expect(route).toContain('await db.setActiveGeneration(');
    expect(route.indexOf('await db.setActiveGeneration(')).toBeLessThan(route.indexOf('processChat({'));
    expect(route).toContain('abortSignal: req.signal');
    expect(route).not.toContain('retryOnceOnOverload(() => processChat');
    expect(service).toContain('claimCommitOwnership');
    expect(service).toContain('isThinkForgeAbortFailure(error, abortSignal) || isStreamClosed');
    expect(service).toMatch(/runThinkingAgent\([\s\S]{0,500}abortSignal,\s*\);/);
    expect(service).toMatch(/resolveThinkForgeTrendContext\(\{[\s\S]{0,300}abortSignal,/);
    expect(service).toContain('if (isThinkForgeAbortFailure(thinkErr, abortSignal))');
    expect(service).toContain('if (isThinkForgeAbortFailure(trendErr, abortSignal))');
    expect(service).toContain('writer.runStructured(baseInput as PostWriterInput, undefined, abortSignal)');
    expect(service).toContain('writer.runStructured(baseInput as ScriptWriterInput, undefined, abortSignal)');
    expect(service).toContain('beforeCommit: claimCommitOwnership');
    expect(service.indexOf('beforeCommit: claimCommitOwnership'))
      .toBeGreaterThan(service.indexOf('reviseDocumentViaFlatWriter({'));
    expect(service.indexOf("terminalFailureMessage = 'Chat limit reached"))
      .toBeLessThan(service.indexOf("await emitEvent('done', { sessionId: canonicalSessionId, quota })"));
    expect(service).not.toContain('initializing: true');
  });

  it('publishes a new document identity only after its canonical commit succeeds', () => {
    const service = read('lib/thinkforge/services/chat-service.ts');
    const stagedIdentity = service.indexOf('createdDocumentId = newScriptId;');
    const canonicalCommit = service.indexOf('const saveResult = await applyCommand({', stagedIdentity);
    const failedCommitGuard = service.indexOf('if (!saveResult.ok)', canonicalCommit);
    const durableCommit = service.indexOf('commitPersisted = true;', failedCommitGuard);
    const publishedIdentity = service.indexOf("await emitEvent('script_created'", durableCommit);
    const publishedDocument = service.indexOf("await emitEvent('script_update'", publishedIdentity);

    expect(stagedIdentity).toBeGreaterThan(-1);
    expect(canonicalCommit).toBeGreaterThan(stagedIdentity);
    expect(failedCommitGuard).toBeGreaterThan(canonicalCommit);
    expect(durableCommit).toBeGreaterThan(failedCommitGuard);
    expect(publishedIdentity).toBeGreaterThan(durableCommit);
    expect(publishedDocument).toBeGreaterThan(publishedIdentity);
    expect(service.slice(stagedIdentity, canonicalCommit)).not.toContain("emitEvent('script_created'");
  });

  it('resolves one authorised authoring context before billing and reuses it in the writer service', () => {
    const route = read('app/api/services/thinkforge/chat/route.ts');
    const service = read('lib/thinkforge/services/chat-service.ts');

    expect(route).toContain('resolveThinkForgeAuthoringContext({');
    expect(route.indexOf('resolveThinkForgeAuthoringContext({'))
      .toBeLessThan(route.indexOf('const creditCheck = await checkCredits('));
    expect(route).toContain('authoringContext,');
    expect(service).toContain('authoringContext?: ThinkForgeResolvedAuthoringContext | null;');
    expect(service).toContain('authoringContext: providedAuthoringContext');
    expect(service).toContain('resolveThinkForgeAuthoringContext({');
    expect(service).not.toContain('fetchContextSources({');
    expect(service).toContain('const authoringContextSnapshot = authoringContext?.snapshot');
    expect(service).toMatch(
      /buildThinkForgeAuthoringContextSnapshot\(\{[\s\S]{0,240}authoringRequest: authoritativeAuthoringRequest/,
    );
  });

  it('fails closed when the required production brief cannot be resolved', () => {
    const service = read('lib/thinkforge/services/chat-service.ts');
    const briefResolution = service.indexOf('let briefSnapshot = resolveThinkForgeProductionBrief({');
    const postWriter = service.indexOf('const writer = new PostWriterAgent()');
    const scriptWriter = service.indexOf('const writer = new ScriptWriterAgent()');

    expect(briefResolution).toBeGreaterThan(-1);
    expect(briefResolution).toBeLessThan(postWriter);
    expect(briefResolution).toBeLessThan(scriptWriter);
    expect(service).not.toContain('generating without briefSnapshot');
  });

  it('keeps the writer execution budget and stale-generation watchdog aligned', () => {
    const route = read('app/api/services/thinkforge/chat/route.ts');
    const statusRoute = read('app/api/services/thinkforge/generation/status/route.ts');

    expect(route).toContain('export const maxDuration = 300');
    expect(statusRoute).toContain('const CHAT_EXECUTION_BUDGET_MS = 300_000');
    expect(statusRoute).toContain('const STALE_AFTER_MS = CHAT_EXECUTION_BUDGET_MS + WATCHDOG_GRACE_MS');
  });

  it('keeps probing and polling when recovery has no live SSE transport', () => {
    expect(shouldProbeThinkForgeGeneration({
      hasSession: true,
      hasThread: true,
      hasLiveStream: false,
    })).toBe(true);

    expect(shouldScheduleThinkForgeGenerationPolling({
      hasSession: true,
      hasThread: true,
      hasLiveStream: false,
      generationId: 'generation_recovered',
    })).toBe(true);

    expect(shouldScheduleThinkForgeGenerationPolling({
      hasSession: true,
      hasThread: true,
      hasLiveStream: true,
      generationId: 'generation_streaming',
    })).toBe(false);
  });

  it('delivers recovered completion to exactly one document owner', () => {
    expect(resolveCompletedGenerationDelivery({
      activeScriptId: 'default',
      completedScriptId: 'post_generated',
      hasScriptPayload: true,
    })).toEqual({ type: 'switch_document', scriptId: 'post_generated' });

    expect(resolveCompletedGenerationDelivery({
      activeScriptId: 'post_generated',
      completedScriptId: 'post_generated',
      hasScriptPayload: true,
    })).toEqual({ type: 'apply_current_document' });

    expect(resolveCompletedGenerationDelivery({
      activeScriptId: 'default',
      completedScriptId: null,
      hasScriptPayload: false,
    })).toEqual({ type: 'missing_document' });
  });

  it('converts terminal server failures into actionable author-facing messages', () => {
    expect(resolveThinkForgeGenerationFailureMessage(
      'Script writer output failed document contract: spoken_word_count_mismatch:591/945',
    )).toBe('The draft did not meet the requested runtime and production requirements, so it was not saved. Please try again.');
    expect(resolveThinkForgeGenerationFailureMessage('Generation timed out before a script could be saved.'))
      .toBe('The draft took too long to complete and was not saved. Please try again.');
    expect(resolveThinkForgeGenerationFailureMessage('provider failure'))
      .toBe('The draft could not be completed and was not saved. Please try again.');
  });

  it('keeps generation work status transient and persists only the completion result', () => {
    const service = read('lib/thinkforge/services/chat-service.ts');

    expect(service).toContain("await emitEvent('progress', { progress: 0, message: workingMsg })");
    expect(service).not.toContain("await emitEvent('token', { content: workingMsg })");
    expect(service).toContain("await db.appendChatMessage(canonicalSessionId, 'assistant', finalResponse, threadId)");
    expect(service).not.toContain('generatedDocumentLabel');
  });

  it('wires stream ownership instead of a session-global cancellation latch', () => {
    const hook = read('app/dashboard/thinkforge/hooks/useThinkForgeChat.ts');

    expect(hook).toContain('activeStreamGenerationIdRef');
    expect(hook).toContain('cancelledGenerationIdRef');
    expect(hook).not.toContain('isCancelledRef');
    expect(hook).toContain('resolveCompletedGenerationDelivery');
    expect(hook).toContain("data?.type === 'error'");
    expect(hook).toContain('finishWithServerFailure(data?.error)');
    expect(hook).toContain('resolveThinkForgeGenerationFailureMessage');
    expect(hook).toContain('shouldScheduleThinkForgeGenerationPolling');
  });
});

describe('ThinkForge generation route ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lifecycleMocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    lifecycleMocks.getSession.mockResolvedValue({
      _id: 'session_canonical',
      userId: 'session_owner',
      orgId: 'org_1',
    });
    lifecycleMocks.getActiveGeneration.mockResolvedValue({
      id: 'generation_1',
      type: 'chat',
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    lifecycleMocks.updateGenerationState.mockResolvedValue({
      id: 'generation_1',
      type: 'chat',
      status: 'cancelled',
    });
    longFormLifecycleMocks.getByGenerationAuthorized.mockResolvedValue(null);
    longFormLifecycleMocks.cancelByGenerationAuthorized.mockResolvedValue(null);
  });

  it('denies foreign-organization callers before reading generation state', async () => {
    lifecycleMocks.getSession.mockResolvedValue(null);
    const { getStatus, stopGeneration } = await loadGenerationRoutes();

    const statusResponse = await getStatus(statusRequest());
    const stopResponse = await stopGeneration(stopRequest({
      sessionId: 'session_requested',
      generationId: 'generation_1',
    }));

    expect([statusResponse.status, stopResponse.status]).toEqual([404, 404]);
    expect(lifecycleMocks.getSession).toHaveBeenCalledTimes(2);
    expect(lifecycleMocks.getSession).toHaveBeenNthCalledWith(
      1,
      'session_requested',
      'user_1',
      'org_1',
    );
    expect(lifecycleMocks.getSession).toHaveBeenNthCalledWith(
      2,
      'session_requested',
      'user_1',
      'org_1',
    );
    expect(lifecycleMocks.getActiveGeneration).not.toHaveBeenCalled();
    expect(lifecycleMocks.updateGenerationState).not.toHaveBeenCalled();
  });

  it('polls and hydrates only the canonical generation document', async () => {
    lifecycleMocks.getActiveGeneration.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'script_generated',
      status: 'completed',
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    lifecycleMocks.getScript.mockResolvedValue({
      sessionId: 'session_canonical',
      scriptId: 'script_generated',
      title: 'Generated document',
    });
    const { getStatus } = await loadGenerationRoutes();

    const response = await getStatus(statusRequest());

    expect(response.status).toBe(200);
    expect(lifecycleMocks.getActiveGeneration).toHaveBeenCalledWith('session_canonical');
    expect(lifecycleMocks.getScript).toHaveBeenCalledWith(
      'session_canonical',
      'script_generated',
    );
    await expect(response.json()).resolves.toMatchObject({
      generation: { id: 'generation_1', scriptId: 'script_generated' },
      script: { sessionId: 'session_canonical', scriptId: 'script_generated' },
    });
  });

  it('does not guess the latest document when completion lacks a script identity', async () => {
    lifecycleMocks.getActiveGeneration.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      status: 'completed',
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    const { getStatus } = await loadGenerationRoutes();

    const response = await getStatus(statusRequest());

    expect(response.status).toBe(200);
    expect(lifecycleMocks.getScript).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      generation: { id: 'generation_1', status: 'completed' },
      script: null,
    });
  });

  it('reports durable chapter progress without applying the one-shot watchdog', async () => {
    const stale = new Date(Date.now() - 600_000);
    lifecycleMocks.getActiveGeneration.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'script_generated',
      intent: 'long_form_chaptered',
      status: 'running',
      startedAt: stale,
      updatedAt: stale,
    });
    longFormLifecycleMocks.getByGenerationAuthorized.mockResolvedValue({
      status: 'running',
      stage: 'writing',
      updatedAt: new Date().toISOString(),
      plan: {
        acts: [{ chapters: [{ id: 'chapter_1' }, { id: 'chapter_2' }] }],
      },
      chapterArtifacts: { chapter_1: {} },
    });
    const { getStatus } = await loadGenerationRoutes();

    const response = await getStatus(statusRequest());

    expect(response.status).toBe(200);
    expect(longFormLifecycleMocks.getByGenerationAuthorized).toHaveBeenCalledWith(
      'session_canonical',
      'generation_1',
      'user_1',
      'org_1',
    );
    expect(lifecycleMocks.updateGenerationState).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      generation: {
        status: 'running',
        progress: 0.475,
        message: 'Writing chapter 2 of 2',
      },
    });
  });

  it('settles a completed durable job and hydrates its canonical script', async () => {
    lifecycleMocks.getActiveGeneration.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'script_generated',
      intent: 'long_form_chaptered',
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    longFormLifecycleMocks.getByGenerationAuthorized.mockResolvedValue({
      status: 'completed',
      stage: 'committing',
      updatedAt: new Date().toISOString(),
      plan: null,
      chapterArtifacts: {},
      error: null,
    });
    lifecycleMocks.updateGenerationState.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'script_generated',
      status: 'completed',
    });
    lifecycleMocks.getScript.mockResolvedValue({
      sessionId: 'session_canonical',
      scriptId: 'script_generated',
      content: 'Complete long-form script',
    });
    const { getStatus } = await loadGenerationRoutes();

    const response = await getStatus(statusRequest());

    expect(lifecycleMocks.updateGenerationState).toHaveBeenCalledWith(
      'session_canonical',
      'generation_1',
      expect.objectContaining({ status: 'completed', progress: 1 }),
    );
    expect(lifecycleMocks.getScript).toHaveBeenCalledWith('session_canonical', 'script_generated');
    await expect(response.json()).resolves.toMatchObject({
      generation: { status: 'completed' },
      script: { content: 'Complete long-form script' },
    });
  });

  it('requires the exact generation identity before cancellation', async () => {
    const { stopGeneration } = await loadGenerationRoutes();

    const response = await stopGeneration(stopRequest({ sessionId: 'session_requested' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing generationId' });
    expect(lifecycleMocks.getSession).not.toHaveBeenCalled();
    expect(lifecycleMocks.getActiveGeneration).not.toHaveBeenCalled();
    expect(lifecycleMocks.updateGenerationState).not.toHaveBeenCalled();
  });

  it('cancels only the matching generation on the canonical session', async () => {
    const { stopGeneration } = await loadGenerationRoutes();

    const response = await stopGeneration(stopRequest({
      sessionId: 'session_requested',
      generationId: 'generation_1',
    }));

    expect(response.status).toBe(200);
    expect(lifecycleMocks.getActiveGeneration).toHaveBeenCalledWith('session_canonical');
    expect(lifecycleMocks.updateGenerationState).toHaveBeenCalledWith(
      'session_canonical',
      'generation_1',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('revokes a durable job before cancelling its generation and billing state', async () => {
    lifecycleMocks.getActiveGeneration.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'script_generated',
      intent: 'long_form_chaptered',
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    longFormLifecycleMocks.cancelByGenerationAuthorized.mockResolvedValue({ status: 'cancelled' });
    const { stopGeneration } = await loadGenerationRoutes();

    const response = await stopGeneration(stopRequest({
      sessionId: 'session_requested',
      generationId: 'generation_1',
    }));

    expect(response.status).toBe(200);
    expect(longFormLifecycleMocks.cancelByGenerationAuthorized).toHaveBeenCalledWith(
      'session_canonical',
      'generation_1',
      'user_1',
      'org_1',
    );
    expect(longFormLifecycleMocks.cancelByGenerationAuthorized.mock.invocationCallOrder[0])
      .toBeLessThan(lifecycleMocks.updateGenerationState.mock.invocationCallOrder[0]);
    expect(lifecycleMocks.updateGenerationState).toHaveBeenCalledWith(
      'session_canonical',
      'generation_1',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('does not relabel a durable completion as cancelled when completion wins the race', async () => {
    lifecycleMocks.getActiveGeneration.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'script_generated',
      intent: 'long_form_chaptered',
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    longFormLifecycleMocks.cancelByGenerationAuthorized.mockResolvedValue({ status: 'completed' });
    lifecycleMocks.updateGenerationState.mockResolvedValue({
      id: 'generation_1',
      type: 'script_generate',
      scriptId: 'script_generated',
      status: 'completed',
    });
    const { stopGeneration } = await loadGenerationRoutes();

    const response = await stopGeneration(stopRequest({
      sessionId: 'session_requested',
      generationId: 'generation_1',
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Generation already completed' });
    expect(lifecycleMocks.updateGenerationState).toHaveBeenCalledWith(
      'session_canonical',
      'generation_1',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(lifecycleMocks.updateGenerationState).not.toHaveBeenCalledWith(
      'session_canonical',
      'generation_1',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('does not cancel a different active generation', async () => {
    lifecycleMocks.getActiveGeneration.mockResolvedValue({
      id: 'generation_other',
      type: 'chat',
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    const { stopGeneration } = await loadGenerationRoutes();

    const response = await stopGeneration(stopRequest({
      sessionId: 'session_requested',
      generationId: 'generation_1',
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Generation mismatch' });
    expect(lifecycleMocks.updateGenerationState).not.toHaveBeenCalled();
  });

  it('returns a conflict when cancellation loses generation ownership', async () => {
    lifecycleMocks.updateGenerationState.mockRejectedValue(
      new lifecycleMocks.GenerationStateConflictError('Generation ownership changed'),
    );
    const { stopGeneration } = await loadGenerationRoutes();

    const response = await stopGeneration(stopRequest({
      sessionId: 'session_requested',
      generationId: 'generation_1',
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Generation is no longer running' });
  });
});
