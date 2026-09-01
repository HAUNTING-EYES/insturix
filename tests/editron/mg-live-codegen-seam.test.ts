import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assetsFindOne: vi.fn(async () => null),
  assetsUpdateOne: vi.fn(async () => ({ upsertedCount: 1 })),
  projectsFindOne: vi.fn(async () => ({ projectId: 'mg-live-project', orgId: 'org-1' })),
  projectsUpdateOne: vi.fn(async () => ({ matchedCount: 1 })),
  enqueueDurableMgRenderJob: vi.fn(),
  captureMgVisualEvidence: vi.fn(),
  recordStorageUsage: vi.fn(async () => undefined),
  deleteR2Prefix: vi.fn(async () => 0),
  designerGenerate: vi.fn(),
}));

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  audioDescriptionToSearchQuery: vi.fn((description: string) => description),
  isSFXLibraryAvailable: vi.fn(() => false),
  searchAndDownloadSFX: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: vi.fn(async () => ({
    collection: (name: string) => name === 'projects'
      ? { findOne: mocks.projectsFindOne, updateOne: mocks.projectsUpdateOne }
      : { findOne: mocks.assetsFindOne, updateOne: mocks.assetsUpdateOne },
  })),
}));

vi.mock('@/lib/editron/motion-graphics/codegen/mg-render-job-runner', () => ({
  resolveMgRenderAppCommit: vi.fn(() => '350b04ccb037ce3ae018627a1b6df0d3f959e2b8'),
  enqueueDurableMgRenderJob: mocks.enqueueDurableMgRenderJob,
}));

vi.mock('@/lib/editron/motion-graphics/codegen/visual-evidence', () => ({
  captureMgVisualEvidence: mocks.captureMgVisualEvidence,
}));

vi.mock('@/lib/editron/motion-graphics/codegen/design/designer-client', () => ({
  defaultGeminiDesignerGenerate: vi.fn(() => mocks.designerGenerate),
}));

vi.mock('@/lib/services/storage-quota-service', () => ({
  resolveStorageOwner: vi.fn((userId: string, orgId?: string) => (
    orgId ? { id: orgId, type: 'org' } : { id: userId, type: 'user' }
  )),
  recordStorageUsage: mocks.recordStorageUsage,
}));

vi.mock('@/lib/editron/services/r2-service', () => ({
  deleteR2Prefix: mocks.deleteR2Prefix,
  uploadToR2: vi.fn(),
}));

import { OverlayType, type Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { executeEDL } from '@/lib/editron/services/edl-executor';
import type { EditDecisionList } from '@/lib/editron/services/reactive-edit-engine';

const RECEIPT = {
  momentId: 'm1',
  promptHash: 'prompt-hash',
  attempts: 1,
  scans: [{ passed: true }],
  compiled: true,
  judgeScore: 9,
  judgeIssues: [],
  outcome: 'generated' as const,
};

const VISUAL_EVIDENCE = {
  space: 'edited-canvas' as const,
  canvas: { width: 1920, height: 1080 },
  frames: [
    { role: 'context-before' as const, coordinate: { kind: 'edited-timeline' as const, timelineFrame: 30 }, imageDataUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQiirUo/+BiOh/AAA=' },
    { role: 'anchor' as const, coordinate: { kind: 'edited-timeline' as const, timelineFrame: 75 }, imageDataUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQiirUo/+BiOh/AAA=' },
    { role: 'context-after' as const, coordinate: { kind: 'edited-timeline' as const, timelineFrame: 119 }, imageDataUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQiirUo/+BiOh/AAA=' },
  ],
};

const DESIGN_PLAN = JSON.stringify({
  brief: {
    styleName: 'measured conversion lift',
    motifLanguage: 'one resolving accent line',
    paletteMoves: 'brand foreground and accent over footage',
    motionPersonality: 'decisive build, quiet hold',
    formVariety: 'one relational reveal for this sole moment',
  },
  moments: [{
    momentId: 'beat-0',
    lane: 'overlay-kit',
    concept: 'conversion lift resolves from claim to measured outcome',
    targetBar: 'clarity',
    primaryCommunicativeJob: 'quantify',
    structure: {
      placement: 'open area clear of the subject',
      grouping: 'outcome label connected to a resolving reveal',
      readingOrder: 'label, relationship reveal, outcome',
    },
    elements: [
      { kind: 'headline', role: 'the measured outcome label', dataProps: ['label'] },
      { kind: 'reveal', role: 'the relationship landing on the outcome', dataProps: [] },
    ],
    motion: {
      enterOrder: [1, 0],
      build: 'relationship reveals before the outcome lands',
      hold: 'the resolved relationship continues a gentle float',
      syncTo: 'landing',
    },
    look: 'integrated',
  }],
  declined: [],
});

const ACCEPTED_DESIGN_REVIEW = JSON.stringify({
  accepted: true,
  packageFailures: { repetitiveWithinVideo: false },
  moments: [{
    momentId: 'beat-0',
    accepted: true,
    hardFailures: {
      decorativeFormOnly: false,
      primitiveChecklist: false,
      genericPrimitiveStack: false,
      missingVisualEncoding: false,
      flatHierarchy: false,
      decorativeMotionOnly: false,
      footageConflict: false,
    },
    issues: [],
  }],
  issues: [],
});

function sourceOverlays(): Overlay[] {
  return [{
    id: 1,
    type: OverlayType.VIDEO,
    from: 0,
    durationInFrames: 300,
    row: 0,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    assetId: 'source-1',
    content: 'https://example.com/source.mp4',
    src: 'https://example.com/source.mp4',
    styles: { opacity: 1 },
  } as Overlay];
}

function graphicEdl(): EditDecisionList {
  return {
    projectId: 'mg-live-project',
    generatedAt: new Date('2026-07-12T00:00:00.000Z'),
    totalDecisions: 1,
    decisions: [{
      type: 'graphic',
      frame: 30,
      durationFrames: 90,
      priority: 3,
      source: 'unified-planner:test',
      signal: 'statistic_detected',
      reason: 'conversion lift moment',
      confidence: 0.95,
      params: {
        graphicType: 'stat-counter',
        value: '47%',
        label: 'conversion lift',
        sourceSpan: { text: 'conversion lift of 47 percent', startMs: 1000, endMs: 2000 },
        signals: {
          salience: 0.9,
          enthusiasm: 0.85,
          emotional_arousal: 0.78,
          visual_dependency: 0.8,
          cinematic_moment: 0.75,
        },
      },
    }],
    stats: {
      cutsPerMinute: 0,
      transitionCount: 0,
      graphicCount: 1,
      zoomCount: 0,
      speedChangeCount: 0,
      averageConfidence: 0.95,
    },
  };
}

beforeEach(() => {
  process.env.MG_CODEGEN_ENABLED = 'true';
  vi.clearAllMocks();
  mocks.assetsFindOne.mockResolvedValue(null);
  mocks.assetsUpdateOne.mockResolvedValue({ upsertedCount: 1 });
  mocks.projectsFindOne.mockResolvedValue({ projectId: 'mg-live-project', orgId: 'org-1' });
  mocks.projectsUpdateOne.mockResolvedValue({ matchedCount: 1 });
  mocks.captureMgVisualEvidence.mockResolvedValue(VISUAL_EVIDENCE);
  mocks.designerGenerate.mockImplementation(async (parts: Array<{ kind: string; text?: string }>) => (
    parts.some((part) => part.kind === 'text' && part.text?.includes('independent motion-design PLAN critic'))
      ? ACCEPTED_DESIGN_REVIEW
      : DESIGN_PLAN
  ));
  mocks.enqueueDurableMgRenderJob.mockResolvedValue({
    jobId: 'mgr_0123456789abcdef0123456789abcdef',
    status: 'queued',
    messageId: 'qstash-message-1',
  });
});

afterEach(() => {
  delete process.env.MG_CODEGEN_ENABLED;
});

describe('live MG codegen seam', () => {
  it('queues one selected candidate without blocking Director or inserting an inline sequence', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const overlays = sourceOverlays();

    const result = await executeEDL(
      graphicEdl(),
      'mg-live-project',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    expect(result.overlaysCreated).toBe(0);
    expect(overlays).toHaveLength(1);
    expect(overlays.some((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC)).toBe(false);
    expect(result.projectEvidence).toMatchObject({
      schemaVersion: 1,
      mgCodegenRun: {
        version: 'mg-codegen-run-v2',
        queuedCount: 1,
        generatedCount: 0,
        failedCount: 0,
        truncated: false,
        outcomes: [expect.objectContaining({
          status: 'queued',
          jobId: 'mgr_0123456789abcdef0123456789abcdef',
        })],
      },
      mgKineticSfxContexts: [expect.objectContaining({
        version: 'mg-kinetic-sfx-context-v1',
        momentId: expect.stringContaining('mg-live-project:'),
      })],
      mgDeliveryRecords: [expect.objectContaining({
        status: 'enqueued',
        jobId: 'mgr_0123456789abcdef0123456789abcdef',
      })],
    });

    const [jobInput] = mocks.enqueueDurableMgRenderJob.mock.calls[0];
    expect(mocks.captureMgVisualEvidence).toHaveBeenCalledWith(expect.objectContaining({
      overlays: expect.arrayContaining([expect.objectContaining({ type: OverlayType.VIDEO })]),
      window: expect.objectContaining({ startFrame: 30, fps: 30 }),
      canvas: { width: 1920, height: 1080 },
    }));
    expect(jobInput.input.visualEvidence).toEqual(VISUAL_EVIDENCE);
    expect(jobInput.input.design).toMatchObject({ plan: { momentId: 'beat-0' } });
    expect(jobInput.input.candidate).toMatchObject({ factKind: 'bounded-stat', content: expect.objectContaining({ label: 'conversion lift' }) });
    expect(jobInput.input.window).toMatchObject({ startFrame: 30, fps: 30 });
    expect(jobInput).toMatchObject({ projectId: 'mg-live-project', userId: 'user-1', orgId: 'org-1', sequenceNamespace: 'user-1' });
    expect(mocks.assetsUpdateOne).not.toHaveBeenCalled();
    expect(mocks.recordStorageUsage).not.toHaveBeenCalled();
    expect(mocks.projectsUpdateOne).not.toHaveBeenCalled();
  });

  it('fails closed before durable dispatch when the video-level designer is unavailable', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.designerGenerate.mockRejectedValue(new Error('designer quota exhausted'));
    const overlays = sourceOverlays();
    const edl = graphicEdl();

    const result = await executeEDL(
      edl,
      'mg-live-project',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    expect(result.overlaysCreated).toBe(0);
    expect(mocks.enqueueDurableMgRenderJob).not.toHaveBeenCalled();
    expect(edl.decisions[0]?.params.mgCodegenOutcome).toMatchObject({
      status: 'fallback',
      reason: expect.stringContaining('designer model call failed'),
    });
  });

  it('does not let late caption-emphasis promotion bypass the video-level designer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const overlays = sourceOverlays();
    const edl: EditDecisionList = {
      ...graphicEdl(),
      decisions: [{
        type: 'caption-emphasis',
        frame: 30,
        durationFrames: 60,
        priority: 2,
        source: 'signal-planner:test',
        signal: 'phrase_emphasis',
        reason: 'emphasize a measured result',
        confidence: 0.9,
        params: {
          emphasisWord: '47%',
          value: '47%',
          label: 'conversion lift',
        },
      }],
    };

    const result = await executeEDL(
      edl,
      'mg-live-project',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    expect(result.overlaysCreated).toBe(0);
    expect(mocks.enqueueDurableMgRenderJob).not.toHaveBeenCalled();
    expect(edl.decisions[0]?.params.mgCodegenOutcome).toMatchObject({
      status: 'declined',
      reason: expect.stringContaining('cannot become an MG after the video-level designer'),
    });
  });

  it('does not fall back to a legacy card when durable dispatch fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.enqueueDurableMgRenderJob.mockRejectedValue(new Error('QSTASH_TOKEN is required'));
    const overlays = sourceOverlays();

    const result = await executeEDL(
      graphicEdl(),
      'mg-live-project',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    expect(result.overlaysCreated).toBe(0);
    expect(overlays).toHaveLength(1);
    expect(overlays.some((overlay) => (
      overlay.type === OverlayType.MG_SEQUENCE || overlay.type === OverlayType.MOTION_GRAPHIC
    ))).toBe(false);
    expect(mocks.assetsUpdateOne).not.toHaveBeenCalled();
    expect(mocks.projectsUpdateOne).not.toHaveBeenCalled();
    expect(result.projectEvidence.mgCodegenRun).toMatchObject({
      queuedCount: 0,
      generatedCount: 0,
      failedCount: 1,
      outcomes: [expect.objectContaining({
        status: 'fallback',
        reason: expect.stringContaining('QSTASH_TOKEN'),
      })],
    });
  });

  it('fails closed before the durable render job when edited-canvas evidence cannot be captured', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.captureMgVisualEvidence.mockRejectedValue(new Error('still render unavailable'));
    const overlays = sourceOverlays();

    const result = await executeEDL(
      graphicEdl(),
      'mg-live-project',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
    );

    expect(result.overlaysCreated).toBe(0);
    expect(mocks.enqueueDurableMgRenderJob).not.toHaveBeenCalled();
    expect(overlays).toHaveLength(1);
    expect(overlays.some((overlay) => (
      overlay.type === OverlayType.MG_SEQUENCE || overlay.type === OverlayType.MOTION_GRAPHIC
    ))).toBe(false);
  });

  it('captures a deterministic non-MG edited-canvas triplet through the real producer', async () => {
    const {
      captureMgVisualEvidence,
      selectMgVisualEvidenceFrames,
    } = await vi.importActual<typeof import('@/lib/editron/motion-graphics/codegen/visual-evidence')>(
      '@/lib/editron/motion-graphics/codegen/visual-evidence',
    );
    expect(selectMgVisualEvidenceFrames(
      { startFrame: 30, endFrame: 120, fps: 30 },
      { landingFrame: 45 },
    )).toEqual([30, 75, 119]);

    const overlayFrame = {
      from: 0,
      durationInFrames: 300,
      row: 1,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      isDragging: false,
      rotation: 0,
    };
    const caption: Overlay = {
      ...overlayFrame,
      id: 2,
      type: OverlayType.CAPTION,
      captions: [{
        text: 'caption',
        startMs: 0,
        endMs: 1_000,
        timestampMs: 0,
        confidence: 1,
        words: [],
      }],
      styles: {
        fontFamily: 'Inter',
        fontSize: '48px',
        fontWeight: 700,
        color: '#ffffff',
        textAlign: 'center',
        lineHeight: 1.2,
        highlight: {
          color: '#ffffff',
          backgroundColor: 'transparent',
          scale: 1,
          effect: 'none',
          animation: 'none',
        },
      },
    };
    const priorGraphic: Overlay = {
      ...overlayFrame,
      id: 3,
      type: OverlayType.MOTION_GRAPHIC,
      structureType: 'test',
      content: { label: 'prior graphic' },
      resolvedTokens: {},
      styles: { opacity: 1 },
    };
    const priorSequence: Overlay = {
      ...overlayFrame,
      id: 4,
      type: OverlayType.MG_SEQUENCE,
      assetId: 'mgseq-prior',
      styles: { opacity: 1 },
    };
    const resolveAssets = vi.fn(async (overlays: Overlay[], forceGCS: boolean) => {
      expect(forceGCS).toBe(true);
      return overlays;
    });
    const renderStill = vi.fn(async (input: any) => ({
      url: 'https://still.test/' + input.frame + '.jpg',
    }));
    const evidence = await captureMgVisualEvidence({
      overlays: [...sourceOverlays(), caption, priorGraphic, priorSequence],
      window: { startFrame: 30, endFrame: 120, fps: 30 },
      canvas: { width: 1920, height: 1080 },
      anchors: { landingFrame: 45 },
    }, {
      env: {
        REMOTION_LAMBDA_FUNCTION_NAME: 'render-fn',
        REMOTION_LAMBDA_SERVE_URL: 'https://site.test/deadbeef',
        REMOTION_AWS_REGION: 'us-east-1',
        VERCEL_GIT_COMMIT_SHA: 'deadbeef',
      },
      prepareCredentials: vi.fn(async () => undefined),
      resolveAssets,
      renderStill: renderStill as any,
      readStillBytes: vi.fn(async () => Buffer.from('still')),
      encodeStill: vi.fn(async () => VISUAL_EVIDENCE.frames[0].imageDataUrl),
    });

    expect(resolveAssets.mock.calls[0][0].map((overlay) => overlay.type)).toEqual([
      OverlayType.VIDEO,
      OverlayType.CAPTION,
    ]);
    expect(renderStill.mock.calls.map(([input]) => input.frame)).toEqual([30, 75, 119]);
    expect(renderStill.mock.calls.every(([input]) => input.deleteAfter === '1-day')).toBe(true);
    expect(evidence.frames.map((frame) => frame.role)).toEqual([
      'context-before',
      'anchor',
      'context-after',
    ]);
  });

  it('namespaces deterministic sequence ids per owner', async () => {
    const { scopeMgSequenceId } = await vi.importActual<typeof import('@/lib/editron/motion-graphics/codegen/render/render-moment')>(
      '@/lib/editron/motion-graphics/codegen/render/render-moment',
    );
    expect(scopeMgSequenceId('same-render', 'user-1')).toBe(scopeMgSequenceId('same-render', 'user-1'));
    expect(scopeMgSequenceId('same-render', 'user-1')).not.toBe(scopeMgSequenceId('same-render', 'user-2'));
  });
  it('authorizes exact rendered bytes before ingest and uploads nothing when quota denies', async () => {
    const { renderMgMoment } = await vi.importActual<typeof import('@/lib/editron/motion-graphics/codegen/render/render-moment')>(
      '@/lib/editron/motion-graphics/codegen/render/render-moment',
    );
    const ingest = vi.fn();
    const authorizeStorage = vi.fn(async () => { throw new Error('storage_full'); });
    const result = await renderMgMoment({
      momentId: 'quota-test',
      candidate: {
        id: 'smg_quota',
        factKind: 'bounded-stat',
        sourceSpan: { text: 'conversion lift of 47 percent' },
        content: { value: '47%', label: 'conversion lift' },
        evidenceKeys: ['source-span'],
        licenses: ['bounded-proportion', 'source-span'],
        salience: 0.9,
        hardGate: { passed: true, reasons: ['licensed'], blockedBy: [] },
        scoreInputs: { structuralStrength: 0.9, salience: 0.9, evidenceStrength: 0.9, renderRisk: 0.1 },
      },
      brand: INSTURIX,
      window: { startFrame: 30, endFrame: 120, fps: 30 },
      expressiveness: { tier: 'hero', intensity: 0.85, emphasisScale: 1.2 },
      placement: { region: 'full-frame', avoid: [], prefer: [] },
    }, {
      codegen: { writeComponent: vi.fn(), compile: vi.fn(), evaluate: vi.fn() },
      canvas: { width: 1920, height: 1080 },
      uploadFrame: vi.fn(),
      generate: vi.fn(async () => ({ status: 'generated' as const, code: 'export const MgScene = () => null;', receipt: RECEIPT })),
      render: vi.fn(async () => ({
        webpDir: '/tmp/webp',
        files: ['00000.webp'],
        workspaceDir: '/tmp/mg',
        width: 1920,
        height: 1080,
        fps: 30,
        count: 1,
        renderMs: 5,
      })),
      frameSize: vi.fn(async () => 1200),
      authorizeStorage,
      ingest,
      cleanup: vi.fn(async () => undefined),
    });

    expect(result).toMatchObject({ status: 'fallback', reason: expect.stringContaining('storage_full') });
    expect(authorizeStorage).toHaveBeenCalledWith(1200);
    expect(ingest).not.toHaveBeenCalled();
  });
});
