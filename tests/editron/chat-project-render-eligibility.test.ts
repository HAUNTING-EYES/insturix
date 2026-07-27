import { describe, expect, it } from 'vitest';

import {
  auditProjectRenderEligibility,
} from '../../lib/editron/shared/render-request-payload';
import {
  buildRequestedChatEditRenderVerification,
  markChatEditRenderVerificationTerminal,
} from '../../lib/editron/services/chat-edit-render-verification-lifecycle';
import type {
  ChatEditRenderVerificationRequest,
} from '../../lib/editron/services/phase0-rendered-evidence-worker';

const request: ChatEditRenderVerificationRequest = {
  version: 'editron-chat-render-verification-v1',
  operationId: 'operation_visual_only',
  sessionId: 'session_visual_only',
  beforeCheckpointId: 'checkpoint_before',
  afterCheckpointId: 'checkpoint_after',
  requestedAt: '2026-07-28T00:00:00.000Z',
  modalities: ['visual'],
  targets: [{
    overlayId: 'title',
    overlayType: 'text',
    state: 'updated',
    from: 0,
    endFrame: 90,
  }],
  sampleFrames: [45],
};

describe('chat project render eligibility truth', () => {
  it('keeps operation proof separate from whole-project render blockers', () => {
    const projectRenderEligibility = auditProjectRenderEligibility({
      overlays: [
        { id: 'title', type: 'text', content: 'Updated title' },
        {
          id: 'legacy_video',
          type: 'video',
          hasNativeAudio: true,
          content: 'https://cdn.example/legacy.mp4',
        },
      ],
    });
    expect(projectRenderEligibility).toMatchObject({
      status: 'blocked',
      issueCount: 1,
      issues: [{ overlayId: 'legacy_video', overlayType: 'video' }],
    });

    const record = markChatEditRenderVerificationTerminal(
      buildRequestedChatEditRenderVerification(request),
      {
        status: 'pass',
        visual: { status: 'completed', gateStatus: 'pass' },
        audio: null,
        reasons: [],
        projectRenderEligibility,
        now: '2026-07-28T00:01:00.000Z',
      },
    );

    expect(record.status).toBe('pass');
    expect(record.projectRenderEligibility?.status).toBe('blocked');
    expect(record.projectRenderEligibility?.issues[0]?.overlayId).toBe('legacy_video');
  });

  it('reports intentionally stripped preview music without blocking render', () => {
    const audit = auditProjectRenderEligibility({
      overlays: [{
        id: 'preview_music',
        type: 'sound',
        row: 1,
        content: 'https://preview.example/music.mp3',
        musicRights: {
          source: 'preview-only',
          userChoice: 'no-music',
          licensed: false,
        },
      }],
    });

    expect(audit).toMatchObject({
      status: 'eligible',
      issueCount: 0,
      strippedAudioNotices: [{
        code: 'PREVIEW_AUDIO_REMOVED_NO_MUSIC',
        overlayId: 'preview_music',
      }],
    });
  });

  it('marks missing project overlay state as unknown instead of eligible', () => {
    expect(auditProjectRenderEligibility({})).toMatchObject({
      status: 'unknown',
      issueCount: 1,
    });
  });
});
