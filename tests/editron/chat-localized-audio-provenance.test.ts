import { describe, expect, it } from 'vitest';

import { resolveServerOwnedLocalizedWorkflowStep } from '@/lib/editron/agent/chat-localized-workflow';
import { resolveServerOwnedChatWorkflowStep } from '@/lib/editron/agent/chat-server-workflow';
import {
  CHAT_TOOL_EVIDENCE_RECEIPT_VERSION,
  type ChatToolEvidenceReceipt,
  type ChatToolTurnLedger,
  type CompletedChatToolExecution,
} from '@/lib/editron/agent/chat-tool-execution-policy';
import type { ChatRequestOwnerLicense } from '@/lib/editron/agent/chat-request-owner';

const PROJECT_ID = 'project-1';
const REVISION = 'revision-1';
const QUERY = 'strongest impact beat';

describe('localized workflow evidence provenance', () => {
  it('corrects a visual camera-motion guess when its candidate came from audio analysis', () => {
    const visualResolver = execution(
      'resolve_visual_edit',
      { query: QUERY, action: 'keyframe_anchor' },
      {
        outcome: 'needs-choice',
        output: resolverOutput('overlays.sound-1.metadata.audioAnalysis.transients.0.label'),
      },
    );

    expect(nextStep(timelineExecution, visualResolver)).toMatchObject({
      kind: 'tool-call',
      toolCall: {
        name: 'resolve_audio_edit',
        args: { query: QUERY, action: 'camera_shake' },
      },
    });

    const shakeArgs = { targetFrame: 325, intensity: 0.45, durationFrames: 12 };
    const audioResolver = execution(
      'resolve_audio_edit',
      { query: QUERY, action: 'camera_shake' },
      {
        evidenceReceipts: [receipt('audio-target', 'resolve_audio_edit', [{
          toolName: 'apply_camera_shake',
          args: shakeArgs,
        }])],
      },
    );

    expect(nextStep(timelineExecution, visualResolver, audioResolver)).toMatchObject({
      kind: 'tool-call',
      toolCall: { name: 'apply_camera_shake', args: shakeArgs },
    });
  });

  it('does not redirect a genuinely visual candidate', () => {
    const visualResolver = execution(
      'resolve_visual_edit',
      { query: QUERY, action: 'keyframe_anchor' },
      {
        outcome: 'needs-choice',
        output: resolverOutput('overlays.video-1.metadata.semanticVisual.events.0.label'),
      },
    );

    expect(nextStep(timelineExecution, visualResolver)).toMatchObject({
      kind: 'halt',
    });
  });

  it('preserves the redirect through the top-level operation ledger', () => {
    const timeline = execution(
      'get_timeline_view',
      { granularity: 'detailed' },
      {
        toolCallId: 'server-workflow:0:localized-camera-motion:timeline:0',
        evidenceReceipts: [receipt('timeline-state', 'get_timeline_view')],
      },
    );
    const visualResolver = execution(
      'resolve_visual_edit',
      { query: QUERY, action: 'keyframe_anchor' },
      {
        toolCallId: 'server-workflow:0:localized-camera-motion:resolver:0',
        outcome: 'needs-choice',
        output: resolverOutput('overlays.sound-1.metadata.audioAnalysis.transients.0.label'),
      },
    );

    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: ownerLicense(),
      ledger: ledger(timeline, visualResolver),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      operationId: '0:localized-camera-motion',
      toolCall: {
        name: 'resolve_audio_edit',
        args: { query: QUERY, action: 'camera_shake' },
      },
    });

    const shakeArgs = { targetFrame: 325, intensity: 0.45, durationFrames: 12 };
    const audioResolver = execution(
      'resolve_audio_edit',
      { query: QUERY, action: 'camera_shake' },
      {
        toolCallId: 'server-workflow:0:localized-camera-motion:resolver:1',
        evidenceReceipts: [receipt('audio-target', 'resolve_audio_edit', [{
          toolName: 'apply_camera_shake',
          args: shakeArgs,
        }])],
      },
    );

    expect(resolveServerOwnedChatWorkflowStep({
      requestOwnerLicense: ownerLicense(),
      ledger: ledger(timeline, visualResolver, audioResolver),
      projectId: PROJECT_ID,
      projectRevision: REVISION,
    })).toMatchObject({
      kind: 'tool-call',
      operationId: '0:localized-camera-motion',
      toolCall: { name: 'apply_camera_shake', args: shakeArgs },
    });
  });
});

function nextStep(...executions: CompletedChatToolExecution[]) {
  return resolveServerOwnedLocalizedWorkflowStep({
    requestOwnerLicense: ownerLicense(),
    ledger: ledger(...executions),
    projectId: PROJECT_ID,
    projectRevision: REVISION,
  });
}

function ownerLicense(): ChatRequestOwnerLicense {
  return {
    version: 'editron-chat-request-owner-v1',
    owner: 'semantic-editorial-planner',
    confidence: 1,
    reason: 'Live routing hypothesis.',
    requestDigest: 'digest',
    decidedBy: 'gemini',
    semanticWorkflow: 'localized-mutation',
    routingFacts: {
      requestsMutation: true,
      requestsAnalysis: false,
      requiresContentLocalization: true,
      requiresEditorialJudgment: false,
      requestsReferenceStyle: false,
      requestsBroadEditorialOutcome: false,
      durableOperation: 'none',
      operationFullySpecified: true,
      targetFullySpecified: false,
      localizedEdits: [{
        modality: 'visual',
        operation: 'camera-motion',
        query: QUERY,
      }],
      requestedCapabilities: ['localized-camera-motion'],
      familyDirectives: [],
      familyScopeExclusive: false,
    },
  };
}

function ledger(...executions: CompletedChatToolExecution[]): ChatToolTurnLedger {
  return {
    requestedToolNames: executions.map((execution) => execution.name),
    completedExecutions: executions,
  };
}

function execution(
  name: string,
  args: Record<string, unknown>,
  overrides: Partial<CompletedChatToolExecution> = {},
): CompletedChatToolExecution {
  return {
    toolCallId: `${name}-${Math.random()}`,
    name,
    args,
    output: '{"status":"success"}',
    outcome: 'success',
    evidenceReceipts: [],
    ...overrides,
  };
}

const timelineExecution = execution(
  'get_timeline_view',
  { granularity: 'detailed' },
  { evidenceReceipts: [receipt('timeline-state', 'get_timeline_view')] },
);

function receipt(
  evidenceClass: ChatToolEvidenceReceipt['evidenceClass'],
  producerTool: string,
  authorizedMutations?: NonNullable<ChatToolEvidenceReceipt['authorizedMutations']>,
): ChatToolEvidenceReceipt {
  return {
    version: CHAT_TOOL_EVIDENCE_RECEIPT_VERSION,
    evidenceClass,
    projectId: PROJECT_ID,
    projectRevision: REVISION,
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

function resolverOutput(path: string): string {
  return JSON.stringify({
    status: 'error',
    data: {
      status: 'ambiguous',
      candidate: {
        source: { overlayType: 'sound', path },
      },
    },
    error: { code: 'RESOLUTION_REQUIRED' },
    nextAction: 'ask_clarification',
  });
}
