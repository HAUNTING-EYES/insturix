import { describe, expect, it } from 'vitest';

import { verifyChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';

const LEGACY_BGM = {
  id: 'bgm-legacy',
  type: 'sound',
  row: 1,
  from: 0,
  durationInFrames: 300,
  assetId: 'bgm-without-rights',
  content: 'https://cdn.example.com/bgm.mp3',
};

describe('chat edit render-eligibility postconditions', () => {
  it('does not roll back an unrelated cut because the same legacy rights debt already existed', () => {
    const verification = verifyChatToolPostcondition({
      toolName: 'cut_section',
      args: { start: 30, end: 60 },
      resultData: { affectedOverlayIds: ['video-1', 'bgm-legacy'] },
      beforeProject: {
        durationInFrames: 300,
        overlays: [
          { id: 'video-1', type: 'video', from: 0, durationInFrames: 300 },
          LEGACY_BGM,
        ],
      },
      afterProject: {
        durationInFrames: 270,
        overlays: [
          { id: 'video-1', type: 'video', from: 0, durationInFrames: 270 },
          { ...LEGACY_BGM, durationInFrames: 270 },
        ],
      },
    });

    expect(verification.status).toBe('pass');
    expect(verification.renderEligibility).toEqual({
      inheritedIssues: [{
        overlayId: 'bgm-legacy',
        reason: expect.stringContaining('background music has no durable rights receipt'),
      }],
      introducedIssues: [],
    });
    expect(verification.renderVerification.modalities).toEqual(['visual', 'audio']);
  });

  it('still rejects newly introduced unlicensed audio', () => {
    const verification = verifyChatToolPostcondition({
      toolName: 'add_overlay',
      args: { type: 'sound' },
      resultData: { id: 'bgm-legacy' },
      beforeProject: { durationInFrames: 300, overlays: [] },
      afterProject: {
        durationInFrames: 300,
        overlays: [LEGACY_BGM],
      },
    });

    expect(verification.status).toBe('fail');
    expect(verification.renderEligibility).toEqual({
      inheritedIssues: [],
      introducedIssues: [{
        overlayId: 'bgm-legacy',
        reason: expect.stringContaining('background music has no durable rights receipt'),
      }],
    });
  });
});
