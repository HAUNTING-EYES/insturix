import { describe, expect, it, vi } from 'vitest';

import {
  buildPhase0RenderedStillEvidenceFailure,
  buildPhase0RenderedStillEvidence,
  resolvePhase0RenderedEvidenceConfig,
} from '../../lib/editron/services/phase0-rendered-evidence-worker';
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

  it('renders sampled stills with the configured Lambda render stack', async () => {
    const renderStill = vi.fn(async (input: any) => ({
      estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
      url: `https://example.com/f${input.frame}.png`,
      outKey: `phase0/f${input.frame}.png`,
      bucketName: 'remotion-bucket',
      renderId: `render-${input.frame}`,
      cloudWatchLogs: 'https://logs.example.com',
      sizeInBytes: 1234,
      artifacts: [],
    }));

    const evidence = await buildPhase0RenderedStillEvidence(projectFixture(), {
      capturedAt: '2026-06-30T00:00:00.000Z',
      env: configuredEnv({ EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES: '2' }),
      renderStill: renderStill as any,
      prepareCredentials: async () => {},
    });

    expect(evidence.status).toBe('completed');
    expect(evidence.sampleLimit).toBe(2);
    expect(evidence.renderedFrames).toHaveLength(2);
    expect(renderStill).toHaveBeenCalledTimes(2);
    expect(renderStill.mock.calls[0]?.[0]).toMatchObject({
      functionName: 'phase0-fn',
      serveUrl: 'https://remotion-site.example.com',
      imageFormat: 'png',
      privacy: 'public',
      maxRetries: 1,
    });
    expect((renderStill.mock.calls[0]?.[0] as any).inputProps.isRendering).toBe(true);
  });

  it('persists partial evidence instead of losing successful frames', async () => {
    const renderStill = vi.fn(async (input: any) => {
      if (renderStill.mock.calls.length === 2) {
        throw new Error('lambda still failed');
      }
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/f${input.frame}.png`,
        outKey: `phase0/f${input.frame}.png`,
        bucketName: 'remotion-bucket',
        renderId: `render-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 1234,
        artifacts: [],
      };
    });

    const evidence = await buildPhase0RenderedStillEvidence(projectFixture(), {
      capturedAt: '2026-06-30T00:00:00.000Z',
      env: configuredEnv({ EDITRON_PHASE0_RENDERED_EVIDENCE_MAX_SAMPLES: '3' }),
      renderStill: renderStill as any,
      prepareCredentials: async () => {},
    });

    expect(evidence.status).toBe('partial');
    expect(evidence.renderedFrames).toHaveLength(2);
    expect(evidence.failedFrames).toEqual([
      expect.objectContaining({ error: 'lambda still failed' }),
    ]);
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
    expect(evidence.failedFrames).toEqual([{ frame: -1, error: 'asset resolution failed' }]);
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

function projectFixture() {
  return {
    projectId: 'proj_phase0_lambda',
    durationInFrames: 120,
    fps: 30,
    playerDimensions: { width: 1080, height: 1920 },
    overlays: [
      {
        id: 1,
        type: OverlayType.TEXT,
        from: 10,
        durationInFrames: 60,
        row: 5,
        left: 80,
        top: 120,
        width: 700,
        height: 160,
        rotation: 0,
        isDragging: false,
        content: 'Phase 0 truth',
        styles: {
          fontSize: '64px',
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
