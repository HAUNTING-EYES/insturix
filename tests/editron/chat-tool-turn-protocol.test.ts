import { describe, expect, it } from 'vitest';

import { buildChatProjectRevision } from '@/lib/editron/agent/chat-edit-postconditions';
import {
  buildChatEvidenceReceipts,
  buildChatToolTurnLedger,
  classifyChatToolExecutionOutcome,
  decideChatToolExecution,
  formatChatToolInvocationError,
  scheduleChatToolCalls,
  type ChatToolEvidenceReceipt,
  type ChatToolTurnLedger,
  type CompletedChatToolExecution,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import { CHAT_TOOL_REGISTRY } from '@/lib/editron/agent/chat-tool-registry';
import type { ChatRequestOwnerLicense } from '@/lib/editron/agent/chat-request-owner';

const PROJECT_ID = 'project-1';
const REVISION = 'revision-1';
const LOCALIZED_LICENSE: ChatRequestOwnerLicense = {
  version: 'editron-chat-request-owner-v1',
  owner: 'semantic-editorial-planner',
  confidence: 1,
  reason: 'The operation is explicit but its media target must be localized.',
  requestDigest: 'localized-request',
  decidedBy: 'gemini',
  semanticWorkflow: 'localized-mutation',
};

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

function successfulMutationOutput(data: Record<string, unknown> = {}, revision = REVISION): string {
  return JSON.stringify({
    status: 'success',
    data: {
      ...data,
      postconditionVerification: { status: 'pass', afterStateHash: revision },
    },
    error: null,
  });
}

function currentProjectRead(revision = REVISION): CompletedChatToolExecution {
  const evidenceReceipts = buildChatEvidenceReceipts({
    toolName: 'read_project_file',
    args: { mode: 'full' },
    output: JSON.stringify({ jsonText: '{}' }),
    projectId: PROJECT_ID,
    projectRevision: revision,
  });
  return execution('read_project_file', JSON.stringify({ jsonText: '{}' }), { evidenceReceipts });
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
  it('schedules same-step evidence before dependent mutations without hardcoded tool names', () => {
    const calls = [
      { id: 'add-1', name: 'add_overlay' },
      { id: 'read', name: 'read_project_file' },
      { id: 'add-2', name: 'add_overlay' },
      { id: 'timeline', name: 'get_timeline_view' },
    ];

    expect(scheduleChatToolCalls(calls).map((call) => call.id)).toEqual([
      'read',
      'add-1',
      'add-2',
      'timeline',
    ]);
    expect(scheduleChatToolCalls(calls, ['project-state']).map((call) => call.id)).toEqual([
      'add-1',
      'read',
      'add-2',
      'timeline',
    ]);
  });

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

  it('gives every tool an explicit cardinality, replay, batch-safety, and target contract', () => {
    for (const metadata of Object.values(CHAT_TOOL_REGISTRY)) {
      expect(metadata.executionPolicy, metadata.name).not.toBeNull();
      expect(metadata.executionPolicy?.cardinality, metadata.name).toMatch(
        /^(repeatable|once-per-turn|once-per-target)$/,
      );
      expect(metadata.executionPolicy?.replayBehavior, metadata.name).toMatch(
        /^(never|same-project-revision)$/,
      );
      expect(metadata.executionPolicy?.batchSafety, metadata.name).toMatch(
        /^(parallel-read|sequential|isolated|explicit-batch)$/,
      );
      expect(Array.isArray(metadata.executionPolicy?.targetKeys), metadata.name).toBe(true);
      expect(Array.isArray(metadata.executionPolicy?.blockedWhenTurnRequests), metadata.name).toBe(true);
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

  it('uses the server-loaded canonical project as project-state evidence', () => {
    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: { type: 'text' },
      ledger: ledger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
    })).toEqual({ action: 'execute' });
  });

  it('authorizes only the exact localized mutation returned by a current resolver', () => {
    const resolvedArgs = {
      type: 'image',
      assetId: 'asset-1',
      start: 90,
      duration: 30,
      x: 120,
      y: 80,
    };
    const resolverOutput = JSON.stringify({
      status: 'success',
      data: { useWith: { add_overlay: resolvedArgs } },
      error: null,
    });
    const evidenceReceipts = buildChatEvidenceReceipts({
      toolName: 'resolve_visual_edit',
      args: { query: 'the bird', action: 'highlight' },
      output: resolverOutput,
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });
    const resolved = execution('resolve_visual_edit', resolverOutput, { evidenceReceipts });

    expect(evidenceReceipts[0]?.authorizedMutations).toEqual([{
      toolName: 'add_overlay',
      args: resolvedArgs,
    }]);
    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: resolvedArgs,
      ledger: ledger([resolved]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
      requestOwnerLicense: LOCALIZED_LICENSE,
    })).toEqual({ action: 'execute' });

    const altered = decideChatToolExecution({
      toolName: 'add_overlay',
      args: { ...resolvedArgs, assetId: 'asset-2' },
      ledger: ledger([resolved]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
      requestOwnerLicense: LOCALIZED_LICENSE,
    });
    expect(altered).toMatchObject({ action: 'block', reason: 'missing-evidence' });
    expect(JSON.parse(altered.action === 'block' ? altered.output : '{}')).toMatchObject({
      error: { code: 'CHAT_TOOL_TARGET_EVIDENCE_REQUIRED' },
    });
  });

  it('turns a sticker resolver result into exact revision-bound mutation authority', () => {
    const resolvedArgs = {
      start: 283,
      duration: 30,
      description: 'small animated lightbulb sticker',
      x: '78%',
      y: '14%',
      width: 140,
      height: 140,
      enterAnimation: 'pop',
      exitAnimation: 'fade',
    };
    const resolverOutput = JSON.stringify({
      status: 'success',
      data: { useWith: { generate_html_sticker: resolvedArgs } },
      error: null,
    });
    const evidenceReceipts = buildChatEvidenceReceipts({
      toolName: 'resolve_sticker_overlay',
      args: { query: 'this is the key point' },
      output: resolverOutput,
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    });

    expect(evidenceReceipts).toHaveLength(1);
    expect(decideChatToolExecution({
      toolName: 'generate_html_sticker',
      args: resolvedArgs,
      ledger: ledger([execution('resolve_sticker_overlay', resolverOutput, { evidenceReceipts })]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
      requestOwnerLicense: LOCALIZED_LICENSE,
    })).toEqual({ action: 'execute' });
  });

  it('stops repeated identical policy-denied mutations without weakening later resolver authorization', () => {
    const args = { start: 283, duration: 30, description: 'lightbulb' };
    const deniedOutput = JSON.stringify({
      status: 'error',
      data: null,
      error: { code: 'CHAT_TOOL_TARGET_EVIDENCE_REQUIRED' },
    });
    const denied = execution('generate_html_sticker', deniedOutput, { args });

    const repeated = decideChatToolExecution({
      toolName: 'generate_html_sticker',
      args,
      ledger: ledger([denied]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
      requestOwnerLicense: LOCALIZED_LICENSE,
    });
    expect(repeated).toMatchObject({ action: 'block', reason: 'policy-retry-limit' });
    expect(JSON.parse(repeated.action === 'block' ? repeated.output : '{}')).toMatchObject({
      error: { code: 'CHAT_TOOL_POLICY_RETRY_LIMIT' },
    });

    const resolverOutput = JSON.stringify({
      status: 'success',
      data: { useWith: { generate_html_sticker: args } },
      error: null,
    });
    const resolved = execution('resolve_sticker_overlay', resolverOutput, {
      evidenceReceipts: buildChatEvidenceReceipts({
        toolName: 'resolve_sticker_overlay',
        args: { query: 'lightbulb moment' },
        output: resolverOutput,
        projectId: PROJECT_ID,
        projectRevision: REVISION,
      }),
    });
    expect(decideChatToolExecution({
      toolName: 'generate_html_sticker',
      args,
      ledger: ledger([denied, resolved]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
      requestOwnerLicense: LOCALIZED_LICENSE,
    })).toEqual({ action: 'execute' });
  });

  it('normalizes resolver frame aliases without weakening localized SFX authorization', () => {
    const resolverOutput = JSON.stringify({
      status: 'success',
      data: {
        useWith: {
          add_sfx: { query: 'soft impact', frame: 120, sync: 'audio-anchor', note: 'beat hit' },
        },
      },
      error: null,
    });
    const resolved = execution('resolve_audio_edit', resolverOutput, {
      evidenceReceipts: buildChatEvidenceReceipts({
        toolName: 'resolve_audio_edit',
        args: { query: 'first beat', action: 'add_sfx' },
        output: resolverOutput,
        projectId: PROJECT_ID,
        projectRevision: REVISION,
      }),
    });

    expect(decideChatToolExecution({
      toolName: 'add_sfx',
      args: { query: 'soft impact', startFrame: 120 },
      ledger: ledger([resolved]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
      canonicalProjectEvidence: true,
      requestOwnerLicense: LOCALIZED_LICENSE,
    })).toEqual({ action: 'execute' });
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
      successfulMutationOutput({ intentId: 'intent-1' }),
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

  it('replays only an identical mutation whose successful postcondition matches the current revision', () => {
    const success = execution(
      'use_matching_footage',
      successfulMutationOutput({ overlayId: 'video-1' }),
      { args: { overlayId: 'video-1', assetId: 'asset-a' } },
    );
    const baseLedger = ledger([currentProjectRead(), success]);

    expect(decideChatToolExecution({
      toolName: 'use_matching_footage',
      args: { overlayId: 'video-1', assetId: 'asset-a' },
      ledger: baseLedger,
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'replay', reason: 'identical-call' });

    expect(decideChatToolExecution({
      toolName: 'use_matching_footage',
      args: { overlayId: 'video-1', assetId: 'asset-a' },
      ledger: baseLedger,
      projectId: PROJECT_ID,
      projectRevision: 'newer-revision',
    })).not.toMatchObject({ action: 'replay' });
  });

  it('replays an identical successful mutation before rejecting its original read as stale', () => {
    const originalRead = currentProjectRead('revision-before-add');
    const successfulAdd = execution(
      'add_overlay',
      successfulMutationOutput({ overlayId: 'text-1' }, REVISION),
      { args: { text: 'Launch day', startFrame: 0, durationFrames: 90 } },
    );

    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: { text: 'Launch day', startFrame: 0, durationFrames: 90 },
      ledger: ledger([originalRead, successfulAdd]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'replay', reason: 'identical-call' });
  });

  it('blocks a second mutation of one target but permits a different target in the same turn', () => {
    const first = execution(
      'use_matching_footage',
      successfulMutationOutput({ overlayId: 'video-1' }),
      { args: { overlayId: 'video-1', assetId: 'asset-a' } },
    );
    const baseLedger = ledger([currentProjectRead(), first]);

    expect(decideChatToolExecution({
      toolName: 'use_matching_footage',
      args: { overlayId: 'video-1', assetId: 'asset-b' },
      ledger: baseLedger,
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'block', reason: 'target-limit' });

    expect(decideChatToolExecution({
      toolName: 'use_matching_footage',
      args: { overlayId: 'video-2', assetId: 'asset-b' },
      ledger: baseLedger,
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({ action: 'execute' });
  });

  it('replays identical additive requests but permits distinct creates and SFX moments', () => {
    const read = currentProjectRead();
    const addedOverlay = execution('add_overlay', successfulMutationOutput({ overlayId: 'shape-1' }), {
      args: { type: 'shape', from: 120 },
    });
    const addedSfx = execution(
      'add_sfx',
      successfulMutationOutput({ overlayId: 'sfx-1' }),
      { args: { query: 'impact', startFrame: 120 } },
    );

    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: { type: 'shape', from: 120 },
      ledger: ledger([read, addedOverlay]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'replay', reason: 'identical-call' });

    expect(decideChatToolExecution({
      toolName: 'add_overlay',
      args: { type: 'shape', from: 240 },
      ledger: ledger([read, addedOverlay]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({ action: 'execute' });

    expect(decideChatToolExecution({
      toolName: 'add_sfx',
      args: { query: 'whoosh', startFrame: 120 },
      ledger: ledger([read, addedSfx]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({ action: 'block', reason: 'target-limit' });

    expect(decideChatToolExecution({
      toolName: 'add_sfx',
      args: { query: 'whoosh', startFrame: 240 },
      ledger: ledger([read, addedSfx]),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({ action: 'execute' });
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
