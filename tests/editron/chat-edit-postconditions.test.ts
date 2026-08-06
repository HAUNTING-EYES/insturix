import { describe, expect, it } from 'vitest';

import { verifyChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';
import { buildNativeVideoAudioRights } from '@/lib/editron/services/native-video-audio-rights';
import { AUDIO_RIGHTS_ATTESTATION_VERSION } from '@/lib/editron/shared/render-request-payload';

const LEGACY_BGM = {
  id: 'bgm-legacy',
  type: 'sound',
  row: 1,
  from: 0,
  durationInFrames: 300,
  assetId: 'bgm-without-rights',
  content: 'https://cdn.example.com/bgm.mp3',
};

const LEGACY_NATIVE_AUDIO_VIDEO = {
  id: 'video-legacy-native-audio',
  type: 'video',
  row: 0,
  from: 0,
  durationInFrames: 300,
  assetId: 'video-without-native-audio-rights',
  content: 'https://cdn.example.com/source.mp4',
  hasNativeAudio: true,
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
    expect(verification.renderVerification.modalities).toEqual(['visual']);
  });

  it('requests audio proof for a timeline edit only when the affected video has renderable native audio', () => {
    const audioRights = buildNativeVideoAudioRights({
      sourceAssetId: 'video-with-rights',
      userId: 'user-1',
      attestation: { accepted: true, version: AUDIO_RIGHTS_ATTESTATION_VERSION },
      attestedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const beforeVideo = {
      id: 'video-1',
      type: 'video',
      from: 30,
      durationInFrames: 270,
      assetId: 'video-with-rights',
      hasNativeAudio: true,
      audioRights,
    };
    const verification = verifyChatToolPostcondition({
      toolName: 'close_gaps',
      args: {},
      resultData: { affectedOverlayIds: ['video-1'] },
      beforeProject: { durationInFrames: 300, overlays: [beforeVideo] },
      afterProject: {
        durationInFrames: 270,
        overlays: [{ ...beforeVideo, from: 0 }],
      },
    });

    expect(verification.status).toBe('pass');
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

  it('does not blame a new licensed BGM overlay for unchanged native-audio debt on a sibling video', () => {
    const generatedBgm = {
      id: 'bgm-generated',
      type: 'sound',
      row: 1,
      from: 0,
      durationInFrames: 300,
      assetId: 'generated-bgm',
      content: 'https://cdn.example.com/generated-bgm.mp3',
      musicRights: {
        mediaRole: 'music',
        source: 'generated',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'generated-provider',
          sourceAssetId: 'generated-bgm',
          licenseId: 'test-provider:commercial-use',
        },
      },
    };
    const verification = verifyChatToolPostcondition({
      toolName: 'regenerate_bgm',
      args: { mood: 'calm' },
      resultData: { overlayId: 'bgm-generated' },
      beforeProject: {
        durationInFrames: 300,
        overlays: [LEGACY_NATIVE_AUDIO_VIDEO],
      },
      afterProject: {
        durationInFrames: 300,
        overlays: [LEGACY_NATIVE_AUDIO_VIDEO, generatedBgm],
      },
    });

    expect(verification.status).toBe('pass');
    expect(verification.renderEligibility).toEqual({
      inheritedIssues: [{
        overlayId: 'video-legacy-native-audio',
        reason: expect.stringContaining('embedded native audio has no durable rights receipt'),
      }],
      introducedIssues: [],
    });
    expect(verification.renderVerification).toMatchObject({
      required: true,
      modalities: ['audio'],
    });
  });

  it('rejects a replacement source that still lacks durable audio rights', () => {
    const verification = verifyChatToolPostcondition({
      toolName: 'update_overlay',
      args: { id: 'bgm-legacy' },
      resultData: { id: 'bgm-legacy' },
      beforeProject: {
        durationInFrames: 300,
        overlays: [LEGACY_BGM],
      },
      afterProject: {
        durationInFrames: 300,
        overlays: [{ ...LEGACY_BGM, assetId: 'different-unlicensed-source' }],
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

  it('blocks inherited audio debt when a mutation expands its audible exposure', () => {
    const verification = verifyChatToolPostcondition({
      toolName: 'update_overlay',
      args: { id: 'bgm-legacy' },
      resultData: { id: 'bgm-legacy' },
      beforeProject: {
        durationInFrames: 300,
        overlays: [LEGACY_BGM],
      },
      afterProject: {
        durationInFrames: 450,
        overlays: [{ ...LEGACY_BGM, durationInFrames: 450 }],
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
