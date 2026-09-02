import {
  parseExactRationalRateV1,
  type CanonicalMediaTimeV1,
  type ExactRationalRateV1,
} from '../contracts/canonical-media-time-v1';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SAMPLE_PLAN_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SAMPLE_PLAN_V1' as const;

const MAX_POLICY_SAMPLES = 10_000;
const MAX_POLICY_WINDOW_SECONDS = BigInt(86_400);
const INTEGER_PATTERN = /^(0|[1-9]\d{0,127})$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d{0,127}$/;

export type NativeMediaTimestampAnalysisSamplePolicyV1 = Readonly<{
  policyVersion: string;
  sampleIntervalSeconds: ExactRationalRateV1;
  maxWindowDurationSeconds: string;
  maxSampleFrames: number;
}>;

export type NativeMediaTimestampAnalysisSampleV1 = Readonly<{
  sampleIndex: number;
  timelineFrame: string;
  nominalWindowOffset: CanonicalMediaTimeV1;
  projectTime: CanonicalMediaTimeV1;
}>;

export type NativeMediaTimestampAnalysisSamplePlanV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SAMPLE_PLAN_KIND_V1;
  policy: NativeMediaTimestampAnalysisSamplePolicyV1;
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  timelineEndExclusiveFrame: string;
  samples: readonly NativeMediaTimestampAnalysisSampleV1[];
  samplePlanSha256: string;
}>;

/**
 * Selects the project frame at or immediately before each exact sampling
 * instant. It never converts through floating-point seconds; every emitted
 * frame keeps both its canonical project time and nominal window offset.
 */
export function createNativeMediaTimestampAnalysisSamplePlanV1(input: Readonly<{
  projectRate: ExactRationalRateV1;
  timelineStartFrame: string;
  timelineEndExclusiveFrame: string;
  policy: NativeMediaTimestampAnalysisSamplePolicyV1;
}>): NativeMediaTimestampAnalysisSamplePlanV1 {
  const projectRate = rate(input.projectRate, 'NATIVE_MEDIA_ANALYSIS_SAMPLE_RATE_INVALID');
  const policy = normalizePolicy(input.policy);
  const start = integer(input.timelineStartFrame, false, 'NATIVE_MEDIA_ANALYSIS_SAMPLE_START_INVALID');
  const end = integer(input.timelineEndExclusiveFrame, true, 'NATIVE_MEDIA_ANALYSIS_SAMPLE_END_INVALID');
  if (end <= start) throw new Error('NATIVE_MEDIA_ANALYSIS_SAMPLE_RANGE_INVALID');

  const durationFrames = end - start;
  const rateNumerator = BigInt(projectRate.numerator);
  const rateDenominator = BigInt(projectRate.denominator);
  const maximumSeconds = BigInt(policy.maxWindowDurationSeconds);
  if (durationFrames * rateDenominator > maximumSeconds * rateNumerator) {
    throw new Error('NATIVE_MEDIA_ANALYSIS_SAMPLE_WINDOW_LIMIT');
  }

  const intervalNumerator = BigInt(policy.sampleIntervalSeconds.numerator);
  const intervalDenominator = BigInt(policy.sampleIntervalSeconds.denominator);
  const stepNumerator = rateNumerator * intervalNumerator;
  const stepDenominator = rateDenominator * intervalDenominator;
  if (stepNumerator < stepDenominator) {
    throw new Error('NATIVE_MEDIA_ANALYSIS_SAMPLE_INTERVAL_UNREPRESENTABLE');
  }
  const sampleCount = divideCeiling(durationFrames * stepDenominator, stepNumerator);
  if (sampleCount > BigInt(policy.maxSampleFrames)) {
    throw new Error('NATIVE_MEDIA_ANALYSIS_SAMPLE_COUNT_LIMIT');
  }

  const samples: NativeMediaTimestampAnalysisSampleV1[] = [];
  for (let sampleIndex = BigInt(0); sampleIndex < sampleCount; sampleIndex += BigInt(1)) {
    const timelineFrame = start + (sampleIndex * stepNumerator) / stepDenominator;
    if (timelineFrame >= end
      || (samples.length > 0 && timelineFrame <= BigInt(samples.at(-1)!.timelineFrame))) {
      throw new Error('NATIVE_MEDIA_ANALYSIS_SAMPLE_ORDER_INVALID');
    }
    samples.push({
      sampleIndex: Number(sampleIndex),
      timelineFrame: timelineFrame.toString(),
      nominalWindowOffset: {
        ticks: (sampleIndex * intervalNumerator).toString(),
        timescale: intervalDenominator.toString(),
      },
      projectTime: {
        ticks: (timelineFrame * rateDenominator).toString(),
        timescale: rateNumerator.toString(),
      },
    });
  }
  if (samples.length === 0) throw new Error('NATIVE_MEDIA_ANALYSIS_SAMPLE_COUNT_INVALID');
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_ANALYSIS_SAMPLE_PLAN_KIND_V1,
    policy,
    projectRate,
    timelineStartFrame: start.toString(),
    timelineEndExclusiveFrame: end.toString(),
    samples,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    samplePlanSha256: hashEditronCanonicalJsonV1(material),
  }) as NativeMediaTimestampAnalysisSamplePlanV1;
}

function normalizePolicy(
  value: NativeMediaTimestampAnalysisSamplePolicyV1,
): NativeMediaTimestampAnalysisSamplePolicyV1 {
  const policyVersion = typeof value?.policyVersion === 'string'
    ? value.policyVersion.trim()
    : '';
  if (!policyVersion || policyVersion.length > 256
    || /[\u0000-\u001F\u007F]/.test(policyVersion)
    || !Number.isSafeInteger(value.maxSampleFrames)
    || value.maxSampleFrames < 1 || value.maxSampleFrames > MAX_POLICY_SAMPLES
    || !POSITIVE_INTEGER_PATTERN.test(value.maxWindowDurationSeconds)
    || BigInt(value.maxWindowDurationSeconds) > MAX_POLICY_WINDOW_SECONDS) {
    throw new Error('NATIVE_MEDIA_ANALYSIS_SAMPLE_POLICY_INVALID');
  }
  return {
    policyVersion,
    sampleIntervalSeconds: rate(
      value.sampleIntervalSeconds,
      'NATIVE_MEDIA_ANALYSIS_SAMPLE_INTERVAL_INVALID',
    ),
    maxWindowDurationSeconds: BigInt(value.maxWindowDurationSeconds).toString(),
    maxSampleFrames: value.maxSampleFrames,
  };
}

function rate(value: ExactRationalRateV1, code: string): ExactRationalRateV1 {
  try {
    return parseExactRationalRateV1(value);
  } catch {
    throw new Error(code);
  }
}

function integer(value: unknown, positive: boolean, code: string): bigint {
  const pattern = positive ? POSITIVE_INTEGER_PATTERN : INTEGER_PATTERN;
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(code);
  return BigInt(value);
}

function divideCeiling(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - BigInt(1)) / denominator;
}
