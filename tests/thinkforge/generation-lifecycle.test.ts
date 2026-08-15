import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  resolveCompletedGenerationDelivery,
  resolveThinkForgeGenerationFailureMessage,
  shouldProbeThinkForgeGeneration,
  shouldScheduleThinkForgeGenerationPolling,
} from '@/lib/thinkforge/client-generation-lifecycle';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
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
