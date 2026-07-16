import { describe, expect, it, vi } from 'vitest';

import {
  compileGroundedEditorialIntent,
  dispatchScriptIntentToPhase2,
} from '@/lib/editron/agent/chat-editorial-intent-tools';
import {
  CHAT_SCRIPT_MAX_CHARS,
  CHAT_SCRIPT_RECOMPOSITION_VERSION,
  queueChatScriptRecomposition,
  type ChatScriptRecompositionDependencies,
} from '@/lib/editron/services/chat-script-recomposition';

const NOW = new Date('2026-07-16T12:00:00.000Z');

function input() {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    intentId: 'intent-1',
    script: 'Open on the problem. Show the process. End on the proof.',
    goal: 'Rebuild the uploaded footage around this script',
    editorialPreferences: {
      families: {
        motionGraphics: { mode: 'prefer' as const, frequency: 0.4, intensity: 0.7 },
        transitions: { mode: 'off' as const },
      },
    },
  };
}

function dependencies(overrides: Partial<ChatScriptRecompositionDependencies> = {}) {
  return {
    loadProject: vi.fn(async () => ({
      projectId: 'project-1',
      userId: 'user-1',
      orgId: 'org-1',
      sourceUploadBatchId: 'batch-1',
      directorLock: false,
    })),
    loadBatch: vi.fn(async () => ({
      uploadBatchId: 'batch-1',
      userId: 'user-1',
      projectId: 'project-1',
      orgId: 'org-1',
      orchestrationStatus: 'director_queued',
    })),
    claimBatch: vi.fn(async () => true),
    markPublished: vi.fn(async () => undefined),
    markDispatchFailed: vi.fn(async () => undefined),
    publish: vi.fn(async () => ({ messageId: 'message-1' })),
    now: vi.fn(() => NOW),
    ...overrides,
  } satisfies ChatScriptRecompositionDependencies;
}

describe('durable chat script recomposition', () => {
  it('claims the existing upload batch and publishes the signed Phase 2 orchestration request', async () => {
    const deps = dependencies();
    const result = await queueChatScriptRecomposition(input(), deps);

    expect(result).toEqual({
      status: 'queued',
      uploadBatchId: 'batch-1',
      messageId: 'message-1',
    });
    expect(deps.claimBatch).toHaveBeenCalledWith(expect.objectContaining({
      uploadBatchId: 'batch-1',
      projectId: 'project-1',
      userId: 'user-1',
      intentId: 'intent-1',
      script: input().script,
      goal: input().goal,
      editorialPreferences: input().editorialPreferences,
      now: NOW,
    }));
    expect(deps.publish).toHaveBeenCalledWith({
      uploadBatchId: 'batch-1',
      userId: 'user-1',
      orgId: 'org-1',
      intentId: 'intent-1',
    });
    expect(deps.markPublished).toHaveBeenCalledWith(expect.objectContaining({
      uploadBatchId: 'batch-1',
      projectId: 'project-1',
      intentId: 'intent-1',
      messageId: 'message-1',
    }));
    expect(deps.markDispatchFailed).not.toHaveBeenCalled();
  });

  it('is idempotent when the same intent was already queued', async () => {
    const deps = dependencies({
      loadBatch: vi.fn(async () => ({
        uploadBatchId: 'batch-1',
        userId: 'user-1',
        projectId: 'project-1',
        lastChatScriptIntentId: 'intent-1',
        orchestrationMessageId: 'message-existing',
      })),
    });
    const result = await queueChatScriptRecomposition(input(), deps);

    expect(result).toEqual({
      status: 'already-queued',
      uploadBatchId: 'batch-1',
      messageId: 'message-existing',
    });
    expect(deps.claimBatch).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('does not steal an active composition lease', async () => {
    const deps = dependencies({
      loadBatch: vi.fn(async () => ({
        uploadBatchId: 'batch-1',
        userId: 'user-1',
        projectId: 'project-1',
        orchestrationLeaseUntil: new Date(NOW.getTime() + 60_000),
      })),
    });
    const result = await queueChatScriptRecomposition(input(), deps);

    expect(result).toEqual({
      status: 'failed',
      reason: 'batch-recomposition-already-in-progress',
      uploadBatchId: 'batch-1',
    });
    expect(deps.claimBatch).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('fails loud when the project is not backed by an upload batch', async () => {
    const deps = dependencies({
      loadProject: vi.fn(async () => ({
        projectId: 'project-1',
        userId: 'user-1',
        sourceUploadBatchId: null,
      })),
    });
    const result = await queueChatScriptRecomposition(input(), deps);

    expect(result).toEqual({ status: 'failed', reason: 'project-has-no-source-upload-batch' });
    expect(deps.loadBatch).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('resolves a concurrent claim by re-reading the batch instead of double-publishing', async () => {
    const loadBatch = vi.fn()
      .mockResolvedValueOnce({
        uploadBatchId: 'batch-1',
        userId: 'user-1',
        projectId: 'project-1',
      })
      .mockResolvedValueOnce({
        uploadBatchId: 'batch-1',
        userId: 'user-1',
        projectId: 'project-1',
        lastChatScriptIntentId: 'intent-1',
        orchestrationMessageId: 'message-raced',
      });
    const deps = dependencies({
      loadBatch,
      claimBatch: vi.fn(async () => false),
    });
    const result = await queueChatScriptRecomposition(input(), deps);

    expect(result).toEqual({
      status: 'already-queued',
      uploadBatchId: 'batch-1',
      messageId: 'message-raced',
    });
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it('marks a failed publish retryable and never reports the edit as queued', async () => {
    const deps = dependencies({
      publish: vi.fn(async () => {
        throw new Error('qstash unavailable');
      }),
    });
    const result = await queueChatScriptRecomposition(input(), deps);

    expect(result).toEqual({
      status: 'failed',
      reason: 'phase2-dispatch-failed:qstash unavailable',
      uploadBatchId: 'batch-1',
    });
    expect(deps.markDispatchFailed).toHaveBeenCalledWith(expect.objectContaining({
      intentId: 'intent-1',
      error: 'qstash unavailable',
    }));
    expect(deps.markPublished).not.toHaveBeenCalled();
  });

  it('rejects an oversized script before loading project or batch state', async () => {
    const deps = dependencies();
    const result = await queueChatScriptRecomposition({
      ...input(),
      script: 'x'.repeat(CHAT_SCRIPT_MAX_CHARS + 1),
    }, deps);

    expect(result).toEqual({
      status: 'failed',
      reason: `script-exceeds-${CHAT_SCRIPT_MAX_CHARS}-character-limit`,
    });
    expect(deps.loadProject).not.toHaveBeenCalled();
    expect(deps.loadBatch).not.toHaveBeenCalled();
  });

  it('maps the selected chat script intent into the durable Phase 2 owner without legacy execution', async () => {
    const intent = compileGroundedEditorialIntent({
      goal: 'Reorder all uploaded footage around the supplied narration',
      scope: { kind: 'project' },
      constraints: ['Keep only relevant evidence'],
      strength: 0.65,
      uncertainty: 0,
      script: input().script,
      families: { motionGraphics: { mode: 'prefer', frequency: 0.4 } },
    });
    const enqueue = vi.fn(async () => ({
      status: 'queued' as const,
      uploadBatchId: 'batch-1',
      messageId: 'message-1',
    }));
    const result = await dispatchScriptIntentToPhase2({
      projectId: 'project-1',
      userId: 'user-1',
      project: {},
      intent,
    }, enqueue);

    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      intentId: intent.intentId,
      script: input().script,
      goal: intent.goal,
      editorialPreferences: intent.editorialPreferences,
    }));
    expect(result).toEqual({
      owner: 'phase2-script-planner',
      status: 'queued',
      mutated: false,
      authority: {
        orchestrationVersion: CHAT_SCRIPT_RECOMPOSITION_VERSION,
        queueStatus: 'queued',
        uploadBatchId: 'batch-1',
        messageId: 'message-1',
      },
      reasons: ['script-recomposition-queued'],
    });
  });
});
