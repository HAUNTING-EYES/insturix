import { describe, expect, it } from 'vitest';

import { buildChatProjectRevision } from '@/lib/editron/agent/chat-edit-postconditions';
import {
  buildChatEvidenceReceipts,
  buildChatToolTurnLedger,
  classifyChatToolExecutionOutcome,
  decideChatToolExecution,
  formatChatToolInvocationError,
  type ChatToolEvidenceReceipt,
  type ChatToolTurnLedger,
  type CompletedChatToolExecution,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import { CHAT_TOOL_REGISTRY } from '@/lib/editron/agent/chat-tool-registry';

const PROJECT_ID = 'project-1';
const REVISION = 'revision-1';

function execution(
  name: string,
  output: string,
  overrides: Partial<CompletedChatToolExecution> = {},
): CompletedChatToolExecution {
  return {
    toolCallId: `${name}-call`,
    name,
    args: {},
    output,
    outcome: classifyChatToolExecutionOutcome(output),
    evidenceReceipts: [],
    ...overrides,
  };
}

function ledger(executions: CompletedChatToolExecution[] = []): ChatToolTurnLedger {
  return { requestedToolNames: executions.map((entry) => entry.name), completedExecutions: executions };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    fps: 30,
    durationInFrames: 300,
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    overlays: [{
      id: 'video-1',
      type: 'video',
      from: 0,
      durationInFrames: 300,
      src: 'https://signed.example/asset.mp4?token=one',
    }],
    ...overrides,
  };
}

describe('chat tool turn protocol', () => {
  it('gives every mutating tool one explicit owner and an evidence strategy', () => {
    const mutations = Object.values(CHAT_TOOL_REGISTRY).filter((metadata) => metadata.mutatesProject);
    expect(mutations.length).toBeGreaterThan(0);
    for (const metadata of mutations) {
      expect(metadata.turnContract.owner, metadata.name).not.toBeNull();
      expect(metadata.turnContract.evidenceStrategy, metadata.name).not.toBe('none');
      if (metadata.turnContract.evidenceStrategy === 'preflight') {
        expect(metadata.turnContract.requiredEvidence, metadata.name).toContain('project-state');
      }
    }
  });

  it('gives every tool an explicit effect contract', () => {
    for (const metadata of Object.values(CHAT_TOOL_REGISTRY)) {
      expect(Array.isArray(metadata.effectContract.produces), metadata.name).toBe(true);
      expect(Array.isArray(metadata.effectContract.redundantAfter), metadata.name).toBe(true);
    }
  });

  it('blocks a mechanical mutation until current project evidence exists', () => {
    const decision = decideChatToolExecution({
      toolName: 'add_overlay',
      args: { type: 'text' },
      ledger: ledger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });

    expect(decision).toMatchObject({ action: 'block', reason: 'missing-evidence' });
    expect(JSON.parse(decision.action === 'block' ? decision.output : '{}')).toMatchObject({
      status: 'error',
      error: { code: 'CHAT_TOOL_EVIDENCE_REQUIRED' },
    });
  });

  it('licenses a mutation only with a matching project and material revision receipt', () => {
    const receipts = buildChatEvidenceReceipts({
      toolName: 'read_project_file',
      args: { mode: 'full' },
      output: JSON.stringify({ jsonText: '{}' }),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });
    const read = execution('read_project_file', JSON.stringify({ jsonText: '{}' }), {
      evidenceReceipts: receipts,
    });

    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: { type: 'text' },
      ledger: ledger([read]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({ action: 'execute' });

    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: { type: 'text' },
      ledger: ledger([read]),
      projectId: PROJECT_ID,
      projectRevision: 'revision-2',
    })).toMatchObject({ action: 'block', reason: 'stale-evidence' });

    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: { type: 'text' },
      ledger: ledger([read]),
      projectId: 'project-2',
      projectRevision: REVISION,
    })).toMatchObject({ action: 'block', reason: 'missing-evidence' });
  });

  it('persists evidence receipts through tool-message ledger reconstruction', () => {
    const receipt: ChatToolEvidenceReceipt = {
      version: 'editron-chat-evidence-v1',
      evidenceClass: 'project-state',
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      producerTool: 'read_project_file',
      target: { scope: 'project', overlayIds: [], startFrame: null, endFrame: null },
    };
    const messages = [
      { _getType: () => 'human', content: 'add text' },
      { tool_calls: [{ id: 'read-1', name: 'read_project_file', args: { mode: 'full' } }] },
      {
        tool_call_id: 'read-1',
        content: JSON.stringify({ jsonText: '{}' }),
        additional_kwargs: { chatEvidenceReceipts: [receipt] },
      },
    ];

    expect(buildChatToolTurnLedger(messages).completedExecutions[0]).toMatchObject({
      name: 'read_project_file',
      outcome: 'success',
      evidenceReceipts: [receipt],
    });
  });

  it('allows one correction after validation failure but never counts it as completed ownership', () => {
    const validationError = formatChatToolInvocationError('apply_editorial_intent', {
      name: 'ToolInputParsingException',
      message: 'Received tool input did not match expected schema',
      cause: { issues: [{ path: ['scope'], code: 'invalid_type', message: 'Expected object' }] },
    });
    const firstFailure = execution('apply_editorial_intent', validationError);

    expect(firstFailure.outcome).toBe('validation-error');
    expect(decideChatToolExecution({
      toolName: 'apply_editorial_intent',
      args: { goal: 'add captions' },
      ledger: ledger([firstFailure]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({ action: 'execute' });

    const secondFailure = execution('apply_editorial_intent', validationError, {
      toolCallId: 'intent-call-2',
    });
    expect(decideChatToolExecution({
      toolName: 'apply_editorial_intent',
      args: { goal: 'add captions' },
      ledger: ledger([firstFailure, secondFailure]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'block', reason: 'validation-retry-limit' });
  });

  it('replays identical successful owner calls and blocks different second executions', () => {
    const success = execution(
      'apply_editorial_intent',
      JSON.stringify({ status: 'success', data: { intentId: 'intent-1' }, error: null }),
      { args: { goal: 'add captions' } },
    );
    expect(decideChatToolExecution({
      toolName: 'apply_editorial_intent',
      args: { goal: 'add captions' },
      ledger: ledger([success]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'replay', reason: 'identical-call' });
    expect(decideChatToolExecution({
      toolName: 'apply_editorial_intent',
      args: { goal: 'add music' },
      ledger: ledger([success]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'block', reason: 'turn-limit' });
  });

  it('shadows a redundant close_gaps after the atomic cut already closed its gap', () => {
    const cut = execution(
      'cut_section',
      JSON.stringify({
        status: 'success',
        data: { framesCut: 30, deleted: 0, trimmed: 1, shifted: 1 },
        error: null,
      }),
      { args: { startFrame: 30, endFrame: 60 } },
    );

    const decision = decideChatToolExecution({
      toolName: 'close_gaps',
      args: { preserveCaptions: true },
      ledger: ledger([cut]),
      projectId: PROJECT_ID,
      projectRevision: 'revision-after-cut',
    });

    expect(decision).toMatchObject({
      action: 'shadow',
      reason: 'effect-already-satisfied',
    });
    expect(JSON.parse(decision.action === 'shadow' ? decision.output : '{}')).toMatchObject({
      status: 'advisory',
      data: {
        executionPolicy: {
          code: 'CHAT_TOOL_EFFECT_ALREADY_SATISFIED',
          shadowedTool: 'close_gaps',
          producerTools: ['cut_section'],
          satisfiedEffects: ['cut-gap-closed'],
        },
      },
      error: null,
    });
  });

  it('does not treat advisory or failed producers as completed effects', () => {
    for (const producer of [
      execution('cut_section', JSON.stringify({ status: 'advisory', data: {}, error: null })),
      execution('cut_section', JSON.stringify({ status: 'error', data: null, error: { code: 'CUT_FAILED' } })),
    ]) {
      const decision = decideChatToolExecution({
        toolName: 'close_gaps',
        args: { preserveCaptions: true },
        ledger: ledger([producer]),
        projectId: PROJECT_ID,
        projectRevision: 'revision-after-attempt',
      });

      expect(decision.action).not.toBe('shadow');
    }
  });

  it('blocks a second mutation owner after a semantic planner has claimed the turn', () => {
    const semanticOwner = execution(
      'apply_editorial_intent',
      JSON.stringify({ status: 'success', data: {}, error: null }),
    );
    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: { type: 'text' },
      ledger: ledger([semanticOwner]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'block', reason: 'owner-conflict' });
  });

  it('uses material project state as revision and ignores transport-only signed URL churn', () => {
    const first = buildChatProjectRevision(project());
    const signedUrlChanged = buildChatProjectRevision(project({
      overlays: [{
        id: 'video-1',
        type: 'video',
        from: 0,
        durationInFrames: 300,
        src: 'https://signed.example/asset.mp4?token=two',
      }],
    }));
    const timelineChanged = buildChatProjectRevision(project({
      overlays: [{
        id: 'video-1',
        type: 'video',
        from: 10,
        durationInFrames: 290,
        src: 'https://signed.example/asset.mp4?token=two',
      }],
    }));

    expect(first).toBe(signedUrlChanged);
    expect(first).not.toBe(timelineChanged);
  });
});
