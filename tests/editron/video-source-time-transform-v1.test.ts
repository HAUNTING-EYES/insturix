import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createProjectVideoSourceTimeTransformV1,
  PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1,
  rebindSourcePresentationTimestampV1,
  VIDEO_SOURCE_TIME_BINDING_KIND_V1,
  type VerifiedVideoSourceTimeBindingV1,
} from '@/lib/editron/services/video-source-time-transform-v1';

describe('ProjectVideoSourceTimeTransformV1', () => {
  it('binds the current renderer mapping and rebinds an exact CFR source event', () => {
    const transform = createProjectVideoSourceTimeTransformV1({
      projectId: 'project-1', overlayId: 17,
      beforeProjectRevision: revision(16, '2026-08-26T00:00:00.000Z'),
      afterProjectRevision: revision(17, '2026-08-26T00:00:01.000Z'),
      projectFps: 30, timelineStartFrame: 90, sourceStartFrame: 10,
      durationInFrames: 100,
      speedCurve: [
        { frame: 20, value: 1, easing: 'ease-in-out' },
        { frame: 40, value: 2, easing: 'ease-in-out' },
        { frame: 60, value: 1, easing: 'ease-out' },
      ],
      sourceBinding: binding(),
    });

    expect(transform).toMatchObject({
      writerAuthority: PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1,
      projectId: 'project-1', overlayId: '17', assetId: 'asset-1',
      segments: [
        { timelineStartFrame: 90, timelineEndFrameExclusive: 110, playbackRate: 1, sourceStartFrame: 10, sourceEndFrameExclusive: 30 },
        { timelineStartFrame: 110, timelineEndFrameExclusive: 130, playbackRate: 1, sourceStartFrame: 30, sourceEndFrameExclusive: 50 },
        { timelineStartFrame: 130, timelineEndFrameExclusive: 150, playbackRate: 2, sourceStartFrame: 50, sourceEndFrameExclusive: 90 },
        { timelineStartFrame: 150, timelineEndFrameExclusive: 190, playbackRate: 0.5, sourceStartFrame: 90, sourceEndFrameExclusive: 110 },
      ],
    });
    expect(rebindSourcePresentationTimestampV1(transform, String(90 * 3003)))
      .toEqual({
        disposition: 'REBOUND', sourcePresentationTimestampTicks: String(90 * 3003),
        sourceFrameOrdinal: 90, projectFrame: 150,
        transformSha256: transform.transformSha256,
      });
    expect(Object.isFrozen(transform)).toBe(true);
  });

  it('fails closed for VFR without index lookup, subframe positions, bad handles and tamper', () => {
    const base = createProjectVideoSourceTimeTransformV1({
      projectId: 'project-1', overlayId: 17,
      beforeProjectRevision: revision(16, '2026-08-26T00:00:00.000Z'),
      afterProjectRevision: revision(17, '2026-08-26T00:00:01.000Z'),
      projectFps: 30, timelineStartFrame: 0, sourceStartFrame: 0,
      durationInFrames: 20,
      speedCurve: [
        { frame: 0, value: 0.75, easing: 'linear' },
        { frame: 10, value: 1, easing: 'linear' },
      ],
      sourceBinding: binding(),
    });
    expect(rebindSourcePresentationTimestampV1(base, String(2 * 3003)))
      .toEqual({ disposition: 'UNVERIFIABLE', reason: 'SUBFRAME_PROJECT_POSITION' });

    const vfrBinding = binding({ sourceCadence: { kind: 'VFR' } });
    const vfr = createProjectVideoSourceTimeTransformV1({
      projectId: 'project-1', overlayId: 17,
      beforeProjectRevision: revision(16, '2026-08-26T00:00:00.000Z'),
      afterProjectRevision: revision(17, '2026-08-26T00:00:01.000Z'),
      projectFps: 30, timelineStartFrame: 0, sourceStartFrame: 0,
      durationInFrames: 20,
      speedCurve: [{ frame: 0, value: 1, easing: 'linear' }, { frame: 10, value: 1, easing: 'linear' }],
      sourceBinding: vfrBinding,
    });
    expect(rebindSourcePresentationTimestampV1(vfr, '3003'))
      .toEqual({ disposition: 'UNVERIFIABLE', reason: 'VFR_INDEX_REQUIRED' });

    expect(() => createProjectVideoSourceTimeTransformV1({
      projectId: 'project-1', overlayId: 17,
      beforeProjectRevision: revision(16, '2026-08-26T00:00:00.000Z'),
      afterProjectRevision: revision(17, '2026-08-26T00:00:01.000Z'),
      projectFps: 30, timelineStartFrame: 0, sourceStartFrame: 150,
      durationInFrames: 100,
      speedCurve: [{ frame: 0, value: 1, easing: 'linear' }, { frame: 50, value: 1, easing: 'linear' }],
      sourceBinding: binding({ totalSourceFrameCount: '200' }),
    })).toThrow('VIDEO_SOURCE_TIME_TRANSFORM_SOURCE_HANDLES_INSUFFICIENT');

    const forged = structuredClone(base) as any;
    forged.segments[0].playbackRate = 3;
    expect(() => rebindSourcePresentationTimestampV1(forged, '3003'))
      .toThrow('VIDEO_SOURCE_TIME_TRANSFORM_INVALID');
  });
});

function binding(
  overrides: Partial<Omit<VerifiedVideoSourceTimeBindingV1, 'bindingSha256'>> = {},
): VerifiedVideoSourceTimeBindingV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: VIDEO_SOURCE_TIME_BINDING_KIND_V1,
    assetId: 'asset-1', sourceVersionSha256: 'a'.repeat(64),
    sourcePtsMapStateSha256: 'b'.repeat(64), mapBindingSha256: 'c'.repeat(64),
    terminalReceiptSha256: 'd'.repeat(64),
    sourceTimebase: { numerator: '1', denominator: '90000' },
    sourceCadence: { kind: 'CFR' as const, durationTicks: '3003' },
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: String(200 * 3003),
    totalSourceFrameCount: '200',
    ...overrides,
  };
  return { ...material, bindingSha256: hashEditronCanonicalJsonV1(material) };
}

function revision(value: number, compatibilityUpdatedAt: string) {
  return { schemaVersion: 1 as const, value, compatibilityUpdatedAt };
}
