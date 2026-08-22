import { describe, expect, it } from 'vitest';

import {
  evaluateStage25DependencyVisualMeasurementsV1,
  executeStage25DependencyRenderProofV1,
  type Stage25DependencyVisualMeasurementsV1,
} from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-render-proof-v1';

const PASSING: Stage25DependencyVisualMeasurementsV1 = {
  boundarySamples: [
    { frame: 118, rgb: [33, 82, 145] },
    { frame: 119, rgb: [111, 54, 124] },
    { frame: 238, rgb: [111, 54, 124] },
    { frame: 239, rgb: [40, 125, 88] },
  ],
  boundaryMeanAbsDiffs: [45, 31],
  initialToFilteredMeanAbsDiff: 9,
  scale1CreamBounds: {
    left: 76, right: 524, top: 115, bottom: 245,
    width: 449, height: 131, centerX: 300, centerY: 180,
  },
  scale108CreamBounds: {
    left: 43, right: 527, top: 110, bottom: 250,
    width: 485, height: 141, centerX: 285, centerY: 180,
  },
  widthScaleRatio: 1.080178,
  heightScaleRatio: 1.076336,
  centerShiftX: -15,
  centerShiftY: 0,
};

describe('Stage 2.5 dependency rendered-proof policy', () => {
  it('accepts only visible cuts, treatment, push-in, and right-biased focal geometry', () => {
    expect(evaluateStage25DependencyVisualMeasurementsV1(PASSING)).toEqual({
      assessment: 'PASS', diagnostics: [],
    });
  });

  it('fails closed when a claimed rendered effect is absent or mistimed', () => {
    const missing = structuredClone(PASSING);
    missing.boundaryMeanAbsDiffs = [0, 0];
    missing.initialToFilteredMeanAbsDiff = 0;
    missing.widthScaleRatio = 1;
    missing.heightScaleRatio = 1;
    missing.centerShiftX = 0;
    expect(evaluateStage25DependencyVisualMeasurementsV1(missing)).toEqual({
      assessment: 'FAIL', diagnostics: [
        'CUT_BOUNDARY_NOT_VISIBLE', 'FILTER_NOT_VISIBLE',
        'PUSH_IN_GEOMETRY_INVALID', 'FOCAL_ORIGIN_GEOMETRY_INVALID',
      ],
    });
  });

  it('rejects a forged source-row identity before rendering', async () => {
    await expect(executeStage25DependencyRenderProofV1({
      sourceRow: { rowId: 'openai_luna-p1' },
      expectedSourceRowSha256: 'f'.repeat(64),
      outputDir: '.calibration-temp/should-not-be-created',
      executionId: 'forged-row-test',
      createdAt: '2026-08-23T00:00:00Z',
    })).rejects.toThrow('SOURCE_ROW_IDENTITY_INVALID');
  });
});
