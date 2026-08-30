import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterAudioLineageVerificationReceiptV1,
  type MediaProxyMasterAudioLineageVerificationReceiptV1,
} from './media-proxy-master-audio-lineage-verifier-v1';
import {
  assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1,
  type MediaProxyMasterCorrespondenceV3DerivationReceiptV1,
} from './media-proxy-master-correspondence-v3-derivation-verifier-v1';
import {
  assertMediaProxyMasterMappingSegmentMaterializationReceiptV1,
  type MediaProxyMasterMappingSegmentMaterializationReceiptV1,
} from './media-proxy-master-mapping-segment-materializer-v1';
import {
  assertMediaProxyMasterTimeMappingV1,
  createMediaProxyMasterTimeMappingV1,
  MEDIA_PROXY_MASTER_TIME_MAPPING_OWNER_V1,
  type MediaProxyMasterTimeMapReferenceV1,
  type MediaProxyMasterTimeMappingV1,
} from './media-proxy-master-time-mapping-v1';
import {
  assertMediaProxyMasterTrustedTranscodeReceiptV1,
  mediaProxyMasterMappingLineageFromTranscodeReceiptV1,
  type MediaProxyMasterTrustedTranscodeReceiptV1,
} from './media-proxy-master-trusted-transcode-v1';
import {
  assertMediaProxyMasterRelationV1,
  type MediaProxyMasterRelationV1,
  type MediaSourceVersionReferenceV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_V1' as const;
export const MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_V1' as const;
export const MEDIA_PROXY_MASTER_MAPPING_QUALIFIER_VERSION_V1 =
  'editron-media-proxy-master-mapping-qualifier-v1' as const;
export const MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_POLICY_VERSION_V1 =
  'exact-v3-correspondence-segments-and-audio-lineage-v1' as const;

export type MediaProxyMasterMappingQualificationExecutionReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_KIND_V1;
  disposition: 'QUALIFICATION_INPUTS_VERIFIED';
  qualifierId: typeof MEDIA_PROXY_MASTER_TIME_MAPPING_OWNER_V1;
  qualifierVersion: typeof MEDIA_PROXY_MASTER_MAPPING_QUALIFIER_VERSION_V1;
  qualificationPolicyVersion:
    typeof MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_POLICY_VERSION_V1;
  workerImageDigest: string;
  relationSha256: string;
  trustedTranscodeReceiptSha256: string;
  correspondenceDerivationSha256: string;
  segmentMaterializationSha256: string;
  audioLineageVerificationSha256: string;
  qualifiedAt: string;
  executionReceiptSha256: string;
}>;

export type MediaProxyMasterMappingQualificationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_KIND_V1;
  disposition: 'MAPPING_QUALIFIED';
  relation: Readonly<MediaProxyMasterRelationV1>;
  execution: MediaProxyMasterMappingQualificationExecutionReceiptV1;
  mapping: MediaProxyMasterTimeMappingV1;
  qualificationSha256: string;
}>;

export type MediaProxyMasterMappingQualificationUnverifiableReasonV1 =
  | 'REQUEST_INVALID'
  | 'TRANSCODE_RECEIPT_REJECTED'
  | 'CORRESPONDENCE_RECEIPT_REJECTED'
  | 'SEGMENT_RECEIPT_REJECTED'
  | 'AUDIO_RECEIPT_REJECTED'
  | 'EVIDENCE_SCOPE_MISMATCH'
  | 'VERIFICATION_TIME_INCONSISTENT'
  | 'MAPPING_REJECTED';

export type MediaProxyMasterMappingQualificationResultV1 =
  | MediaProxyMasterMappingQualificationReceiptV1
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason: MediaProxyMasterMappingQualificationUnverifiableReasonV1;
      diagnostic: string | null;
    }>;

export function qualifyMediaProxyMasterTimeMappingV1(input: Readonly<{
  relation: MediaProxyMasterRelationV1;
  trustedTranscodeReceipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  correspondenceDerivationReceipt:
    MediaProxyMasterCorrespondenceV3DerivationReceiptV1;
  segmentMaterializationReceipt:
    MediaProxyMasterMappingSegmentMaterializationReceiptV1;
  audioLineageReceipt: MediaProxyMasterAudioLineageVerificationReceiptV1;
  workerImageDigest: string;
  qualifiedAt: Date;
}>): MediaProxyMasterMappingQualificationResultV1 {
  let relation: Readonly<MediaProxyMasterRelationV1>;
  let workerImageDigest: string;
  let qualifiedAt: string;
  try {
    relation = assertMediaProxyMasterRelationV1(input.relation);
    workerImageDigest = sha256(
      input.workerImageDigest,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_WORKER_DIGEST_INVALID',
    );
    qualifiedAt = isoDate(
      input.qualifiedAt,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_TIME_INVALID',
    );
  } catch (error) {
    return unverifiable('REQUEST_INVALID', error);
  }

  let transcode: MediaProxyMasterTrustedTranscodeReceiptV1;
  try {
    transcode = assertMediaProxyMasterTrustedTranscodeReceiptV1(
      input.trustedTranscodeReceipt,
    );
  } catch (error) {
    return unverifiable('TRANSCODE_RECEIPT_REJECTED', error);
  }

  let derivation: MediaProxyMasterCorrespondenceV3DerivationReceiptV1;
  try {
    derivation = assertMediaProxyMasterCorrespondenceV3DerivationReceiptV1(
      input.correspondenceDerivationReceipt,
    );
  } catch (error) {
    return unverifiable('CORRESPONDENCE_RECEIPT_REJECTED', error);
  }

  let segments: MediaProxyMasterMappingSegmentMaterializationReceiptV1;
  try {
    segments = assertMediaProxyMasterMappingSegmentMaterializationReceiptV1(
      input.segmentMaterializationReceipt,
      derivation,
    );
  } catch (error) {
    return unverifiable('SEGMENT_RECEIPT_REJECTED', error);
  }

  let audio: MediaProxyMasterAudioLineageVerificationReceiptV1;
  try {
    audio = assertMediaProxyMasterAudioLineageVerificationReceiptV1(
      input.audioLineageReceipt,
    );
  } catch (error) {
    return unverifiable('AUDIO_RECEIPT_REJECTED', error);
  }

  if (!scopeMatches({ relation, transcode, derivation, segments, audio })) {
    return unverifiable('EVIDENCE_SCOPE_MISMATCH', null);
  }
  if (!isCausallyOrdered(qualifiedAt, transcode.completedAt, audio.verifiedAt)) {
    return unverifiable('VERIFICATION_TIME_INCONSISTENT', null);
  }

  const execution = createExecutionReceipt({
    workerImageDigest,
    relationSha256: relation.relationSha256,
    trustedTranscodeReceiptSha256: transcode.receiptSha256,
    correspondenceDerivationSha256: derivation.derivationSha256,
    segmentMaterializationSha256: segments.materializationSha256,
    audioLineageVerificationSha256: audio.verificationSha256,
    qualifiedAt,
  });

  let mapping: MediaProxyMasterTimeMappingV1;
  try {
    mapping = createMediaProxyMasterTimeMappingV1({
      relation,
      verificationBasis: 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1',
      verifier: {
        verifierId: execution.qualifierId,
        verifierVersion: execution.qualifierVersion,
        verificationPolicyVersion: execution.qualificationPolicyVersion,
        workerImageDigest: execution.workerImageDigest,
        executionReceiptSha256: execution.executionReceiptSha256,
      },
      lineage: mediaProxyMasterMappingLineageFromTranscodeReceiptV1(transcode),
      proxyTimeMap: derivation.basis.proxyTimeMap,
      masterTimeMap: derivation.basis.masterTimeMap,
      frameCorrespondenceIndex: derivation.indexReference,
      segments: segments.segments,
      audio: audio.audio,
      verifiedAt: qualifiedAt,
    });
  } catch (error) {
    return unverifiable('MAPPING_REJECTED', error);
  }

  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_KIND_V1,
    disposition: 'MAPPING_QUALIFIED' as const,
    relation,
    execution,
    mapping,
  };
  try {
    return assertMediaProxyMasterMappingQualificationReceiptV1({
      ...material,
      qualificationSha256: hashEditronCanonicalJsonV1(material),
    });
  } catch (error) {
    return unverifiable('MAPPING_REJECTED', error);
  }
}

export function assertMediaProxyMasterMappingQualificationExecutionReceiptV1(
  value: unknown,
): MediaProxyMasterMappingQualificationExecutionReceiptV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'qualifierId',
    'qualifierVersion', 'qualificationPolicyVersion', 'workerImageDigest',
    'relationSha256', 'trustedTranscodeReceiptSha256',
    'correspondenceDerivationSha256', 'segmentMaterializationSha256',
    'audioLineageVerificationSha256', 'qualifiedAt',
    'executionReceiptSha256',
  ], 'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_KIND_V1
    || record.disposition !== 'QUALIFICATION_INPUTS_VERIFIED'
    || record.qualifierId !== MEDIA_PROXY_MASTER_TIME_MAPPING_OWNER_V1
    || record.qualifierVersion
      !== MEDIA_PROXY_MASTER_MAPPING_QUALIFIER_VERSION_V1
    || record.qualificationPolicyVersion
      !== MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_POLICY_VERSION_V1) {
    fail('MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_IDENTITY_INVALID');
  }
  return createExecutionReceipt({
    workerImageDigest: sha256(
      record.workerImageDigest,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_WORKER_INVALID',
    ),
    relationSha256: sha256(
      record.relationSha256,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_RELATION_INVALID',
    ),
    trustedTranscodeReceiptSha256: sha256(
      record.trustedTranscodeReceiptSha256,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_TRANSCODE_INVALID',
    ),
    correspondenceDerivationSha256: sha256(
      record.correspondenceDerivationSha256,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_DERIVATION_INVALID',
    ),
    segmentMaterializationSha256: sha256(
      record.segmentMaterializationSha256,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_SEGMENTS_INVALID',
    ),
    audioLineageVerificationSha256: sha256(
      record.audioLineageVerificationSha256,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_AUDIO_INVALID',
    ),
    qualifiedAt: isoInstant(
      record.qualifiedAt,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_TIME_INVALID',
    ),
    expectedExecutionReceiptSha256: sha256(
      record.executionReceiptSha256,
      'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_HASH_INVALID',
    ),
  });
}

export function assertMediaProxyMasterMappingQualificationReceiptV1(
  value: unknown,
): MediaProxyMasterMappingQualificationReceiptV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_RECEIPT_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'relation', 'execution',
    'mapping', 'qualificationSha256',
  ], 'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_KIND_V1
    || record.disposition !== 'MAPPING_QUALIFIED') {
    fail('MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_RECEIPT_IDENTITY_INVALID');
  }
  const relation = assertMediaProxyMasterRelationV1(record.relation);
  const execution =
    assertMediaProxyMasterMappingQualificationExecutionReceiptV1(
      record.execution,
    );
  const mapping = assertMediaProxyMasterTimeMappingV1(record.mapping, relation);
  if (execution.relationSha256 !== relation.relationSha256
    || mapping.relationSha256 !== relation.relationSha256
    || mapping.verifier.verifierId !== execution.qualifierId
    || mapping.verifier.verifierVersion !== execution.qualifierVersion
    || mapping.verifier.verificationPolicyVersion
      !== execution.qualificationPolicyVersion
    || mapping.verifier.workerImageDigest !== execution.workerImageDigest
    || mapping.verifier.executionReceiptSha256
      !== execution.executionReceiptSha256
    || mapping.verifiedAt !== execution.qualifiedAt) {
    fail('MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_RECEIPT_SCOPE_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_KIND_V1,
    disposition: 'MAPPING_QUALIFIED' as const,
    relation,
    execution,
    mapping,
  };
  const qualificationSha256 = sha256(
    record.qualificationSha256,
    'MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_RECEIPT_HASH_INVALID',
  );
  if (qualificationSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, qualificationSha256 });
}

function createExecutionReceipt(input: Readonly<{
  workerImageDigest: string;
  relationSha256: string;
  trustedTranscodeReceiptSha256: string;
  correspondenceDerivationSha256: string;
  segmentMaterializationSha256: string;
  audioLineageVerificationSha256: string;
  qualifiedAt: string;
  expectedExecutionReceiptSha256?: string;
}>): MediaProxyMasterMappingQualificationExecutionReceiptV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_KIND_V1,
    disposition: 'QUALIFICATION_INPUTS_VERIFIED' as const,
    qualifierId: MEDIA_PROXY_MASTER_TIME_MAPPING_OWNER_V1,
    qualifierVersion: MEDIA_PROXY_MASTER_MAPPING_QUALIFIER_VERSION_V1,
    qualificationPolicyVersion:
      MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_POLICY_VERSION_V1,
    workerImageDigest: input.workerImageDigest,
    relationSha256: input.relationSha256,
    trustedTranscodeReceiptSha256: input.trustedTranscodeReceiptSha256,
    correspondenceDerivationSha256: input.correspondenceDerivationSha256,
    segmentMaterializationSha256: input.segmentMaterializationSha256,
    audioLineageVerificationSha256: input.audioLineageVerificationSha256,
    qualifiedAt: input.qualifiedAt,
  };
  const executionReceiptSha256 = hashEditronCanonicalJsonV1(material);
  if (input.expectedExecutionReceiptSha256 !== undefined
    && input.expectedExecutionReceiptSha256 !== executionReceiptSha256) {
    fail('MEDIA_PROXY_MASTER_MAPPING_QUALIFICATION_EXECUTION_HASH_MISMATCH');
  }
  return frozen({ ...material, executionReceiptSha256 });
}

function scopeMatches(input: Readonly<{
  relation: Readonly<MediaProxyMasterRelationV1>;
  transcode: MediaProxyMasterTrustedTranscodeReceiptV1;
  derivation: MediaProxyMasterCorrespondenceV3DerivationReceiptV1;
  segments: MediaProxyMasterMappingSegmentMaterializationReceiptV1;
  audio: MediaProxyMasterAudioLineageVerificationReceiptV1;
}>): boolean {
  const masterMap = input.derivation.basis.masterTimeMap;
  const proxyMap = input.derivation.basis.proxyTimeMap;
  return input.relation.mediaKind === 'video'
    && input.derivation.basis.relationSha256 === input.relation.relationSha256
    && input.segments.derivationSha256 === input.derivation.derivationSha256
    && input.audio.relationSha256 === input.relation.relationSha256
    && input.audio.transcodeReceiptSha256 === input.transcode.receiptSha256
    && sourceMatchesReference(
      input.transcode.command.masterSourceVersion,
      input.relation.master,
    )
    && sourceMatchesReference(
      input.transcode.proxyEncode.sourceVersion,
      input.relation.proxy,
    )
    && timeMapMatchesReference(proxyMap, input.relation.proxy)
    && timeMapMatchesReference(masterMap, input.relation.master)
    && canonicalizeEditronJsonV1(input.transcode.command.masterTimeMap)
      === canonicalizeEditronJsonV1(masterMap)
    && input.transcode.masterDecode.timeMapVerificationSha256
      === masterMap.verificationSha256
    && input.transcode.masterDecode.epochIndexContentSha256
      === masterMap.epochIndexContentSha256
    && input.transcode.masterDecode.totalFrameCount
      === masterMap.totalFrameCount
    && input.transcode.masterDecode.videoStreamIndex
      === masterMap.videoStreamIndex
    && input.transcode.proxyEncode.outputVideoStreamIndex
      === proxyMap.videoStreamIndex
    && proxyVideoMatchesMapping(input.transcode, input.segments);
}

function timeMapMatchesReference(
  map: Readonly<MediaProxyMasterTimeMapReferenceV1>,
  reference: Readonly<MediaSourceVersionReferenceV1>,
): boolean {
  return map.sourceVersionSha256 === reference.sourceVersionSha256
    && map.storageVersionSha256 === reference.storageVersionSha256;
}

function proxyVideoMatchesMapping(
  transcode: MediaProxyMasterTrustedTranscodeReceiptV1,
  segments: MediaProxyMasterMappingSegmentMaterializationReceiptV1,
): boolean {
  const video = transcode.proxyEncode.outputProbe.video;
  const mappingEnd = segments.canonicalEndExclusiveTime;
  const firstSegment = segments.segments[0];
  return firstSegment !== undefined
    && video.frameCount
      === segments.basis.proxyTimeMap.totalFrameCount
    && firstSegment.proxyStart.presentationTimestampTicks
      === video.sourceStartPts
    && segments.segments.every((segment) =>
      canonicalizeEditronJsonV1(segment.proxyStart.secondsPerSourceTick)
        === canonicalizeEditronJsonV1(video.sourceTimebase)
      && canonicalizeEditronJsonV1(segment.proxyEndExclusive.secondsPerSourceTick)
        === canonicalizeEditronJsonV1(video.sourceTimebase))
    && BigInt(video.sourceDurationTicks)
      * BigInt(video.sourceTimebase.numerator)
      * BigInt(mappingEnd.timescale)
      === BigInt(mappingEnd.ticks)
        * BigInt(video.sourceTimebase.denominator);
}

function sourceMatchesReference(
  source: Readonly<MediaSourceVersionV1>,
  reference: Readonly<MediaSourceVersionReferenceV1>,
): boolean {
  return source.sourceVersionSha256 === reference.sourceVersionSha256
    && source.contentSha256 === reference.contentSha256
    && source.storageVersion.storageVersionSha256
      === reference.storageVersionSha256;
}

function isCausallyOrdered(
  qualifiedAt: string,
  transcodeCompletedAt: string,
  audioVerifiedAt: string,
): boolean {
  const transcodeTime = Date.parse(transcodeCompletedAt);
  const audioTime = Date.parse(audioVerifiedAt);
  const qualificationTime = Date.parse(qualifiedAt);
  return transcodeTime <= audioTime && audioTime <= qualificationTime;
}

function unverifiable(
  reason: MediaProxyMasterMappingQualificationUnverifiableReasonV1,
  error: unknown,
): MediaProxyMasterMappingQualificationResultV1 {
  return frozen({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    diagnostic: error instanceof Error ? safeDiagnostic(error.message) : null,
  });
}

function isoDate(value: unknown, error: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(error);
  return value.toISOString();
}

function isoInstant(value: unknown, error: string): string {
  if (typeof value !== 'string') fail(error);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) fail(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function safeDiagnostic(value: string): string | null {
  return /^[A-Z0-9_:.-]{1,240}$/.test(value) ? value : null;
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  error: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function frozen<const T>(value: T): T {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
