import { describe, expect, it } from 'vitest';

import { resolveServerOwnedLocalizedWorkflowStep } from '@/lib/editron/agent/chat-localized-workflow';
import { resolveServerOwnedChatWorkflowStep } from '@/lib/editron/agent/chat-server-workflow';
import {
  getChatCapabilityAuthorityContract,
  type ChatRequestCapability,
} from '@/lib/editron/agent/chat-command-authority';
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

  it('licenses an audio impact resolver before applying exact camera shake args', () => {
    const owner = license(routingFacts(
      [{ modality: 'audio', operation: 'camera-motion', query: 'the strongest downbeat' }],
      ['localized-camera-motion'],
    ));
    const shakeArgs = {
      targetFrame: 210,
      intensity: 0.6,
      durationFrames: 12,
    };
    const resolver = execution('resolve_audio_edit', {
      query: 'the strongest downbeat',
      action: 'camera_shake',
    }, {
      evidenceReceipts: [receipt('audio-target', 'resolve_audio_edit', [{
        toolName: 'apply_camera_shake',
        args: shakeArgs,
      }])],
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: {
        name: 'resolve_audio_edit',
        args: { query: 'the strongest downbeat', action: 'camera_shake' },
      },
    });
    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution, resolver),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: { name: 'apply_camera_shake', args: shakeArgs },
    });
  });

  it('grounds a visual event removal before authorizing the exact cut', () => {
    const owner = license(routingFacts(
      [{ modality: 'visual', operation: 'remove', query: 'the bird appears' }],
      ['localized-cut'],
    ));
    const cutArgs = { startFrame: 84, endFrame: 96 };
    const resolver = execution('resolve_visual_edit', {
      query: 'the bird appears',
      action: 'cut_range',
    }, {
      evidenceReceipts: [receipt('visual-target', 'resolve_visual_edit', [{
        toolName: 'cut_section',
        args: cutArgs,
      }])],
    });

    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: {
        name: 'resolve_visual_edit',
        args: { query: 'the bird appears', action: 'cut_range' },
      },
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

  it('resolves an uploaded source against one trusted selected timeline target', () => {
    const resolverArgs = {
      query: 'uploaded embroidery clip',
      operation: 'replace',
      targetOverlayId: 'video-selected',
    };
    const owner = license(routingFacts([{
      modality: 'asset',
      operation: 'replace-asset',
      query: 'uploaded embroidery clip',
      sourceQuery: 'uploaded embroidery clip',
      targetQuery: 'selected video scene',
      targetKind: 'selected-overlay',
      targetOverlayId: 'video-selected',
      sourceSpan: 'Replace the selected video scene with my uploaded embroidery clip',
    }], ['asset-replacement']));

    expect(getChatCapabilityAuthorityContract('asset-replacement').requiredToolSequence)
      .not.toContain('search_user_assets');
    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: {
        name: 'resolve_user_asset_overlay',
        args: resolverArgs,
      },
    });

    const resolver = execution('resolve_user_asset_overlay', resolverArgs, {
      evidenceReceipts: [receipt('asset-target', 'resolve_user_asset_overlay', [{
        toolName: 'use_matching_footage',
        args: {
          assetId: 'asset-embroidery',
          targetOverlayId: 'video-selected',
        },
      }])],
    });
    expect(resolveServerOwnedLocalizedWorkflowStep({
      requestOwnerLicense: owner,
      ledger: ledger(timelineExecution, resolver),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      toolCall: {
        name: 'use_matching_footage',
        args: {
          assetId: 'asset-embroidery',
          targetOverlayId: 'video-selected',
        },
      },
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
              sourceQuery: '',
              targetQuery: '',
              targetKind: 'none',
              sourceSpan: 'remove the words pricing is simple',
            }],
            requestedCapabilities: ['caption-track', 'localized-cut'],
            capabilityEvidence: [
              { capability: 'caption-track', sourceSpan: 'Add clean captions' },
              { capability: 'localized-cut', sourceSpan: 'remove the words pricing is simple' },
            ],
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
      allowedToolNames: new Set(['add_captions']),
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

  it.each([
    ['overlay-create', 'add_overlay'],
    ['overlay-update', 'update_overlay'],
    ['overlay-batch-update', 'batch_update_overlays'],
    ['clip-split', 'split_overlay'],
    ['clip-trim', 'trim_overlay'],
    ['timeline-cut', 'cut_section'],
    ['overlay-delete', 'delete_overlay'],
    ['overlay-style-sync', 'sync_style'],
    ['timeline-gap-close', 'close_gaps'],
    ['overlay-fade', 'apply_fade'],
    ['overlay-layer-order', 'reorder_layer'],
    ['overlay-retime', 'move_retime_overlay'],
    ['clip-filter', 'apply_filter'],
  ] satisfies Array<[ChatRequestCapability, string]>)(
    'forces %s through only %s after current timeline evidence',
    (capability, mutationTool) => {
      const exactOperationLicense: ChatRequestOwnerLicense = {
        version: 'editron-chat-request-owner-v1',
        owner: 'semantic-editorial-planner',
        confidence: 1,
        reason: 'The exact operation and target are supplied.',
        requestDigest: 'exact-operation',
        decidedBy: 'gemini',
        semanticWorkflow: 'editorial-plan',
        routingFacts: {
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
          familyDirectives: [],
          familyScopeExclusive: false,
        },
      };

      expect(resolveServerOwnedChatWorkflowStep({
        requestOwnerLicense: exactOperationLicense,
        ledger: ledger(),
        projectId: PROJECT_ID,
        projectRevision: REVISION,
      })).toMatchObject({
        kind: 'tool-call',
        operationId: `0:${capability}`,
        toolCall: { name: 'get_timeline_view' },
      });
      expect(resolveServerOwnedChatWorkflowStep({
        requestOwnerLicense: exactOperationLicense,
        ledger: ledger(timelineExecution),
        projectId: PROJECT_ID,
        projectRevision: REVISION,
      })).toEqual({
        kind: 'model-call',
        operationId: `0:${capability}`,
        stepIndex: 1,
        allowedToolNames: new Set([mutationTool]),
        instruction: `Complete ${capability} through its licensed mechanical workflow.`,
      });
    },
  );

  it('preserves resolver authorization for sticker and selected-keyframe workflows', () => {
    expect(getChatCapabilityAuthorityContract('sticker-overlay').requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'resolve_sticker_overlay',
      'generate_html_sticker',
    ]);
    expect(getChatCapabilityAuthorityContract('selected-keyframes').requiredToolSequence).toEqual([
      ['read_project_file', 'get_timeline_view'],
      'resolve_keyframe_edit',
      'set_keyframes',
    ]);
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
