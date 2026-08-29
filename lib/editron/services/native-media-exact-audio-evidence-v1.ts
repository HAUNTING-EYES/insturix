import {
  readMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetRecordV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
} from './media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 } from './media-source-audio-private-artifact-port-v1';
import {
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  verifyMediaSourceAudioPrivateArtifactSetV1,
} from './media-source-audio-private-artifact-v1';

export type NativeMediaExactAudioEvidenceV1 = Readonly<{
  assetStateSha256: string;
  record: MediaSourceAudioArtifactAssetRecordV1;
  evidence: ReturnType<typeof verifyMediaSourceAudioPrivateArtifactSetV1>;
}>;

export type NativeMediaExactAudioEvidenceResultV1 = Readonly<
  | {
      disposition: 'NO_AUDIO_REQUESTED';
      observedAudioStreamIndexes: readonly number[];
    }
  | {
      disposition: 'EXACT_AUDIO_EVIDENCE_READY';
      selected: NativeMediaExactAudioEvidenceV1;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'AUDIO_STREAM_OBSERVATION_INVALID'
        | 'AUDIO_STREAM_SELECTION_REQUIRED'
        | 'AUDIO_ARTIFACT_STATE_REQUIRED'
        | 'AUDIO_ARTIFACT_READER_REQUIRED'
        | 'AUDIO_ARTIFACT_READ_FAILED'
        | 'AUDIO_ARTIFACT_SCOPE_MISMATCH';
      diagnostic: string | null;
    }
>;

export async function resolveNativeMediaExactAudioEvidenceV1(input: Readonly<{
  asset: MediaSourceAudioArtifactAssetStateInputV1;
  required: boolean;
  reader?: MediaSourceAudioPrivateArtifactReaderV1;
}>): Promise<NativeMediaExactAudioEvidenceResultV1> {
  const indexes = readNativeMediaExactAudioStreamIndexesV1(input.asset);
  if (indexes === null) {
    return unverifiable('AUDIO_STREAM_OBSERVATION_INVALID');
  }
  if (!input.required) {
    return Object.freeze({
      disposition: 'NO_AUDIO_REQUESTED' as const,
      observedAudioStreamIndexes: indexes,
    });
  }
  if (indexes.length !== 1) {
    return unverifiable('AUDIO_STREAM_SELECTION_REQUIRED');
  }
  let state: ReturnType<typeof readMediaSourceAudioArtifactAssetStateV1>;
  try {
    state = readMediaSourceAudioArtifactAssetStateV1(input.asset);
  } catch (error) {
    return unverifiable('AUDIO_ARTIFACT_SCOPE_MISMATCH', diagnostic(error));
  }
  if (!state) return unverifiable('AUDIO_ARTIFACT_STATE_REQUIRED');
  if (!input.reader || typeof input.reader.readArtifactSet !== 'function') {
    return unverifiable('AUDIO_ARTIFACT_READER_REQUIRED');
  }
  const record = state.sourceAudioArtifactsV1.records.find(
    (candidate) => candidate.audioStreamIndex === indexes[0],
  );
  if (!record) return unverifiable('AUDIO_ARTIFACT_STATE_REQUIRED');

  let artifactSet: Awaited<ReturnType<MediaSourceAudioPrivateArtifactReaderV1['readArtifactSet']>>;
  try {
    artifactSet = await input.reader.readArtifactSet(record.manifestReference);
  } catch (error) {
    return unverifiable('AUDIO_ARTIFACT_READ_FAILED', diagnostic(error));
  }
  try {
    const evidence = verifyMediaSourceAudioPrivateArtifactSetV1({
      manifest: artifactSet.manifest,
      mapCanonicalJson: artifactSet.mapCanonicalJson,
    });
    assertArtifactMatchesRecord(record, artifactSet.manifest, evidence);
    return Object.freeze({
      disposition: 'EXACT_AUDIO_EVIDENCE_READY' as const,
      selected: Object.freeze({
        assetStateSha256: state.sourceAudioArtifactsStateSha256V1,
        record,
        evidence,
      }),
    });
  } catch (error) {
    return unverifiable('AUDIO_ARTIFACT_SCOPE_MISMATCH', diagnostic(error));
  }
}

export function readNativeMediaExactAudioStreamIndexesV1(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): readonly number[] | null {
  const qualification = asset.sourceQualificationV1 as {
    observation?: { audioStreams?: unknown };
  } | undefined;
  const streams = qualification?.observation?.audioStreams;
  if (!Array.isArray(streams)) return null;
  const indexes: number[] = [];
  for (const stream of streams) {
    if (!stream || typeof stream !== 'object') return null;
    const streamIndex = (stream as { streamIndex?: unknown }).streamIndex;
    if (!Number.isSafeInteger(streamIndex) || Number(streamIndex) < 0
      || indexes.includes(Number(streamIndex))) return null;
    indexes.push(Number(streamIndex));
  }
  return Object.freeze(indexes.sort((left, right) => left - right));
}

function assertArtifactMatchesRecord(
  record: MediaSourceAudioArtifactAssetRecordV1,
  manifest: Parameters<typeof verifyMediaSourceAudioPrivateArtifactSetV1>[0]['manifest'],
  evidence: ReturnType<typeof verifyMediaSourceAudioPrivateArtifactSetV1>,
): void {
  const serialized = serializeMediaSourceAudioPrivateArtifactManifestV1(manifest);
  if (!sameReference(serialized.reference, record.manifestReference)
    || manifest.manifestSha256 !== record.manifestSha256
    || manifest.audioSampleEpochMapSha256 !== record.audioSampleEpochMapSha256
    || manifest.decodedPcmSha256 !== record.decodedPcmSha256
    || manifest.decodedSampleFrameCount !== record.decodedSampleFrameCount
    || evidence.audioSampleEpochMapSha256 !== record.audioSampleEpochMapSha256
    || evidence.pcm.decodedPcmSha256 !== record.decodedPcmSha256
    || evidence.pcm.decodedSampleFrameCount !== record.decodedSampleFrameCount
    || evidence.binding.audioStreamIndex !== record.audioStreamIndex
    || evidence.binding.streamId !== record.streamId
    || evidence.binding.sampleRate !== record.sampleRate
    || evidence.binding.channelCount !== record.channelCount) {
    throw new Error('NATIVE_MEDIA_EXACT_AUDIO_ARTIFACT_STATE_MISMATCH');
  }
}

function sameReference(
  left: MediaSourceAudioArtifactAssetRecordV1['manifestReference'],
  right: MediaSourceAudioArtifactAssetRecordV1['manifestReference'],
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.storage === right.storage
    && left.artifactKind === right.artifactKind
    && left.objectKey === right.objectKey
    && left.byteLength === right.byteLength
    && left.contentSha256 === right.contentSha256;
}

function unverifiable(
  reason: Extract<NativeMediaExactAudioEvidenceResultV1, { disposition: 'UNVERIFIABLE' }>['reason'],
  detail: string | null = null,
): NativeMediaExactAudioEvidenceResultV1 {
  return Object.freeze({ disposition: 'UNVERIFIABLE' as const, reason, diagnostic: detail });
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,180}$/.test(error.message)
    ? error.message
    : null;
}
