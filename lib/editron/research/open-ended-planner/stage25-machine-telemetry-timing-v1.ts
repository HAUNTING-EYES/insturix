const SHA256 = /^[a-f0-9]{64}$/;

export const STAGE25_DURATION_KINDS_V1 = [
  'queue',
  'providerFirstToken',
  'providerCompletion',
  'tool',
  'execution',
  'render',
  'proof',
  'reviewReady',
  'humanReview',
  'correction',
  'endToEnd',
] as const;

export type Stage25DurationKindV1 = typeof STAGE25_DURATION_KINDS_V1[number];

export interface Stage25MeasuredDurationSegmentV1 {
  segmentId: string;
  startedAt: string;
  completedAt: string;
  durationMilliseconds: number;
  sourceEvidenceSha256: string;
}

export type Stage25DurationMetricV1 = Readonly<
  | {
      disposition: 'MEASURED';
      segments: readonly Readonly<Stage25MeasuredDurationSegmentV1>[];
      durationMilliseconds: number;
      reason: null;
    }
  | {
      disposition: 'UNAVAILABLE';
      segments: readonly [];
      durationMilliseconds: null;
      reason: string;
    }
>;

export type Stage25DurationMetricsV1 = Readonly<
  Record<Stage25DurationKindV1, Stage25DurationMetricV1>
>;
export interface Stage25RetryRepairCountsV1 {
  providerAttemptCount: number; providerRetryCount: number; modelRepairCount: number;
  renderAttemptCount: number; renderRepairCount: number; humanCorrectionCount: number;
}

type JsonRecord = Record<string, unknown>;

export function normalizeStage25DurationsV1(value: unknown): Stage25DurationMetricsV1 {
  const input = record(value, 'DURATIONS');
  exactKeys(input, STAGE25_DURATION_KINDS_V1, 'DURATIONS');
  const result = Object.fromEntries(STAGE25_DURATION_KINDS_V1.map((kind) => [
    kind,
    normalizeDurationMetric(input[kind], kind),
  ])) as unknown as Stage25DurationMetricsV1;
  validateProviderTiming(result.providerFirstToken, result.providerCompletion);
  requireOrdered(result.reviewReady, result.humanReview, 'REVIEW_READY_TO_HUMAN_REVIEW');
  requireOrdered(result.humanReview, result.correction, 'HUMAN_REVIEW_TO_CORRECTION');
  return result;
}

export function validateStage25TimelineEnvelopeV1(
  durations: Stage25DurationMetricsV1,
  issuedAt: string,
): void {
  if (durations.endToEnd.disposition !== 'MEASURED') fail('END_TO_END_DURATION_REQUIRED');
  const envelope = durations.endToEnd.segments[0];
  for (const kind of STAGE25_DURATION_KINDS_V1.filter((item) => item !== 'endToEnd')) {
    const metric = durations[kind];
    if (metric.disposition !== 'MEASURED') continue;
    for (const segment of metric.segments) {
      if (Date.parse(segment.startedAt) < Date.parse(envelope.startedAt)
        || Date.parse(segment.completedAt) > Date.parse(envelope.completedAt)) {
        fail(`DURATION_${kind}_OUTSIDE_END_TO_END`);
      }
    }
  }
  if (Date.parse(issuedAt) < Date.parse(envelope.completedAt)) {
    fail('ISSUED_BEFORE_END_TO_END_COMPLETION');
  }
}

export function normalizeStage25RetryRepairV1(
  value: unknown,
  attemptCount: number,
  durations: Stage25DurationMetricsV1,
): Stage25RetryRepairCountsV1 {
  const input = record(value, 'RETRY_REPAIR');
  const counts = {
    providerAttemptCount: nonNegativeInteger(input.providerAttemptCount, 'PROVIDER_ATTEMPT_COUNT'),
    providerRetryCount: nonNegativeInteger(input.providerRetryCount, 'PROVIDER_RETRY_COUNT'),
    modelRepairCount: nonNegativeInteger(input.modelRepairCount, 'MODEL_REPAIR_COUNT'),
    renderAttemptCount: nonNegativeInteger(input.renderAttemptCount, 'RENDER_ATTEMPT_COUNT'),
    renderRepairCount: nonNegativeInteger(input.renderRepairCount, 'RENDER_REPAIR_COUNT'),
    humanCorrectionCount: nonNegativeInteger(input.humanCorrectionCount, 'HUMAN_CORRECTION_COUNT'),
  };
  if (counts.providerAttemptCount !== attemptCount
    || counts.providerRetryCount > Math.max(0, attemptCount - 1)
    || counts.renderRepairCount > Math.max(0, counts.renderAttemptCount - 1)
    || (counts.renderAttemptCount === 0 && durations.render.disposition === 'MEASURED')
    || (counts.humanCorrectionCount === 0 && durations.correction.disposition === 'MEASURED')
    || (counts.humanCorrectionCount > 0 && durations.correction.disposition !== 'MEASURED')) {
    fail('RETRY_REPAIR_ARITHMETIC_INVALID');
  }
  return counts;
}

function normalizeDurationMetric(
  value: unknown,
  kind: Stage25DurationKindV1,
): Stage25DurationMetricV1 {
  const metric = record(value, `DURATION_${kind}`);
  if (metric.disposition === 'UNAVAILABLE') {
    if (!Array.isArray(metric.segments) || metric.segments.length
      || metric.durationMilliseconds !== null || !requiredText(metric.reason)) {
      fail(`DURATION_${kind}_UNAVAILABLE_INVALID`);
    }
    return {
      disposition: 'UNAVAILABLE',
      segments: [],
      durationMilliseconds: null,
      reason: metric.reason as string,
    };
  }
  if (metric.disposition !== 'MEASURED' || metric.reason !== null
    || !Array.isArray(metric.segments) || !metric.segments.length) {
    fail(`DURATION_${kind}_INVALID`);
  }
  const segments = metric.segments.map((item) => normalizeSegment(item, kind));
  unique(segments.map(({ segmentId }) => segmentId), `DURATION_${kind}_SEGMENT`);
  const chronological = [...segments].sort((left, right) => (
    Date.parse(left.startedAt) - Date.parse(right.startedAt)
  ));
  for (let index = 1; index < chronological.length; index += 1) {
    if (Date.parse(chronological[index].startedAt)
      < Date.parse(chronological[index - 1].completedAt)) {
      fail(`DURATION_${kind}_SEGMENTS_OVERLAP`);
    }
  }
  const total = safeSum(segments.map(({ durationMilliseconds }) => durationMilliseconds), kind);
  if (metric.durationMilliseconds !== total || total <= 0) {
    fail(`DURATION_${kind}_ARITHMETIC_INVALID`);
  }
  if (kind === 'endToEnd' && segments.length !== 1) {
    fail('DURATION_END_TO_END_SEGMENT_COUNT_INVALID');
  }
  return { disposition: 'MEASURED', segments, durationMilliseconds: total, reason: null };
}

function normalizeSegment(value: unknown, kind: Stage25DurationKindV1) {
  const segment = record(value, `DURATION_${kind}_SEGMENT`);
  const startedAt = iso(segment.startedAt, `DURATION_${kind}_STARTED_AT`);
  const completedAt = iso(segment.completedAt, `DURATION_${kind}_COMPLETED_AT`);
  const durationMilliseconds = positiveInteger(
    segment.durationMilliseconds,
    `DURATION_${kind}_MILLISECONDS`,
  );
  if (Date.parse(completedAt) - Date.parse(startedAt) !== durationMilliseconds) {
    fail(`DURATION_${kind}_TIMESTAMP_ARITHMETIC_INVALID`);
  }
  return {
    segmentId: identity(segment.segmentId, `DURATION_${kind}_SEGMENT_ID`),
    startedAt,
    completedAt,
    durationMilliseconds,
    sourceEvidenceSha256: sha(segment.sourceEvidenceSha256, `DURATION_${kind}_SOURCE`),
  };
}

function validateProviderTiming(
  firstToken: Stage25DurationMetricV1,
  completion: Stage25DurationMetricV1,
): void {
  if (firstToken.disposition !== 'MEASURED' || completion.disposition !== 'MEASURED') return;
  const completions = new Map(completion.segments.map((segment) => [segment.segmentId, segment]));
  if (completions.size !== firstToken.segments.length) {
    fail('PROVIDER_TIMING_SEGMENT_SET_INVALID');
  }
  for (const segment of firstToken.segments) {
    const complete = completions.get(segment.segmentId);
    if (!complete || complete.startedAt !== segment.startedAt
      || Date.parse(segment.completedAt) > Date.parse(complete.completedAt)) {
      fail('PROVIDER_TIMING_RELATIONSHIP_INVALID');
    }
  }
}

function requireOrdered(
  left: Stage25DurationMetricV1,
  right: Stage25DurationMetricV1,
  label: string,
): void {
  if (left.disposition !== 'MEASURED' || right.disposition !== 'MEASURED') return;
  const leftEnd = Math.max(...left.segments.map(({ completedAt }) => Date.parse(completedAt)));
  const rightStart = Math.min(...right.segments.map(({ startedAt }) => Date.parse(startedAt)));
  if (rightStart < leftEnd) fail(`${label}_ORDER_INVALID`);
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) fail(`${label}_FIELDS_INVALID`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as JsonRecord;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label}_HASH_INVALID`);
  return value;
}

function iso(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  try {
    if (new Date(value).toISOString() !== value) fail(`${label}_INVALID`);
  } catch {
    fail(`${label}_INVALID`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(`${label}_INVALID`);
  return Number(value);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`);
  return Number(value);
}

function safeSum(values: readonly number[], label: string): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total < 0) fail(`DURATION_${label}_OVERFLOW`);
  return total;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label}_DUPLICATE`);
}

function requiredText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= 2_000;
}

function fail(code: string): never {
  throw new Error(`STAGE25_MACHINE_TELEMETRY_${code}`);
}
