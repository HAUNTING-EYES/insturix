import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  VIDEO_SOURCE_TIME_BINDING_KIND_V1,
  type VerifiedVideoSourceTimeBindingV1,
} from '@/lib/editron/services/video-source-time-transform-v1';

const serviceMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
  getAsset: vi.fn(),
  resolveSourceBinding: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'editron_prev.projects' },
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: serviceMocks.findOne,
      updateOne: serviceMocks.updateOne,
    })),
  })),
  connectToDatabase: vi.fn(),
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    getAsset: serviceMocks.getAsset,
    stripUrlsForLLM: vi.fn((overlays) => overlays),
    resolveProjectAssets: vi.fn(async (overlays) => overlays),
  },
}));

vi.mock('@/lib/editron/services/video-source-time-transform-v1', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/editron/services/video-source-time-transform-v1')
  >();
  return {
    ...actual,
    resolveVerifiedVideoSourceTimeBindingV1: serviceMocks.resolveSourceBinding,
  };
});

vi.mock('@/lib/services/orgMemberService', () => ({ orgMemberService: {} }));
vi.mock('@/lib/shared/project-links', () => ({ removeProjectFromLinks: vi.fn() }));

describe('ProjectService video speed-ramp writer V1', () => {
  beforeEach(() => {
    serviceMocks.findOne.mockReset();
    serviceMocks.updateOne.mockReset();
    serviceMocks.getAsset.mockReset();
    serviceMocks.resolveSourceBinding.mockReset();
    serviceMocks.getAsset.mockResolvedValue({ assetId: 'asset-1', type: 'video' });
    serviceMocks.resolveSourceBinding.mockReturnValue(binding());
  });

  it('persists one writer-issued source-time transform in the same CAS receipt', async () => {
    serviceMocks.findOne.mockResolvedValueOnce(projectAtRevision(16));
    serviceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import('@/lib/editron/services/project-service');

    const result = await projectService.applyVideoSpeedRampV1(
      'user-1',
      'project-1',
      speedRampCommand(),
    );

    expect(result.disposition).toBe('APPLIED');
    if (result.disposition !== 'APPLIED') throw new Error('expected applied result');
    expect(result.mutationReceipt.revision.value).toBe(17);
    expect(result.sourceTimeTransform).toMatchObject({
      projectId: 'project-1',
      overlayId: '17',
      assetId: 'asset-1',
      beforeProjectRevision: revision(16),
      timelineStartFrame: 90,
      sourceStartFrame: 10,
    });
    expect(serviceMocks.getAsset).toHaveBeenCalledWith('asset-1', 'user-1');
    expect(serviceMocks.updateOne).toHaveBeenCalledTimes(1);
    const [predicate, update] = serviceMocks.updateOne.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, any>,
    ];
    expect(predicate).toMatchObject({
      projectId: 'project-1',
      userId: 'user-1',
      'overlays.id': 17,
      projectRevision: 16,
      updatedAt: new Date(revision(16).compatibilityUpdatedAt),
    });
    expect(update.$set['overlays.$[elem]']).toMatchObject({
      id: 17,
      speedCurve: speedCurve(),
      keyframeTracks: [{ property: 'speed', keyframes: speedCurve() }],
    });
    expect(update.$push.timelineRangeChangeReceipts.$each).toEqual([
      expect.objectContaining({
        operation: 'APPLY_VIDEO_SPEED_RAMP',
        actorKind: 'AGENT',
        sourceTimeTransform: result.sourceTimeTransform,
        beforeProjectRevision: revision(16),
        afterProjectRevision: result.mutationReceipt.revision,
      }),
    ]);
  });

  it('safe-stops before writing when terminal source timing or handles are unavailable', async () => {
    serviceMocks.findOne.mockResolvedValue(projectAtRevision(16));
    serviceMocks.resolveSourceBinding.mockReturnValueOnce(null);
    const { projectService } = await import('@/lib/editron/services/project-service');

    await expect(projectService.applyVideoSpeedRampV1(
      'user-1',
      'project-1',
      speedRampCommand(),
    )).resolves.toEqual({
      disposition: 'SAFE_STOP',
      reason: 'SOURCE_TIME_EVIDENCE_INCOMPLETE',
      currentRevision: revision(16),
    });
    expect(serviceMocks.updateOne).not.toHaveBeenCalled();

    serviceMocks.resolveSourceBinding.mockReturnValueOnce(binding({
      totalSourceFrameCount: '30',
      sourceEndExclusivePresentationTimestampTicks: String(30 * 3003),
    }));
    await expect(projectService.applyVideoSpeedRampV1(
      'user-1',
      'project-1',
      speedRampCommand(),
    )).resolves.toEqual({
      disposition: 'SAFE_STOP',
      reason: 'SOURCE_HANDLES_INSUFFICIENT',
      currentRevision: revision(16),
    });
    expect(serviceMocks.updateOne).not.toHaveBeenCalled();
  });

  it('rejects stale revisions and contradictory source/form state before writing', async () => {
    serviceMocks.findOne.mockResolvedValue(projectAtRevision(17));
    const { ProjectMutationConflictError, projectService } = await import(
      '@/lib/editron/services/project-service'
    );
    await expect(projectService.applyVideoSpeedRampV1(
      'user-1',
      'project-1',
      speedRampCommand(),
    )).rejects.toBeInstanceOf(ProjectMutationConflictError);
    expect(serviceMocks.getAsset).not.toHaveBeenCalled();
    expect(serviceMocks.updateOne).not.toHaveBeenCalled();

    serviceMocks.findOne.mockResolvedValueOnce(projectAtRevision(16, {
      sourceStartFrame: 10,
      videoStartTime: 11,
    }));
    await expect(projectService.applyVideoSpeedRampV1(
      'user-1',
      'project-1',
      speedRampCommand(),
    )).rejects.toThrow('Conflicting sourceStartFrame and videoStartTime');

    serviceMocks.findOne.mockResolvedValueOnce(projectAtRevision(16));
    await expect(projectService.applyVideoSpeedRampV1(
      'user-1',
      'project-1',
      {
        ...speedRampCommand(),
        keyframeTracks: [{
          property: 'speed',
          keyframes: speedCurve().map((point) => ({ ...point, value: 2 })),
        }],
      },
    )).rejects.toThrow('VIDEO_SPEED_RAMP_KEYFRAME_PARITY_INVALID');
    expect(serviceMocks.updateOne).not.toHaveBeenCalled();
  });

  it('re-reads project and media ownership before rebinding a downstream source event', async () => {
    serviceMocks.findOne.mockResolvedValueOnce(projectAtRevision(16));
    serviceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import('@/lib/editron/services/project-service');
    const applied = await projectService.applyVideoSpeedRampV1(
      'user-1',
      'project-1',
      speedRampCommand(),
    );
    if (applied.disposition !== 'APPLIED') throw new Error('expected applied result');

    serviceMocks.findOne.mockResolvedValueOnce(projectAtRevision(
      17,
      {},
      applied.mutationReceipt.revision.compatibilityUpdatedAt,
      { timelineRangeChangeReceipts: [applied.timelineChangeReceipt] },
    ));
    await expect(projectService.rebindVideoSourceEventAfterRetimeV1(
      'user-1',
      'project-1',
      {
        sourceTimeTransform: applied.sourceTimeTransform,
        sourcePresentationTimestampTicks: String(50 * 3003),
      },
    )).resolves.toMatchObject({
      disposition: 'REBOUND',
      sourceFrameOrdinal: 50,
      transformSha256: applied.sourceTimeTransform.transformSha256,
    });

    serviceMocks.findOne.mockResolvedValueOnce(projectAtRevision(
      17,
      {},
      applied.mutationReceipt.revision.compatibilityUpdatedAt,
      { timelineRangeChangeReceipts: [applied.timelineChangeReceipt] },
    ));
    await expect(projectService.rebindVideoSourceEventAfterRetimeV1(
      'user-1',
      'project-1',
      {
        sourceTimeTransform: {
          ...applied.sourceTimeTransform,
          transformSha256: 'f'.repeat(64),
        },
        sourcePresentationTimestampTicks: String(50 * 3003),
      },
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_TIME_TRANSFORM_NOT_CURRENT',
    });

    serviceMocks.findOne.mockResolvedValueOnce(projectAtRevision(
      18,
      {},
      '2026-08-26T00:00:02.000Z',
    ));
    await expect(projectService.rebindVideoSourceEventAfterRetimeV1(
      'user-1',
      'project-1',
      {
        sourceTimeTransform: applied.sourceTimeTransform,
        sourcePresentationTimestampTicks: String(50 * 3003),
      },
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'PROJECT_REVISION_STALE',
    });
  });

  it('atomically shortens an isolated source range, ripples later content and issues the V2 transform', async () => {
    serviceMocks.findOne.mockResolvedValueOnce(sourceRangeProjectAtRevision(16));
    serviceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import('@/lib/editron/services/project-service');

    const result = await projectService.applyVideoSourceRangeRetimeV1(
      'user-1',
      'project-1',
      {
        expectedRevision: revision(16),
        actorKind: 'AGENT',
        overlayId: 17,
        playbackRate: 2,
      },
    );

    expect(result.disposition).toBe('APPLIED');
    if (result.disposition !== 'APPLIED') throw new Error('expected applied result');
    expect(result.sourceTimeTransform).toMatchObject({
      rendererMappingVersion: 'EDITRON_STEP_SPEED_SEGMENTS_SOURCE_SPAN_V2',
      sourceStartFrame: 0,
      sourceEndFrameExclusive: 120,
      durationInFrames: 60,
    });
    const update = serviceMocks.updateOne.mock.calls[0]?.[1] as Record<string, any>;
    expect(update.$set).toMatchObject({
      durationInFrames: 180,
      overlays: [
        expect.objectContaining({ id: 17, from: 0, durationInFrames: 60, sourceEndFrame: 120 }),
        expect.objectContaining({ id: 18, from: 60, durationInFrames: 120 }),
      ],
    });
    expect(update.$push.timelineRangeChangeReceipts.$each[0]).toMatchObject({
      operation: 'RETIME_VIDEO_SOURCE_RANGE',
      beforeProjectRevision: revision(16),
      sourceTimeTransform: result.sourceTimeTransform,
      ripple: {
        kind: 'RETIME_AND_SHIFT_LEFT',
        retimedBeforeFrameRange: { startFrame: 0, endFrame: 120 },
        retimedAfterFrameRange: { startFrame: 0, endFrame: 60 },
        shiftedBeforeFrameRange: { startFrame: 120, endFrame: 240 },
        shiftedAfterFrameRange: { startFrame: 60, endFrame: 180 },
        deltaFrames: -60,
      },
    });
  });

  it('safe-stops source-range retime on overlapping dialogue and VFR evidence', async () => {
    serviceMocks.findOne.mockResolvedValueOnce(sourceRangeProjectAtRevision(16, [{
      id: 19, type: 'caption', captions: [], from: 90, durationInFrames: 20,
      row: 2, left: 0, top: 0, width: 100, height: 50,
      rotation: 0, isDragging: false, styles: {},
    }]));
    const { projectService } = await import('@/lib/editron/services/project-service');
    await expect(projectService.applyVideoSourceRangeRetimeV1(
      'user-1', 'project-1', {
        expectedRevision: revision(16), actorKind: 'AGENT', overlayId: 17, playbackRate: 2,
      },
    )).resolves.toMatchObject({
      disposition: 'SAFE_STOP', reason: 'OVERLAPPING_DEPENDENT_OVERLAY',
    });
    expect(serviceMocks.updateOne).not.toHaveBeenCalled();

    serviceMocks.findOne.mockResolvedValueOnce(sourceRangeProjectAtRevision(16));
    serviceMocks.resolveSourceBinding.mockReturnValueOnce(binding({ sourceCadence: { kind: 'VFR' } }));
    await expect(projectService.applyVideoSourceRangeRetimeV1(
      'user-1', 'project-1', {
        expectedRevision: revision(16), actorKind: 'AGENT', overlayId: 17, playbackRate: 2,
      },
    )).resolves.toMatchObject({
      disposition: 'SAFE_STOP', reason: 'SOURCE_EVENT_REBIND_UNSUPPORTED',
    });
    expect(serviceMocks.updateOne).not.toHaveBeenCalled();
  });

  it('rebinds an event only from the persisted source-range retime receipt', async () => {
    serviceMocks.findOne.mockResolvedValueOnce(sourceRangeProjectAtRevision(16));
    serviceMocks.updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const { projectService } = await import('@/lib/editron/services/project-service');
    const applied = await projectService.applyVideoSourceRangeRetimeV1(
      'user-1', 'project-1', {
        expectedRevision: revision(16), actorKind: 'AGENT', overlayId: 17, playbackRate: 2,
      },
    );
    if (applied.disposition !== 'APPLIED') throw new Error('expected applied result');
    serviceMocks.findOne.mockResolvedValueOnce(sourceRangeProjectAtRevision(
      17,
      [],
      applied.mutationReceipt.revision.compatibilityUpdatedAt,
      {
        overlays: [
          sourceRangeVideo(17, 0, 60, 0, 120),
          sourceRangeVideo(18, 60, 120, 120, 240),
        ],
        timelineRangeChangeReceipts: [applied.timelineChangeReceipt],
        durationInFrames: 180,
      },
    ));

    await expect(projectService.rebindVideoSourceEventAfterRetimeV1(
      'user-1', 'project-1', {
        sourceTimeTransform: applied.sourceTimeTransform,
        sourcePresentationTimestampTicks: String(100 * 3003),
      },
    )).resolves.toMatchObject({
      disposition: 'REBOUND', sourceFrameOrdinal: 100, projectFrame: 50,
    });
  });
});

function projectAtRevision(
  value: number,
  overlayOverrides: Record<string, unknown> = {},
  compatibilityUpdatedAt = revision(value).compatibilityUpdatedAt,
  projectOverrides: Record<string, unknown> = {},
) {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    fps: 30,
    projectRevision: value,
    updatedAt: new Date(compatibilityUpdatedAt),
    overlays: [{
      id: 17,
      type: 'video',
      assetId: 'asset-1',
      content: '',
      from: 90,
      durationInFrames: 100,
      sourceStartFrame: 10,
      videoStartTime: 10,
      row: 0,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      isDragging: false,
      styles: {},
      ...overlayOverrides,
    }],
    ...projectOverrides,
  };
}

function sourceRangeProjectAtRevision(
  value: number,
  extraOverlays: Record<string, unknown>[] = [],
  compatibilityUpdatedAt = revision(value).compatibilityUpdatedAt,
  projectOverrides: Record<string, unknown> = {},
) {
  return {
    projectId: 'project-1', userId: 'user-1', fps: 30,
    projectRevision: value, updatedAt: new Date(compatibilityUpdatedAt),
    durationInFrames: 240,
    overlays: [
      sourceRangeVideo(17, 0, 120, 0, 120),
      sourceRangeVideo(18, 120, 120, 120, 240),
      ...extraOverlays,
    ],
    ...projectOverrides,
  };
}

function sourceRangeVideo(
  id: number,
  from: number,
  durationInFrames: number,
  sourceStartFrame: number,
  sourceEndFrame: number,
) {
  return {
    id, type: 'video', assetId: 'asset-1', content: '', from, durationInFrames,
    sourceStartFrame, sourceEndFrame, videoStartTime: sourceStartFrame,
    row: 0, left: 0, top: 0, width: 1920, height: 1080,
    rotation: 0, isDragging: false, styles: {},
  };
}

function speedRampCommand() {
  return {
    expectedRevision: revision(16),
    actorKind: 'AGENT' as const,
    overlayId: 17,
    speedCurve: speedCurve(),
    keyframeTracks: [{ property: 'speed' as const, keyframes: speedCurve() }],
  };
}

function speedCurve() {
  return [
    { frame: 20, value: 1, easing: 'ease-in-out' as const },
    { frame: 40, value: 0.5, easing: 'ease-in-out' as const },
    { frame: 60, value: 1, easing: 'ease-out' as const },
  ];
}

function binding(
  overrides: Partial<Omit<VerifiedVideoSourceTimeBindingV1, 'bindingSha256'>> = {},
): VerifiedVideoSourceTimeBindingV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: VIDEO_SOURCE_TIME_BINDING_KIND_V1,
    assetId: 'asset-1',
    sourceVersionSha256: 'a'.repeat(64),
    sourcePtsMapStateSha256: 'b'.repeat(64),
    mapBindingSha256: 'c'.repeat(64),
    terminalReceiptSha256: 'd'.repeat(64),
    sourceTimebase: { numerator: '1', denominator: '90000' },
    sourceCadence: { kind: 'CFR' as const, durationTicks: '3003' },
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: String(300 * 3003),
    totalSourceFrameCount: '300',
    ...overrides,
  };
  return { ...material, bindingSha256: hashEditronCanonicalJsonV1(material) };
}

function revision(value: number) {
  return {
    schemaVersion: 1 as const,
    value,
    compatibilityUpdatedAt: `2026-08-26T00:00:${String(value).padStart(2, '0')}.000Z`,
  };
}
