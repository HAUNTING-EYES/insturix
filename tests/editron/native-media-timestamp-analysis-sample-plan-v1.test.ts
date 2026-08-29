import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createNativeMediaTimestampAnalysisSamplePlanV1,
  type NativeMediaTimestampAnalysisSamplePolicyV1,
} from '@/lib/editron/services/native-media-timestamp-analysis-sample-plan-v1';

const POLICY: NativeMediaTimestampAnalysisSamplePolicyV1 = Object.freeze({
  policyVersion: 'EDITRON_ANALYSIS_ONE_SECOND_120_V1',
  sampleIntervalSeconds: { numerator: '1', denominator: '1' },
  maxWindowDurationSeconds: '120',
  maxSampleFrames: 120,
});

describe('native media timestamp analysis sample plan V1', () => {
  it('selects exactly 120 one-second queries across a 30 fps two-minute window', () => {
    const plan = createNativeMediaTimestampAnalysisSamplePlanV1({
      projectRate: { numerator: '30', denominator: '1' },
      timelineStartFrame: '100',
      timelineEndExclusiveFrame: '3700',
      policy: POLICY,
    });

    expect(plan.samples).toHaveLength(120);
    expect(plan.samples[0]).toEqual({
      sampleIndex: 0,
      timelineFrame: '100',
      nominalWindowOffset: { ticks: '0', timescale: '1' },
      projectTime: { ticks: '100', timescale: '30' },
    });
    expect(plan.samples[119]).toMatchObject({
      sampleIndex: 119,
      timelineFrame: '3670',
      nominalWindowOffset: { ticks: '119', timescale: '1' },
    });
    const { samplePlanSha256, ...material } = plan;
    expect(samplePlanSha256).toBe(hashEditronCanonicalJsonV1(material));
    expect(Object.isFrozen(plan.samples[0])).toBe(true);
  });

  it('uses exact rational accumulation for 30000/1001 without decimal drift', () => {
    const plan = createNativeMediaTimestampAnalysisSamplePlanV1({
      projectRate: { numerator: '30000', denominator: '1001' },
      timelineStartFrame: '50',
      timelineEndExclusiveFrame: '3646',
      policy: POLICY,
    });

    expect(plan.samples).toHaveLength(120);
    expect(plan.samples[1]?.timelineFrame).toBe('79');
    expect(plan.samples[100]?.timelineFrame).toBe('3047');
    expect(plan.samples[119]?.timelineFrame).toBe('3616');
    expect(plan.samples[100]?.projectTime).toEqual({
      ticks: String(3047 * 1001),
      timescale: '30000',
    });
  });

  it('keeps one sample for a sub-interval window', () => {
    const plan = createNativeMediaTimestampAnalysisSamplePlanV1({
      projectRate: { numerator: '24', denominator: '1' },
      timelineStartFrame: '8',
      timelineEndExclusiveFrame: '19',
      policy: POLICY,
    });

    expect(plan.samples.map(({ timelineFrame }) => timelineFrame)).toEqual(['8']);
  });

  it.each([
    [
      'NATIVE_MEDIA_ANALYSIS_SAMPLE_WINDOW_LIMIT',
      { projectRate: { numerator: '30', denominator: '1' }, start: '0', end: '3601', policy: POLICY },
    ],
    [
      'NATIVE_MEDIA_ANALYSIS_SAMPLE_COUNT_LIMIT',
      {
        projectRate: { numerator: '30', denominator: '1' }, start: '0', end: '3600',
        policy: { ...POLICY, maxSampleFrames: 119 },
      },
    ],
    [
      'NATIVE_MEDIA_ANALYSIS_SAMPLE_INTERVAL_UNREPRESENTABLE',
      {
        projectRate: { numerator: '1', denominator: '2' }, start: '0', end: '1',
        policy: POLICY,
      },
    ],
    [
      'NATIVE_MEDIA_ANALYSIS_SAMPLE_RATE_INVALID',
      {
        projectRate: { numerator: '60', denominator: '2' }, start: '0', end: '30',
        policy: POLICY,
      },
    ],
    [
      'NATIVE_MEDIA_ANALYSIS_SAMPLE_POLICY_INVALID',
      {
        projectRate: { numerator: '30', denominator: '1' }, start: '0', end: '30',
        policy: { ...POLICY, maxWindowDurationSeconds: '0' },
      },
    ],
  ] as const)('fails closed as %s', (code, value) => {
    expect(() => createNativeMediaTimestampAnalysisSamplePlanV1({
      projectRate: value.projectRate,
      timelineStartFrame: value.start,
      timelineEndExclusiveFrame: value.end,
      policy: value.policy,
    })).toThrow(code);
  });
});
