import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
  serializeMediaSourceAudioSampleEpochMapV1,
} from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import {
  createMediaSourceAudioEpochMapArtifactReferenceV1,
  createMediaSourceAudioPcmChunkPlanV1,
  createMediaSourceAudioPcmChunkReferenceV1,
  createMediaSourceAudioPrivateArtifactManifestV1,
  MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  parseMediaSourceAudioPrivateArtifactManifestV1,
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  verifyMediaSourceAudioPrivateArtifactSetV1,
  type MediaSourceAudioPrivateArtifactPolicyV1,
} from '@/lib/editron/services/media-source-audio-private-artifact-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('media source audio private artifact V1', () => {
  it('plans sample-aligned chunks and round-trips a commit-last manifest', () => {
    const fixture = audioFixture();
    const mapSerialization = serializeMediaSourceAudioSampleEpochMapV1(fixture.map);
    const epochMapArtifact = createMediaSourceAudioEpochMapArtifactReferenceV1({
      serialization: mapSerialization,
    });
    const plan = createMediaSourceAudioPcmChunkPlanV1({
      map: fixture.map,
      policy: fixture.policy,
    });
    expect(plan).toEqual([
      { chunkIndex: 0, startSampleFrame: '0', endExclusiveSampleFrame: '4', byteLength: 32 },
      { chunkIndex: 1, startSampleFrame: '4', endExclusiveSampleFrame: '8', byteLength: 32 },
      { chunkIndex: 2, startSampleFrame: '8', endExclusiveSampleFrame: '10', byteLength: 16 },
    ]);
    const chunks = plan.map((entry) => createMediaSourceAudioPcmChunkReferenceV1({
      map: fixture.map,
      planEntry: entry,
      contentSha256: digest(fixture.pcm.subarray(
        Number(BigInt(entry.startSampleFrame) * BigInt(8)),
        Number(BigInt(entry.endExclusiveSampleFrame) * BigInt(8)),
      )),
    }));
    const manifest = createMediaSourceAudioPrivateArtifactManifestV1({
      map: fixture.map,
      epochMapArtifact,
      pcmChunks: chunks,
      policy: fixture.policy,
    });
    const serialization = serializeMediaSourceAudioPrivateArtifactManifestV1(manifest);
    expect(serialization.reference).toMatchObject({
      storage: 'R2_PRIVATE',
      artifactKind: 'MANIFEST',
      byteLength: Buffer.byteLength(serialization.canonicalJson, 'utf8'),
    });
    expect(serialization.reference.objectKey).toMatch(
      /^private\/editron\/media-source-audio\/v1\/[a-f0-9]{64}\/[a-f0-9]{64}\/manifests\/[a-f0-9]{64}\.json$/,
    );
    const parsed = parseMediaSourceAudioPrivateArtifactManifestV1(
      serialization.canonicalJson,
    );
    expect(verifyMediaSourceAudioPrivateArtifactSetV1({
      manifest: parsed,
      mapCanonicalJson: mapSerialization.canonicalJson,
    })).toEqual(fixture.map);
  });

  it('rejects unsafe policy, missing/reordered coverage, wrong scope, and tampering', () => {
    const fixture = audioFixture();
    expect(() => createMediaSourceAudioPcmChunkPlanV1({
      map: fixture.map,
      policy: { ...fixture.policy, maxChunkBytes: 7 },
    })).toThrow('MEDIA_SOURCE_AUDIO_PRIVATE_POLICY_CHUNK_ALIGNMENT_INVALID');
    expect(() => createMediaSourceAudioPcmChunkPlanV1({
      map: fixture.map,
      policy: { ...fixture.policy, maxChunkCount: 2 },
    })).toThrow('MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_COUNT_EXCEEDED');

    const mapSerialization = serializeMediaSourceAudioSampleEpochMapV1(fixture.map);
    const epochMapArtifact = createMediaSourceAudioEpochMapArtifactReferenceV1({
      serialization: mapSerialization,
    });
    const plan = createMediaSourceAudioPcmChunkPlanV1({
      map: fixture.map,
      policy: fixture.policy,
    });
    const chunks = plan.map((entry) => createMediaSourceAudioPcmChunkReferenceV1({
      map: fixture.map,
      planEntry: entry,
      contentSha256: digest(fixture.pcm.subarray(
        entry.chunkIndex * 32,
        entry.chunkIndex * 32 + entry.byteLength,
      )),
    }));
    expect(() => createMediaSourceAudioPrivateArtifactManifestV1({
      map: fixture.map,
      epochMapArtifact,
      pcmChunks: [chunks[1]!, chunks[0]!, chunks[2]!],
      policy: fixture.policy,
    })).toThrow('MEDIA_SOURCE_AUDIO_PRIVATE_CHUNK_COVERAGE_INVALID');
    expect(() => createMediaSourceAudioPrivateArtifactManifestV1({
      map: fixture.map,
      epochMapArtifact: {
        ...epochMapArtifact,
        objectKey: epochMapArtifact.objectKey.replace('/epoch-map/', '/manifests/'),
      },
      pcmChunks: chunks,
      policy: fixture.policy,
    })).toThrow('MEDIA_SOURCE_AUDIO_PRIVATE_MAP_REFERENCE_MISMATCH');

    const manifest = createMediaSourceAudioPrivateArtifactManifestV1({
      map: fixture.map,
      epochMapArtifact,
      pcmChunks: chunks,
      policy: fixture.policy,
    });
    const serialized = serializeMediaSourceAudioPrivateArtifactManifestV1(manifest);
    expect(() => parseMediaSourceAudioPrivateArtifactManifestV1(
      `${serialized.canonicalJson} `,
    )).toThrow('MEDIA_SOURCE_AUDIO_PRIVATE_MANIFEST_JSON_NON_CANONICAL');
    const wrongMapJson = serializeMediaSourceAudioSampleEpochMapV1(
      audioFixture('other-source').map,
    ).canonicalJson;
    expect(() => verifyMediaSourceAudioPrivateArtifactSetV1({
      manifest,
      mapCanonicalJson: wrongMapJson,
    })).toThrow('MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_SET_SCOPE_MISMATCH');
  });
});

function audioFixture(tag = 'primary') {
  const pcm = Uint8Array.from({ length: 80 }, (_, index) => index);
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `media/${tag}.mov` },
    byteLength: 100,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: `asset-${tag}`,
    mediaKind: 'video',
    byteLength: 100,
    contentSha256: digest(Buffer.from(`source-${tag}`)),
    storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 1,
    startTimeMilliseconds: 0,
    videoStreams: [],
    audioStreams: [{
      streamIndex: 1,
      codec: 'pcm_s16le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '10',
    }],
  };
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: sourceVersion.assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: digest(Buffer.from(`binding-${tag}`)),
    requestId: `request-${tag}`,
    attemptCount: 1,
    requestedAt: '2026-08-29T00:00:00.000Z',
    startedAt: '2026-08-29T00:00:01.000Z',
    completedAt: '2026-08-29T00:00:02.000Z',
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  const binding = createMediaSourceAudioStreamBindingV1({
    sourceVersion,
    qualification,
    audioStreamIndex: 1,
  });
  const policy: MediaSourceAudioPrivateArtifactPolicyV1 = {
    policyVersion: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
    maxChunkBytes: 32,
    maxChunkCount: 10,
    maxManifestBytes: 100_000,
    maxReadBytes: 100_000,
  };
  const map = createMediaSourceAudioSampleEpochMapV1({
    binding,
    toolchain: {
      adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
      ffmpegVersion: 'ffmpeg-8.1',
      ffprobeVersion: 'ffprobe-8.1',
    },
    resourcePolicy: {
      policyVersion: 'audio-evidence-test-v1',
      maxSourceBytes: 100,
      maxCanonicalJsonBytes: 100_000,
      maxDecodedFrameEntries: 10,
      maxEpochEntries: 10,
      maxDecodedSampleFrames: 100,
      maxDecodedPcmBytes: 1_000,
      timeoutMs: 1_000,
    },
    frames: [{ presentationTimestampTicks: '0', decodedSampleFrameCount: '10' }],
    pcm: { decodedByteLength: pcm.byteLength, decodedPcmSha256: digest(pcm) },
  });
  return { map, pcm, policy };
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
