import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 } from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from '@/lib/editron/services/durable-workflow-job-store-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_COMMAND_POLICY_VERSION_V1,
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_MAX_ATTEMPTS_V1,
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1,
  assertMediaSourcePtsCadenceDurableJobInputV1,
  buildMediaSourcePtsCadenceDurableJobContractV1,
  createOrGetMediaSourcePtsCadenceDurableJobV1,
} from '@/lib/editron/services/media-source-pts-cadence-durable-job-binding-v1';
import { MEDIA_SOURCE_PROBE_VERSION_V1 } from '@/lib/editron/services/media-source-probe-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const NOW = new Date('2026-08-25T08:00:00.000Z');

describe('media source PTS cadence durable job binding V1', () => {
  it('creates one URL-free MEDIA_ASSETS job bound to exact source evidence', async () => {
    const fixture = sourceFixture();
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
    const request = {
      tenantId: 'tenant-1', userId: 'user-1', orgId: null,
      assetId: 'asset-1', sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification, videoStreamIndex: 0,
    };
    const first = await createOrGetMediaSourcePtsCadenceDurableJobV1({
      jobStore, request, now: NOW,
    });
    const replay = await createOrGetMediaSourcePtsCadenceDurableJobV1({
      jobStore, request, now: new Date(NOW.getTime() + 1_000),
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.job.jobId).toBe(first.job.jobId);
    expect(first.job).toMatchObject({
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_source_pts_cadence_scan',
      projectId: null,
      maxAttempts: MEDIA_SOURCE_PTS_CADENCE_DURABLE_MAX_ATTEMPTS_V1,
      input: { schemaId: MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1 },
    });
    expect(JSON.stringify(first.job.input.payload)).not.toMatch(/source_url|https?:\/\//i);
    expect(first.job.input.payload).toMatchObject({
      mapBinding: {
        mapper: {
          ffprobeVersion: 'ffprobe version 8.1',
          commandPolicyVersion: MEDIA_SOURCE_PTS_CADENCE_COMMAND_POLICY_VERSION_V1,
        },
      },
    });
  });

  it('rejects stale qualification, implicit stream selection and owner mismatch', () => {
    const fixture = sourceFixture();
    const base = {
      tenantId: 'tenant-1', userId: 'user-1', orgId: null,
      assetId: 'asset-1', sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification, videoStreamIndex: 0,
    };
    expect(() => buildMediaSourcePtsCadenceDurableJobContractV1({
      ...base,
      qualification: { ...fixture.qualification, sourceBindingSha256: 'f'.repeat(64) },
    })).toThrow('MEDIA_SOURCE_PTS_JOB_QUALIFICATION_BINDING_INVALID');
    expect(() => buildMediaSourcePtsCadenceDurableJobContractV1({
      ...base, videoStreamIndex: 1,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_VIDEO_STREAM_UNAVAILABLE');
    expect(() => buildMediaSourcePtsCadenceDurableJobContractV1({
      ...base, userId: 'other-user',
    })).toThrow('MEDIA_SOURCE_PTS_JOB_SOURCE_OWNER_MISMATCH');
  });

  it('rejects old observations that do not bind the exact ffprobe binary', () => {
    const fixture = sourceFixture('ffprobe-8.1');
    expect(() => buildMediaSourcePtsCadenceDurableJobContractV1({
      tenantId: 'tenant-1', userId: 'user-1', orgId: null,
      assetId: 'asset-1', sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification, videoStreamIndex: 0,
    })).toThrow('MEDIA_SOURCE_PTS_JOB_FFPROBE_VERSION_UNAVAILABLE');
  });

  it('rejects copied or forged map and coverage bindings on resume', () => {
    const fixture = sourceFixture();
    const contract = buildMediaSourcePtsCadenceDurableJobContractV1({
      tenantId: 'tenant-1', userId: 'user-1', orgId: null,
      assetId: 'asset-1', sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification, videoStreamIndex: 0,
    });
    expect(assertMediaSourcePtsCadenceDurableJobInputV1(contract.payload))
      .toEqual(contract.payload);
    expect(() => assertMediaSourcePtsCadenceDurableJobInputV1({
      ...contract.payload,
      mapBindingSha256: 'f'.repeat(64),
    })).toThrow('MEDIA_SOURCE_PTS_JOB_MAP_BINDING_MISMATCH');
    expect(() => assertMediaSourcePtsCadenceDurableJobInputV1({
      ...contract.payload,
      expectedCoverage: {
        ...contract.payload.expectedCoverage,
        mapBindingSha256: 'f'.repeat(64),
      },
    })).toThrow();
  });
});

function sourceFixture(probeVersion = `${MEDIA_SOURCE_PROBE_VERSION_V1}; ffprobe version 8.1`) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'uploads/source.mov' },
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1', mediaKind: 'video', byteLength: 1_000,
    contentSha256: 'a'.repeat(64), storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PROBE_VERSION_V1,
    probeVersion,
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0', sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' }, frameCount: '300',
      colorSpace: 'bt709', colorTransfer: 'bt709', colorPrimaries: 'bt709',
      colorRange: 'tv', timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: 'asset-1',
    locator: storageVersion.locator,
    sourceBindingSha256: hashEditronCanonicalJsonV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
      assetId: 'asset-1',
      locator: storageVersion.locator,
    }),
    requestId: 'media-source-probe:test',
    attemptCount: 1,
    requestedAt: NOW.toISOString(), startedAt: NOW.toISOString(), completedAt: NOW.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  return { sourceVersion, qualification };
}
