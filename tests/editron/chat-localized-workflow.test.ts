import { describe, expect, it } from 'vitest';

import { resolveServerOwnedLocalizedWorkflowStep } from '@/lib/editron/agent/chat-localized-workflow';
import { resolveServerOwnedChatWorkflowStep } from '@/lib/editron/agent/chat-server-workflow';
import {
  CHAT_TOOL_EVIDENCE_RECEIPT_VERSION,
  type ChatToolEvidenceReceipt,
  type ChatToolTurnLedger,
  type CompletedChatToolExecution,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import {
  classifyChatRequestOwner,
  type ChatRequestOwnerLicense,
  type ChatRequestRoutingFacts,
} from '@/lib/editron/agent/chat-request-owner';

const PROJECT_ID = 'project-1';
const REVISION = 'revision-1';

function routingFacts(
  localizedEdits: NonNullable<ChatRequestRoutingFacts['localizedEdits']>,
  requestedCapabilities: ChatRequestRoutingFacts['requestedCapabilities'],
): ChatRequestRoutingFacts {
  return {
    requestsMutation: true,
    requestsAnalysis: false,
    requiresContentLocalization: true,
    requiresEditorialJudgment: false,
    requestsReferenceStyle: false,
    requestsBroadEditorialOutcome: false,
    durableOperation: 'none',
    operationFullySpecified: true,
    targetFullySpecified: false,
    localizedEdits,
    requestedCapabilities,
    familyDirectives: [],
    familyScopeExclusive: false,
  };
}

function license(facts: ChatRequestRoutingFacts): ChatRequestOwnerLicense {
  return {
    version: 'editron-chat-request-owner-v1',
    owner: 'semantic-editorial-planner',
    confidence: 1,
    reason: 'Localized test.',
    requestDigest: 'digest',
    decidedBy: 'gemini',
    routingFacts: facts,
    semanticWorkflow: 'localized-mutation',
  };
}

function ledger(...executions: CompletedChatToolExecution[]): ChatToolTurnLedger {
  return {
    requestedToolNames: executions.map((execution) => execution.name),
    completedExecutions: executions,
  };
}

function receipt(
  evidenceClass: ChatToolEvidenceReceipt['evidenceClass'],
  producerTool: string,
  authorizedMutations?: NonNullable<ChatToolEvidenceReceipt['authorizedMutations']>,
  projectRevision = REVISION,
): ChatToolEvidenceReceipt {
  return {
    version: CHAT_TOOL_EVIDENCE_RECEIPT_VERSION,
    evidenceClass,
    projectId: PROJECT_ID,
    projectRevision,
    producerTool,
    target: {
      scope: evidenceClass === 'timeline-state' ? 'project' : 'target',
      overlayIds: [],
      startFrame: null,
      endFrame: null,
    },
    ...(authorizedMutations ? { authorizedMutations } : {}),
  };
}

function execution(
  name: string,
  args: Record<string, unknown>,
  options: Partial<CompletedChatToolExecution> = {},
): CompletedChatToolExecution {
  return {
    toolCallId: `${name}-${Math.random()}`,
    name,
    args,
    output: '{"status":"success"}',
    outcome: 'success',
    evidenceReceipts: [],
    ...options,
  };
}

const timelineExecution = execution('get_timeline_view', { granularity: 'detailed' }, {
  evidenceReceipts: [receipt('timeline-state', 'get_timeline_view')],
});

describe('server-owned localized chat workflow', () => {
  it.each([
    'pricing is simple',
    'कीमत आसान है',
    'pricing simple hai',
  ])('preserves %s while scheduling transcript resolution and exact mutation', (query) => {
    const owner = license(routingFacts(
      [{ modality: 'transcript', operation: 'remove', query }],
      ['localized-cut'],
    ));

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: { name: 'get_timeline_view' },
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: {
        name: 'resolve_transcript_edit',
        args: { query, action: 'cut_phrase' },
      },
    });

    const cutArgs = { startFrame: 120, endFrame: 150 };
    const resolver = execution('resolve_transcript_edit', {
      query,
      action: 'cut_phrase',
    }, {
      evidenceReceipts: [receipt('transcript-target', 'resolve_transcript_edit', [{
        toolName: 'cut_section',
        args: cutArgs,
      }])],
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution, resolver),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: { name: 'cut_section', args: cutArgs },
    });

    const cut = execution('cut_section', cutArgs);
    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution, resolver, cut),
      projectId: PROJECT_ID,
      projectRevision: 'revision-2',
    })).toMatchObject({ kind: 'complete' });
  });

  it('routes a visual highlight through visual evidence and exact add_overlay args', () => {
    const owner = license(routingFacts(
      [{ modality: 'visual', operation: 'highlight', query: 'embroidery frame' }],
      ['localized-overlay'],
    ));
    const overlayArgs = {
      type: 'text',
      content: 'Highlight',
      start: 42,
      duration: 45,
      x: 250,
      y: 160,
    };
    const resolver = execution('resolve_visual_edit', {
      query: 'embroidery frame',
      action: 'highlight',
    }, {
      evidenceReceipts: [receipt('visual-target', 'resolve_visual_edit', [{
        toolName: 'add_overlay',
        args: overlayArgs,
      }])],
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution, resolver),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: { name: 'add_overlay', args: overlayArgs },
    });
  });

  it('halts on ambiguity instead of substituting another resolver or mutator', () => {
    const owner = license(routingFacts(
      [{ modality: 'visual', operation: 'highlight', query: 'garment sketch' }],
      ['localized-overlay'],
    ));
    const resolver = execution('resolve_visual_edit', {
      query: 'garment sketch',
      action: 'highlight',
    }, {
      outcome: 'execution-error',
      output: JSON.stringify({
        status: 'error',
        data: { status: 'ambiguous', message: 'Two visual moments match this request.' },
      }),
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution, resolver),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({
      kind: 'halt',
      message: 'Two visual moments match this request.',
    });
  });

  it.each([
    ['declined', 'The requested cut would remove required context.'],
    ['needs-choice', 'Two safe cut ranges match this phrase.'],
  ] as const)('halts truthfully when an authorized mutation is %s', (outcome, message) => {
    const owner = license(routingFacts(
      [{ modality: 'transcript', operation: 'remove', query: 'pricing is simple' }],
      ['localized-cut'],
    ));
    const cutArgs = { startFrame: 120, endFrame: 150 };
    const resolver = execution('resolve_transcript_edit', {
      query: 'pricing is simple',
      action: 'cut_phrase',
    }, {
      evidenceReceipts: [receipt('transcript-target', 'resolve_transcript_edit', [{
        toolName: 'cut_section',
        args: cutArgs,
      }])],
    });
    const mutation = execution('cut_section', cutArgs, {
      outcome,
      output: JSON.stringify({
        status: outcome,
        data: { message },
        error: null,
        nextAction: null,
      }),
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution, resolver, mutation),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({ kind: 'halt', message });
  });

  it('refreshes timeline evidence before resolving the next edit after a mutation', () => {
    const owner = license(routingFacts(
      [
        { modality: 'transcript', operation: 'remove', query: 'first phrase' },
        { modality: 'transcript', operation: 'remove', query: 'second phrase' },
      ],
      ['localized-cut'],
    ));
    const firstCutArgs = { startFrame: 60, endFrame: 90 };
    const firstResolver = execution('resolve_transcript_edit', {
      query: 'first phrase',
      action: 'cut_phrase',
    }, {
      evidenceReceipts: [receipt('transcript-target', 'resolve_transcript_edit', [{
        toolName: 'cut_section',
        args: firstCutArgs,
      }])],
    });
    const firstCut = execution('cut_section', firstCutArgs);
    const afterFirstCut = ledger(timelineExecution, firstResolver, firstCut);

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: afterFirstCut,
      projectId: PROJECT_ID,
      projectRevision: 'revision-2',
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: { name: 'get_timeline_view' },
    });

    const refreshedTimeline = execution('get_timeline_view', {
      granularity: 'detailed',
    }, {
      evidenceReceipts: [receipt(
        'timeline-state',
        'get_timeline_view',
        undefined,
        'revision-2',
      )],
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution, firstResolver, firstCut, refreshedTimeline),
      projectId: PROJECT_ID,
      projectRevision: 'revision-2',
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: {
        name: 'resolve_transcript_edit',
        args: { query: 'second phrase', action: 'cut_phrase' },
      },
    });
  });

  it('re-reads the current timeline instead of replaying stale resolver authorization', () => {
    const owner = license(routingFacts(
      [{ modality: 'transcript', operation: 'remove', query: 'pricing is simple' }],
      ['localized-cut'],
    ));
    const resolver = execution('resolve_transcript_edit', {
      query: 'pricing is simple',
      action: 'cut_phrase',
    }, {
      evidenceReceipts: [receipt('transcript-target', 'resolve_transcript_edit', [{
        toolName: 'cut_section',
        args: { startFrame: 120, endFrame: 150 },
      }], 'revision-old')],
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(resolver),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: { name: 'get_timeline_view' },
    });
  });
  it('turns classified mixed capabilities into one server-owned operation at a time', async () => {
    const classified = await classifyChatRequestOwner({
      userMessage: 'Add clean captions, then remove the words pricing is simple.',
      restoreStatus: 'no-intent',
      selectedOverlayPresent: false,
      visualEvidencePresent: false,
      attachments: [],
    }, {
      generate: async () => ({
        text: JSON.stringify({
          facts: {
            requestsMutation: true,
            requestsAnalysis: true,
            requiresContentLocalization: true,
            requiresEditorialJudgment: false,
            requestsReferenceStyle: false,
            requestsBroadEditorialOutcome: false,
            durableOperation: 'none',
            operationFullySpecified: true,
            targetFullySpecified: false,
            localizedReads: [],
            localizedEdits: [{
              modality: 'transcript',
              operation: 'remove',
              query: 'pricing is simple',
            }],
            requestedCapabilities: ['caption-track', 'localized-cut'],
            familyDirectives: [{ family: 'captions', mode: 'prefer' }],
          },
          confidence: 1,
          reason: 'The user requested two explicit operations in order.',
        }),
      }),
    });

    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: classified,
      ledger: ledger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      operationId: '0:caption-track',
      toolCall: { name: 'get_timeline_view' },
    });

    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: classified,
      ledger: ledger(timelineExecution),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({
      kind: 'model-call',
      operationId: '0:caption-track',
      stepIndex: 1,
      allowedToolNames: new Set(['add_captions', 'add_fancy_captions']),
      instruction: 'Complete caption-track through its licensed family owner.',
    });

    const captions = execution('add_captions', {}, {
      toolCallId: 'server-workflow:0:caption-track:1:model:0',
    });
    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: classified,
      ledger: ledger(timelineExecution, captions),
      projectId: PROJECT_ID,
      projectRevision: 'revision-2',
    })).toMatchObject({
      kind: 'tool-call',
      operationId: '1:localized-cut',
      toolCall: { name: 'get_timeline_view' },
    });

    const refreshedTimeline = execution('get_timeline_view', {
      granularity: 'detailed',
    }, {
      toolCallId: 'server-workflow:1:localized-cut:timeline:0',
      evidenceReceipts: [receipt(
        'timeline-state',
        'get_timeline_view',
        undefined,
        'revision-2',
      )],
    });
    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: classified,
      ledger: ledger(timelineExecution, captions, refreshedTimeline),
      projectId: PROJECT_ID,
      projectRevision: 'revision-2',
    })).toMatchObject({
      kind: 'tool-call',
      operationId: '1:localized-cut',
      toolCall: {
        name: 'resolve_transcript_edit',
        args: { query: 'pricing is simple', action: 'cut_phrase' },
      },
    });
  });

  it.each([
    {
      userMessage: 'Add restrained background music that fits this video.',
      selectedOverlayPresent: false,
      capability: 'background-music',
      family: 'music',
      mutationTool: 'regenerate_bgm',
    },
    {
      userMessage: 'Make all existing captions sentence case and high contrast without changing timing.',
      selectedOverlayPresent: false,
      capability: 'caption-batch-style',
      family: 'captions',
      mutationTool: 'batch_edit_captions',
    },
    {
      userMessage: 'Replace the selected sound effect with a softer paper whoosh at the same time.',
      selectedOverlayPresent: true,
      capability: 'sfx-replacement',
      family: 'sfx',
      mutationTool: 'replace_sfx',
    },
  ])(
    'runs $capability through its server-owned family workflow',
    async ({
      userMessage,
      selectedOverlayPresent,
      capability,
      family,
      mutationTool,
    }) => {
      const classified = await classifyChatRequestOwner({
        userMessage,
        restoreStatus: 'no-intent',
        selectedOverlayPresent,
        visualEvidencePresent: false,
        attachments: [],
      }, {
        generate: async () => ({
          text: JSON.stringify({
            facts: {
              requestsMutation: true,
              requestsAnalysis: false,
              requiresContentLocalization: false,
              requiresEditorialJudgment: false,
              requestsReferenceStyle: false,
              requestsBroadEditorialOutcome: false,
              durableOperation: 'none',
              operationFullySpecified: true,
              targetFullySpecified: true,
              localizedReads: [],
              localizedEdits: [],
              requestedCapabilities: [capability],
              familyDirectives: [{ family, mode: 'prefer' }],
            },
            confidence: 1,
            reason: 'The user requested one explicit family operation.',
          }),
        }),
      });

      expect(classified.routingFacts?.requestedCapabilities).toEqual([capability]);
      expect(resolveServerOwnedChatWorkflowStep({
        requestOwnerLicense: classified,
        ledger: ledger(),
        projectId: PROJECT_ID,
        projectRevision: REVISION,
      })).toMatchObject({
        kind: 'tool-call',
        operationId: `0:${capability}`,
        toolCall: { name: 'get_timeline_view' },
      });
      expect(resolveServerOwnedChatWorkflowStep({
        requestOwnerLicense: classified,
        ledger: ledger(timelineExecution),
        projectId: PROJECT_ID,
        projectRevision: REVISION,
      })).toEqual({
        kind: 'model-call',
        operationId: `0:${capability}`,
        stepIndex: 1,
        allowedToolNames: new Set([mutationTool]),
        instruction: `Complete ${capability} through its licensed family owner.`,
      });
    },
  );

  it('runs a fully specified HTML-scene edit through one server-owned capability workflow', async () => {
    const classified = await classifyChatRequestOwner({
      userMessage: 'Change the selected HTML scene heading to How it works.',
      restoreStatus: 'no-intent',
      selectedOverlayPresent: true,
      visualEvidencePresent: false,
      attachments: [],
    }, {
      generate: async () => ({
        text: JSON.stringify({
          facts: {
            requestsMutation: true,
            requestsAnalysis: false,
            requiresContentLocalization: false,
            requiresEditorialJudgment: false,
            requestsReferenceStyle: false,
            requestsBroadEditorialOutcome: false,
            durableOperation: 'none',
            operationFullySpecified: true,
            targetFullySpecified: true,
            localizedReads: [],
            localizedEdits: [],
            requestedCapabilities: ['html-scene-edit'],
            familyDirectives: [],
          },
          confidence: 1,
          reason: 'The selected HTML scene and requested revision are explicit.',
        }),
      }),
    });

    expect(classified.owner).toBe('semantic-editorial-planner');
    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: classified,
      ledger: ledger(),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      operationId: '0:html-scene-edit',
      toolCall: { name: 'get_timeline_view' },
    });
    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: classified,
      ledger: ledger(timelineExecution),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toEqual({
      kind: 'model-call',
      operationId: '0:html-scene-edit',
      stepIndex: 1,
      allowedToolNames: new Set(['edit_html_scene']),
      instruction: 'Complete html-scene-edit through its licensed family owner.',
    });
  });

  it('keeps replan-required internal and stops after bounded validated retries', () => {
    const owner = license({
      ...routingFacts([], ['caption-track']),
      requiresContentLocalization: false,
      requestedCapabilities: ['caption-track'],
      familyDirectives: [{ family: 'captions', mode: 'prefer' }],
      familyScopeExclusive: true,
    });
    const refreshedTimeline = execution('get_timeline_view', {
      granularity: 'detailed',
    }, {
      evidenceReceipts: [receipt(
        'timeline-state',
        'get_timeline_view',
        undefined,
        'revision-2',
      )],
    });
    const replans = Array.from({ length: 3 }, (_, index) => execution('add_captions', {}, {
      toolCallId: `server-workflow:0:caption-track:1:model:${index}`,
      outcome: 'replan-required',
      output: JSON.stringify({
        status: 'replan-required',
        data: null,
        error: null,
        nextAction: 'retry',
      }),
    }));

    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(refreshedTimeline, replans[0]),
      projectId: PROJECT_ID,
      projectRevision: 'revision-2',
    })).toMatchObject({
      kind: 'model-call',
      operationId: '0:caption-track',
      stepIndex: 1,
    });

    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(refreshedTimeline, ...replans),
      projectId: PROJECT_ID,
      projectRevision: 'revision-2',
    })).toEqual({
      kind: 'halt',
      message: 'I could not complete caption-track after 3 validated attempts, so I stopped without guessing.',
    });
  });
});
