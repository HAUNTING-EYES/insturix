import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assetsFindOne: vi.fn(async () => null),
  assetsUpdateOne: vi.fn(async () => ({ upsertedCount: 1 })),
  projectsFindOne: vi.fn(async () => ({ projectId: 'mg-live-project', orgId: 'org-1' })),
  projectsUpdateOne: vi.fn(async () => ({ matchedCount: 1 })),
  renderMgMoment: vi.fn(),
  reserveStorageForUpload: vi.fn(async () => ({
    allowed: true,
    owner: { id: 'org-1', type: 'org' },
    usedBytes: 0,
    limitBytes: 1_000_000,
    addBytes: 1200,
    evictedAssetIds: [],
    overage: false,
  })),
  recordStorageUsage: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  deleteR2Prefix: vi.fn(async () => 0),
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

vi.mock('@/lib/editron/motion-graphics/codegen/production-runtime', () => ({
  createProductionMgRuntime: vi.fn(() => ({
    codegen: {},
    render: vi.fn(),
    cleanup: vi.fn(),
    dispose: mocks.dispose,
  })),
}));

vi.mock('@/lib/editron/motion-graphics/codegen/render/render-moment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/motion-graphics/codegen/render/render-moment')>();
  return { ...actual, renderMgMoment: mocks.renderMgMoment };
});

vi.mock('@/lib/editron/motion-graphics/codegen/render/sequence-ingest-r2', () => ({
  makeR2FrameUploader: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/services/storage-reserve-service', () => ({
  reserveStorageForUpload: mocks.reserveStorageForUpload,
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
  mocks.reserveStorageForUpload.mockResolvedValue({
    allowed: true,
    owner: { id: 'org-1', type: 'org' },
    usedBytes: 0,
    limitBytes: 1_000_000,
    addBytes: 1200,
    evictedAssetIds: [],
    overage: false,
  });
  mocks.renderMgMoment.mockImplementation(async (_input, deps) => {
    await deps.authorizeStorage?.(1200);
    return {
      status: 'generated',
      sequence: {
        address: { sequenceId: 'tenant-seq-1', frameCount: 90, cdnBaseUrl: 'https://cdn.example.com' },
        r2Prefix: 'mgseq_tenant-seq-1_',
        fps: 30,
        width: 1920,
        height: 1080,
        frameFormat: 'webp',
        transparent: true,
        sizeBytes: 1200,
        renderMs: 45,
      },
      receipt: RECEIPT,
    };
  });
});

afterEach(() => {
  delete process.env.MG_CODEGEN_ENABLED;
});

describe('live MG codegen seam', () => {
  it('drives a real graphic decision through one selected candidate into a durable full-frame sequence', async () => {
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

    expect(result.overlaysCreated).toBe(1);
    const sequence = overlays.find((overlay) => overlay.type === OverlayType.MG_SEQUENCE);
    expect(sequence).toMatchObject({
      type: OverlayType.MG_SEQUENCE,
      assetId: 'mgseq_tenant-seq-1',
      from: 30,
      durationInFrames: 90,
      row: 6,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      _workerAdded: true,
    });
    expect(overlays.some((overlay) => overlay.type === OverlayType.MOTION_GRAPHIC)).toBe(false);

    const [momentInput, renderDeps] = mocks.renderMgMoment.mock.calls[0];
    expect(momentInput.candidate).toMatchObject({ factKind: 'bounded-stat', content: expect.objectContaining({ label: 'conversion lift' }) });
    expect(momentInput.window).toMatchObject({ startFrame: 30, fps: 30 });
    expect(renderDeps.sequenceNamespace).toBe('user-1');
    expect(mocks.reserveStorageForUpload).toHaveBeenCalledWith('user-1', 'org-1', 1200);
    expect(mocks.recordStorageUsage).toHaveBeenCalledWith({ id: 'org-1', type: 'org' }, 1200);

    const assetCall = mocks.assetsUpdateOne.mock.calls[0] as unknown as [unknown, { $setOnInsert: Record<string, unknown> }];
    const assetWrite = assetCall[1].$setOnInsert;
    expect(assetWrite).toMatchObject({
      assetId: 'mgseq_tenant-seq-1',
      type: 'sequence',
      source: 'generated',
      frameCount: 90,
      fps: 30,
      r2Prefix: 'mgseq_tenant-seq-1_',
      status: 'ready',
      codegen: expect.objectContaining({ factKind: 'bounded-stat', receipt: RECEIPT }),
    });
    expect(mocks.projectsUpdateOne).toHaveBeenCalledWith(
      { projectId: 'mg-live-project', userId: 'user-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'intelligence.mgCodegenRun': expect.objectContaining({ generatedCount: 1, failedCount: 0 }),
        }),
      }),
    );
  });

  it('does not fall back to a legacy card when codegen honestly declines', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.renderMgMoment.mockResolvedValue({
      status: 'declined',
      reason: 'the moment has no faithful visual explanation',
      receipt: { ...RECEIPT, outcome: 'declined', reason: 'the moment has no faithful visual explanation' },
    });
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
    const projectCall = mocks.projectsUpdateOne.mock.calls.at(-1) as unknown as
      | [unknown, { $set: Record<string, any> }]
      | undefined;
    const runEvidence = projectCall?.[1].$set['intelligence.mgCodegenRun'];
    expect(runEvidence).toMatchObject({ generatedCount: 0, failedCount: 1 });
    expect(runEvidence.outcomes[0]).toMatchObject({ status: 'declined', reason: expect.stringContaining('no faithful visual') });
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