import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readAssetState: vi.fn(),
  serializeManifest: vi.fn(),
  verifyArtifactSet: vi.fn(),
}));

vi.mock('@/lib/editron/services/media-source-audio-artifact-asset-owner-v1', async (
  importOriginal,
) => {
  const actual = await importOriginal<
    typeof import('@/lib/editron/services/media-source-audio-artifact-asset-owner-v1')
  >();
  return {
    ...actual,
    readMediaSourceAudioArtifactAssetStateV1: mocks.readAssetState,
  };
});

vi.mock('@/lib/editron/services/media-source-audio-private-artifact-v1', async (
  importOriginal,
) => {
  const actual = await importOriginal<
    typeof import('@/lib/editron/services/media-source-audio-private-artifact-v1')
  >();
  return {
    ...actual,
    serializeMediaSourceAudioPrivateArtifactManifestV1: mocks.serializeManifest,
    verifyMediaSourceAudioPrivateArtifactSetV1: mocks.verifyArtifactSet,
  };
});

import {
  readNativeMediaExactAudioStreamIndexesV1,
  resolveNativeMediaExactAudioEvidenceV1,
} from '@/lib/editron/services/native-media-exact-audio-evidence-v1';

const SHA = Object.freeze({
  state: '1'.repeat(64),
  manifest: '2'.repeat(64),
  map: '3'.repeat(64),
  pcm: '4'.repeat(64),
  content: '5'.repeat(64),
});

const reference = Object.freeze({
  schemaVersion: 1 as const,
  storage: 'R2_PRIVATE' as const,
  artifactKind: 'MANIFEST' as const,
  objectKey: 'private/editron/media-source-audio/v1/source/stream/manifests/test.json',
  byteLength: 100,
  contentSha256: SHA.content,
});

const record = Object.freeze({
  audioStreamIndex: 1,
  streamId: 'audio-stream-1',
  sampleRate: '48000',
  channelCount: 2,
  manifestReference: reference,
  manifestSha256: SHA.manifest,
  audioSampleEpochMapSha256: SHA.map,
  decodedPcmSha256: SHA.pcm,
  decodedSampleFrameCount: '48000',
});

function asset(streamIndexes: readonly number[]) {
  return {
    assetId: 'asset-1',
    type: 'video' as const,
    sourceQualificationV1: {
      observation: {
        audioStreams: streamIndexes.map((streamIndex) => ({ streamIndex })),
      },
    },
  };
}

function manifest(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    manifestSha256: SHA.manifest,
    audioSampleEpochMapSha256: SHA.map,
    decodedPcmSha256: SHA.pcm,
    decodedSampleFrameCount: '48000',
    ...overrides,
  };
}

function evidence() {
  return {
    audioSampleEpochMapSha256: SHA.map,
    pcm: {
      decodedPcmSha256: SHA.pcm,
      decodedSampleFrameCount: '48000',
    },
    binding: {
      audioStreamIndex: 1,
      streamId: 'audio-stream-1',
      sampleRate: '48000',
      channelCount: 2,
    },
  };
}

describe('native media exact-audio evidence v1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAssetState.mockReturnValue({
      sourceAudioArtifactsStateSha256V1: SHA.state,
      sourceAudioArtifactsV1: { records: [record] },
    });
    mocks.serializeManifest.mockReturnValue({ reference });
    mocks.verifyArtifactSet.mockReturnValue(evidence());
  });

  it('sorts observed indexes and rejects duplicate observations', () => {
    expect(readNativeMediaExactAudioStreamIndexesV1(asset([2, 1]) as never)).toEqual([1, 2]);
    expect(readNativeMediaExactAudioStreamIndexesV1(asset([1, 1]) as never)).toBeNull();
  });

  it('does not require private artifacts when native audio was not requested', async () => {
    const result = await resolveNativeMediaExactAudioEvidenceV1({
      asset: asset([2, 1]) as never,
      required: false,
    });

    expect(result).toEqual({
      disposition: 'NO_AUDIO_REQUESTED',
      observedAudioStreamIndexes: [1, 2],
    });
    expect(mocks.readAssetState).not.toHaveBeenCalled();
  });

  it('requires an explicit choice when more than one source audio stream exists', async () => {
    const reader = { readArtifactSet: vi.fn() };
    const result = await resolveNativeMediaExactAudioEvidenceV1({
      asset: asset([1, 2]) as never,
      required: true,
      reader,
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'AUDIO_STREAM_SELECTION_REQUIRED',
      diagnostic: null,
    });
    expect(reader.readArtifactSet).not.toHaveBeenCalled();
  });

  it('returns exact evidence only when the private artifact matches asset state', async () => {
    const artifactManifest = manifest();
    const reader = {
      readArtifactSet: vi.fn(async () => ({
        manifest: artifactManifest,
        mapCanonicalJson: '{"kind":"test"}',
      })),
    };
    const result = await resolveNativeMediaExactAudioEvidenceV1({
      asset: asset([1]) as never,
      required: true,
      reader: reader as never,
    });

    expect(result).toEqual({
      disposition: 'EXACT_AUDIO_EVIDENCE_READY',
      selected: {
        assetStateSha256: SHA.state,
        record,
        evidence: evidence(),
      },
    });
    expect(reader.readArtifactSet).toHaveBeenCalledWith(reference);
  });

  it('rejects missing state, a missing reader, and manifest scope mismatch', async () => {
    mocks.readAssetState.mockReturnValueOnce(null);
    await expect(resolveNativeMediaExactAudioEvidenceV1({
      asset: asset([1]) as never,
      required: true,
      reader: { readArtifactSet: vi.fn() } as never,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'AUDIO_ARTIFACT_STATE_REQUIRED',
      diagnostic: null,
    });

    await expect(resolveNativeMediaExactAudioEvidenceV1({
      asset: asset([1]) as never,
      required: true,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'AUDIO_ARTIFACT_READER_REQUIRED',
      diagnostic: null,
    });

    const wrongManifest = manifest({ decodedPcmSha256: 'f'.repeat(64) });
    await expect(resolveNativeMediaExactAudioEvidenceV1({
      asset: asset([1]) as never,
      required: true,
      reader: {
        readArtifactSet: vi.fn(async () => ({
          manifest: wrongManifest,
          mapCanonicalJson: '{"kind":"test"}',
        })),
      } as never,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'AUDIO_ARTIFACT_SCOPE_MISMATCH',
      diagnostic: 'NATIVE_MEDIA_EXACT_AUDIO_ARTIFACT_STATE_MISMATCH',
    });
  });
});
