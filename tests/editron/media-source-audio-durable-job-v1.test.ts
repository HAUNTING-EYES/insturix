import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1,
  MEDIA_SOURCE_AUDIO_DURABLE_MAX_ATTEMPTS_V1,
  MEDIA_SOURCE_AUDIO_DURABLE_TTL_MS_V1,
  assertMediaSourceAudioDurableJobInputV1,
  buildMediaSourceAudioDurableJobContractV1,
  createOrGetMediaSourceAudioDurableJobV1,
} from '@/lib/editron/services/media-source-audio-durable-job-v1';
import type { MediaSourceAudioSampleEpochResourcePolicyV1 }
  from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const NOW = new Date('2026-08-30T15:00:00.000Z');

describe('MediaSourceAudioDurableJobV1', () => {
  it('creates one URL-free job bound to the complete canonical stream set', async () => {
    const fixture = sourceFixture('primary', 'video', [7, 2]);
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    );
    const request = requestFor(fixture);
    const first = await createOrGetMediaSourceAudioDurableJobV1({
      jobStore, request, now: NOW,
    });
    const replay = await createOrGetMediaSourceAudioDurableJobV1({
      jobStore,
      request,
      now: new Date(NOW.getTime() + 1_000),
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.job.jobId).toBe(first.job.jobId);
    expect(first.job).toMatchObject({
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_source_audio_materialization',
      projectId: null,
      maxAttempts: MEDIA_SOURCE_AUDIO_DURABLE_MAX_ATTEMPTS_V1,
      input: { schemaId: MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1 },
    });
    expect(Date.parse(first.job.expiresAt) - NOW.getTime())
      .toBe(MEDIA_SOURCE_AUDIO_DURABLE_TTL_MS_V1);
    const payload = assertMediaSourceAudioDurableJobInputV1(
      first.job.input.payload,
    );
    expect(payload.audioStreamBindings.map(({ audioStreamIndex }) => (
      audioStreamIndex
    ))).toEqual([2, 7]);
    expect(first.job.dependencies.map(({ dependencyId }) => dependencyId))
      .toEqual([
        'audio-resource-policy',
        'audio-stream-bindings',
        'durable-lifecycle-policy',
        'private-storage-policy',
        'source-binding',
        'source-version',
        'storage-version',
        'technical-observation',
      ]);
    expect(JSON.stringify(first.job.input.payload))
      .not.toMatch(/source_url|https?:\/\/|uploads\//i);
  });

  it.each(['audio', 'video'] as const)(
    'builds the same evidence contract for a qualified %s source',
    (mediaKind) => {
      const contract = buildMediaSourceAudioDurableJobContractV1(
        requestFor(sourceFixture(mediaKind, mediaKind, [3])),
      );

      expect(contract.payload.audioStreamBindings).toHaveLength(1);
      expect(contract.payload.audioStreamBindings[0]?.mediaKind).toBe(mediaKind);
      expect(contract.operationIdentity).toMatch(/^msaudio_[a-f0-9]{64}$/);
    },
  );

  it('changes identity when the source version or resource policy changes', () => {
    const primary = buildMediaSourceAudioDurableJobContractV1(
      requestFor(sourceFixture('identity-a', 'video', [2])),
    );
    const differentSource = buildMediaSourceAudioDurableJobContractV1(
      requestFor(sourceFixture('identity-b', 'video', [2])),
    );
    const differentPolicy = buildMediaSourceAudioDurableJobContractV1({
      ...requestFor(sourceFixture('identity-a', 'video', [2])),
      resourcePolicy: { ...resourcePolicy(), timeoutMs: 2_000 },
    });

    expect(differentSource.operationIdentity)
      .not.toBe(primary.operationIdentity);
    expect(differentPolicy.operationIdentity)
      .not.toBe(primary.operationIdentity);
  });

  it('rejects noncanonical, copied, weakened and extended payloads', () => {
    const primary = buildMediaSourceAudioDurableJobContractV1(
      requestFor(sourceFixture('adversary-a', 'video', [2, 7])),
    );
    const other = buildMediaSourceAudioDurableJobContractV1(
      requestFor(sourceFixture('adversary-b', 'video', [2, 7])),
    );
    expect(assertMediaSourceAudioDurableJobInputV1(primary.payload))
      .toEqual(primary.payload);
    expect(() => assertMediaSourceAudioDurableJobInputV1({
      ...primary.payload,
      audioStreamBindings: [...primary.payload.audioStreamBindings].reverse(),
    })).toThrow('MEDIA_SOURCE_AUDIO_JOB_STREAM_BINDINGS_NONCANONICAL');

    const mixed = [
      primary.payload.audioStreamBindings[0]!,
      other.payload.audioStreamBindings[1]!,
    ];
    expect(() => assertMediaSourceAudioDurableJobInputV1({
      ...primary.payload,
      audioStreamBindings: mixed,
      audioStreamBindingsSha256: hashEditronCanonicalJsonV1(mixed),
    })).toThrow('MEDIA_SOURCE_AUDIO_JOB_STREAM_BINDINGS_SCOPE_MISMATCH');
    expect(() => assertMediaSourceAudioDurableJobInputV1({
      ...primary.payload,
      lifecyclePolicy: {
        ...primary.payload.lifecyclePolicy,
        maxAttempts: 19,
      },
    })).toThrow('MEDIA_SOURCE_AUDIO_JOB_LIFECYCLE_POLICY_MISMATCH');
    expect(() => assertMediaSourceAudioDurableJobInputV1({
      ...primary.payload,
      unexpected: true,
    })).toThrow('MEDIA_SOURCE_AUDIO_JOB_INPUT_FIELDS_INVALID');
  });

  it('rejects an owner mismatch and routes zero streams to no-audio proof', () => {
    const fixture = sourceFixture('scope', 'video', [2]);
    expect(() => buildMediaSourceAudioDurableJobContractV1({
      ...requestFor(fixture), userId: 'other-user',
    })).toThrow('MEDIA_SOURCE_AUDIO_JOB_SOURCE_OWNER_MISMATCH');
    expect(() => buildMediaSourceAudioDurableJobContractV1(
      requestFor(sourceFixture('silent', 'video', [])),
    )).toThrow('MEDIA_SOURCE_AUDIO_JOB_NO_AUDIO_STREAMS');
  });
});

function requestFor(fixture: ReturnType<typeof sourceFixture>) {
  return {
    tenantId: 'tenant-audio',
    userId: 'user-audio',
    orgId: null,
    assetId: 'asset-audio',
    sourceVersion: fixture.sourceVersion,
    qualification: fixture.qualification,
    resourcePolicy: resourcePolicy(),
  };
}

function sourceFixture(
  tag: string,
  mediaKind: 'audio' | 'video',
  audioStreamIndexes: readonly number[],
) {
  const locator = {
    provider: 'R2' as const,
    objectKey: `uploads/audio-${tag}.mov`,
  };
  const storageVersion = createMediaSourceStorageVersionV1({
    locator,
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-audio' },
    assetId: 'asset-audio',
    mediaKind,
    byteLength: storageVersion.byteLength,
    contentSha256: hashEditronCanonicalJsonV1({ tag }),
    storageVersion,
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: sourceVersion.assetId,
      source: 'user-upload',
      r2Key: locator.objectKey,
    },
    now: NOW,
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_FIXTURE_INVALID');
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: mediaKind === 'audio' ? 'wav' : 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [],
    audioStreams: audioStreamIndexes.map((streamIndex) => ({
      streamIndex,
      codec: 'pcm_s24le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '480000',
    })),
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    ...created.record,
    status: 'MEASURED_TECHNICAL',
    attemptCount: 1,
    startedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
  };
  return { qualification, sourceVersion };
}

function resourcePolicy(): MediaSourceAudioSampleEpochResourcePolicyV1 {
  return {
    policyVersion: 'audio-durable-job-test-v1',
    maxSourceBytes: 1_000,
    maxCanonicalJsonBytes: 100_000,
    maxDecodedFrameEntries: 10,
    maxEpochEntries: 10,
    maxDecodedSampleFrames: 1_000_000,
    maxDecodedPcmBytes: 8_000_000,
    timeoutMs: 1_000,
  };
}
