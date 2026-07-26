import { describe, expect, it } from 'vitest';

import { resolveServerOwnedLocalizedWorkflowStep } from '@/lib/editron/agent/chat-localized-workflow';
import {
  CHAT_TOOL_EVIDENCE_RECEIPT_VERSION,
  type ChatToolEvidenceReceipt,
  type ChatToolTurnLedger,
  type CompletedChatToolExecution,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import type {
  ChatRequestOwnerLicense,
  ChatRequestRoutingFacts,
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
});
