import { describe, expect, it } from 'vitest';

import {
  classifyChatToolExecutionOutcome,
  decideChatToolExecution,
  type ChatToolTurnLedger,
  type CompletedChatToolExecution,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import {
  classifyChatBattleMutationTerminalOutcome,
  evaluateChatBattleMutationTruth,
  getChatEditBattleScenario,
  type ChatBattleInvocationEvidence,
  type ChatBattleMutationTerminalOutcome,
  type ChatBattleToolEvent,
} from '@/lib/editron/services/chat-edit-battle-harness';

const PROJECT_ID = 'project-1';
const REVISION = 'revision-1';

function execution(input: {
  name: string;
  args: Record<string, unknown>;
  status: string;
}): CompletedChatToolExecution {
  const output = JSON.stringify({
    status: input.status,
    data: {},
    error: null,
    nextAction: null,
  });
  return {
    toolCallId: `${input.name}-${input.status}`,
    name: input.name,
    args: input.args,
    output,
    outcome: classifyChatToolExecutionOutcome(output),
    evidenceReceipts: [],
  };
}

function ledger(...executions: CompletedChatToolExecution[]): ChatToolTurnLedger {
  return {
    requestedToolNames: executions.map((entry) => entry.name),
    completedExecutions: executions,
  };
}

function event(name: string, status: string): ChatBattleToolEvent {
  return {
    id: `${name}-${status}`,
    name,
    args: {},
    startedAt: '2026-07-27T00:00:00.000Z',
    completedAt: '2026-07-27T00:00:01.000Z',
    output: {
      status,
      data: {},
      error: null,
      nextAction: null,
    },
  };
}

const invocation: ChatBattleInvocationEvidence = {
  agentRunId: 'run-1',
  mode: 'live-provider',
  prompt: 'test',
  responseText: '',
  toolEvents: [],
};

describe('chat terminal outcome contract', () => {
  it('allows a corrected caption call after an authoritative no-op', () => {
    const timeline = execution({
      name: 'get_timeline_view',
      args: {},
      status: 'success',
    });
    timeline.evidenceReceipts = [{
      version: 'editron-chat-evidence-v1',
      evidenceClass: 'timeline-state',
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      producerTool: 'get_timeline_view',
      target: {
        scope: 'project',
        overlayIds: [],
        startFrame: null,
        endFrame: null,
      },
    }];
    const prior = execution({
      name: 'add_captions',
      args: { videoOverlayId: 'video-1', overwrite: false },
      status: 'no-op',
    });

    expect(decideChatToolExecution({
      toolName: 'add_captions',
      args: { videoOverlayId: 'video-1', overwrite: true },
      ledger: ledger(timeline, prior),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
    })).toEqual({ action: 'execute' });
  });

  it('replays an identical no-op instead of executing it forever', () => {
    const args = { videoOverlayId: 'video-1', overwrite: false };
    const prior = execution({ name: 'add_captions', args, status: 'no-op' });

    expect(decideChatToolExecution({
      toolName: 'add_captions',
      args,
      ledger: ledger(prior),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
    })).toMatchObject({
      action: 'replay',
      reason: 'identical-call',
    });
  });

  it.each([
    ['success', 'mutated'],
    ['no-op', 'no-op'],
    ['needs-choice', 'needs-input'],
    ['declined', 'declined'],
    ['error', 'failed'],
  ] as const)('maps %s to %s once for every mutating tool', (status, expected) => {
    const terminal = classifyChatBattleMutationTerminalOutcome(
      event('add_captions', status),
      invocation,
    );
    expect(terminal).toBe(expected);
  });

  it('uses one truth table for required, conditional, and forbidden requests', () => {
    const required = getChatEditBattleScenario('clean-captions')!;
    const conditional = getChatEditBattleScenario('vague-transitions')!;
    const forbidden = getChatEditBattleScenario('inspect-rendered-frame')!;
    const truth = (
      scenario: typeof required,
      outcomes: ChatBattleMutationTerminalOutcome[],
      stateChanged: boolean,
    ) => evaluateChatBattleMutationTruth(scenario, outcomes, stateChanged, false);

    expect(truth(required, ['mutated'], true)).toBe('pass');
    expect(truth(required, ['no-op'], false)).toBe('pass');
    expect(truth(required, ['declined'], false)).toBe('fail');
    expect(truth(conditional, ['declined'], false)).toBe('pass');
    expect(truth(conditional, ['needs-input'], false)).toBe('pass');
    expect(truth(conditional, ['failed'], false)).toBe('fail');
    expect(truth(forbidden, [], false)).toBe('pass');
    expect(truth(forbidden, ['no-op'], false)).toBe('fail');
  });

  it('accepts an explicitly licensed partial-success journey without weakening ordinary failures', () => {
    const partialSuccess = getChatEditBattleScenario('rollback-partial-failure')!;
    const ordinary = getChatEditBattleScenario('clean-captions')!;

    expect(evaluateChatBattleMutationTruth(
      partialSuccess,
      ['mutated', 'mutated', 'failed'],
      true,
      false,
    )).toBe('pass');
    expect(evaluateChatBattleMutationTruth(
      ordinary,
      ['mutated', 'failed'],
      true,
      false,
    )).toBe('fail');
  });
});
