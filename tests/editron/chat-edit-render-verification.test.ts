import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/editron-test';
  process.env.MONGODB_DB_NAME ??= 'editron-test';
});

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    stripUrlsForLLM: <T>(overlays: T[]) => structuredClone(overlays),
    resolveProjectAssets: async <T>(overlays: T[]) => structuredClone(overlays),
  },
}));

import { OverlayType } from '../../components/editron/editor/version-7.0.0/types';
import {
  buildChatEditRenderVerificationRequest,
  buildChatEditRenderVerificationStatusMessage,
} from '../../lib/editron/agent/chat-ai-edit-transaction-runtime';
import {
  buildChatEditAudioVerificationWindows,
  buildChatEditRenderedAudioEvidence,
  buildPhase0RenderedStillEvidence,
  type ChatEditRenderVerificationRequest,
} from '../../lib/editron/services/phase0-rendered-evidence-worker';
import type { RawRenderedStillImage } from '../../lib/editron/services/phase0-rendered-aesthetic-scoring';
import { buildChatEditRenderIssue } from '../../lib/editron/services/chat-edit-render-diagnostics';

describe('chat edit rendered verification', () => {
  it('derives exact targets, sample frames, and visual modality from a passed state receipt', () => {
    const request = buildRequest({
      name: 'update_overlay',
      args: { overlayId: 'txt_1', text: 'Verified copy' },
      target: { overlayId: 'txt_1', overlayType: 'text', state: 'updated', from: 30, endFrame: 90 },
      modalities: ['visual'],
    });

    expect(request.modalities).toEqual(['visual']);
    expect(request.targets).toEqual([
      { overlayId: 'txt_1', overlayType: 'text', state: 'updated', from: 30, endFrame: 90 },
    ]);
    expect(request.sampleFrames).toEqual([45, 60, 74]);
  });

  it('preserves deleted tail frames when the resulting project is shorter', () => {
    const request = buildRequest({
      name: 'delete_overlay',
      args: { overlayId: 'tail_1' },
      target: { overlayId: 'tail_1', overlayType: 'video', state: 'deleted', from: 240, endFrame: 300 },
      modalities: ['visual', 'audio'],
      projectDurationInFrames: 180,
    });

    expect(request.sampleFrames).toEqual([255, 270, 284]);
  });

  it('uses the only interior hold frame for a three-frame animated overlay', () => {
    const request = buildRequest({
      name: 'update_overlay',
      args: { overlayId: 'flash_1', opacity: 1 },
      target: { overlayId: 'flash_1', overlayType: 'text', state: 'updated', from: 40, endFrame: 43 },
      modalities: ['visual'],
    });

    expect(request.sampleFrames).toEqual([41]);
  });

  it('keeps both frames when an edit is too short to have an interior hold', () => {
    const request = buildRequest({
      name: 'update_overlay',
      args: { overlayId: 'flash_2', opacity: 1 },
      target: { overlayId: 'flash_2', overlayType: 'text', state: 'updated', from: 40, endFrame: 42 },
      modalities: ['visual'],
    });

    expect(request.sampleFrames).toEqual([40, 41]);
  });

  it('trusts the postcondition receipt modality for timeline mutations', () => {
    const request = buildRequest({
      name: 'trim_overlay',
      args: { overlayId: 'video_1', startFrame: 45, endFrame: 150 },
      target: { overlayId: 'video_1', overlayType: 'video', state: 'updated', from: 0, endFrame: 150 },
      modalities: ['visual'],
    });

    expect(request.modalities).toEqual(['visual']);
  });

  it('marks a lossless split as continuity-preserving instead of requiring changed pixels or audio', () => {
    const request = buildRequest({
      name: 'split_overlay',
      args: { overlayId: 'video_1', splitFrame: 75 },
      target: { overlayId: 'video_1', overlayType: 'video', state: 'updated', from: 0, endFrame: 150 },
      modalities: ['visual', 'audio'],
      affectedFrameRange: { startFrame: 74, endFrame: 77 },
    });

    expect(request.expectedEffect).toBe('continuity-preserved');
    expect(request.sampleFrames).toEqual([73, 74, 75, 76, 77]);
  });

  it('proves closed gaps through changed picture and preserved audio', async () => {
    const request = buildRequest({
      name: 'close_gaps',
      args: {},
      target: { overlayId: 'video_1', overlayType: 'video', state: 'updated', from: 0, endFrame: 150 },
      modalities: ['visual', 'audio'],
      affectedFrameRange: { startFrame: 74, endFrame: 77 },
    });

    expect(request.expectedEffect).toBe('mutation-delta');
    expect(request.expectationsByModality).toEqual({
      visual: 'mutation-delta',
      audio: 'continuity-preserved',
    });

    const evidence = await buildChatEditRenderedAudioEvidence(
      afterProject(),
      beforeProject(),
      request,
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'present',
          audioTrackCount: 1,
          reason: null,
        }),
        renderAudioWindow: async () => ({
          url: 'https://example.com/same.wav',
          renderId: 'same-render',
          bucketName: 'render-bucket',
          pcmSha256: 'same-pcm',
          rms: 0.2,
          peak: 0.5,
        }),
      },
    );
    expect(evidence.status, evidence.reason ?? 'no reason').toBe('pass');
  });

  it('carries an owner-reported mutation range into exact seam samples and audio windows', () => {
    const request = buildRequest({
      name: 'cut_section',
      args: { startFrame: 30, endFrame: 60 },
      target: { overlayId: 'video_1', overlayType: 'video', state: 'updated', from: 0, endFrame: 270 },
      modalities: ['visual', 'audio'],
      affectedFrameRange: { startFrame: 30, endFrame: 31 },
    });

    expect(request.mutationRanges).toEqual([
      { startFrame: 30, endFrame: 31, toolName: 'cut_section' },
    ]);
    expect(request.sampleFrames).toEqual([29, 30, 31]);
    expect(buildChatEditAudioVerificationWindows({
      targets: request.targets,
      mutationRanges: request.mutationRanges,
      durationInFrames: 270,
      fps: 30,
      sampleLimit: 12,
    })).toEqual([{ startFrame: 0, endFrame: 91 }]);
  });

  it('does not broaden an explicitly visual video mutation into audio verification', () => {
    const request = buildRequest({
      name: 'apply_filter',
      args: {
        overlayId: 'video_1',
        filterCss: 'brightness(1.05) contrast(1.1)',
      },
      target: { overlayId: 'video_1', overlayType: 'video', state: 'updated', from: 0, endFrame: 150 },
      modalities: ['visual'],
    });

    expect(request.modalities).toEqual(['visual']);
  });

  it('renders the exact requested frame from immutable before and after project states', async () => {
    const renderStill = vi.fn(async (input: any) => {
      const isAfter = input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after');
      const kind = isAfter ? 'after' : 'before';
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${kind}-f${input.frame}.png`,
        outKey: `chat/${kind}-f${input.frame}.png`,
        bucketName: 'render-bucket',
        renderId: `${kind}-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(afterProject(), {
      baselineProject: beforeProject(),
      requestedSampleFrames: [45],
      capturedAt: '2026-07-17T00:00:00.000Z',
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => renderedImage(url.includes('/after-')),
      prepareCredentials: async () => {},
    });

    expect(evidence.status, evidence.statusReason ?? evidence.artifactPackIssues.join('|')).toBe('completed');
    expect(evidence.requestedSampleFrames).toEqual([45]);
    expect(renderStill).toHaveBeenCalledTimes(2);
    expect(renderStill.mock.calls.map((call) => call[0].frame)).toEqual([45, 45]);
    expect(evidence.renderedFrames[0]).toMatchObject({
      frame: 45,
      url: 'https://example.com/after-f45.png',
      baselineUrl: 'https://example.com/before-f45.png',
    });
  });

  it('uses separate immutable controls for mutation proof and post-edit overlay quality', async () => {
    const before = projectWithOverlays([{
      id: 'txt_after',
      type: OverlayType.TEXT,
      from: 30,
      durationInFrames: 60,
      left: 60,
      top: 60,
      width: 200,
      height: 60,
      content: 'Old copy',
      styles: { fontSize: '32px', color: '#111111' },
    }]);
    const after = projectWithOverlays([{
      id: 'txt_after',
      type: OverlayType.TEXT,
      from: 30,
      durationInFrames: 60,
      left: 60,
      top: 60,
      width: 200,
      height: 60,
      content: 'New copy',
      styles: { fontSize: '32px', color: '#ffffff' },
    }]);
    const renderStill = vi.fn(async (input: any) => {
      const target = input.inputProps.overlays.find((overlay: any) => overlay.id === 'txt_after');
      const kind = target?.content === 'New copy'
        ? 'after'
        : target?.content === 'Old copy'
          ? 'before'
          : 'aesthetic';
      return stillResult(kind, input.frame);
    });

    const evidence = await buildPhase0RenderedStillEvidence(after, {
      baselineProject: before,
      requestedSampleFrames: [45],
      auditedOverlayIds: ['txt_after'],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => renderedImage(url.includes('/after-')),
      prepareCredentials: async () => {},
    });

    expect(renderStill).toHaveBeenCalledTimes(3);
    expect(renderStill.mock.calls[0]?.[0].inputProps.overlays)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'txt_after', content: 'New copy' })]));
    expect(renderStill.mock.calls[1]?.[0].inputProps.overlays)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'txt_after', content: 'Old copy' })]));
    expect(renderStill.mock.calls[2]?.[0].inputProps.overlays)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'txt_after' })]));
    expect(evidence.renderedFrames[0]).toMatchObject({
      url: 'https://example.com/after-f45.png',
      baselineUrl: 'https://example.com/before-f45.png',
      aestheticBaselineUrl: 'https://example.com/aesthetic-f45.png',
    });
    expect(evidence.renderedAestheticReport?.summary).toMatchObject({
      mutationStatus: 'pass',
      absoluteQualityStatus: 'pass',
    });
  });

  it('does not report licensed fade endpoints as blank or invisible render failures', async () => {
    const baseTarget = {
      id: 'txt_after',
      type: OverlayType.TEXT,
      from: 30,
      durationInFrames: 60,
      left: 60,
      top: 60,
      width: 200,
      height: 60,
      content: 'Fade target',
      styles: { fontSize: '32px', color: '#ffffff' },
    };
    const before = projectWithOverlays([baseTarget]);
    const after = projectWithOverlays([{
      ...baseTarget,
      keyframeTracks: [{
        property: 'opacity',
        keyframes: [
          { frame: 0, value: 0, easing: 'ease-out' },
          { frame: 20, value: 1, easing: 'linear' },
          { frame: 40, value: 1, easing: 'ease-in' },
          { frame: 60, value: 0, easing: 'linear' },
        ],
        metadata: { family: 'fade', source: 'apply_fade', direction: 'both' },
      }],
    }]);
    const renderStill = vi.fn(async (input: any) => {
      const target = input.inputProps.overlays.find((overlay: any) => overlay.id === 'txt_after');
      const kind = target?.keyframeTracks
        ? 'after'
        : target
          ? 'before'
          : 'aesthetic';
      return stillResult(kind, input.frame);
    });

    const evidence = await buildPhase0RenderedStillEvidence(after, {
      baselineProject: before,
      requestedSampleFrames: [30, 50, 70, 89],
      auditedOverlayIds: ['txt_after'],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => {
        const match = url.match(/\/([^/]+)-f(\d+)\.png$/);
        const kind = match?.[1];
        const frame = Number(match?.[2] ?? 0);
        if (kind === 'aesthetic') return renderedImage(false);
        if (kind === 'before') return renderedImage(true);
        return renderedImage(frame !== 30 && frame !== 89);
      },
      prepareCredentials: async () => {},
    });

    expect(evidence.renderedAestheticReport?.summary).toMatchObject({
      mutationStatus: 'pass',
      absoluteQualityStatus: 'pass',
    });
    expect(evidence.renderedAestheticReport?.frames?.flatMap((frame) => frame.report?.issues ?? []))
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ dimension: 'render', severity: 'fail' }),
        expect.objectContaining({ dimension: 'visibility', severity: 'fail' }),
        expect.objectContaining({ dimension: 'contrast', severity: 'fail' }),
      ]));
  });

  it('retries only a transient still failure before declaring rendered evidence partial', async () => {
    let afterAttempts = 0;
    const renderStill = vi.fn(async (input: any) => {
      const isAfter = input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after');
      if (isAfter && afterAttempts++ === 0) {
        throw new Error('waiting for the page to render the React component failed: timeout 33000ms exceeded');
      }
      const kind = isAfter ? 'after' : 'before';
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${kind}-f${input.frame}.png`,
        outKey: `chat/${kind}-f${input.frame}.png`,
        bucketName: 'render-bucket',
        renderId: `${kind}-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(afterProject(), {
      baselineProject: beforeProject(),
      requestedSampleFrames: [45],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => renderedImage(url.includes('/after-')),
      prepareCredentials: async () => {},
    });

    expect(evidence.status, evidence.statusReason ?? 'no reason').toBe('completed');
    expect(evidence.failedFrames).toEqual([]);
    expect(renderStill).toHaveBeenCalledTimes(3);
    expect(renderStill.mock.calls.every((call) => call[0].timeoutInMilliseconds === 90_000)).toBe(true);
  });

  it('waits for the initial render batch before repairing a transient still failure', async () => {
    let releaseInitialRenders!: () => void;
    const initialRendersReleased = new Promise<void>((resolve) => {
      releaseInitialRenders = resolve;
    });
    const attempts = new Map<string, number>();
    const renderStill = vi.fn(async (input: any) => {
      const isAfter = input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after');
      const kind = isAfter ? 'after' : 'before';
      const key = `${kind}:${input.frame}`;
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      if (key === 'after:30' && attempt === 1) {
        throw new Error('Lambda function failed with error code Sandbox.Timeout');
      }
      if (attempt === 1) {
        await initialRendersReleased;
      }
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${kind}-f${input.frame}.png`,
        outKey: `chat/${kind}-f${input.frame}.png`,
        bucketName: 'render-bucket',
        renderId: `${kind}-${input.frame}-${attempt}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
        artifacts: [],
      };
    });

    const evidencePromise = buildPhase0RenderedStillEvidence(afterProject(), {
      baselineProject: beforeProject(),
      requestedSampleFrames: [30, 45],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => renderedImage(url.includes('/after-')),
      prepareCredentials: async () => {},
    });

    await vi.waitFor(() => {
      expect(renderStill).toHaveBeenCalledTimes(4);
    });
    expect(attempts.get('after:30')).toBe(1);

    releaseInitialRenders();
    const evidence = await evidencePromise;

    expect(evidence.status, evidence.statusReason ?? 'no reason').toBe('completed');
    expect(evidence.failedFrames).toEqual([]);
    expect(attempts.get('after:30')).toBe(2);
    expect(renderStill).toHaveBeenCalledTimes(5);
  });

  it('audits only overlays changed by the chat operation', async () => {
    const unchangedCaption = {
      id: 'caption_unrelated',
      type: OverlayType.CAPTION,
      from: 0,
      durationInFrames: 300,
      left: 20,
      top: 130,
      width: 280,
      height: 40,
      captions: [{ text: 'Unchanged caption', startMs: 0, endMs: 10_000 }],
      styles: { fontSize: '24px', color: '#ffffff' },
    };
    const before = projectWithOverlays([unchangedCaption]);
    const after = projectWithOverlays([
      unchangedCaption,
      {
        id: 'txt_after',
        type: OverlayType.TEXT,
        from: 30,
        durationInFrames: 60,
        left: 60,
        top: 60,
        width: 200,
        height: 60,
        content: 'Verified copy',
        styles: { fontSize: '32px', color: '#ffffff' },
      },
    ]);
    const renderStill = vi.fn(async (input: any) => ({
      estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
      url: `https://example.com/${input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after') ? 'after' : 'before'}-f${input.frame}.png`,
      outKey: `chat/f${input.frame}.png`,
      bucketName: 'render-bucket',
      renderId: `render-${input.frame}`,
      cloudWatchLogs: 'https://logs.example.com',
      sizeInBytes: 512,
      artifacts: [],
    }));

    const evidence = await buildPhase0RenderedStillEvidence(after, {
      baselineProject: before,
      requestedSampleFrames: [45],
      auditedOverlayIds: ['txt_after'],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => renderedImage(url.includes('/after-')),
      prepareCredentials: async () => {},
    });

    expect(evidence.renderedAestheticReport?.frames?.[0]?.activeOverlayIds).toEqual(['txt_after']);
    expect(evidence.renderedQualityEvidence?.renderedAestheticIssueSamples)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ overlayId: 'caption_unrelated' })]));
  });

  it('accepts a tiny real mutation without misclassifying the full frame as blank', async () => {
    const renderStill = vi.fn(async (input: any) => {
      const isAfter = input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after');
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${isAfter ? 'after' : 'before'}-f${input.frame}.png`,
        outKey: `chat/${isAfter ? 'after' : 'before'}-f${input.frame}.png`,
        bucketName: 'render-bucket',
        renderId: `${isAfter ? 'after' : 'before'}-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(afterProject(), {
      baselineProject: beforeProject(),
      requestedSampleFrames: [45],
      auditedOverlayIds: ['txt_after'],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => renderedImageWithTinyDelta(url.includes('/after-')),
      prepareCredentials: async () => {},
    });

    expect(evidence.renderedAestheticReport?.summary).toMatchObject({
      mutationStatus: 'pass',
      mutationChangedFrameCount: 1,
    });
    expect(evidence.renderedAestheticReport?.frames?.[0]).toMatchObject({
      frame: 45,
      mutationPixelCount: expect.any(Number),
      sampledPixelCount: expect.any(Number),
    });
    expect(evidence.renderedAestheticReport?.frames?.[0]?.mutationPixelCount)
      .toBeGreaterThan(0);
    expect(evidence.renderedAestheticReport?.summary?.status).not.toBe('fail');
    expect(evidence.renderedAestheticReport?.summary?.absoluteQualityStatus).not.toBe('fail');
    expect(evidence.renderedAestheticReport?.frames?.flatMap((frame) => frame.report?.issues ?? []))
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          dimension: 'render',
          message: expect.stringContaining('blank'),
        }),
      ]));
  });

  it('fails mutation proof when rendered before and after frames are pixel-identical', async () => {
    const renderStill = vi.fn(async (input: any) => {
      const isAfter = input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after');
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${isAfter ? 'after' : 'before'}-f${input.frame}.png`,
        outKey: `chat/${isAfter ? 'after' : 'before'}-f${input.frame}.png`,
        bucketName: 'render-bucket',
        renderId: `${isAfter ? 'after' : 'before'}-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(afterProject(), {
      baselineProject: beforeProject(),
      requestedSampleFrames: [45],
      auditedOverlayIds: ['txt_after'],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async () => renderedImageWithTinyDelta(false),
      prepareCredentials: async () => {},
    });

    expect(evidence.renderedAestheticReport?.summary).toMatchObject({
      status: 'fail',
      mutationStatus: 'fail',
      mutationChangedFrameCount: 0,
    });
    expect(evidence.renderedAestheticReport?.summary?.absoluteQualityStatus).not.toBe('fail');
    expect(evidence.renderedAestheticReport?.frames?.flatMap((frame) => frame.report?.issues ?? []))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          dimension: 'mutation',
          severity: 'fail',
        }),
      ]));
    expect(evidence.renderedAestheticReport?.frames?.flatMap((frame) => frame.report?.issues ?? []))
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          dimension: 'render',
          message: expect.stringContaining('blank'),
        }),
      ]));
  });

  it('treats a changed render canvas as visual mutation proof', async () => {
    const renderStill = vi.fn(async (input: any) => {
      const isAfter = input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after');
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${isAfter ? 'after' : 'before'}-f${input.frame}.png`,
        outKey: `chat/${isAfter ? 'after' : 'before'}-f${input.frame}.png`,
        bucketName: 'render-bucket',
        renderId: `${isAfter ? 'after' : 'before'}-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(afterProject(), {
      baselineProject: beforeProject(),
      requestedSampleFrames: [45],
      auditedOverlayIds: ['txt_after'],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => url.includes('/after-')
        ? { data: Buffer.alloc(4 * 2 * 4, 240), width: 4, height: 2, channels: 4 }
        : { data: Buffer.alloc(2 * 4 * 4, 240), width: 2, height: 4, channels: 4 },
      prepareCredentials: async () => {},
    });

    expect(evidence.renderedAestheticReport?.summary).toMatchObject({
      mutationStatus: 'pass',
      mutationChangedFrameCount: 1,
    });
  });

  it('passes continuity proof only when the seam renders identically', async () => {
    const renderStill = vi.fn(async (input: any) => ({
      estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
      url: `https://example.com/${input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after') ? 'after' : 'before'}-f${input.frame}.png`,
      outKey: `chat/continuity-f${input.frame}.png`,
      bucketName: 'render-bucket',
      renderId: `continuity-${input.frame}`,
      cloudWatchLogs: 'https://logs.example.com',
      sizeInBytes: 512,
      artifacts: [],
    }));

    const evidence = await buildPhase0RenderedStillEvidence(afterProject(), {
      baselineProject: beforeProject(),
      requestedSampleFrames: [44, 45, 46],
      auditedOverlayIds: ['txt_after'],
      comparisonMode: 'continuity-preserved',
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async () => renderedImageWithTinyDelta(false),
      prepareCredentials: async () => {},
    });

    expect(evidence.renderedAestheticReport?.summary).toMatchObject({
      mutationStatus: 'pass',
      mutationChangedFrameCount: 0,
    });
    expect(evidence.renderedAestheticReport?.summary?.status).not.toBe('fail');
  });

  it('fails continuity proof when the split changes seam pixels', async () => {
    const renderStill = vi.fn(async (input: any) => {
      const isAfter = input.inputProps.overlays.some((overlay: any) => overlay.id === 'txt_after');
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${isAfter ? 'after' : 'before'}-continuity-f${input.frame}.png`,
        outKey: `chat/changed-continuity-f${input.frame}.png`,
        bucketName: 'render-bucket',
        renderId: `changed-continuity-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(afterProject(), {
      baselineProject: beforeProject(),
      requestedSampleFrames: [44, 45, 46],
      auditedOverlayIds: ['txt_after'],
      comparisonMode: 'continuity-preserved',
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => renderedImageWithTinyDelta(url.includes('/after-')),
      prepareCredentials: async () => {},
    });

    expect(evidence.renderedAestheticReport?.summary).toMatchObject({
      status: 'fail',
      mutationStatus: 'fail',
      mutationChangedFrameCount: 3,
    });
  });

  it('renders shortened before and after timelines on a shared absolute duration', async () => {
    const renderStill = vi.fn(async (input: any) => ({
      estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
      url: `https://example.com/${input.inputProps.overlays.some((overlay: any) => overlay.id === 'tail_1') ? 'before' : 'after'}-f${input.frame}.png`,
      outKey: `chat/f${input.frame}.png`,
      bucketName: 'render-bucket',
      renderId: `render-${input.frame}`,
      cloudWatchLogs: 'https://logs.example.com',
      sizeInBytes: 512,
      artifacts: [],
    }));
    const before = projectWithOverlays([{
      id: 'tail_1',
      type: OverlayType.TEXT,
      from: 240,
      durationInFrames: 60,
      left: 60,
      top: 60,
      width: 200,
      height: 60,
      content: 'Tail title',
      styles: { fontSize: '32px', color: '#ffffff' },
    }]);
    const after = {
      ...projectWithOverlays([]),
      durationInFrames: 180,
      overlays: projectWithOverlays([]).overlays.map((overlay) => ({
        ...overlay,
        durationInFrames: 180,
      })),
    };

    const evidence = await buildPhase0RenderedStillEvidence(after, {
      baselineProject: before,
      requestedSampleFrames: [270],
      env: configuredEnv(),
      renderStill: renderStill as any,
      readImage: async (url) => renderedImage(url.includes('/after-')),
      prepareCredentials: async () => {},
    });

    expect(evidence.status, evidence.statusReason ?? 'no reason').toBe('completed');
    expect(renderStill.mock.calls.map((call) => call[0].inputProps.durationInFrames)).toEqual([300, 300]);
    expect(renderStill.mock.calls.map((call) => call[0].frame)).toEqual([270, 270]);
  });

  it('passes audio proof only when rendered PCM changes inside every requested window', async () => {
    const request = audioRequest();
    const renderAudioWindow = vi.fn(async (input: any) => {
      const isAfter = input.inputProps.overlays.some((overlay: any) => overlay.id === 'sound_after');
      return {
        url: `https://example.com/${isAfter ? 'after' : 'before'}.wav`,
        renderId: isAfter ? 'after-render' : 'before-render',
        bucketName: 'render-bucket',
        pcmSha256: isAfter ? 'after-pcm' : 'before-pcm',
        rms: isAfter ? 0.4 : 0.1,
        peak: isAfter ? 0.8 : 0.2,
      };
    });

    const evidence = await buildChatEditRenderedAudioEvidence(
      afterProject(),
      beforeProject(),
      request,
      {
        capturedAt: '2026-07-17T00:00:00.000Z',
        env: configuredEnv(),
        prepareCredentials: async () => {},
        renderAudioWindow,
        inspectAudioTrack: async () => ({
          status: 'present',
          audioTrackCount: 1,
          reason: null,
        }),
      },
    );

    expect(evidence.status, evidence.reason ?? 'no reason').toBe('pass');
    expect(evidence.windows).toEqual([
      expect.objectContaining({
        startFrame: 30,
        endFrame: 120,
        beforePcmSha256: 'before-pcm',
        afterPcmSha256: 'after-pcm',
        changed: true,
      }),
    ]);
  });

  it('fails closed when the before and after audio render to identical PCM', async () => {
    const evidence = await buildChatEditRenderedAudioEvidence(
      afterProject(),
      beforeProject(),
      audioRequest(),
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'present',
          audioTrackCount: 1,
          reason: null,
        }),
        renderAudioWindow: async () => ({
          url: 'https://example.com/same.wav',
          renderId: 'same-render',
          bucketName: 'render-bucket',
          pcmSha256: 'same-pcm',
          rms: 0.2,
          peak: 0.5,
        }),
      },
    );

    expect(evidence.status, evidence.reason ?? 'no reason').toBe('fail');
    expect(evidence.reason).toBe('rendered_audio_did_not_change_in_the_requested_window');
  });

  it('passes continuity proof when before and after PCM are identical', async () => {
    const evidence = await buildChatEditRenderedAudioEvidence(
      afterProject(),
      beforeProject(),
      {
        ...videoMutationAudioRequest(),
        expectedEffect: 'continuity-preserved',
      },
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'present',
          audioTrackCount: 1,
          reason: null,
        }),
        renderAudioWindow: async () => ({
          url: 'https://example.com/same.wav',
          renderId: 'same-render',
          bucketName: 'render-bucket',
          pcmSha256: 'same-pcm',
          rms: 0.2,
          peak: 0.5,
        }),
      },
    );

    expect(evidence.status, evidence.reason ?? 'no reason').toBe('pass');
    expect(evidence.windows).toEqual(expect.arrayContaining([
      expect.objectContaining({ changed: false }),
    ]));
  });

  it('passes continuity proof across sub-frame decoder alignment drift', async () => {
    const beforeWaveform = Array.from({ length: 1_200 }, (_, index) =>
      Math.sin(index * 0.11) * 0.4 + Math.sin(index * 0.037) * 0.2);
    const afterWaveform = beforeWaveform.map((sample, index) =>
      index < 500 ? sample : (beforeWaveform[index - 1] ?? sample));
    const evidence = await buildChatEditRenderedAudioEvidence(
      afterProject(),
      beforeProject(),
      {
        ...videoMutationAudioRequest(),
        expectedEffect: 'continuity-preserved',
      },
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'present',
          audioTrackCount: 1,
          reason: null,
        }),
        renderAudioWindow: async (input) => {
          const overlays = Array.isArray(input.inputProps.overlays) ? input.inputProps.overlays : [];
          const isAfter = overlays.some((overlay: any) => overlay.id === 'sound_after');
          return {
            url: `https://example.com/${isAfter ? 'after' : 'before'}.wav`,
            renderId: isAfter ? 'after-render' : 'before-render',
            bucketName: 'render-bucket',
            pcmSha256: isAfter ? 'after-shifted-pcm' : 'before-pcm',
            rms: 0.2,
            peak: 0.5,
            fingerprint: {
              sampleRate: 48_000,
              samplesPerPoint: 24,
              waveform: isAfter ? afterWaveform : beforeWaveform,
            },
          };
        },
      },
    );

    expect(evidence.status, evidence.reason ?? 'no reason').toBe('pass');
    expect(evidence.windows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        changed: false,
        comparisonMethod: 'aligned-waveform-v1',
        rmsDeltaDb: 0,
        peakDeltaDb: 0,
      }),
    ]));
    expect(evidence.windows[0]?.similarity).toBeGreaterThan(0.985);
  });

  it('fails continuity proof when PCM changes across the split seam', async () => {
    const evidence = await buildChatEditRenderedAudioEvidence(
      afterProject(),
      beforeProject(),
      {
        ...videoMutationAudioRequest(),
        expectedEffect: 'continuity-preserved',
      },
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'present',
          audioTrackCount: 1,
          reason: null,
        }),
        renderAudioWindow: async (input) => {
          const overlays = Array.isArray(input.inputProps.overlays) ? input.inputProps.overlays : [];
          const isAfter = overlays.some((overlay: any) => overlay.id === 'sound_after');
          return {
            url: `https://example.com/${isAfter ? 'after' : 'before'}.wav`,
            renderId: isAfter ? 'after-render' : 'before-render',
            bucketName: 'render-bucket',
            pcmSha256: isAfter ? 'after-pcm' : 'before-pcm',
            rms: isAfter ? 0.4 : 0.2,
            peak: isAfter ? 0.8 : 0.5,
          };
        },
      },
    );

    expect(evidence.status).toBe('fail');
    expect(evidence.reason).toBe('rendered_audio_changed_across_continuity_preserving_edit');
  });

  it('skips an impossible audio render when both timeline states are proven audio-less', async () => {
    const renderAudioWindow = vi.fn();
    const evidence = await buildChatEditRenderedAudioEvidence(
      projectWithOverlays([]),
      projectWithOverlays([]),
      videoMutationAudioRequest(),
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'absent',
          audioTrackCount: 0,
          reason: null,
        }),
        renderAudioWindow,
      },
    );

    expect(evidence.status).toBe('pass');
    expect(evidence.reason).toBe('no_audio_stream_in_requested_windows');
    expect(evidence.windows).toEqual([]);
    expect(evidence.skippedWindows).toEqual([
      expect.objectContaining({
        beforeStatus: 'absent',
        afterStatus: 'absent',
        reason: 'no_audio_stream_in_requested_window',
      }),
    ]);
    expect(renderAudioWindow).not.toHaveBeenCalled();
  });

  it('fails fast when media-track truth cannot be established', async () => {
    const renderAudioWindow = vi.fn();
    const evidence = await buildChatEditRenderedAudioEvidence(
      projectWithOverlays([]),
      projectWithOverlays([]),
      videoMutationAudioRequest(),
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'unknown',
          audioTrackCount: null,
          reason: 'media_audio_track_inspection_timeout',
        }),
        renderAudioWindow,
      },
    );

    expect(evidence.status).toBe('missing');
    expect(evidence.reason).toContain('audio_stream_presence_unknown');
    expect(renderAudioWindow).not.toHaveBeenCalled();
  });

  it('fails when an explicit audio edit produces no audio-bearing output', async () => {
    const renderAudioWindow = vi.fn();
    const evidence = await buildChatEditRenderedAudioEvidence(
      projectWithOverlays([]),
      projectWithOverlays([]),
      audioRequest(),
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'absent',
          audioTrackCount: 0,
          reason: null,
        }),
        renderAudioWindow,
      },
    );

    expect(evidence.status).toBe('fail');
    expect(evidence.reason).toBe('expected_audio_stream_missing_in_requested_windows');
    expect(renderAudioWindow).not.toHaveBeenCalled();
  });

  it('renders only the audio-bearing side when an edit adds audio to silent footage', async () => {
    const renderAudioWindow = vi.fn(async (_input: any) => ({
      url: 'https://example.com/after.wav',
      renderId: 'after-render',
      bucketName: 'render-bucket',
      pcmSha256: 'after-pcm',
      rms: 0.4,
      peak: 0.8,
    }));
    const evidence = await buildChatEditRenderedAudioEvidence(
      afterProject(),
      beforeProject(),
      audioRequest(),
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack: async () => ({
          status: 'absent',
          audioTrackCount: 0,
          reason: null,
        }),
        renderAudioWindow,
      },
    );

    expect(evidence.status, evidence.reason ?? 'no reason').toBe('pass');
    expect(renderAudioWindow).toHaveBeenCalledTimes(1);
    expect(renderAudioWindow.mock.calls[0]?.[0].inputProps.overlays).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'sound_after' })]),
    );
    expect(evidence.windows[0]).toMatchObject({
      beforeUrl: null,
      afterUrl: 'https://example.com/after.wav',
      beforeRms: 0,
      afterRms: 0.4,
      changed: true,
    });
  });

  it('treats muted media as audio-less without probing its container', async () => {
    const inspectAudioTrack = vi.fn();
    const mutedProject = projectWithOverlays([]) as ReturnType<typeof projectWithOverlays>;
    mutedProject.overlays[0] = {
      ...mutedProject.overlays[0],
      styles: { volume: 0 },
    };
    const evidence = await buildChatEditRenderedAudioEvidence(
      mutedProject,
      structuredClone(mutedProject),
      videoMutationAudioRequest(),
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        inspectAudioTrack,
        renderAudioWindow: vi.fn(),
      },
    );

    expect(evidence.status).toBe('pass');
    expect(evidence.reason).toBe('no_audio_stream_in_requested_windows');
    expect(inspectAudioTrack).not.toHaveBeenCalled();
  });

  it('bounds long audio targets into distributed verification windows', () => {
    expect(buildChatEditAudioVerificationWindows({
      targets: [{ overlayId: 'sound_1', overlayType: 'sound', state: 'updated', from: 0, endFrame: 900 }],
      durationInFrames: 900,
      fps: 30,
      sampleLimit: 12,
    })).toEqual([
      { startFrame: 0, endFrame: 180 },
      { startFrame: 360, endFrame: 540 },
      { startFrame: 720, endFrame: 900 },
    ]);
  });

  it('never reports model success before the rendered job proves it', () => {
    expect(buildChatEditRenderVerificationStatusMessage({ dispatched: true }))
      .toContain('not marking it successful until that verification finishes');
    expect(buildChatEditRenderVerificationStatusMessage({ dispatched: false, reason: 'missing worker' }))
      .toContain('not marking this edit as successful');
  });

  it('preserves bounded long provider diagnostics instead of replacing them with a generic error', () => {
    const providerError = `Lambda audio render failed:\n${'provider-trace '.repeat(80)}`;
    const issue = buildChatEditRenderIssue(
      'audio',
      'audio_window_render_error',
      providerError,
      { startFrame: 30, endFrame: 120 },
    );

    expect(issue).toMatchObject({
      modality: 'audio',
      code: 'audio_window_render_error',
      startFrame: 30,
      endFrame: 120,
    });
    expect(String(issue.message)).toContain('Lambda audio render failed: provider-trace');
    expect(String(issue.message)).toHaveLength(500);
    expect(String(issue.message).endsWith('...')).toBe(true);
    expect(issue.message).not.toBe('Rendered verification failed.');
  });
});

function buildRequest(input: {
  name: string;
  args: Record<string, unknown>;
  target: ChatEditRenderVerificationRequest['targets'][number];
  modalities: ChatEditRenderVerificationRequest['modalities'];
  projectDurationInFrames?: number;
  affectedFrameRange?: { startFrame: number; endFrame: number };
}) {
  return buildChatEditRenderVerificationRequest({
    transaction: {
      operationId: 'op_render_verify_1',
      sessionId: 'sess_render_verify_1',
      projectId: 'proj_render_verify_1',
      userId: 'user_render_verify_1',
      beforeCheckpointId: 'ckpt_before_render_verify_1',
    },
    afterCheckpointId: 'ckpt_after_render_verify_1',
    project: { durationInFrames: input.projectDurationInFrames ?? 300 },
    requestedAt: '2026-07-17T00:00:00.000Z',
    successfulCalls: [{
      call: { id: 'call_1', name: input.name, args: input.args },
      result: {
        toolCallId: 'call_1',
        toolName: input.name,
        result: JSON.stringify({
          status: 'success',
          data: {
            ...(input.affectedFrameRange ? { affectedFrameRange: input.affectedFrameRange } : {}),
            postconditionVerification: {
              version: 'editron-chat-postcondition-v1',
              status: 'pass',
              affectedTargets: [input.target],
              renderVerification: { modalities: input.modalities },
            },
          },
        }),
      },
    }],
  });
}

function audioRequest(): ChatEditRenderVerificationRequest {
  return {
    version: 'editron-chat-render-verification-v1',
    operationId: 'op_audio_verify_1',
    sessionId: 'sess_audio_verify_1',
    beforeCheckpointId: 'ckpt_before_audio_verify_1',
    afterCheckpointId: 'ckpt_after_audio_verify_1',
    requestedAt: '2026-07-17T00:00:00.000Z',
    modalities: ['audio'],
    targets: [{ overlayId: 'sound_after', overlayType: 'sound', state: 'created', from: 30, endFrame: 120 }],
    sampleFrames: [30, 75, 119],
  };
}

function videoMutationAudioRequest(): ChatEditRenderVerificationRequest {
  return {
    ...audioRequest(),
    operationId: 'op_video_audio_verify_1',
    targets: [{
      overlayId: 'video_1',
      overlayType: 'video',
      state: 'updated',
      from: 0,
      endFrame: 300,
    }],
    mutationRanges: [{
      startFrame: 150,
      endFrame: 151,
      toolName: 'cut_section',
    }],
    sampleFrames: [149, 150, 151],
  };
}

function configuredEnv() {
  return {
    REMOTION_LAMBDA_FUNCTION_NAME: 'phase0-fn',
    REMOTION_LAMBDA_SERVE_URL: 'https://remotion-site.example.com',
    REMOTION_AWS_REGION: 'us-east-1',
    EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES: '12',
  };
}

function beforeProject() {
  return projectWithOverlays([]);
}

function afterProject() {
  return projectWithOverlays([
    {
      id: 'txt_after',
      type: OverlayType.TEXT,
      from: 30,
      durationInFrames: 60,
      left: 60,
      top: 60,
      width: 200,
      height: 60,
      content: 'Verified copy',
      styles: { fontSize: '32px', color: '#ffffff' },
    },
    {
      id: 'sound_after',
      type: OverlayType.SOUND,
      from: 30,
      durationInFrames: 90,
      assetId: 'sound_after_asset',
      src: 'https://example.com/sound.mp3',
      volume: 1,
      audioRights: {
        mediaRole: 'sfx',
        source: 'generated',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'generated-provider',
          sourceAssetId: 'sound_after_asset',
          licenseId: 'chat-render-verification:test-provider',
        },
      },
    },
  ]);
}

function projectWithOverlays(extraOverlays: Record<string, unknown>[]) {
  return {
    projectId: 'proj_render_verify_1',
    durationInFrames: 300,
    fps: 30,
    playerDimensions: { width: 320, height: 180 },
    overlays: [
      {
        id: 'video_1',
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 300,
        left: 0,
        top: 0,
        width: 320,
        height: 180,
        src: 'https://example.com/video.mp4',
      },
      ...extraOverlays,
    ],
  };
}

function renderedImage(changed: boolean): RawRenderedStillImage {
  const width = 320;
  const height = 180;
  const channels = 4;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const highlighted = changed && x >= 60 && x < 260 && y >= 60 && y < 120;
      data[offset] = highlighted ? 240 : 12;
      data[offset + 1] = highlighted ? 240 : 12;
      data[offset + 2] = highlighted ? 240 : 12;
      data[offset + 3] = 255;
    }
  }
  return { width, height, channels, data };
}

function renderedImageWithTinyDelta(changed: boolean): RawRenderedStillImage {
  const width = 320;
  const height = 180;
  const channels = 4;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const base = (x + y) % 2 === 0 ? 0 : 20;
      const value = changed && x === 100 && y === 80 ? 255 : base;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, channels, data };
}

function stillResult(kind: string, frame: number) {
  return {
    estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
    url: `https://example.com/${kind}-f${frame}.png`,
    outKey: `chat/${kind}-f${frame}.png`,
    bucketName: 'render-bucket',
    renderId: `${kind}-${frame}`,
    cloudWatchLogs: 'https://logs.example.com',
    sizeInBytes: 512,
    artifacts: [],
  };
}
