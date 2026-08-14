import { describe, expect, it } from 'vitest';

import {
  parseFfmpegPhotosensitivityMetadataV1,
  summarizeFfmpegPhotosensitivityObservationsV1,
} from '@/lib/editron/research/open-ended-planner/generated-composition-temporal-safety-v1';

describe('open-ended planner V2 generated-composition temporal safety evidence', () => {
  it('requires every ordered frame and preserves the complete FFmpeg heuristic observations', () => {
    const observations = parseFfmpegPhotosensitivityMetadataV1(metadata([
      [0.2, 0.2], [0.4, 0.3], [1.2, 0.7], [1.1, 0.6], [0.3, 0.2],
    ]), 5);
    expect(observations).toHaveLength(5);
    expect(observations.map(({ frame, ptsTime }) => ({ frame, ptsTime }))).toEqual([
      { frame: 0, ptsTime: 0 }, { frame: 1, ptsTime: 0.0333333 }, { frame: 2, ptsTime: 0.0666667 },
      { frame: 3, ptsTime: 0.1 }, { frame: 4, ptsTime: 0.1333333 },
    ]);
    expect(summarizeFfmpegPhotosensitivityObservationsV1(observations, 1)).toEqual({
      threshold: 1, peakFrame: 2, peakBadness: 1.2, maximumFrameBadness: 0.7,
      thresholdExceedanceFrames: 2,
      riskIntervals: [{ startFrame: 2, endFrame: 3, peakFrame: 2, peakBadness: 1.2 }],
    });
  });

  it('rejects partial, reordered, and non-finite metadata instead of producing a false screen result', () => {
    const complete = metadata([[0.2, 0.2], [0.3, 0.3]]);
    expect(() => parseFfmpegPhotosensitivityMetadataV1(complete.split('\n').slice(0, -2).join('\n'), 2)).toThrow('METADATA_COVERAGE_DRIFT');
    expect(() => parseFfmpegPhotosensitivityMetadataV1(complete.replace('frame:1', 'frame:2'), 2)).toThrow('FRAME_SEQUENCE_DRIFT');
    expect(() => parseFfmpegPhotosensitivityMetadataV1(complete.replace('badness=0.200000', 'badness=NaN'), 2)).toThrow('NUMBER_INVALID');
  });
});

function metadata(values: readonly (readonly [badness: number, frameBadness: number])[]): string {
  return values.map(([badness, frameBadness], frame) => [
    `frame:${frame}    pts:${frame * 3000}    pts_time:${formatTime(frame / 30)}`,
    `lavfi.photosensitivity.badness=${badness.toFixed(6)}`,
    `lavfi.photosensitivity.fixed-badness=${badness.toFixed(6)}`,
    `lavfi.photosensitivity.frame-badness=${frameBadness.toFixed(6)}`,
    'lavfi.photosensitivity.factor=1.000000',
  ].join('\n')).join('\n');
}

function formatTime(value: number): string { return value.toFixed(7).replace(/0+$/, '').replace(/\.$/, '') || '0'; }
