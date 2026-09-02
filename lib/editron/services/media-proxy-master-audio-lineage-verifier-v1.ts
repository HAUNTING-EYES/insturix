import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaSourceAudioArtifactAssetRecordV1 }
  from './media-source-audio-artifact-asset-owner-v1';
import {
  assertMediaSourceAudioAvailabilityEvidenceV1,
  type MediaSourceAudioAvailabilityEvidenceV1,
} from './media-source-audio-availability-evidence-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 }
  from './media-source-audio-private-artifact-port-v1';
import {
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  verifyMediaSourceAudioPrivateArtifactSetV1,
} from './media-source-audio-private-artifact-v1';
import type {
  ExactSignedRationalV1,
  MediaSourceAudioSampleEpochMapV1,
} from './media-source-audio-sample-epoch-map-v1';
import type { MediaProxyMasterAudioMappingV1 }
  from './media-proxy-master-time-mapping-v1';
import {
  assertMediaProxyMasterTrustedTranscodeReceiptV1,
  type MediaProxyMasterTrustedTranscodeReceiptV1,
} from './media-proxy-master-trusted-transcode-v1';
import {
  assertMediaProxyMasterRelationV1,
  type MediaProxyMasterRelationV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionReferenceV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_V1' as const;
export const MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFICATION_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFICATION_V1' as const;
export const MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFIER_VERSION_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFIER_V1' as const;

const MAX_AUDIO_STREAMS = 64;
const MAX_ARTIFACT_READS = 128;

export type MediaProxyMasterAudioLineagePolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_KIND_V1;
  policyVersion: string;
  streamSelection: 'ALL_OBSERVED_STREAMS_REQUIRED';
  timelineComparison: 'EXACT_NORMALIZED_SAMPLE_EPOCHS_NO_TOLERANCE';
  maxAudioStreams: number;
  maxArtifactReads: number;
  policySha256: string;
}>;

export type MediaProxyMasterAudioLineageStreamReceiptV1 = Readonly<{
  sequence: number;
  masterAudioStreamIndex: number;
  proxyAudioStreamIndex: number;
  masterStreamId: string;
  proxyStreamId: string;
  masterArtifactRecordSha256: string;
  proxyArtifactRecordSha256: string;
  masterManifestSha256: string;
  proxyManifestSha256: string;
  masterAudioEpochMapSha256: string;
  proxyAudioEpochMapSha256: string;
  masterChannelLayoutSha256: string;
  proxyChannelLayoutSha256: string;
  canonicalTimelineEquivalenceSha256: string;
  lineageEvidenceSha256: string;
}>;

export type MediaProxyMasterAudioLineageVerificationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFICATION_KIND_V1;
  disposition: 'AUDIO_LINEAGE_VERIFIED';
  verifierVersion: typeof MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFIER_VERSION_V1;
  relationSha256: string;
  transcodeReceiptSha256: string;
  verificationPolicy: MediaProxyMasterAudioLineagePolicyV1;
  masterAudioAvailabilityEvidenceSha256: string;
  proxyAudioAvailabilityEvidenceSha256: string;
  audio: MediaProxyMasterAudioMappingV1;
  streams: readonly MediaProxyMasterAudioLineageStreamReceiptV1[];
  artifactReadCount: number;
  verifiedAt: string;
  verificationSha256: string;
}>;

export type MediaProxyMasterAudioLineageUnverifiableReasonV1 =
  | 'REQUEST_INVALID'
  | 'SOURCE_SCOPE_MISMATCH'
  | 'TRANSCODE_LINEAGE_MISMATCH'
  | 'VERIFICATION_TIME_INCONSISTENT'
  | 'AUDIO_DISPOSITION_MISMATCH'
  | 'MASTER_AUDIO_SELECTION_INCOMPLETE'
  | 'PROXY_AUDIO_SELECTION_INCOMPLETE'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'ARTIFACT_READ_FAILED'
  | 'ARTIFACT_BINDING_MISMATCH'
  | 'SAMPLE_RATE_MISMATCH'
  | 'CHANNEL_LAYOUT_MISMATCH'
  | 'TIMELINE_MISMATCH';

export type MediaProxyMasterAudioLineageVerificationResultV1 =
  | MediaProxyMasterAudioLineageVerificationReceiptV1
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason: MediaProxyMasterAudioLineageUnverifiableReasonV1;
      failedSide: 'MASTER' | 'PROXY' | null;
      failedStreamIndex: number | null;
      diagnostic: string | null;
    }>;

export function createMediaProxyMasterAudioLineagePolicyV1(input: Readonly<{
  policyVersion: string;
  maxAudioStreams: number;
  maxArtifactReads: number;
}>): MediaProxyMasterAudioLineagePolicyV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_KIND_V1,
    policyVersion: identifier(
      input.policyVersion,
      'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_VERSION_INVALID',
    ),
    streamSelection: 'ALL_OBSERVED_STREAMS_REQUIRED' as const,
    timelineComparison:
      'EXACT_NORMALIZED_SAMPLE_EPOCHS_NO_TOLERANCE' as const,
    maxAudioStreams: positiveSafeInteger(
      input.maxAudioStreams,
      MAX_AUDIO_STREAMS,
      'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_STREAM_LIMIT_INVALID',
    ),
    maxArtifactReads: positiveSafeInteger(
      input.maxArtifactReads,
      MAX_ARTIFACT_READS,
      'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_READ_LIMIT_INVALID',
    ),
  };
  return frozen({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterAudioLineagePolicyV1(
  value: unknown,
): MediaProxyMasterAudioLineagePolicyV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'policyVersion', 'streamSelection',
    'timelineComparison', 'maxAudioStreams', 'maxArtifactReads', 'policySha256',
  ], 'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_KIND_V1
    || record.streamSelection !== 'ALL_OBSERVED_STREAMS_REQUIRED'
    || record.timelineComparison
      !== 'EXACT_NORMALIZED_SAMPLE_EPOCHS_NO_TOLERANCE') {
    fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterAudioLineagePolicyV1({
    policyVersion: record.policyVersion as string,
    maxAudioStreams: record.maxAudioStreams as number,
    maxArtifactReads: record.maxArtifactReads as number,
  });
  if (sha256(
    record.policySha256,
    'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_HASH_INVALID',
  ) !== rebuilt.policySha256) {
    fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_POLICY_HASH_MISMATCH');
  }
  return rebuilt;
}

export async function verifyMediaProxyMasterAudioLineageV1(input: Readonly<{
  relation: MediaProxyMasterRelationV1;
  trustedTranscodeReceipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  masterAudioAvailabilityEvidence: MediaSourceAudioAvailabilityEvidenceV1;
  proxyAudioAvailabilityEvidence: MediaSourceAudioAvailabilityEvidenceV1;
  verificationPolicy: MediaProxyMasterAudioLineagePolicyV1;
  reader: MediaSourceAudioPrivateArtifactReaderV1;
  verifiedAt: string;
}>): Promise<MediaProxyMasterAudioLineageVerificationResultV1> {
  let relation: Readonly<MediaProxyMasterRelationV1>;
  let receipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  let masterEvidence: MediaSourceAudioAvailabilityEvidenceV1;
  let proxyEvidence: MediaSourceAudioAvailabilityEvidenceV1;
  let policy: MediaProxyMasterAudioLineagePolicyV1;
  let verifiedAt: string;
  try {
    relation = assertMediaProxyMasterRelationV1(input.relation);
    receipt = assertMediaProxyMasterTrustedTranscodeReceiptV1(
      input.trustedTranscodeReceipt,
    );
    masterEvidence = assertMediaSourceAudioAvailabilityEvidenceV1(
      input.masterAudioAvailabilityEvidence,
    );
    proxyEvidence = assertMediaSourceAudioAvailabilityEvidenceV1(
      input.proxyAudioAvailabilityEvidence,
    );
    policy = assertMediaProxyMasterAudioLineagePolicyV1(
      input.verificationPolicy,
    );
    verifiedAt = isoInstant(
      input.verifiedAt,
      'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFIED_AT_INVALID',
    );
    if (!input.reader || typeof input.reader.readArtifactSet !== 'function') {
      fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_READER_INVALID');
    }
  } catch (error) {
    return unverifiable('REQUEST_INVALID', null, null, error);
  }

  if (!scopeMatchesRelation(relation, receipt, masterEvidence, proxyEvidence)) {
    return unverifiable('SOURCE_SCOPE_MISMATCH', null, null, null);
  }
  if (!transcodeLineageMatchesAudioEvidence(receipt, masterEvidence, proxyEvidence)) {
    return unverifiable('TRANSCODE_LINEAGE_MISMATCH', null, null, null);
  }
  if (!verificationTimeIsCausal(
    verifiedAt,
    receipt,
    masterEvidence,
    proxyEvidence,
  )) {
    return unverifiable('VERIFICATION_TIME_INCONSISTENT', null, null, null);
  }

  const masterAvailability = masterEvidence.availability;
  const proxyAvailability = proxyEvidence.availability;
  if (masterAvailability.disposition === 'NO_AUDIO_STREAMS_OBSERVED'
    || proxyAvailability.disposition === 'NO_AUDIO_STREAMS_OBSERVED') {
    if (masterAvailability.disposition !== 'NO_AUDIO_STREAMS_OBSERVED'
      || proxyAvailability.disposition !== 'NO_AUDIO_STREAMS_OBSERVED') {
      return unverifiable('AUDIO_DISPOSITION_MISMATCH', null, null, null);
    }
    if (receipt.command.masterAudioStreamIndexes.length !== 0
      || receipt.masterDecode.audioStreamIndexes.length !== 0) {
      return unverifiable('MASTER_AUDIO_SELECTION_INCOMPLETE', 'MASTER', null, null);
    }
    if (receipt.proxyEncode.outputAudioStreamIndexes.length !== 0
      || receipt.proxyEncode.outputProbe.audio.length !== 0) {
      return unverifiable('PROXY_AUDIO_SELECTION_INCOMPLETE', 'PROXY', null, null);
    }
    return buildReceipt({
      relation,
      receipt,
      policy,
      masterEvidence,
      proxyEvidence,
      streams: [],
      verifiedAt,
    });
  }

  const masterRecords = masterAvailability.sourceAudioArtifactsV1.records;
  const proxyRecords = proxyAvailability.sourceAudioArtifactsV1.records;
  const selectedMasterIndexes = receipt.command.masterAudioStreamIndexes;
  const selectedProxyIndexes = receipt.proxyEncode.outputAudioStreamIndexes;
  if (!sameIntegerSet(
    masterRecords.map(({ audioStreamIndex }) => audioStreamIndex),
    selectedMasterIndexes,
  ) || !sameIntegerArray(
    receipt.masterDecode.audioStreamIndexes,
    selectedMasterIndexes,
  )) {
    return unverifiable('MASTER_AUDIO_SELECTION_INCOMPLETE', 'MASTER', null, null);
  }
  if (!sameIntegerSet(
    proxyRecords.map(({ audioStreamIndex }) => audioStreamIndex),
    selectedProxyIndexes,
  ) || !sameIntegerArray(
    receipt.proxyEncode.outputProbe.audio.map(({ streamIndex }) => streamIndex),
    selectedProxyIndexes,
  ) || selectedProxyIndexes.length !== selectedMasterIndexes.length) {
    return unverifiable('PROXY_AUDIO_SELECTION_INCOMPLETE', 'PROXY', null, null);
  }
  if (selectedMasterIndexes.length === 0) {
    return unverifiable('AUDIO_DISPOSITION_MISMATCH', null, null, null);
  }
  if (selectedMasterIndexes.length > policy.maxAudioStreams
    || selectedMasterIndexes.length * 2 > policy.maxArtifactReads) {
    return unverifiable('RESOURCE_LIMIT_EXCEEDED', null, null, null);
  }

  const streams: MediaProxyMasterAudioLineageStreamReceiptV1[] = [];
  for (let sequence = 0; sequence < selectedMasterIndexes.length; sequence += 1) {
    const masterStreamIndex = selectedMasterIndexes[sequence]!;
    const proxyStreamIndex = selectedProxyIndexes[sequence]!;
    const masterRecord = recordForStream(masterRecords, masterStreamIndex);
    const proxyRecord = recordForStream(proxyRecords, proxyStreamIndex);
    if (masterRecord === null) {
      return unverifiable(
        'MASTER_AUDIO_SELECTION_INCOMPLETE', 'MASTER', masterStreamIndex, null,
      );
    }
    if (proxyRecord === null) {
      return unverifiable(
        'PROXY_AUDIO_SELECTION_INCOMPLETE', 'PROXY', proxyStreamIndex, null,
      );
    }
    const masterRead = await readVerifiedArtifact(
      input.reader,
      masterRecord,
      masterEvidence,
      'MASTER',
    );
    if (masterRead.disposition === 'UNVERIFIABLE') return masterRead.result;
    const proxyRead = await readVerifiedArtifact(
      input.reader,
      proxyRecord,
      proxyEvidence,
      'PROXY',
    );
    if (proxyRead.disposition === 'UNVERIFIABLE') return proxyRead.result;

    const masterMap = masterRead.map;
    const proxyMap = proxyRead.map;
    if (masterMap.binding.sampleRate !== proxyMap.binding.sampleRate) {
      return unverifiable(
        'SAMPLE_RATE_MISMATCH', null, masterStreamIndex, null,
      );
    }
    const masterLayout = channelLayout(masterMap);
    const proxyLayout = channelLayout(proxyMap);
    if (canonicalizeEditronJsonV1(masterLayout)
      !== canonicalizeEditronJsonV1(proxyLayout)) {
      return unverifiable(
        'CHANNEL_LAYOUT_MISMATCH', null, masterStreamIndex, null,
      );
    }
    const masterTimeline = normalizedTimeline(masterMap);
    const proxyTimeline = normalizedTimeline(proxyMap);
    if (canonicalizeEditronJsonV1(masterTimeline)
      !== canonicalizeEditronJsonV1(proxyTimeline)) {
      return unverifiable('TIMELINE_MISMATCH', null, masterStreamIndex, null);
    }
    const timelineSha256 = hashEditronCanonicalJsonV1(masterTimeline);
    const streamMaterial = {
      sequence,
      masterAudioStreamIndex: masterStreamIndex,
      proxyAudioStreamIndex: proxyStreamIndex,
      masterStreamId: masterMap.binding.streamId,
      proxyStreamId: proxyMap.binding.streamId,
      masterArtifactRecordSha256: masterRecord.recordSha256,
      proxyArtifactRecordSha256: proxyRecord.recordSha256,
      masterManifestSha256: masterRead.manifestSha256,
      proxyManifestSha256: proxyRead.manifestSha256,
      masterAudioEpochMapSha256: masterMap.audioSampleEpochMapSha256,
      proxyAudioEpochMapSha256: proxyMap.audioSampleEpochMapSha256,
      masterChannelLayoutSha256: hashEditronCanonicalJsonV1(masterLayout),
      proxyChannelLayoutSha256: hashEditronCanonicalJsonV1(proxyLayout),
      canonicalTimelineEquivalenceSha256: timelineSha256,
    };
    streams.push(frozen({
      ...streamMaterial,
      lineageEvidenceSha256: streamLineageHash({
        relationSha256: relation.relationSha256,
        transcodeReceiptSha256: receipt.receiptSha256,
        policySha256: policy.policySha256,
        masterEvidenceSha256: masterEvidence.evidenceSha256,
        proxyEvidenceSha256: proxyEvidence.evidenceSha256,
        stream: streamMaterial,
      }),
    }));
  }

  return buildReceipt({
    relation,
    receipt,
    policy,
    masterEvidence,
    proxyEvidence,
    streams,
    verifiedAt,
  });
}

export function assertMediaProxyMasterAudioLineageVerificationReceiptV1(
  value: unknown,
): MediaProxyMasterAudioLineageVerificationReceiptV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'verifierVersion',
    'relationSha256', 'transcodeReceiptSha256', 'verificationPolicy',
    'masterAudioAvailabilityEvidenceSha256',
    'proxyAudioAvailabilityEvidenceSha256', 'audio', 'streams',
    'artifactReadCount', 'verifiedAt', 'verificationSha256',
  ], 'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFICATION_KIND_V1
    || record.disposition !== 'AUDIO_LINEAGE_VERIFIED'
    || record.verifierVersion
      !== MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFIER_VERSION_V1) {
    fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_IDENTITY_INVALID');
  }
  const relationSha256 = sha256(
    record.relationSha256,
    'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_RELATION_INVALID',
  );
  const transcodeReceiptSha256 = sha256(
    record.transcodeReceiptSha256,
    'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_TRANSCODE_INVALID',
  );
  const verificationPolicy = assertMediaProxyMasterAudioLineagePolicyV1(
    record.verificationPolicy,
  );
  const masterEvidenceSha256 = sha256(
    record.masterAudioAvailabilityEvidenceSha256,
    'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_MASTER_EVIDENCE_INVALID',
  );
  const proxyEvidenceSha256 = sha256(
    record.proxyAudioAvailabilityEvidenceSha256,
    'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_PROXY_EVIDENCE_INVALID',
  );
  const streams = normalizeStreamReceipts(record.streams, {
    relationSha256,
    transcodeReceiptSha256,
    policySha256: verificationPolicy.policySha256,
    masterEvidenceSha256,
    proxyEvidenceSha256,
  });
  const audio = audioFromStreams(streams, record.audio);
  const artifactReadCount = nonNegativeSafeInteger(
    record.artifactReadCount,
    'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_READ_COUNT_INVALID',
  );
  if (artifactReadCount !== streams.length * 2
    || streams.length > verificationPolicy.maxAudioStreams
    || artifactReadCount > verificationPolicy.maxArtifactReads) {
    fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_RESOURCE_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFICATION_KIND_V1,
    disposition: 'AUDIO_LINEAGE_VERIFIED' as const,
    verifierVersion: MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFIER_VERSION_V1,
    relationSha256,
    transcodeReceiptSha256,
    verificationPolicy,
    masterAudioAvailabilityEvidenceSha256: masterEvidenceSha256,
    proxyAudioAvailabilityEvidenceSha256: proxyEvidenceSha256,
    audio,
    streams,
    artifactReadCount,
    verifiedAt: isoInstant(
      record.verifiedAt,
      'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_TIME_INVALID',
    ),
  };
  const verificationSha256 = sha256(
    record.verificationSha256,
    'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_HASH_INVALID',
  );
  if (verificationSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, verificationSha256 });
}

function buildReceipt(input: Readonly<{
  relation: Readonly<MediaProxyMasterRelationV1>;
  receipt: MediaProxyMasterTrustedTranscodeReceiptV1;
  policy: MediaProxyMasterAudioLineagePolicyV1;
  masterEvidence: MediaSourceAudioAvailabilityEvidenceV1;
  proxyEvidence: MediaSourceAudioAvailabilityEvidenceV1;
  streams: readonly MediaProxyMasterAudioLineageStreamReceiptV1[];
  verifiedAt: string;
}>): MediaProxyMasterAudioLineageVerificationReceiptV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFICATION_KIND_V1,
    disposition: 'AUDIO_LINEAGE_VERIFIED' as const,
    verifierVersion: MEDIA_PROXY_MASTER_AUDIO_LINEAGE_VERIFIER_VERSION_V1,
    relationSha256: input.relation.relationSha256,
    transcodeReceiptSha256: input.receipt.receiptSha256,
    verificationPolicy: input.policy,
    masterAudioAvailabilityEvidenceSha256: input.masterEvidence.evidenceSha256,
    proxyAudioAvailabilityEvidenceSha256: input.proxyEvidence.evidenceSha256,
    audio: audioFromStreams(input.streams),
    streams: input.streams,
    artifactReadCount: input.streams.length * 2,
    verifiedAt: input.verifiedAt,
  };
  return assertMediaProxyMasterAudioLineageVerificationReceiptV1({
    ...material,
    verificationSha256: hashEditronCanonicalJsonV1(material),
  });
}

function scopeMatchesRelation(
  relation: Readonly<MediaProxyMasterRelationV1>,
  receipt: MediaProxyMasterTrustedTranscodeReceiptV1,
  masterEvidence: MediaSourceAudioAvailabilityEvidenceV1,
  proxyEvidence: MediaSourceAudioAvailabilityEvidenceV1,
): boolean {
  const master = receipt.command.masterSourceVersion;
  const proxy = receipt.proxyEncode.sourceVersion;
  return relation.mediaKind === 'video'
    && relation.assetId === master.assetId
    && relation.assetId === proxy.assetId
    && sameOwner(relation.owner, master.owner)
    && sameOwner(relation.owner, proxy.owner)
    && sourceMatchesReference(master, relation.master)
    && sourceMatchesReference(proxy, relation.proxy)
    && sourceMatchesReference(masterEvidence.sourceVersionV1, relation.master)
    && sourceMatchesReference(proxyEvidence.sourceVersionV1, relation.proxy);
}

function transcodeLineageMatchesAudioEvidence(
  receipt: MediaProxyMasterTrustedTranscodeReceiptV1,
  masterEvidence: MediaSourceAudioAvailabilityEvidenceV1,
  proxyEvidence: MediaSourceAudioAvailabilityEvidenceV1,
): boolean {
  const masterQualification = masterEvidence.sourceQualificationV1;
  const proxyQualification = proxyEvidence.sourceQualificationV1;
  const masterObservation = masterQualification.observation;
  const proxyObservation = proxyQualification.observation;
  if (masterObservation === null || proxyObservation === null
    || masterQualification.sourceBindingSha256
      !== receipt.command.masterTimeMap.sourceBindingSha256
    || masterObservation.observationSha256
      !== receipt.command.masterTimeMap.technicalObservationSha256
    || proxyObservation.probeVersion
      !== receipt.proxyEncode.outputProbe.ffprobeVersion) {
    return false;
  }
  const observedProxyAudio = proxyObservation.audioStreams.map((stream) => ({
    streamIndex: stream.streamIndex,
    codec: stream.codec,
    sampleRate: stream.sampleRate,
    channelCount: stream.channelCount,
    channelLayout: stream.channelLayout,
    sourceTimebase: stream.sourceTimebase,
    sourceStartPts: stream.sourceStartPts,
    sourceDurationTicks: stream.sourceDurationTicks,
  }));
  return canonicalizeEditronJsonV1(observedProxyAudio)
    === canonicalizeEditronJsonV1(receipt.proxyEncode.outputProbe.audio);
}

function verificationTimeIsCausal(
  verifiedAt: string,
  receipt: MediaProxyMasterTrustedTranscodeReceiptV1,
  masterEvidence: MediaSourceAudioAvailabilityEvidenceV1,
  proxyEvidence: MediaSourceAudioAvailabilityEvidenceV1,
): boolean {
  const verifiedAtMs = Date.parse(verifiedAt);
  const masterQualifiedAt = masterEvidence.sourceQualificationV1.completedAt;
  const proxyQualifiedAt = proxyEvidence.sourceQualificationV1.completedAt;
  if (typeof masterQualifiedAt !== 'string'
    || typeof proxyQualifiedAt !== 'string') return false;
  const evidenceTimes = [
    receipt.completedAt,
    masterQualifiedAt,
    proxyQualifiedAt,
    ...artifactPublicationTimes(masterEvidence),
    ...artifactPublicationTimes(proxyEvidence),
  ];
  return evidenceTimes.every((value) => Date.parse(value) <= verifiedAtMs);
}

function artifactPublicationTimes(
  evidence: MediaSourceAudioAvailabilityEvidenceV1,
): readonly string[] {
  return evidence.availability.disposition === 'DECODED_ARTIFACT_SET'
    ? evidence.availability.sourceAudioArtifactsV1.records.map(
      ({ publishedAt }) => publishedAt,
    )
    : [];
}

type VerifiedArtifactReadV1 = Readonly<
  | {
      disposition: 'VERIFIED';
      map: MediaSourceAudioSampleEpochMapV1;
      manifestSha256: string;
    }
  | {
      disposition: 'UNVERIFIABLE';
      result: MediaProxyMasterAudioLineageVerificationResultV1;
    }
>;

async function readVerifiedArtifact(
  reader: MediaSourceAudioPrivateArtifactReaderV1,
  record: MediaSourceAudioArtifactAssetRecordV1,
  evidence: MediaSourceAudioAvailabilityEvidenceV1,
  side: 'MASTER' | 'PROXY',
): Promise<VerifiedArtifactReadV1> {
  let stored: Awaited<ReturnType<MediaSourceAudioPrivateArtifactReaderV1[
    'readArtifactSet'
  ]>>;
  try {
    stored = await reader.readArtifactSet(record.manifestReference);
  } catch {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        'ARTIFACT_READ_FAILED', side, record.audioStreamIndex, null,
      ),
    };
  }
  try {
    const manifestSerialization = serializeMediaSourceAudioPrivateArtifactManifestV1(
      stored.manifest,
    );
    const map = verifyMediaSourceAudioPrivateArtifactSetV1({
      manifest: stored.manifest,
      mapCanonicalJson: stored.mapCanonicalJson,
    });
    if (canonicalizeEditronJsonV1(manifestSerialization.reference)
        !== canonicalizeEditronJsonV1(record.manifestReference)
      || stored.manifest.manifestSha256 !== record.manifestSha256
      || map.audioSampleEpochMapSha256 !== record.audioSampleEpochMapSha256
      || map.binding.sourceVersionSha256
        !== evidence.sourceVersionV1.sourceVersionSha256
      || map.binding.storageVersionSha256
        !== evidence.sourceVersionV1.storageVersion.storageVersionSha256
      || map.binding.audioStreamIndex !== record.audioStreamIndex
      || map.binding.streamId !== record.streamId) {
      fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_ARTIFACT_SCOPE_MISMATCH');
    }
    return {
      disposition: 'VERIFIED',
      map,
      manifestSha256: stored.manifest.manifestSha256,
    };
  } catch (error) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        'ARTIFACT_BINDING_MISMATCH', side, record.audioStreamIndex, error,
      ),
    };
  }
}

function normalizedTimeline(map: MediaSourceAudioSampleEpochMapV1) {
  const origin = map.epochs[0]!.sourceStartSamplePosition;
  return {
    sampleRate: map.binding.sampleRate,
    decodedSampleFrameCount: map.pcm.decodedSampleFrameCount,
    epochs: map.epochs.map((epoch, sequence) => ({
      sequence,
      boundaryKind: epoch.boundaryKind,
      precedingDisplacementSampleFrames: normalizedRational(
        epoch.precedingDisplacementSampleFrames,
      ),
      decodedStartSampleFrame: epoch.decodedStartSampleFrame,
      decodedEndExclusiveSampleFrame: epoch.decodedEndExclusiveSampleFrame,
      normalizedSourceStartSamplePosition: subtractRational(
        epoch.sourceStartSamplePosition,
        origin,
      ),
      normalizedSourceEndExclusiveSamplePosition: subtractRational(
        epoch.sourceEndExclusiveSamplePosition,
        origin,
      ),
    })),
  };
}

function channelLayout(map: MediaSourceAudioSampleEpochMapV1) {
  return {
    channelCount: map.binding.channelCount,
    channelLayout: map.binding.channelLayout,
  };
}

function audioFromStreams(
  streams: readonly MediaProxyMasterAudioLineageStreamReceiptV1[],
  persisted?: unknown,
): MediaProxyMasterAudioMappingV1 {
  const audio: MediaProxyMasterAudioMappingV1 = streams.length === 0
    ? { disposition: 'NO_AUDIO_IN_EITHER_SOURCE' }
    : {
        disposition: 'VERIFIED_SAMPLE_TIMELINE_LINEAGE',
        streams: streams.map((stream) => ({
          sequence: stream.sequence,
          proxyStreamId: stream.proxyStreamId,
          masterStreamId: stream.masterStreamId,
          proxyAudioEpochMapSha256: stream.proxyAudioEpochMapSha256,
          masterAudioEpochMapSha256: stream.masterAudioEpochMapSha256,
          proxyChannelLayoutSha256: stream.proxyChannelLayoutSha256,
          masterChannelLayoutSha256: stream.masterChannelLayoutSha256,
          canonicalTimelineEquivalenceSha256:
            stream.canonicalTimelineEquivalenceSha256,
          lineageEvidenceSha256: stream.lineageEvidenceSha256,
        })),
      };
  if (persisted !== undefined
    && canonicalizeEditronJsonV1(persisted)
      !== canonicalizeEditronJsonV1(audio)) {
    fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_AUDIO_MISMATCH');
  }
  return frozen(audio);
}

function normalizeStreamReceipts(
  value: unknown,
  context: Readonly<{
    relationSha256: string;
    transcodeReceiptSha256: string;
    policySha256: string;
    masterEvidenceSha256: string;
    proxyEvidenceSha256: string;
  }>,
): readonly MediaProxyMasterAudioLineageStreamReceiptV1[] {
  if (!Array.isArray(value) || value.length > MAX_AUDIO_STREAMS) {
    fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_STREAMS_INVALID');
  }
  const masterIndexes = new Set<number>();
  const proxyIndexes = new Set<number>();
  return frozen(value.map((entry, sequence) => {
    const stream = object(
      entry,
      'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_STREAM_INVALID',
    );
    exactKeys(stream, [
      'sequence', 'masterAudioStreamIndex', 'proxyAudioStreamIndex',
      'masterStreamId', 'proxyStreamId', 'masterArtifactRecordSha256',
      'proxyArtifactRecordSha256', 'masterManifestSha256',
      'proxyManifestSha256', 'masterAudioEpochMapSha256',
      'proxyAudioEpochMapSha256', 'masterChannelLayoutSha256',
      'proxyChannelLayoutSha256', 'canonicalTimelineEquivalenceSha256',
      'lineageEvidenceSha256',
    ], 'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_STREAM_FIELDS_INVALID');
    if (stream.sequence !== sequence) {
      fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_STREAM_SEQUENCE_INVALID');
    }
    const material = {
      sequence,
      masterAudioStreamIndex: nonNegativeSafeInteger(
        stream.masterAudioStreamIndex,
        'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_MASTER_STREAM_INDEX_INVALID',
      ),
      proxyAudioStreamIndex: nonNegativeSafeInteger(
        stream.proxyAudioStreamIndex,
        'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_PROXY_STREAM_INDEX_INVALID',
      ),
      masterStreamId: identifier(
        stream.masterStreamId,
        'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_MASTER_STREAM_INVALID',
      ),
      proxyStreamId: identifier(
        stream.proxyStreamId,
        'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_PROXY_STREAM_INVALID',
      ),
      masterArtifactRecordSha256: checkedHash(stream.masterArtifactRecordSha256),
      proxyArtifactRecordSha256: checkedHash(stream.proxyArtifactRecordSha256),
      masterManifestSha256: checkedHash(stream.masterManifestSha256),
      proxyManifestSha256: checkedHash(stream.proxyManifestSha256),
      masterAudioEpochMapSha256: checkedHash(stream.masterAudioEpochMapSha256),
      proxyAudioEpochMapSha256: checkedHash(stream.proxyAudioEpochMapSha256),
      masterChannelLayoutSha256: checkedHash(stream.masterChannelLayoutSha256),
      proxyChannelLayoutSha256: checkedHash(stream.proxyChannelLayoutSha256),
      canonicalTimelineEquivalenceSha256: checkedHash(
        stream.canonicalTimelineEquivalenceSha256,
      ),
    };
    if (masterIndexes.has(material.masterAudioStreamIndex)
      || proxyIndexes.has(material.proxyAudioStreamIndex)
      || material.masterChannelLayoutSha256
        !== material.proxyChannelLayoutSha256) {
      fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_STREAM_SCOPE_INVALID');
    }
    masterIndexes.add(material.masterAudioStreamIndex);
    proxyIndexes.add(material.proxyAudioStreamIndex);
    const lineageEvidenceSha256 = checkedHash(stream.lineageEvidenceSha256);
    if (lineageEvidenceSha256 !== streamLineageHash({
      ...context,
      stream: material,
    })) {
      fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_RECEIPT_STREAM_HASH_MISMATCH');
    }
    return { ...material, lineageEvidenceSha256 };
  }));
}

function streamLineageHash(input: Readonly<{
  relationSha256: string;
  transcodeReceiptSha256: string;
  policySha256: string;
  masterEvidenceSha256: string;
  proxyEvidenceSha256: string;
  stream: Omit<MediaProxyMasterAudioLineageStreamReceiptV1, 'lineageEvidenceSha256'>;
}>): string {
  return hashEditronCanonicalJsonV1(input);
}

function recordForStream(
  records: readonly MediaSourceAudioArtifactAssetRecordV1[],
  streamIndex: number,
): MediaSourceAudioArtifactAssetRecordV1 | null {
  const matching = records.filter(
    ({ audioStreamIndex }) => audioStreamIndex === streamIndex,
  );
  return matching.length === 1 ? matching[0]! : null;
}

function sourceMatchesReference(
  source: Readonly<MediaSourceVersionV1>,
  reference: MediaSourceVersionReferenceV1,
): boolean {
  return source.sourceVersionSha256 === reference.sourceVersionSha256
    && source.contentSha256 === reference.contentSha256
    && source.storageVersion.storageVersionSha256
      === reference.storageVersionSha256;
}

function sameOwner(left: MediaSourceOwnerV1, right: MediaSourceOwnerV1): boolean {
  return left.kind === right.kind && (left.kind === 'USER'
    ? left.userId
      === (right as Extract<MediaSourceOwnerV1, { kind: 'USER' }>).userId
    : left.orgId
      === (right as Extract<MediaSourceOwnerV1, { kind: 'ORG' }>).orgId);
}

function sameIntegerSet(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length
    && left.every((value) => right.includes(value));
}

function sameIntegerArray(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function subtractRational(
  left: ExactSignedRationalV1,
  right: ExactSignedRationalV1,
): ExactSignedRationalV1 {
  const leftNumerator = BigInt(left.numerator);
  const leftDenominator = BigInt(left.denominator);
  const rightNumerator = BigInt(right.numerator);
  const rightDenominator = BigInt(right.denominator);
  return rational(
    leftNumerator * rightDenominator - rightNumerator * leftDenominator,
    leftDenominator * rightDenominator,
  );
}

function normalizedRational(value: ExactSignedRationalV1): ExactSignedRationalV1 {
  return rational(BigInt(value.numerator), BigInt(value.denominator));
}

function rational(numeratorValue: bigint, denominatorValue: bigint): ExactSignedRationalV1 {
  if (denominatorValue === BigInt(0)) fail('MEDIA_PROXY_MASTER_AUDIO_LINEAGE_ZERO_DENOMINATOR');
  let numerator = numeratorValue;
  let denominator = denominatorValue;
  if (denominator < BigInt(0)) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator < BigInt(0) ? -numerator : numerator, denominator);
  return { numerator: (numerator / divisor).toString(), denominator: (denominator / divisor).toString() };
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === BigInt(0) ? BigInt(1) : a;
}

function unverifiable(
  reason: MediaProxyMasterAudioLineageUnverifiableReasonV1,
  failedSide: 'MASTER' | 'PROXY' | null,
  failedStreamIndex: number | null,
  error: unknown,
): MediaProxyMasterAudioLineageVerificationResultV1 {
  return frozen({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    failedSide,
    failedStreamIndex,
    diagnostic: safeDiagnostic(error),
  });
}

function safeDiagnostic(error: unknown): string | null {
  if (!(error instanceof Error) || error.message.length > 200
    || !/^[A-Z0-9_:.-]+$/.test(error.message)) return null;
  return error.message;
}

function isoInstant(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || Number.isNaN(Date.parse(value))) fail(error);
  return value;
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

function identifier(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length === 0 || value.length > 240) fail(error);
  return value;
}

function checkedHash(value: unknown): string {
  return sha256(value, 'MEDIA_PROXY_MASTER_AUDIO_LINEAGE_HASH_INVALID');
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function positiveSafeInteger(value: unknown, max: number, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0
    || (value as number) > max) fail(error);
  return value as number;
}

function nonNegativeSafeInteger(value: unknown, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(error);
  return value as number;
}

function frozen<const T>(value: T): T {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
