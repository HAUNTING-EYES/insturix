import { z } from 'zod';

import {
  CANONICAL_MEDIA_TIME_MAX_INTEGER_DIGITS_V1,
  classifyRationalRateComponentsV1,
  compareIntegerTextV1,
  rationalRateComponentsSchemaV1,
} from './canonical-media-time-v1';

/**
 * A vocabulary and validation boundary for the future canonical media graph.
 *
 * This module is deliberately unwired: it neither discovers media, resolves a
 * URL, writes a project, maps timestamps, nor grants an operation permission.
 * Existing ingest, media, and project owners remain authoritative until a
 * separately reviewed migration consumes this value through those owners.
 */
export const EDITORIAL_MEDIA_IDENTITY_CONTRACT_VERSION_V1 =
  'EDITRON_EDITORIAL_MEDIA_IDENTITY_CONTRACT_V1' as const;

const identifier = z.string().trim().min(1).max(256);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const positiveIntegerText = z.string()
  .max(CANONICAL_MEDIA_TIME_MAX_INTEGER_DIGITS_V1)
  .regex(/^[1-9]\d*$/);
const nonNegativeIntegerText = z.string()
  .max(CANONICAL_MEDIA_TIME_MAX_INTEGER_DIGITS_V1)
  .regex(/^(0|[1-9]\d*)$/);

const artifactReference = z.object({
  artifactId: identifier,
  version: identifier,
  digest: z.object({
    algorithm: z.literal('sha-256'),
    value: sha256,
  }).strict(),
}).strict();

const rationalRate = rationalRateComponentsSchemaV1;

const tickRange = z.object({
  startTick: nonNegativeIntegerText,
  endExclusiveTick: nonNegativeIntegerText,
}).strict();

const sourceTimebase = z.object({
  timebaseId: identifier,
  version: identifier,
  coordinateDomain: z.literal('SOURCE_PTS'),
  ticksPerSecond: rationalRate,
}).strict();

const reelTimecode = z.object({
  reelId: identifier,
  start: z.string().regex(/^\d{2}:\d{2}:\d{2}[:;]\d{2}$/),
  rate: rationalRate,
  dropFrame: z.boolean(),
  evidence: artifactReference,
}).strict();

const cfrCadence = z.object({
  kind: z.literal('CFR'),
  frameRate: rationalRate,
  frameCount: positiveIntegerText,
}).strict();

const vfrCadence = z.object({
  kind: z.literal('VFR'),
  nominalFrameRate: rationalRate,
  /** Immutable probe output; a VFR source is never treated as uniform CFR. */
  ptsMapping: artifactReference,
}).strict();

const sourceProxyMapping = z.object({
  proxy: artifactReference,
  mappingArtifact: artifactReference,
  coordinateMapping: z.enum([
    'SOURCE_PTS_TO_PROXY_TICK',
    'SOURCE_PTS_TO_PROJECT_TICK',
  ]),
}).strict();

const audioStream = z.object({
  streamId: identifier,
  sampleRate: positiveIntegerText,
  sampleCount: nonNegativeIntegerText,
  channelCount: z.number().int().positive().max(64),
  channelLayout: identifier,
  codec: identifier,
}).strict();

const qualifiedIdentity = z.object({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(EDITORIAL_MEDIA_IDENTITY_CONTRACT_VERSION_V1),
  kind: z.literal('editorial-media-identity'),
  status: z.literal('UNWIRED_CONTRACT_ONLY'),
  identityStatus: z.literal('QUALIFIED'),
  operationEligibility: z.enum([
    'REFERENCE_ONLY',
    'PRECISE_TIMELINE',
    'CONFORM',
  ]),
  media: z.object({
    assetId: identifier,
    version: identifier,
    contentDigest: z.object({ algorithm: z.literal('sha-256'), value: sha256 }).strict(),
    ingestReceipt: artifactReference,
  }).strict(),
  source: z.object({
    timebase: sourceTimebase,
    range: tickRange,
    cadence: z.discriminatedUnion('kind', [cfrCadence, vfrCadence]),
    reelTimecode,
    video: z.object({
      codedWidth: z.number().int().positive(),
      codedHeight: z.number().int().positive(),
      pixelAspectRatio: rationalRate,
      codec: identifier,
      colorPrimaries: identifier,
      transfer: identifier,
      matrix: identifier,
      range: z.enum(['FULL', 'LIMITED', 'UNSPECIFIED']),
    }).strict().nullable(),
    audioStreams: z.array(audioStream),
  }).strict(),
  sourceToProxyMappings: z.array(sourceProxyMapping),
}).strict();

const legacyIdentity = z.object({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(EDITORIAL_MEDIA_IDENTITY_CONTRACT_VERSION_V1),
  kind: z.literal('editorial-media-identity'),
  status: z.literal('UNWIRED_CONTRACT_ONLY'),
  identityStatus: z.literal('UNQUALIFIED_LEGACY'),
  operationEligibility: z.literal('REFERENCE_ONLY'),
  legacyMedia: z.object({
    assetId: identifier,
    fps: z.number().finite().positive(),
    durationInFrames: z.number().int().nonnegative(),
    reasonCodes: z.array(identifier).min(1),
  }).strict(),
}).strict();

export const editorialMediaIdentityContractSchemaV1 = z.discriminatedUnion(
  'identityStatus',
  [qualifiedIdentity, legacyIdentity],
);

export type EditorialMediaIdentityContractV1 = z.infer<
  typeof editorialMediaIdentityContractSchemaV1
>;

export type EditorialMediaIdentityVerificationV1 =
  | {
      readonly status: 'PASS';
      readonly diagnostics: readonly [];
      readonly value: EditorialMediaIdentityContractV1;
    }
  | {
      readonly status: 'FAIL';
      readonly diagnostics: readonly string[];
    };

export class EditorialMediaIdentityValidationErrorV1 extends Error {
  constructor(readonly diagnostics: readonly string[]) {
    super(`Editorial media identity validation failed: ${diagnostics.join(', ')}`);
    this.name = 'EditorialMediaIdentityValidationErrorV1';
  }
}

/**
 * Validates a supplied value only. This is not an ingest probe, PTS mapper,
 * asset resolver, project mutation command, or operation authorization check.
 */
export function verifyEditorialMediaIdentityContractV1(
  input: unknown,
): EditorialMediaIdentityVerificationV1 {
  const parsed = editorialMediaIdentityContractSchemaV1.safeParse(input);
  if (!parsed.success) return { status: 'FAIL', diagnostics: ['SCHEMA_INVALID'] };

  const value = parsed.data;
  if (value.identityStatus === 'UNQUALIFIED_LEGACY') {
    return { status: 'PASS', diagnostics: [], value };
  }

  const diagnostics: string[] = [];
  const { source } = value;
  for (const [label, rate] of [
    ['SOURCE_TIMEBASE_RATE', source.timebase.ticksPerSecond],
    ['REEL_TIMECODE_RATE', source.reelTimecode.rate],
    ['PIXEL_ASPECT_RATIO', source.video?.pixelAspectRatio],
    ['CADENCE_RATE', source.cadence.kind === 'CFR'
      ? source.cadence.frameRate
      : source.cadence.nominalFrameRate],
  ] as const) {
    if (!rate) continue;
    const rateStatus = validateReducedRate(rate);
    if (rateStatus) diagnostics.push(`${label}_${rateStatus}`);
  }

  const rangeStatus = validateStrictlyIncreasingRange(source.range);
  if (rangeStatus) diagnostics.push(rangeStatus);
  if (source.reelTimecode.dropFrame !== source.reelTimecode.start.includes(';')) {
    diagnostics.push('REEL_TIMECODE_DELIMITER_MISMATCH');
  }
  if (source.cadence.kind === 'VFR' && !hasSourcePtsMapping(value)) {
    diagnostics.push('VFR_PTS_MAPPING_UNBOUND');
  }
  if (value.operationEligibility !== 'REFERENCE_ONLY' && value.sourceToProxyMappings.length === 0) {
    diagnostics.push('PRECISE_OPERATION_PROXY_MAPPING_REQUIRED');
  }
  if (new Set(source.audioStreams.map(({ streamId }) => streamId)).size !== source.audioStreams.length) {
    diagnostics.push('AUDIO_STREAM_ID_DUPLICATE');
  }

  return diagnostics.length === 0
    ? { status: 'PASS', diagnostics: [], value }
    : { status: 'FAIL', diagnostics };
}

export function parseEditorialMediaIdentityContractV1(
  input: unknown,
): EditorialMediaIdentityContractV1 {
  const verification = verifyEditorialMediaIdentityContractV1(input);
  if (verification.status === 'FAIL') {
    throw new EditorialMediaIdentityValidationErrorV1(verification.diagnostics);
  }
  return verification.value;
}

function hasSourcePtsMapping(value: Extract<EditorialMediaIdentityContractV1, {
  identityStatus: 'QUALIFIED';
}>): boolean {
  return value.sourceToProxyMappings.some(({ coordinateMapping }) =>
    coordinateMapping === 'SOURCE_PTS_TO_PROXY_TICK'
    || coordinateMapping === 'SOURCE_PTS_TO_PROJECT_TICK');
}

function validateStrictlyIncreasingRange(
  range: { startTick: string; endExclusiveTick: string },
): 'SOURCE_RANGE_INVALID' | null {
  return compareIntegerTextV1(range.startTick, range.endExclusiveTick) < 0
    ? null
    : 'SOURCE_RANGE_INVALID';
}

function validateReducedRate(
  rate: { numerator: string; denominator: string },
): 'NOT_REDUCED' | null {
  return classifyRationalRateComponentsV1(rate) === 'VALID_REDUCED'
    ? null
    : 'NOT_REDUCED';
}
