import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
  process.env.GOOGLE_CLOUD_CREDENTIALS ??= 'e30=';
  process.env.GCS_BUCKET_NAME ??= 'editron-test';
});

import {
  buildChatEditRenderVerificationRequest,
  type ChatAiToolCall,
  type ChatAiToolResult,
} from '../../lib/editron/agent/chat-ai-edit-transaction-runtime';
import { buildRequestedChatEditRenderVerification } from '../../lib/editron/services/chat-edit-render-verification-lifecycle';
import {
  normalizeChatEditInheritedRenderEligibilityOverlayIds,
  omitInheritedRenderDebtFromChatDeltaProject,
} from '../../lib/editron/services/phase0-rendered-evidence-worker';

function successfulCall(input: {
  callId: string;
  targetId: string;
  targetType: string;
  inherited?: boolean;
  required?: boolean;
}): { call: ChatAiToolCall; result: ChatAiToolResult } {
  const call = {
    id: input.callId,
    name: 'update_overlay',
    args: { id: input.targetId },
  };
  const result = {
    toolCallId: input.callId,
    toolName: 'update_overlay',
    result: JSON.stringify({
      status: 'success',
      data: {
        postconditionVerification: {
          version: 'editron-chat-postcondition-v1',
          status: 'pass',
          affectedTargets: [{
            overlayId: input.targetId,
            overlayType: input.targetType,
            state: 'updated',
            from: 0,
            endFrame: 90,
          }],
          renderEligibility: {
            inheritedIssues: input.inherited
              ? [{ overlayId: input.targetId, reason: 'legacy unlicensed audio' }]
              : [],
            introducedIssues: [],
          },
          renderVerification: {
            required: input.required ?? true,
            modalities: input.targetType === 'sound' ? ['audio'] : ['visual'],
          },
        },
      },
    }),
  };
  return { call, result };
}

function buildRequest(
  successfulCalls: Array<{ call: ChatAiToolCall; result: ChatAiToolResult }>,
) {
  return buildChatEditRenderVerificationRequest({
    transaction: {
      operationId: 'operation_inherited_debt',
      sessionId: 'session_inherited_debt',
      projectId: 'project_inherited_debt',
      userId: 'user_inherited_debt',
      beforeCheckpointId: 'checkpoint_before',
    },
    afterCheckpointId: 'checkpoint_after',
    project: { durationInFrames: 300 },
    successfulCalls,
    requestedAt: '2026-07-26T00:00:00.000Z',
  });
}

describe('chat rendered verification inherited debt', () => {
  it('carries inherited debt from a deferred sibling into a durable render request', () => {
    const inherited = successfulCall({
      callId: 'call_audio',
      targetId: 'legacy_audio',
      targetType: 'sound',
      inherited: true,
      required: false,
    });
    const visual = successfulCall({
      callId: 'call_text',
      targetId: 'title',
      targetType: 'text',
    });

    const request = buildRequest([inherited, visual]);
    expect(request.inheritedRenderEligibilityOverlayIds).toEqual(['legacy_audio']);
    expect(buildRequestedChatEditRenderVerification(request)).toMatchObject({
      inheritedRenderEligibilityOverlayIds: ['legacy_audio'],
    });
  });

  it('lets a later successful repair remove stale inherited debt', () => {
    const inherited = successfulCall({
      callId: 'call_audio_1',
      targetId: 'legacy_audio',
      targetType: 'sound',
      inherited: true,
    });
    const repaired = successfulCall({
      callId: 'call_audio_2',
      targetId: 'legacy_audio',
      targetType: 'sound',
      inherited: false,
    });

    expect(buildRequest([inherited, repaired]).inheritedRenderEligibilityOverlayIds).toBeUndefined();
  });

  it('filters named debt symmetrically without mutating checkpoint projects', () => {
    const project = {
      projectId: 'project_inherited_debt',
      overlays: [
        { id: 'legacy_audio', type: 'sound' },
        { id: 'video_1', type: 'video' },
      ],
    };

    const filtered = omitInheritedRenderDebtFromChatDeltaProject(project, ['legacy_audio']);
    expect(filtered.overlays?.map((overlay) => overlay.id)).toEqual(['video_1']);
    expect(project.overlays.map((overlay) => overlay.id)).toEqual(['legacy_audio', 'video_1']);
  });

  it('bounds, deduplicates, and rejects malformed inherited-debt identifiers', () => {
    expect(normalizeChatEditInheritedRenderEligibilityOverlayIds(
      [' legacy_audio ', 'legacy_audio', 'video_1'],
    )).toEqual(['legacy_audio', 'video_1']);
    expect(normalizeChatEditInheritedRenderEligibilityOverlayIds(['bad\u0000id'])).toBeNull();
    expect(normalizeChatEditInheritedRenderEligibilityOverlayIds(Array(65).fill('overlay'))).toBeNull();
    expect(normalizeChatEditInheritedRenderEligibilityOverlayIds([42])).toBeNull();
  });
});
