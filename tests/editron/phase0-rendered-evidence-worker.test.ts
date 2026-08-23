import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  buildChatEditRenderedAudioEvidence,
  buildPhase0RenderedStillEvidenceFailure,
  buildPhase0RenderedStillEvidence,
  dispatchPhase0RenderedEvidenceJob,
  resolvePhase0RenderedEvidenceConfig,
  toProjectPhase0RenderedEvidenceFacts,
} from '../../lib/editron/services/phase0-rendered-evidence-worker';
import {
  buildPhase0RenderedAestheticEvidence,
  measureRenderedOverlayPixelEvidence,
  type RawRenderedStillImage,
} from '../../lib/editron/services/phase0-rendered-aesthetic-scoring';
import { buildPhase0FixtureManifest } from '../../lib/editron/services/phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from '../../lib/editron/services/phase0-render-artifact-pack';
import { OverlayType } from '../../components/editron/editor/version-7.0.0/types';

describe('phase0 rendered evidence worker service', () => {
  it('skips honestly when Remotion Lambda configuration is missing', async () => {
    const evidence = await buildPhase0RenderedStillEvidence(projectFixture(), {
      capturedAt: '2026-06-30T00:00:00.000Z',
      env: {},
    });

    expect(evidence.status).toBe('skipped');
    expect(evidence.statusReason).toBe('missing_remotion_lambda_function_name');
    expect(evidence.functionName).toBeNull();
    expect(evidence.renderedFrames).toHaveLength(0);
    expect(evidence.requestedSampleFrames.length).toBeGreaterThan(0);

    const facts = toProjectPhase0RenderedEvidenceFacts(evidence);
    expect(facts.renderedQualityEvidence).toMatchObject({
      qualityEvidenceSource: 'metadata-only',
      renderedAestheticStatus: 'missing',
      renderedAestheticArtifactAccess: 'missing',
      renderedAestheticArtifactNote: expect.stringContaining('missing_remotion_lambda_function_name'),
    });
    expect(facts.fixtureArtifact.renderedStillEvidenceReason).toBe('missing_remotion_lambda_function_name');
    expect(facts.renderedQualityGate).toMatchObject({
      status: 'missing_rendered_evidence',
      reason: 'missing_rendered_evidence',
      qualityEvidenceSource: 'metadata-only',
    });
    expect(facts.reviewDisposition).toBeUndefined();
  });

  it('blocks unlicensed music before credentials or the Phase-0 audio renderer', async () => {
    const prepareCredentials = vi.fn(async () => {});
    const renderAudioWindow = vi.fn();
    const project = audioEvidenceProject({
      source: 'preview-only',
      userChoice: 'attested',
      licensed: false,
      mediaRole: 'music',
    });

    await expect(buildChatEditRenderedAudioEvidence(
      project,
      structuredClone(project),
      audioVerificationRequest(),
      {
        env: configuredEnv(),
        prepareCredentials,
        renderAudioWindow,
      },
    )).rejects.toThrow(
      'Cannot verify render audio rights for overlay music_1: preview-only audio is not licensed for rendering',
    );

    expect(prepareCredentials).not.toHaveBeenCalled();
    expect(renderAudioWindow).not.toHaveBeenCalled();
  });

  it('strips an explicit no-music decision before Phase-0 audio rendering', async () => {
    let renderCount = 0;
    const renderAudioWindow = vi.fn(async (_input: any) => {
      renderCount += 1;
      return {
        url: `https://example.com/audio-${renderCount}.wav`,
        renderId: `audio-render-${renderCount}`,
        bucketName: 'render-bucket',
        pcmSha256: `pcm-${renderCount}`,
        rms: 0,
        peak: 0,
      };
    });
    const project = audioEvidenceProject({
      source: 'preview-only',
      userChoice: 'no-music',
      licensed: false,
      mediaRole: 'music',
    });

    await buildChatEditRenderedAudioEvidence(
      project,
      structuredClone(project),
      audioVerificationRequest(),
      {
        env: configuredEnv(),
        prepareCredentials: async () => {},
        renderAudioWindow,
      },
    );

    expect(renderAudioWindow).toHaveBeenCalledTimes(2);
    for (const [input] of renderAudioWindow.mock.calls) {
      expect(input.inputProps.overlays).toEqual([]);
      expect(input.inputProps.audioRightsNotices).toEqual([
        expect.objectContaining({
          code: 'PREVIEW_AUDIO_REMOVED_NO_MUSIC',
          action: 'stripped',
        }),
      ]);
    }
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
      maxRetries: 0,
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
      renderedAestheticArtifactAccess: 'worker-local',
    });
    expect(evidence.renderedAestheticReport?.frames?.[0]).toMatchObject({
      fullStill: expect.stringContaining('/full-f'),
      baselineStill: expect.stringContaining('/baseline-f'),
    });
    expect(evidence.phase0LiveTruth).toMatchObject({
      source: 'phase0-rendered-evidence-worker',
      renderArtifacts: { status: 'rendered' },
      qualityEvidence: {
        qualityEvidenceSource: 'rendered-aesthetic',
        renderedAestheticArtifactAccess: 'worker-local',
      },
    });
    expect(evidence.phase0LiveTruth?.failureClasses.map((item) => item.id)).not.toContain('render.artifact_pack_missing');
  });

  it('renders independent frame pairs concurrently with a bounded worker count', async () => {
    let activeRenders = 0;
    let maximumActiveRenders = 0;
    const renderStill = vi.fn(async (input: any) => {
      activeRenders += 1;
      maximumActiveRenders = Math.max(maximumActiveRenders, activeRenders);
      await new Promise((resolve) => setTimeout(resolve, 15));
      activeRenders -= 1;
      const overlayIds = (input.inputProps.overlays ?? []).map((overlay: any) => overlay.id);
      const kind = overlayIds.includes(1) ? 'full' : 'baseline';
      return {
        estimatedPrice: { currency: 'USD', estimatedCost: 0.001 },
        url: `https://example.com/${kind}-f${input.frame}.png`,
        outKey: `phase0/${kind}-f${input.frame}.png`,
        bucketName: 'remotion-bucket',
        renderId: `${kind}-render-${input.frame}`,
        cloudWatchLogs: 'https://logs.example.com',
        sizeInBytes: 512,
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

    expect(evidence.status).toBe('completed');
    expect(renderStill).toHaveBeenCalledTimes(6);
    expect(maximumActiveRenders).toBe(6);
    expect(evidence.renderedFrames.map((frame) => frame.frame)).toEqual(evidence.requestedSampleFrames);
  });

  it('measures text contrast against each changed pixel local background', () => {
    const baseline = rawRenderedImageFromLumas([210, 210, 210, 210, 20, 20, 20, 20, 20, 20]);
    const full = rawRenderedImageFromLumas([255, 255, 255, 255, 255, 255, 255, 255, 255, 255]);

    const mixedEvidence = measureRenderedOverlayPixelEvidence(
      full,
      baseline,
      { x: 0, y: 0, width: 10, height: 1 },
      10,
      1,
    );

    expect(mixedEvidence.contrastRatio).toBeGreaterThan(3);
    expect(mixedEvidence.localBackgroundLuma).toBeLessThan(100);
    expect(mixedEvidence.foregroundLuma).toBe(255);

    const brightBaseline = rawRenderedImageFromLumas(Array.from({ length: 10 }, () => 210));
    const brightEvidence = measureRenderedOverlayPixelEvidence(
      full,
      brightBaseline,
      { x: 0, y: 0, width: 10, height: 1 },
      10,
      1,
    );

    expect(brightEvidence.contrastRatio).toBeLessThan(3);
  });

  it('measures outlined text from supported glyph and halo layers without blessing bright-on-bright text', () => {
    const baseline = rawRenderedImageFromLumas(Array.from({ length: 30 }, () => 210));
    const outlinedText = rawRenderedImageFromLumas([
      ...Array.from({ length: 5 }, () => 255),
      ...Array.from({ length: 5 }, () => 20),
      ...Array.from({ length: 10 }, () => 225),
      ...Array.from({ length: 10 }, () => 195),
    ]);

    const outlinedEvidence = measureRenderedOverlayPixelEvidence(
      outlinedText,
      baseline,
      { x: 0, y: 0, width: 30, height: 1 },
      30,
      1,
      { allowLayeredForegroundContrast: true },
    );

    expect(outlinedEvidence.contrastRatio).toBeGreaterThan(3);

    const brightOnly = rawRenderedImageFromLumas(Array.from({ length: 30 }, (_, index) => (
      index < 5 ? 255 : 225
    )));
    const brightOnlyEvidence = measureRenderedOverlayPixelEvidence(
      brightOnly,
      baseline,
      { x: 0, y: 0, width: 30, height: 1 },
      30,
      1,
      { allowLayeredForegroundContrast: true },
    );

    expect(brightOnlyEvidence.contrastRatio).toBeLessThan(3);
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
      renderedAestheticArtifactAccess: 'worker-local',
    });
    expect(evidence.renderedAestheticReport?.frames?.[0]?.report?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'render', severity: 'fail' }),
      ]),
    );

    const facts = toProjectPhase0RenderedEvidenceFacts(evidence);
    expect(facts.renderedQualityGate).toMatchObject({
      status: 'needs_review',
      reason: 'rendered_quality_failed',
      qualityEvidenceSource: 'rendered-aesthetic',
    });
    expect(facts.reviewDisposition).toMatchObject({
      autoEditStatus: 'needs_review',
      projectStatus: 'needs-attention',
      autoEditHealth: 'needs_review',
    });
    expect(String(facts.reviewDisposition?.autoEditWarning)).toContain('Rendered Phase 0 quality failed');
    expect(facts.liveTruth).toMatchObject({
      source: 'phase0-rendered-evidence-worker',
      renderArtifacts: { renderedSummary: { status: 'fail' } },
      qualityEvidence: { renderedAestheticStatus: 'fail' },
    });
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
    expect(evidence.statusReason).toBe('rendered_still_partial');
    expect(evidence.renderedFrames).toHaveLength(3);
    expect(evidence.renderedFrames[0]?.baselineUrl).toBeUndefined();
    expect(evidence.renderedFrames.slice(1).every((frame) => frame.baselineUrl)).toBe(true);
    expect(evidence.failedFrames).toEqual([
      expect.objectContaining({ renderKind: 'baseline', error: 'lambda baseline still failed' }),
    ]);
    expect(evidence.renderedQualityEvidence?.qualityEvidenceSource).toBe('rendered-aesthetic');
    expect(toProjectPhase0RenderedEvidenceFacts(evidence).fixtureArtifact.renderedStillEvidenceReason).toBe('rendered_still_partial');
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
    expect(evidence.statusReason).toBe('worker_error');
    expect(evidence.artifactPackStatus).toBe('not-renderable');
    expect(evidence.failedFrames).toEqual([{ frame: -1, renderKind: 'worker', error: 'asset resolution failed' }]);
    expect(evidence.artifactPackIssues).toEqual(['worker-error:asset resolution failed']);

    const facts = toProjectPhase0RenderedEvidenceFacts(evidence);
    expect(facts.fixtureArtifact.renderedStillEvidenceReason).toBe('worker_error');
    expect(facts.renderedQualityEvidence).toMatchObject({
      renderedAestheticArtifactNote: expect.stringContaining('worker_error'),
    });
  });

  it('scores caption evidence from the visible phrase window instead of the full caption group', async () => {
    const project = {
      projectId: 'proj_phase0_caption_window',
      durationInFrames: 120,
      fps: 30,
      playerDimensions: { width: 320, height: 180 },
      overlays: [{
        id: 'caption-track',
        type: OverlayType.CAPTION,
        from: 0,
        durationInFrames: 120,
        left: 40,
        top: 40,
        width: 180,
        height: 52,
        row: 6,
        content: 'So if you wanna see how I edit video, if that might help you, you can watch that.',
        text: 'So if you wanna see how I edit video, if that might help you, you can watch that.',
        displayConfig: {
          mode: 'phrase',
          wordsPerGroup: 1,
          maxWordsPerLine: 4,
          showPreviousWords: false,
          fadeOutPreviousWords: false,
        },
        styles: {
          fontSize: '38px',
          fontWeight: 500,
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.6)',
          fontFamily: 'Inter',
        },
        captions: [{
          text: 'So if you wanna see how I edit video, if that might help you, you can watch that.',
          startMs: 0,
          endMs: 4000,
          words: [
            { word: 'So', startMs: 0, endMs: 180 },
            { word: 'if', startMs: 220, endMs: 420 },
            { word: 'you', startMs: 460, endMs: 620 },
            { word: 'wanna', startMs: 660, endMs: 880 },
            { word: 'see', startMs: 920, endMs: 1100 },
            { word: 'how', startMs: 1140, endMs: 1300 },
            { word: 'I', startMs: 1340, endMs: 1420 },
            { word: 'edit', startMs: 1460, endMs: 1660 },
            { word: 'video,', startMs: 1700, endMs: 1940 },
            { word: 'if', startMs: 1980, endMs: 2140 },
            { word: 'that', startMs: 2180, endMs: 2340 },
            { word: 'might', startMs: 2380, endMs: 2580 },
            { word: 'help', startMs: 2620, endMs: 2820 },
            { word: 'you,', startMs: 2860, endMs: 3060 },
            { word: 'you', startMs: 3100, endMs: 3260 },
            { word: 'can', startMs: 3300, endMs: 3460 },
            { word: 'watch', startMs: 3500, endMs: 3720 },
            { word: 'that.', startMs: 3760, endMs: 4000 },
          ],
        }],
      }],
    } as any;
    const manifest = buildPhase0FixtureManifest(project);
    const artifactPack = buildPhase0RenderArtifactPack(project, manifest, {
      artifactDir: 'tmp/phase0-caption-window-test',
      maxSamples: 1,
    });
    const result = await buildPhase0RenderedAestheticEvidence(manifest, artifactPack, {
      renderedFrames: [{ frame: 8, url: 'https://example.com/full-caption.png', baselineUrl: 'https://example.com/baseline-caption.png' }],
    }, {
      readImage: visibleImageReader(),
    });

    const issues = result?.report.frames?.[0]?.report?.issues ?? [];
    expect(issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'long caption is compressed into one row' }),
      expect.objectContaining({ message: 'caption row is too wide for social-video reading' }),
    ]));
  });

  it('keeps rendered aesthetic scoring safe for Next server route builds', () => {
    const source = readFileSync('lib/editron/services/phase0-rendered-aesthetic-scoring.ts', 'utf8');

    expect(source).not.toContain('keyframe-evaluator');
    expect(source).not.toContain("from 'remotion'");
    expect(source).not.toContain('from "remotion"');
    expect(source).toContain('evaluateScoringKeyframeTracks');
  });

  it('surfaces worker status reasons in the Phase 0 rendered evidence route boundary', () => {
    const source = readFileSync('app/api/internal/workers/phase0-rendered-evidence/route.ts', 'utf8');

    expect(source).toContain('reason=${evidence.statusReason ??');
    expect(source).toContain('statusReason: evidence.statusReason');
  });

  it('preserves exact chat mutation ranges through the rendered-evidence worker trust boundary', () => {
    const source = readFileSync('app/api/internal/workers/phase0-rendered-evidence/route.ts', 'utf8');

    expect(source).toContain('const rawMutationRanges = Array.isArray(request.mutationRanges)');
    expect(source).toContain('if (rawMutationRanges.length > 64) return null');
    expect(source).toContain('endFrame <= startFrame');
    expect(source).toContain('...(mutationRanges.length > 0 ? { mutationRanges } : {})');
  });

  it('requires a writer receipt and routes generic evidence through ProjectService', () => {
    const serviceSource = readFileSync('lib/editron/services/phase0-rendered-evidence-worker.ts', 'utf8');
    const routeSource = readFileSync('app/api/internal/workers/phase0-rendered-evidence/route.ts', 'utf8');
    const genericHandler = routeSource.slice(
      routeSource.indexOf('async function handler'),
      routeSource.indexOf('async function handleChatEditRenderVerification'),
    );

    expect(serviceSource).toContain('targetReceipt?: ProjectMutationReceiptV1');
    expect(serviceSource).not.toContain('buildPhase0RenderedEvidenceDispatchPersistSet');
    expect(serviceSource).not.toContain('buildPhase0RenderedEvidenceClaimFilter');
    expect(genericHandler).toContain('parseProjectMutationReceipt(body.targetReceipt)');
    expect(genericHandler).toContain('projectService.claimPhase0RenderedEvidence');
    expect(genericHandler).toContain('projectService.recordPhase0RenderedEvidence');
    expect(genericHandler).toContain("skipped: 'stale-target'");
    expect(genericHandler).not.toContain("collection('projects').updateOne");
    expect(genericHandler).not.toContain('persistPhase0RenderedStillEvidence');
  });

  it('prefers the bounded Phase 0 still-render function over the long media-render function', () => {
    expect(resolvePhase0RenderedEvidenceConfig(configuredEnv({
      REMOTION_PHASE0_LAMBDA_FUNCTION_NAME: 'phase0-still-180sec',
      REMOTION_LAMBDA_FUNCTION_NAME: 'general-media-900sec',
    }))).toMatchObject({
      configured: true,
      functionName: 'phase0-still-180sec',
    });
  });

  it('does not enqueue a Phase 0 job when the receiver cannot verify QStash', async () => {
    await expect(dispatchPhase0RenderedEvidenceJob({
      projectId: 'proj_phase0_dispatch',
      userId: 'user_phase0_dispatch',
    }, configuredEnv({
      QSTASH_TOKEN: 'qstash-token',
      QSTASH_CURRENT_SIGNING_KEY: '',
      QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
    }))).resolves.toEqual({
      dispatched: false,
      reason: 'missing_qstash_signing_keys',
    });
  });

  it('wires QStash failure callbacks so async rendered evidence jobs cannot hang silently', () => {
    const serviceSource = readFileSync('lib/editron/services/phase0-rendered-evidence-worker.ts', 'utf8');
    const routeSource = readFileSync('app/api/internal/workers/phase0-rendered-evidence/route.ts', 'utf8');

    expect(serviceSource).toContain('failureCallback');
    expect(serviceSource).toContain('/api/internal/workers/phase0-rendered-evidence');
    expect(serviceSource).toContain('?qstashFailure=1');
    expect(serviceSource).toContain('isInternalQStashWorkerAuthConfigured(env)');
    expect(serviceSource).toContain("reason: 'missing_qstash_signing_keys'");
    expect(routeSource).toContain("request.nextUrl.searchParams.get('qstashFailure') === '1'");
    expect(routeSource).toContain('markChatEditRenderVerificationDeliveryFailed');
    expect(routeSource).toContain('qstash_delivery_failed');
    expect(routeSource).toContain("withInternalQStashWorkerAuth(handler, 'phase0-rendered-evidence')");
  });

  it('persists operation evidence and whole-project render eligibility as separate truths', () => {
    const routeSource = readFileSync('app/api/internal/workers/phase0-rendered-evidence/route.ts', 'utf8');

    expect(routeSource).toContain('auditProjectRenderEligibility(afterProject)');
    expect(routeSource).toContain('projectRenderEligibility,');
    expect(routeSource).toContain('Final project rendering is still blocked');
  });

  it('claims render ownership before persisting retry-delivery progress', () => {
    const source = readFileSync('app/api/internal/workers/phase0-rendered-evidence/route.ts', 'utf8');
    const handlerStart = source.indexOf('async function handleChatEditRenderVerification');
    const handlerEnd = source.indexOf('async function handleQstashFailureCallback');
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerSource.indexOf('const claim = await checkpoints.updateOne')).toBeGreaterThan(-1);
    expect(handlerSource).not.toContain('persistChatEditVerificationProgress');
    expect(handlerSource.indexOf('const claim = await checkpoints.updateOne'))
      .toBeLessThan(handlerSource.indexOf('projectService.recordChatRenderVerificationProjection'));
  });

  it('routes every chat proof projection through ProjectService and rejects stale receipt payloads', () => {
    const source = readFileSync('app/api/internal/workers/phase0-rendered-evidence/route.ts', 'utf8');
    const chatHandler = source.slice(
      source.indexOf('async function handleChatEditRenderVerification'),
      source.indexOf('async function handleQstashFailureCallback'),
    );
    const resultWriter = source.slice(
      source.indexOf('async function persistChatEditVerificationResult'),
      source.indexOf('async function ensureVerificationNotification'),
    );

    expect(chatHandler).toContain('projectService.recordChatRenderVerificationProjection');
    expect(chatHandler).toContain("skipped: 'stale-projection'");
    expect(chatHandler).not.toContain("collection(COLLECTIONS.PROJECTS).updateOne");
    expect(resultWriter).toContain('projectService.recordChatRenderVerificationProjection');
    expect(resultWriter).not.toContain("collection(COLLECTIONS.PROJECTS).updateOne");
    expect(source).toContain('parseProjectMutationReceipt(request.subjectReceipt)');
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

function audioVerificationRequest() {
  return {
    version: 'editron-chat-render-verification-v1' as const,
    operationId: 'op_audio_rights',
    sessionId: 'session_audio_rights',
    beforeCheckpointId: 'checkpoint_before',
    afterCheckpointId: 'checkpoint_after',
    requestedAt: '2026-07-26T00:00:00.000Z',
    modalities: ['audio' as const],
    expectedEffect: 'mutation-delta' as const,
    targets: [{
      overlayId: 'music_1',
      overlayType: 'sound',
      state: 'updated' as const,
      from: 0,
      endFrame: 120,
    }],
    sampleFrames: [0],
  };
}

function audioEvidenceProject(audioRights: Record<string, unknown>) {
  return {
    projectId: 'proj_phase0_audio_rights',
    userId: 'user_phase0_audio_rights',
    durationInFrames: 120,
    fps: 30,
    playerDimensions: { width: 320, height: 180 },
    overlays: [{
      id: 'music_1',
      assetId: 'bgm_phase0_audio_rights',
      type: OverlayType.SOUND,
      row: 1,
      from: 0,
      durationInFrames: 120,
      src: 'https://example.com/music.mp3',
      audioRights,
    }],
  } as any;
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

function rawRenderedImageFromLumas(lumas: number[]): RawRenderedStillImage {
  const channels = 4;
  const data = Buffer.alloc(lumas.length * channels);
  for (let index = 0; index < lumas.length; index += 1) {
    const offset = index * channels;
    const luma = lumas[index] ?? 0;
    data[offset] = luma;
    data[offset + 1] = luma;
    data[offset + 2] = luma;
    data[offset + 3] = 255;
  }
  return { data, width: lumas.length, height: 1, channels };
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
