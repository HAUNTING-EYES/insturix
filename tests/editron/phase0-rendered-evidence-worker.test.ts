import { describe, expect, it, vi } from 'vitest';

import {
  buildPhase0RenderedStillEvidenceFailure,
  buildPhase0RenderedStillEvidence,
  resolvePhase0RenderedEvidenceConfig,
} from '../../lib/editron/services/phase0-rendered-evidence-worker';
import type { RawRenderedStillImage } from '../../lib/editron/services/phase0-rendered-aesthetic-scoring';
import { OverlayType } from '../../components/editron/editor/version-7.0.0/types';

describe('phase0 rendered evidence worker service', () => {
  it('skips honestly when Remotion Lambda configuration is missing', async () => {
    const evidence = await buildPhase0RenderedStillEvidence(projectFixture(), {
      capturedAt: '2026-06-30T00:00:00.000Z',
      env: {},
    });

    expect(evidence.status).toBe('skipped');
    expect(evidence.functionName).toBeNull();
    expect(evidence.renderedFrames).toHaveLength(0);
    expect(evidence.requestedSampleFrames.length).toBeGreaterThan(0);
  });

  it('renders paired full and baseline sampled stills with the configured Lambda render stack', async () => {
    const renderStill = vi.fn(async (input: any) => {
      const overlayIds = (input.inputProps.overlays ?? []).map((overlay: any) => overlay.id);
      const kind = overlayIds.includes(1) ? 'full' : 'baseline';
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${kind}-f${input.frame}.png`,
        outKey: `phase0/${kind}-f${input.frame}.png`,
        bucketName: 'remotion-bucket',
        renderId: `${kind}-render-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: kind === 'full' ? 1234 : 678,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(projectFixture(), {
      capturedAt: '2026-06-30T00:00:00.000Z',
      env: configuredEnv({ EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES: '2' }),
      renderStill: renderStill as any,
      readImage: visibleImageReader(),
      prepareCredentials: async () => {},
    });

    expect(evidence.status).toBe('completed');
    expect(evidence.sampleLimit).toBe(2);
    expect(evidence.renderedFrames).toHaveLength(2);
    expect(renderStill).toHaveBeenCalledTimes(4);
    expect(renderStill.mock.calls[0]?.[0]).toMatchObject({
      functionName: 'phase0-fn',
      serveUrl: 'https://remotion-site.example.com',
      imageFormat: 'png',
      privacy: 'public',
      maxRetries: 1,
    });
    expect((renderStill.mock.calls[0]?.[0] as any).inputProps.isRendering).toBe(true);
    expect((renderStill.mock.calls[0]?.[0] as any).inputProps.overlays.map((overlay: any) => overlay.id)).toEqual(['bg', 1]);
    expect((renderStill.mock.calls[1]?.[0] as any).inputProps.overlays.map((overlay: any) => overlay.id)).toEqual(['bg']);
    expect(evidence.renderedFrames[0]).toMatchObject({
      url: expect.stringContaining('/full-f'),
      baselineUrl: expect.stringContaining('/baseline-f'),
      baselineSizeInBytes: 678,
    });
    expect(evidence.renderedQualityEvidence).toMatchObject({
      qualityEvidenceSource: 'rendered-aesthetic',
      renderedAestheticSampledFrames: 2,
    });
    expect(evidence.renderedAestheticReport?.frames?.[0]).toMatchObject({
      fullStill: expect.stringContaining('/full-f'),
      baselineStill: expect.stringContaining('/baseline-f'),
    });
  });

  it('fails rendered quality evidence when full and baseline stills are visually unchanged', async () => {
    const renderStill = vi.fn(async (input: any) => {
      const overlayIds = (input.inputProps.overlays ?? []).map((overlay: any) => overlay.id);
      const kind = overlayIds.includes(1) ? 'full' : 'baseline';
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${kind}-unchanged-f${input.frame}.png`,
        outKey: `phase0/${kind}-unchanged-f${input.frame}.png`,
        bucketName: 'remotion-bucket',
        renderId: `${kind}-unchanged-render-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(projectFixture(), {
      capturedAt: '2026-06-30T00:00:00.000Z',
      env: configuredEnv({ EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES: '1' }),
      renderStill: renderStill as any,
      readImage: unchangedImageReader(),
      prepareCredentials: async () => {},
    });

    expect(evidence.status).toBe('completed');
    expect(evidence.renderedQualityEvidence).toMatchObject({
      qualityEvidenceSource: 'rendered-aesthetic',
      renderedAestheticStatus: 'fail',
      renderedAestheticFailFrameCount: 1,
      renderedAestheticSampledFrames: 1,
    });
    expect(evidence.renderedAestheticReport?.frames?.[0]?.report?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'render', severity: 'fail' }),
      ]),
    );
  });

  it('persists partial evidence instead of losing successful full frames when a baseline still fails', async () => {
    const renderStill = vi.fn(async (input: any) => {
      const overlayIds = (input.inputProps.overlays ?? []).map((overlay: any) => overlay.id);
      const kind = overlayIds.includes(1) ? 'full' : 'baseline';
      if (kind === 'baseline' && renderStill.mock.calls.length === 2) {
        throw new Error('lambda baseline still failed');
      }
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${kind}-f${input.frame}.png`,
        outKey: `phase0/${kind}-f${input.frame}.png`,
        bucketName: 'remotion-bucket',
        renderId: `${kind}-render-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 1234,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(projectFixture(), {
      capturedAt: '2026-06-30T00:00:00.000Z',
      env: configuredEnv({ EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES: '3' }),
      renderStill: renderStill as any,
      readImage: visibleImageReader(),
      prepareCredentials: async () => {},
    });

    expect(evidence.status).toBe('partial');
    expect(evidence.renderedFrames).toHaveLength(3);
    expect(evidence.renderedFrames[0]?.baselineUrl).toBeUndefined();
    expect(evidence.renderedFrames.slice(1).every((frame) => frame.baselineUrl)).toBe(true);
    expect(evidence.failedFrames).toEqual([
      expect.objectContaining({ renderKind: 'baseline', error: 'lambda baseline still failed' }),
    ]);
    expect(evidence.renderedQualityEvidence?.qualityEvidenceSource).toBe('rendered-aesthetic');
  });

  it('resolves disabled and sample-limit configuration deterministically', () => {
    expect(resolvePhase0RenderedEvidenceConfig(configuredEnv({
      EDITRON_PHASE0_RENDERED_EVIDENCE_AUTO: 'false',
      EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES: '99',
    }))).toMatchObject({
      configured: false,
      reason: 'disabled',
      sampleLimit: 24,
    });
  });

  it('builds a failed evidence breadcrumb for worker-level errors', () => {
    const evidence = buildPhase0RenderedStillEvidenceFailure({
      projectId: 'proj_failed',
      capturedAt: '2026-06-30T00:00:00.000Z',
      error: 'asset resolution failed',
      env: configuredEnv(),
    });

    expect(evidence.status).toBe('failed');
    expect(evidence.artifactPackStatus).toBe('not-renderable');
    expect(evidence.failedFrames).toEqual([{ frame: -1, renderKind: 'worker', error: 'asset resolution failed' }]);
    expect(evidence.artifactPackIssues).toEqual(['worker-error:asset resolution failed']);
  });
});

function configuredEnv(extra: Record<string, string> = {}) {
  return {
    REMOTION_LAMBDA_FUNCTION_NAME: 'phase0-fn',
    REMOTION_LAMBDA_SERVE_URL: 'https://remotion-site.example.com',
    REMOTION_AWS_REGION: 'us-east-1',
    ...extra,
  };
}

function visibleImageReader() {
  return async (url: string) => url.includes('/full-')
    ? rawRenderedImage('visible')
    : rawRenderedImage('baseline');
}

function unchangedImageReader() {
  return async () => rawRenderedImage('baseline');
}

function rawRenderedImage(kind: 'baseline' | 'visible'): RawRenderedStillImage {
  const width = 320;
  const height = 180;
  const channels = 4;
  const data = Buffer.alloc(width * height * channels);

  for (let offset = 0; offset < data.length; offset += channels) {
    data[offset] = 12;
    data[offset + 1] = 12;
    data[offset + 2] = 12;
    data[offset + 3] = 255;
  }

  if (kind === 'visible') {
    for (let y = 40; y < 92; y += 1) {
      for (let x = 40; x < 220; x += 1) {
        const offset = ((y * width) + x) * channels;
        data[offset] = 246;
        data[offset + 1] = 246;
        data[offset + 2] = 246;
        data[offset + 3] = 255;
      }
    }
  }

  return { data, width, height, channels };
}

function projectFixture() {
  return {
    projectId: 'proj_phase0_lambda',
    durationInFrames: 120,
    fps: 30,
    playerDimensions: { width: 320, height: 180 },
    overlays: [
      {
        id: 'bg',
        type: OverlayType.IMAGE,
        from: 0,
        durationInFrames: 120,
        left: 0,
        top: 0,
        width: 320,
        height: 180,
        src: 'https://example.com/background.png',
        styles: {},
      },
      {
        id: 'video-source',
        type: OverlayType.VIDEO,
        from: 0,
        durationInFrames: 120,
        left: 0,
        top: 0,
        width: 320,
        height: 180,
        src: 'https://example.com/video.mp4',
      },
      {
        id: 1,
        type: OverlayType.TEXT,
        from: 10,
        durationInFrames: 60,
        row: 5,
        left: 40,
        top: 40,
        width: 180,
        height: 52,
        rotation: 0,
        isDragging: false,
        content: 'Phase 0 truth',
        styles: {
          fontSize: '32px',
          fontWeight: '800',
          color: '#ffffff',
          backgroundColor: '#111111',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          textDecoration: 'none',
        },
      },
    ],
  } as any;
}
