import { z } from 'zod';

/**
 * Pure, lossless time vocabulary for media, timeline, and audio owner
 * boundaries. This module performs no ingest, conform, project mutation, or
 * rendering; those owners must adopt these values in separately verified
 * slices.
 */
export const CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1 =
  'EDITRON_CANONICAL_MEDIA_TIME_CONTRACT_V1' as const;

export const CANONICAL_MEDIA_TIME_MAX_INTEGER_DIGITS_V1 = 128;

const identifier = z.string().trim().min(1).max(256);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const signedIntegerText = z.string().regex(
  new RegExp(`^(0|-?[1-9][0-9]{0,${CANONICAL_MEDIA_TIME_MAX_INTEGER_DIGITS_V1 - 1}})$`),
);
const nonNegativeIntegerText = z.string().regex(
  new RegExp(`^(0|[1-9][0-9]{0,${CANONICAL_MEDIA_TIME_MAX_INTEGER_DIGITS_V1 - 1}})$`),
);
const positiveIntegerText = z.string().regex(
  new RegExp(`^[1-9][0-9]{0,${CANONICAL_MEDIA_TIME_MAX_INTEGER_DIGITS_V1 - 1}}$`),
);

/** Syntactic ratio components. Callers use the classifier/parser for reduction. */
export const rationalRateComponentsSchemaV1 = z.object({
  numerator: positiveIntegerText,
  denominator: positiveIntegerText,
}).strict();

export type ExactRationalRateV1 = Readonly<
  z.infer<typeof rationalRateComponentsSchemaV1>
>;

export const canonicalMediaTimeSchemaV1 = z.object({
  ticks: signedIntegerText,
  timescale: positiveIntegerText,
}).strict();

export type CanonicalMediaTimeV1 = Readonly<z.infer<typeof canonicalMediaTimeSchemaV1>>;

export const audioSampleRangeSchemaV1 = z.object({
  startSampleFrame: nonNegativeIntegerText,
  endExclusiveSampleFrame: positiveIntegerText,
  sampleRate: positiveIntegerText,
}).strict();

export type AudioSampleRangeV1 = Readonly<z.infer<typeof audioSampleRangeSchemaV1>>;

export const sourcePositionSchemaV1 = z.object({
  sourceVersionSha256: sha256,
  streamId: identifier,
  epochId: identifier,
  presentationTimestampTicks: signedIntegerText,
  secondsPerSourceTick: rationalRateComponentsSchemaV1,
}).strict();

export type SourcePositionV1 = Readonly<z.infer<typeof sourcePositionSchemaV1>>;

export const timelinePositionSchemaV1 = z.object({
  projectId: identifier,
  projectRevision: nonNegativeIntegerText,
  sequenceId: identifier,
  time: canonicalMediaTimeSchemaV1,
}).strict();

export type TimelinePositionV1 = Readonly<z.infer<typeof timelinePositionSchemaV1>>;

export const PRESENTATION_EPOCH_BOUNDARY_KINDS_V1 = [
  'INITIAL',
  'TIMESTAMP_RESET',
  'GAP',
  'OVERLAP',
  'WRAP',
  'EDIT_LIST',
] as const;

export const presentationEpochSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1),
  kind: z.literal('presentation-epoch'),
  epochId: identifier,
  streamId: identifier,
  secondsPerSourceTick: rationalRateComponentsSchemaV1,
  sourceStartPresentationTimestampTicks: signedIntegerText,
  sourceEndExclusivePresentationTimestampTicks: signedIntegerText,
  canonicalStartTime: canonicalMediaTimeSchemaV1,
  boundaryKind: z.enum(PRESENTATION_EPOCH_BOUNDARY_KINDS_V1),
}).strict();

export type PresentationEpochV1 = Readonly<z.infer<typeof presentationEpochSchemaV1>>;

export type CanonicalFrameRateReadV1 = Readonly<{
  rate: ExactRationalRateV1;
  provenance: 'EXACT_RATIONAL_V1' | 'LEGACY_NUMERIC_DECIMAL_V1';
  writeEligibility: 'CANONICAL_EXACT' | 'READ_COMPATIBILITY_ONLY';
}>;

export type ExactMediaTimeRescaleV1 = Readonly<
  | { disposition: 'EXACT'; value: CanonicalMediaTimeV1 }
  | {
      disposition: 'NON_INTEGRAL';
      source: CanonicalMediaTimeV1;
      targetTimescale: string;
    }
>;

export class CanonicalMediaTimeValidationErrorV1 extends Error {
  constructor(readonly code: string) {
    super(`Canonical media time validation failed: ${code}`);
    this.name = 'CanonicalMediaTimeValidationErrorV1';
  }
}

export function classifyRationalRateComponentsV1(
  input: unknown,
): 'VALID_REDUCED' | 'SCHEMA_INVALID' | 'NOT_REDUCED' {
  const parsed = rationalRateComponentsSchemaV1.safeParse(input);
  if (!parsed.success) return 'SCHEMA_INVALID';
  return greatestCommonDivisor(
    BigInt(parsed.data.numerator),
    BigInt(parsed.data.denominator),
  ) === BigInt(1)
    ? 'VALID_REDUCED'
    : 'NOT_REDUCED';
}

export function parseExactRationalRateV1(input: unknown): ExactRationalRateV1 {
  const parsed = rationalRateComponentsSchemaV1.safeParse(input);
  if (!parsed.success) fail('RATIONAL_RATE_SCHEMA_INVALID');
  if (classifyRationalRateComponentsV1(parsed.data) !== 'VALID_REDUCED') {
    fail('RATIONAL_RATE_NOT_REDUCED');
  }
  return parsed.data;
}

/**
 * Reads old numeric FPS without silently interpreting 29.97 as 30000/1001.
 * The shortest round-trip decimal is preserved exactly and remains read-only
 * migration input; new writes must supply an explicit reduced rational rate.
 */
export function readCanonicalFrameRateV1(input: unknown): CanonicalFrameRateReadV1 {
  if (typeof input === 'number') return legacyNumericFrameRate(input);
  if (isRecord(input) && input.kind === 'LEGACY_NUMERIC_FPS_V1') {
    return legacyNumericFrameRate(input.fps);
  }
  return {
    rate: parseExactRationalRateV1(input),
    provenance: 'EXACT_RATIONAL_V1',
    writeEligibility: 'CANONICAL_EXACT',
  };
}

export function parseCanonicalMediaTimeV1(input: unknown): CanonicalMediaTimeV1 {
  const parsed = canonicalMediaTimeSchemaV1.safeParse(input);
  if (!parsed.success) fail('MEDIA_TIME_SCHEMA_INVALID');
  return parsed.data;
}

export function parseAudioSampleRangeV1(input: unknown): AudioSampleRangeV1 {
  const parsed = audioSampleRangeSchemaV1.safeParse(input);
  if (!parsed.success) fail('AUDIO_SAMPLE_RANGE_SCHEMA_INVALID');
  if (BigInt(parsed.data.startSampleFrame) >= BigInt(parsed.data.endExclusiveSampleFrame)) {
    fail('AUDIO_SAMPLE_RANGE_NOT_INCREASING');
  }
  return parsed.data;
}

export function parseSourcePositionV1(input: unknown): SourcePositionV1 {
  const parsed = sourcePositionSchemaV1.safeParse(input);
  if (!parsed.success) fail('SOURCE_POSITION_SCHEMA_INVALID');
  parseExactRationalRateV1(parsed.data.secondsPerSourceTick);
  return parsed.data;
}

export function parseTimelinePositionV1(input: unknown): TimelinePositionV1 {
  const parsed = timelinePositionSchemaV1.safeParse(input);
  if (!parsed.success) fail('TIMELINE_POSITION_SCHEMA_INVALID');
  return parsed.data;
}

export function parsePresentationEpochV1(input: unknown): PresentationEpochV1 {
  const parsed = presentationEpochSchemaV1.safeParse(input);
  if (!parsed.success) fail('PRESENTATION_EPOCH_SCHEMA_INVALID');
  parseExactRationalRateV1(parsed.data.secondsPerSourceTick);
  if (compareIntegerTextV1(
    parsed.data.sourceStartPresentationTimestampTicks,
    parsed.data.sourceEndExclusivePresentationTimestampTicks,
  ) >= 0) {
    fail('PRESENTATION_EPOCH_RANGE_NOT_INCREASING');
  }
  return parsed.data;
}

export function compareIntegerTextV1(left: string, right: string): -1 | 0 | 1 {
  const leftValue = parseSignedIntegerText(left);
  const rightValue = parseSignedIntegerText(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function compareCanonicalMediaTimeV1(
  left: CanonicalMediaTimeV1,
  right: CanonicalMediaTimeV1,
): -1 | 0 | 1 {
  const leftValue = parseCanonicalMediaTimeV1(left);
  const rightValue = parseCanonicalMediaTimeV1(right);
  const leftCross = BigInt(leftValue.ticks) * BigInt(rightValue.timescale);
  const rightCross = BigInt(rightValue.ticks) * BigInt(leftValue.timescale);
  return leftCross < rightCross ? -1 : leftCross > rightCross ? 1 : 0;
}

export function rescaleCanonicalMediaTimeExactV1(
  input: CanonicalMediaTimeV1,
  targetTimescale: string,
): ExactMediaTimeRescaleV1 {
  const source = parseCanonicalMediaTimeV1(input);
  const target = positiveIntegerText.safeParse(targetTimescale);
  if (!target.success) fail('TARGET_TIMESCALE_INVALID');
  const numerator = BigInt(source.ticks) * BigInt(target.data);
  const denominator = BigInt(source.timescale);
  if (numerator % denominator !== BigInt(0)) {
    return { disposition: 'NON_INTEGRAL', source, targetTimescale: target.data };
  }
  return {
    disposition: 'EXACT',
    value: parseCanonicalMediaTimeV1({
      ticks: String(numerator / denominator),
      timescale: target.data,
    }),
  };
}

export function mediaTimeFromSourceTicksV1(
  presentationTimestampTicks: string,
  secondsPerSourceTick: ExactRationalRateV1,
): CanonicalMediaTimeV1 {
  const pts = parseSignedIntegerText(presentationTimestampTicks);
  const rate = parseExactRationalRateV1(secondsPerSourceTick);
  return parseCanonicalMediaTimeV1({
    ticks: String(pts * BigInt(rate.numerator)),
    timescale: rate.denominator,
  });
}

/**
 * Converts one source PTS coordinate inside a presentation epoch to the
 * continuous canonical timeline. The epoch end is accepted so callers can
 * represent an end-exclusive frame boundary without flattening a reset.
 */
export function mediaTimeFromPresentationEpochTicksV1(
  epochInput: PresentationEpochV1,
  presentationTimestampTicks: string,
): CanonicalMediaTimeV1 {
  const epoch = parsePresentationEpochV1(epochInput);
  if (compareIntegerTextV1(
    presentationTimestampTicks,
    epoch.sourceStartPresentationTimestampTicks,
  ) < 0 || compareIntegerTextV1(
    presentationTimestampTicks,
    epoch.sourceEndExclusivePresentationTimestampTicks,
  ) > 0) {
    fail('PRESENTATION_EPOCH_TICK_OUTSIDE_RANGE');
  }

  const canonicalStart = parseCanonicalMediaTimeV1(epoch.canonicalStartTime);
  const rate = parseExactRationalRateV1(epoch.secondsPerSourceTick);
  const canonicalTimescale = BigInt(canonicalStart.timescale);
  const rateDenominator = BigInt(rate.denominator);
  const deltaSourceTicks = BigInt(presentationTimestampTicks)
    - BigInt(epoch.sourceStartPresentationTimestampTicks);
  const numerator = BigInt(canonicalStart.ticks) * rateDenominator
    + deltaSourceTicks * BigInt(rate.numerator) * canonicalTimescale;
  const denominator = canonicalTimescale * rateDenominator;
  const divisor = greatestCommonDivisor(numerator, denominator);

  return parseCanonicalMediaTimeV1({
    ticks: String(numerator / divisor),
    timescale: String(denominator / divisor),
  });
}

function legacyNumericFrameRate(value: unknown): CanonicalFrameRateReadV1 {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail('LEGACY_NUMERIC_FRAME_RATE_INVALID');
  }
  const rate = exactRationalFromDecimalText(value.toString());
  return {
    rate,
    provenance: 'LEGACY_NUMERIC_DECIMAL_V1',
    writeEligibility: 'READ_COMPATIBILITY_ONLY',
  };
}

function exactRationalFromDecimalText(value: string): ExactRationalRateV1 {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) fail('LEGACY_NUMERIC_FRAME_RATE_INVALID');
  const integer = match[1]!;
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  if (!Number.isSafeInteger(exponent)) fail('LEGACY_NUMERIC_FRAME_RATE_INVALID');
  let numerator = BigInt(`${integer}${fraction}`);
  let denominator = BigInt(1);
  const decimalPlaces = fraction.length - exponent;
  if (decimalPlaces > 0) denominator = BigInt(10) ** BigInt(decimalPlaces);
  if (decimalPlaces < 0) numerator *= BigInt(10) ** BigInt(-decimalPlaces);
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reduced = {
    numerator: String(numerator / divisor),
    denominator: String(denominator / divisor),
  };
  return parseExactRationalRateV1(reduced);
}

function parseSignedIntegerText(value: unknown): bigint {
  const parsed = signedIntegerText.safeParse(value);
  if (!parsed.success) fail('INTEGER_TEXT_INVALID');
  return BigInt(parsed.data);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right < BigInt(0) ? -right : right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string): never {
  throw new CanonicalMediaTimeValidationErrorV1(code);
}
