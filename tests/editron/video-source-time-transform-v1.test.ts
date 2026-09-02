import { describe, expect, it } from 'vitest';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  type PresentationEpochV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  assertProjectVideoSpeedRampStateV1,
  classifyVerifiedVideoSourceRateCompatibilityV1,
  createProjectVideoSourceTimeTransformV1,
  createVideoSourceTimestampConformV2,
  PROJECT_VIDEO_SOURCE_TIME_TRANSFORM_OWNER_V1,
  rebindSourcePresentationTimestampV1,
  VIDEO_RETIME_RENDERER_MAPPING_VERSION_V2,
  VIDEO_SOURCE_TIME_BINDING_KIND_V1,
  type VerifiedVideoSourceTimeBindingV1,
  type VideoSourceTimestampConformFrameV2,
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
    expect(rebindSourcePresentationTimestampV1(transform, binding(), String(90 * 3000)))
      .toEqual({
        disposition: 'REBOUND', sourcePresentationTimestampTicks: String(90 * 3000),
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
    expect(rebindSourcePresentationTimestampV1(base, binding(), String(2 * 3000)))
      .toEqual({ disposition: 'UNVERIFIABLE', reason: 'SUBFRAME_PROJECT_POSITION' });

    expect(rebindSourcePresentationTimestampV1(
      base,
      binding({ sourceVersionSha256: 'e'.repeat(64) }),
      '3000',
    )).toEqual({ disposition: 'UNVERIFIABLE', reason: 'SOURCE_BINDING_STALE' });

    const vfrBinding = binding({ sourceCadence: { kind: 'VFR' } });
    expect(classifyVerifiedVideoSourceRateCompatibilityV1(vfrBinding, 30))
      .toEqual({ disposition: 'UNSUPPORTED', reason: 'VFR_INDEX_REQUIRED' });
    expect(() => createProjectVideoSourceTimeTransformV1({
      projectId: 'project-1', overlayId: 17,
      beforeProjectRevision: revision(16, '2026-08-26T00:00:00.000Z'),
      afterProjectRevision: revision(17, '2026-08-26T00:00:01.000Z'),
      projectFps: 30, timelineStartFrame: 0, sourceStartFrame: 0,
      durationInFrames: 20,
      speedCurve: [{ frame: 0, value: 1, easing: 'linear' }, { frame: 10, value: 1, easing: 'linear' }],
      sourceBinding: vfrBinding,
    })).toThrow('VIDEO_SOURCE_TIME_TRANSFORM_VFR_INDEX_REQUIRED');

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
    expect(() => rebindSourcePresentationTimestampV1(forged, binding(), '3000'))
      .toThrow('VIDEO_SOURCE_TIME_TRANSFORM_INVALID');
  });

  it('fails closed when the source cadence cannot be addressed exactly by the project timebase', () => {
    const mixedRateBinding = binding({
      sourceCadence: { kind: 'CFR', durationTicks: '3003' },
      sourceEndExclusivePresentationTimestampTicks: String(200 * 3003),
    });

    expect(classifyVerifiedVideoSourceRateCompatibilityV1(mixedRateBinding, 30))
      .toEqual({ disposition: 'UNSUPPORTED', reason: 'SOURCE_PROJECT_RATE_MISMATCH' });
    expect(classifyVerifiedVideoSourceRateCompatibilityV1(binding(), 29.97))
      .toEqual({ disposition: 'UNSUPPORTED', reason: 'PROJECT_RATIONAL_TIMEBASE_REQUIRED' });
    expect(() => createProjectVideoSourceTimeTransformV1({
      projectId: 'project-1', overlayId: 17,
      beforeProjectRevision: revision(16, '2026-08-26T00:00:00.000Z'),
      afterProjectRevision: revision(17, '2026-08-26T00:00:01.000Z'),
      projectFps: 30, timelineStartFrame: 0, sourceStartFrame: 0,
      durationInFrames: 20,
      speedCurve: [{ frame: 0, value: 1, easing: 'linear' }],
      sourceBinding: mixedRateBinding,
    })).toThrow('VIDEO_SOURCE_TIME_TRANSFORM_SOURCE_PROJECT_RATE_MISMATCH');
  });

  it('rebinds through a shortened composition using its explicit source span', () => {
    const transform = createProjectVideoSourceTimeTransformV1({
      projectId: 'project-1', overlayId: 17,
      beforeProjectRevision: revision(16, '2026-08-26T00:00:00.000Z'),
      afterProjectRevision: revision(17, '2026-08-26T00:00:01.000Z'),
      projectFps: 30, timelineStartFrame: 0, sourceStartFrame: 0,
      sourceEndFrameExclusive: 120,
      durationInFrames: 60,
      speedCurve: [
        { frame: 0, value: 2, easing: 'linear' },
        { frame: 59, value: 2, easing: 'linear' },
      ],
      sourceBinding: binding(),
    });

    expect(transform).toMatchObject({
      rendererMappingVersion: VIDEO_RETIME_RENDERER_MAPPING_VERSION_V2,
      sourceEndFrameExclusive: 120,
      segments: [
        { timelineStartFrame: 0, timelineEndFrameExclusive: 59, playbackRate: 2, sourceStartFrame: 0, sourceEndFrameExclusive: 118 },
        { timelineStartFrame: 59, timelineEndFrameExclusive: 60, playbackRate: 2, sourceStartFrame: 118, sourceEndFrameExclusive: 120 },
      ],
    });
    expect(rebindSourcePresentationTimestampV1(transform, binding(), String(100 * 3000)))
      .toEqual({
        disposition: 'REBOUND', sourcePresentationTimestampTicks: String(100 * 3000),
        sourceFrameOrdinal: 100, projectFrame: 50,
        transformSha256: transform.transformSha256,
      });
  });

  it('requires the stored speed track to match the renderer speed curve exactly', () => {
    const speedCurve = [
      { frame: 0, value: 1, easing: 'linear' as const },
      { frame: 10, value: 0.5, easing: 'ease-in-out' as const },
    ];
    expect(assertProjectVideoSpeedRampStateV1({
      durationInFrames: 20,
      speedCurve,
      keyframeTracks: [
        { property: 'opacity', keyframes: [{ frame: 0, value: 1, easing: 'linear' }] },
        { property: 'speed', keyframes: speedCurve },
      ],
    })).toEqual({
      speedCurve,
      keyframeTracks: [
        { property: 'opacity', keyframes: [{ frame: 0, value: 1, easing: 'linear' }] },
        { property: 'speed', keyframes: speedCurve },
      ],
    });
    expect(() => assertProjectVideoSpeedRampStateV1({
      durationInFrames: 20,
      speedCurve,
      keyframeTracks: [{
        property: 'speed',
        keyframes: [
          { frame: 0, value: 1, easing: 'linear' },
          { frame: 10, value: 2, easing: 'ease-in-out' },
        ],
      }],
    })).toThrow('VIDEO_SPEED_RAMP_KEYFRAME_PARITY_INVALID');
  });
});

describe('VideoSourceTimestampConformV2', () => {
  it('maps same-rate CFR one-to-one and keeps audio in exact sample coordinates', () => {
    const result = createVideoSourceTimestampConformV2(conformInput({
      timelineFrameQueries: ['90', '91', '92'],
      timelineStartFrame: '90',
      audio: {
        sourceRange: {
          startSampleFrame: '0', endExclusiveSampleFrame: '48000', sampleRate: '48000',
        },
        sourceAnchorSampleFrame: '0',
        endExclusiveTimelineFrame: '93',
      },
    }));

    expect(result.evidenceStatus).toBe('PURE_PRE_RESOLVED_WINDOW_CONTRACT_NOT_RUNTIME_WIRED');
    expect(result.frameSelections.map(({ sourceFrameOrdinal }) => sourceFrameOrdinal))
      .toEqual(['0', '1', '2']);
    expect(result.audioMapping).toMatchObject({
      startSamplePosition: {
        numerator: '0', denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME',
      },
      endExclusiveSamplePosition: {
        numerator: '4800', denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME',
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('conforms 24000/1001 source to 30000/1001 project by covering presentation', () => {
    const sourceBinding = binding({
      sourceTimebase: { numerator: '1', denominator: '24000' },
      sourceCadence: { kind: 'CFR', durationTicks: '1001' },
      sourceEndExclusivePresentationTimestampTicks: String(20 * 1001),
      totalSourceFrameCount: '20',
    });
    const result = createVideoSourceTimestampConformV2(conformInput({
      sourceBinding,
      projectRate: { numerator: '30000', denominator: '1001' },
      epochs: [epoch({
        secondsPerSourceTick: sourceBinding.sourceTimebase,
        sourceEndExclusivePresentationTimestampTicks: String(20 * 1001),
      })],
      sourceFrames: contiguousFrames({ count: 20, durationTicks: '1001' }),
      timelineFrameQueries: Array.from({ length: 10 }, (_, index) => String(index)),
    }));

    expect(result.frameSelections.map(({ sourceFrameOrdinal }) => sourceFrameOrdinal))
      .toEqual(['0', '0', '1', '2', '3', '4', '4', '5', '6', '7']);
  });

  it('conforms 30000/1001 source to 30fps without accumulating a decimal-rate guess', () => {
    const sourceBinding = binding({
      sourceTimebase: { numerator: '1', denominator: '30000' },
      sourceCadence: { kind: 'CFR', durationTicks: '1001' },
      sourceEndExclusivePresentationTimestampTicks: String(1003 * 1001),
      totalSourceFrameCount: '1003',
    });
    const result = createVideoSourceTimestampConformV2(conformInput({
      sourceBinding,
      projectRate: { numerator: '30', denominator: '1' },
      epochs: [epoch({
        secondsPerSourceTick: sourceBinding.sourceTimebase,
        sourceEndExclusivePresentationTimestampTicks: String(1003 * 1001),
      })],
      sourceFrames: contiguousFrames({ count: 1003, durationTicks: '1001' }),
      timelineFrameQueries: ['0', '1', '1001'],
    }));

    expect(result.frameSelections.map(({ sourceFrameOrdinal }) => sourceFrameOrdinal))
      .toEqual(['0', '0', '1000']);
  });

  it('uses exact VFR intervals and preserves a negative source PTS anchor', () => {
    const vfrBinding = binding({
      sourceTimebase: { numerator: '1', denominator: '1000' },
      sourceCadence: { kind: 'VFR' },
      sourceStartPresentationTimestampTicks: '-40',
      sourceEndExclusivePresentationTimestampTicks: '80',
      totalSourceFrameCount: '3',
    });
    const result = createVideoSourceTimestampConformV2(conformInput({
      sourceBinding: vfrBinding,
      projectRate: { numerator: '25', denominator: '1' },
      epochs: [epoch({
        secondsPerSourceTick: vfrBinding.sourceTimebase,
        sourceStartPresentationTimestampTicks: '-40',
        sourceEndExclusivePresentationTimestampTicks: '80',
      })],
      sourceFrames: contiguousFrames({
        count: 3, startPts: -40, durations: ['40', '20', '60'],
      }),
      sourceAnchor: sourceAnchor(vfrBinding, '-40'),
      timelineFrameQueries: ['0', '1', '2'],
    }));

    expect(result.frameSelections.map(({ sourceFrameOrdinal }) => sourceFrameOrdinal))
      .toEqual(['0', '1', '2']);
    expect(result.frameSelections[0]!.presentationTimestampTicks).toBe('-40');
  });

  it('uses the explicitly named later epoch at a half-open timestamp reset boundary', () => {
    const resetBinding = binding({
      sourceCadence: { kind: 'VFR' },
      totalSourceFrameCount: '2',
    });
    const first = epoch({
      epochId: 'epoch-1', sourceStartPresentationTimestampTicks: '0',
      sourceEndExclusivePresentationTimestampTicks: '3000',
    });
    const second = epoch({
      epochId: 'epoch-2', sourceStartPresentationTimestampTicks: '-9000',
      sourceEndExclusivePresentationTimestampTicks: '-6000',
      canonicalStartTime: { ticks: '1', timescale: '30' },
      boundaryKind: 'TIMESTAMP_RESET',
    });
    const result = createVideoSourceTimestampConformV2(conformInput({
      sourceBinding: resetBinding,
      epochs: [first, second],
      sourceFrames: [
        frame('0', 'epoch-1', '0', '3000'),
        frame('1', 'epoch-2', '-9000', '3000'),
      ],
      sourceAnchor: sourceAnchor(resetBinding, '0', 'epoch-1'),
      timelineFrameQueries: ['0', '1'],
    }));

    expect(result.frameSelections).toMatchObject([
      { epochId: 'epoch-1', sourceFrameOrdinal: '0' },
      { epochId: 'epoch-2', sourceFrameOrdinal: '1' },
    ]);
  });

  it('reports fractional audio boundaries without rounding them into video frames', () => {
    const result = createVideoSourceTimestampConformV2(conformInput({
      projectRate: { numerator: '30000', denominator: '1001' },
      timelineFrameQueries: ['0'],
      audio: {
        sourceRange: {
          startSampleFrame: '0', endExclusiveSampleFrame: '48000', sampleRate: '48000',
        },
        sourceAnchorSampleFrame: '0',
        endExclusiveTimelineFrame: '1',
      },
    }));

    expect(result.audioMapping?.endExclusiveSamplePosition).toEqual({
      numerator: '8008', denominator: '5', disposition: 'BETWEEN_SAMPLE_FRAMES',
    });
  });

  it('fails closed for unqualified proxy mapping, undeclared PTS gaps and uncovered queries', () => {
    expect(() => createVideoSourceTimestampConformV2(conformInput({
      proxyMasterMapping: { disposition: 'UNQUALIFIED', relationSha256: 'f'.repeat(64) },
    }))).toThrow('VIDEO_SOURCE_CONFORM_PROXY_MASTER_MAPPING_REQUIRED');

    expect(() => createVideoSourceTimestampConformV2(conformInput({
      sourceFrames: [
        frame('0', 'epoch-1', '0', '3000'),
        frame('1', 'epoch-1', '6000', '3000'),
      ],
    }))).toThrow('VIDEO_SOURCE_CONFORM_UNDECLARED_DISCONTINUITY');

    expect(() => createVideoSourceTimestampConformV2(conformInput({
      timelineFrameQueries: ['100'],
    }))).toThrow('VIDEO_SOURCE_CONFORM_QUERY_OUTSIDE_WINDOW');
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
    sourceCadence: { kind: 'CFR' as const, durationTicks: '3000' },
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: String(200 * 3000),
    totalSourceFrameCount: '200',
    ...overrides,
  };
  return { ...material, bindingSha256: hashEditronCanonicalJsonV1(material) };
}

function revision(value: number, compatibilityUpdatedAt: string) {
  return { schemaVersion: 1 as const, value, compatibilityUpdatedAt };
}

type TimestampConformInput = Parameters<typeof createVideoSourceTimestampConformV2>[0];

function conformInput(overrides: Partial<TimestampConformInput> = {}): TimestampConformInput {
  const sourceBinding = overrides.sourceBinding ?? binding();
  const durationTicks = sourceBinding.sourceCadence.kind === 'CFR'
    ? sourceBinding.sourceCadence.durationTicks
    : '3000';
  return {
    sourceBinding,
    presentationWindowEvidenceSha256: 'e'.repeat(64),
    presentationWindowEvidenceStatus: 'PRE_RESOLVED_FIXTURE_ONLY',
    streamId: 'video-0',
    epochs: [epoch({
      secondsPerSourceTick: sourceBinding.sourceTimebase,
      sourceStartPresentationTimestampTicks: sourceBinding.sourceStartPresentationTimestampTicks,
      sourceEndExclusivePresentationTimestampTicks: sourceBinding.sourceEndExclusivePresentationTimestampTicks,
    })],
    sourceFrames: contiguousFrames({ count: 10, durationTicks }),
    projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '0',
    timelineFrameQueries: ['0', '1', '2'],
    sourceAnchor: sourceAnchor(
      sourceBinding,
      sourceBinding.sourceStartPresentationTimestampTicks,
    ),
    resourcePolicy: {
      policyVersion: 'timestamp-conform-fixture-v1',
      maxSourceFrames: 5000,
      maxFrameQueries: 100,
    },
    ...overrides,
  };
}

function epoch(overrides: Partial<PresentationEpochV1> = {}): PresentationEpochV1 {
  return { ...epochBase(), ...overrides };
}

function epochBase(): PresentationEpochV1 {
  return {
    schemaVersion: 1 as const,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch' as const,
    epochId: 'epoch-1',
    streamId: 'video-0',
    secondsPerSourceTick: { numerator: '1', denominator: '90000' },
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: String(200 * 3000),
    canonicalStartTime: { ticks: '0', timescale: '1' },
    boundaryKind: 'INITIAL' as const,
  };
}

function sourceAnchor(
  sourceBinding: VerifiedVideoSourceTimeBindingV1,
  presentationTimestampTicks: string,
  epochId = 'epoch-1',
) {
  return {
    sourceVersionSha256: sourceBinding.sourceVersionSha256,
    streamId: 'video-0',
    epochId,
    presentationTimestampTicks,
    secondsPerSourceTick: sourceBinding.sourceTimebase,
  };
}

function contiguousFrames(input: {
  count: number;
  durationTicks?: string;
  durations?: readonly string[];
  startPts?: number;
  epochId?: string;
}): VideoSourceTimestampConformFrameV2[] {
  const frames: VideoSourceTimestampConformFrameV2[] = [];
  let pts = BigInt(input.startPts ?? 0);
  for (let index = 0; index < input.count; index += 1) {
    const durationTicks = input.durations?.[index] ?? input.durationTicks ?? '3000';
    frames.push(frame(String(index), input.epochId ?? 'epoch-1', pts.toString(), durationTicks));
    pts += BigInt(durationTicks);
  }
  return frames;
}

function frame(
  sourceFrameOrdinal: string,
  epochId: string,
  presentationTimestampTicks: string,
  durationTicks: string,
): VideoSourceTimestampConformFrameV2 {
  return { sourceFrameOrdinal, epochId, presentationTimestampTicks, durationTicks };
}
