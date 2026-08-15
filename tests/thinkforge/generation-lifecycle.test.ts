import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveCompletedGenerationDelivery,
  resolveThinkForgeGenerationFailureMessage,
  shouldProbeThinkForgeGeneration,
  shouldScheduleThinkForgeGenerationPolling,
} from '@/lib/thinkforge/client-generation-lifecycle';

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

vi.mock('@clerk/nextjs/server', () => ({ auth: lifecycleMocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  GenerationStateConflictError: lifecycleMocks.GenerationStateConflictError,
  getActiveGeneration: lifecycleMocks.getActiveGeneration,
  getScript: lifecycleMocks.getScript,
  getSession: lifecycleMocks.getSession,
  updateGenerationState: lifecycleMocks.updateGenerationState,
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

describe('ThinkForge generation lifecycle', () => {
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
    expect(service).toContain('claimCommitOwnership');
    expect(service).toContain("commitPersisted || !isStreamClosed");
    expect(service.indexOf("terminalFailureMessage = 'Chat limit reached"))
      .toBeLessThan(service.indexOf("await emitEvent('done', { sessionId: canonicalSessionId, quota })"));
    expect(service).not.toContain('initializing: true');
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
