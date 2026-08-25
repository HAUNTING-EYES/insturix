import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  verifyMediaSourcePtsCadenceManifestIndexV2,
  type MediaSourcePtsCadenceFrameBatchReaderV2,
} from './media-source-pts-cadence-index-verifier-v2';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import {
  mediaSourcePtsCadenceMapBindingSha256V1,
} from './media-source-pts-cadence-map-lifecycle-v1';
import {
  createMediaSourcePtsCadenceShardV1,
  type MediaSourcePtsCadenceMapperV1,
} from './media-source-pts-cadence-shard-v1';
import type { MediaSourcePtsCadenceManifestIndexSerializationV2 } from './media-source-pts-cadence-manifest-index-v2';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_V2' as const;

export type MediaSourcePtsCadenceSourceCoverageV2 = {
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_KIND_V2;
  coveragePolicyVersion: string;
  mapBindingSha256: string;
  sourceStartPresentationTimestampTicks: string;
  sourceEndExclusivePresentationTimestampTicks: string;
  coverageSha256: string;
};

export type MediaSourcePtsCadenceSourceCoverageVerificationV2 =
  | Readonly<{
      disposition: 'SOURCE_PRESENTATION_COVERAGE_VERIFIED';
      coverageSha256: string;
      indexVerificationSha256: string;
      mapBindingSha256: string;
      sourceCadence: Readonly<
        | { kind: 'CFR'; durationTicks: string }
        | { kind: 'VFR' }
      >;
      sourceStartPresentationTimestampTicks: string;
      sourceEndExclusivePresentationTimestampTicks: string;
      sourcePresentationCoverageSha256: string;
    }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason:
        | 'SOURCE_COVERAGE_INVALID'
        | 'INDEX_INTEGRITY_UNVERIFIABLE'
        | 'MAP_BINDING_MISMATCH'
        | 'SOURCE_RANGE_INCOMPLETE';
      indexReason?: string;
    }>;

/**
 * Creates the expected presentation boundary from the already qualified
 * source/stream. A caller cannot replace this with project FPS or a URL.
 */
export function createMediaSourcePtsCadenceSourceCoverageV2(input: {
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  videoStreamIndex: number;
  mapper: MediaSourcePtsCadenceMapperV1;
  coveragePolicyVersion: string;
}): Readonly<MediaSourcePtsCadenceSourceCoverageV2> {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  const videoStreamIndex = nonNegativeSafeInteger(
    input.videoStreamIndex,
    'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_STREAM_INVALID',
  );
  const observation = input.qualification?.observation;
  const stream = observation?.videoStreams.find(({ streamIndex }) => streamIndex === videoStreamIndex);
  const start = signedIntegerText(
    stream?.sourceStartPts,
    'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_START_UNAVAILABLE',
  );
  const duration = positiveIntegerText(
    stream?.sourceDurationTicks,
    'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_DURATION_UNAVAILABLE',
  );
  // The canonical map binding excludes shard sequence and frame evidence. This
  // one-tick descriptor only reuses its existing source/qualification/mapper
  // validation; it neither persists nor claims a real frame batch.
  const bindingShard = createMediaSourcePtsCadenceShardV1({
    sourceVersion,
    qualification: input.qualification,
    videoStreamIndex,
    mapper: input.mapper,
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames: [{ presentationTimestampTicks: start, durationTicks: '1' }],
  });
  const material = {
    schemaVersion: 2 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_KIND_V2,
    coveragePolicyVersion: boundedText(
      input.coveragePolicyVersion,
      'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_POLICY_INVALID',
    ),
    mapBindingSha256: mediaSourcePtsCadenceMapBindingSha256V1(bindingShard),
    sourceStartPresentationTimestampTicks: start,
    sourceEndExclusivePresentationTimestampTicks: (BigInt(start) + BigInt(duration)).toString(),
  };
  return frozen({ ...material, coverageSha256: hashEditronCanonicalJsonV1(material) });
}

/**
 * Promotes an injected-reader result only when the indexed range exactly spans
 * the qualified stream's presentation range. It does not persist a map.
 */
export async function verifyMediaSourcePtsCadenceSourceCoverageV2(input: {
  coverage: MediaSourcePtsCadenceSourceCoverageV2;
  manifestIndex: Readonly<MediaSourcePtsCadenceManifestIndexSerializationV2>;
  reader: MediaSourcePtsCadenceFrameBatchReaderV2;
}): Promise<MediaSourcePtsCadenceSourceCoverageVerificationV2> {
  let coverage: Readonly<MediaSourcePtsCadenceSourceCoverageV2>;
  try {
    coverage = assertMediaSourcePtsCadenceSourceCoverageV2(input.coverage);
  } catch {
    return frozen({ disposition: 'UNVERIFIABLE', reason: 'SOURCE_COVERAGE_INVALID' as const });
  }
  const indexResult = await verifyMediaSourcePtsCadenceManifestIndexV2({
    manifestIndex: input.manifestIndex,
    reader: input.reader,
  });
  if (indexResult.disposition !== 'INDEX_INTEGRITY_VERIFIED') {
    return frozen({
      disposition: 'UNVERIFIABLE',
      reason: 'INDEX_INTEGRITY_UNVERIFIABLE' as const,
      indexReason: indexResult.reason,
    });
  }
  if (indexResult.mapBindingSha256 !== coverage.mapBindingSha256) {
    return frozen({ disposition: 'UNVERIFIABLE', reason: 'MAP_BINDING_MISMATCH' as const });
  }
  if (indexResult.indexedRange.startPresentationTimestampTicks
    !== coverage.sourceStartPresentationTimestampTicks
    || indexResult.indexedRange.endExclusivePresentationTimestampTicks
      !== coverage.sourceEndExclusivePresentationTimestampTicks) {
    return frozen({ disposition: 'UNVERIFIABLE', reason: 'SOURCE_RANGE_INCOMPLETE' as const });
  }
  const material = {
    disposition: 'SOURCE_PRESENTATION_COVERAGE_VERIFIED' as const,
    coverageSha256: coverage.coverageSha256,
    indexVerificationSha256: indexResult.verificationSha256,
    mapBindingSha256: coverage.mapBindingSha256,
    sourceCadence: indexResult.observedCadence.kind === 'UNIFORM_INDEXED_RANGE'
      ? { kind: 'CFR' as const, durationTicks: indexResult.observedCadence.durationTicks }
      : { kind: 'VFR' as const },
    sourceStartPresentationTimestampTicks: coverage.sourceStartPresentationTimestampTicks,
    sourceEndExclusivePresentationTimestampTicks: coverage.sourceEndExclusivePresentationTimestampTicks,
  };
  return frozen({
    ...material,
    sourcePresentationCoverageSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaSourcePtsCadenceSourceCoverageV2(
  value: unknown,
): Readonly<MediaSourcePtsCadenceSourceCoverageV2> {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_INVALID');
  exactKeys(record, [
    'coveragePolicyVersion', 'coverageSha256', 'kind', 'mapBindingSha256',
    'schemaVersion', 'sourceEndExclusivePresentationTimestampTicks',
    'sourceStartPresentationTimestampTicks',
  ], 'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_FIELDS_INVALID');
  if (record.schemaVersion !== 2 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_KIND_V2) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_INVALID');
  }
  const material = {
    schemaVersion: 2 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_KIND_V2,
    coveragePolicyVersion: boundedText(record.coveragePolicyVersion, 'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_POLICY_INVALID'),
    mapBindingSha256: sha256(record.mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_BINDING_INVALID'),
    sourceStartPresentationTimestampTicks: signedIntegerText(record.sourceStartPresentationTimestampTicks, 'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_START_INVALID'),
    sourceEndExclusivePresentationTimestampTicks: signedIntegerText(record.sourceEndExclusivePresentationTimestampTicks, 'MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_END_INVALID'),
  };
  if (BigInt(material.sourceEndExclusivePresentationTimestampTicks)
    <= BigInt(material.sourceStartPresentationTimestampTicks)
    || record.coverageSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SOURCE_COVERAGE_HASH_OR_RANGE_INVALID');
  }
  return frozen({ ...material, coverageSha256: record.coverageSha256 as string });
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) throw new Error(code);
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) throw new Error(code);
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function signedIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
