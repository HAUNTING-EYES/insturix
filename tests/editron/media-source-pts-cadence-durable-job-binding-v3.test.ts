import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { buildMediaSourcePtsCadenceDurableJobContractV1 }
  from '@/lib/editron/services/media-source-pts-cadence-durable-job-binding-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3,
  assertMediaSourcePtsCadenceDurableEpochJobInputV3,
  buildMediaSourcePtsCadenceDurableEpochJobContractV3,
  createOrGetMediaSourcePtsCadenceDurableEpochJobV3,
} from '@/lib/editron/services/media-source-pts-cadence-durable-job-binding-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-scan-transport-v3';
import { MEDIA_SOURCE_PROBE_VERSION_V1 }
  from '@/lib/editron/services/media-source-probe-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const NOW = new Date('2026-08-30T08:00:00.000Z');

describe('media source PTS cadence durable epoch job binding V3', () => {
  it('creates one URL-free V3 job bound to source, mapper and verification policy', async () => {
    const fixture = sourceFixture();
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(async () => collection.asCollection());
    const request = requestFor(fixture);
    const first = await createOrGetMediaSourcePtsCadenceDurableEpochJobV3({
      jobStore, request, now: NOW,
    });
    const replay = await createOrGetMediaSourcePtsCadenceDurableEpochJobV3({
      jobStore, request, now: new Date(NOW.getTime() + 1_000),
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.job.jobId).toBe(first.job.jobId);
    expect(first.job).toMatchObject({
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_source_pts_cadence_epoch_scan',
      projectId: null,
      input: {
        schemaId: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3,
      },
    });
    expect(first.job.input.payload).toMatchObject({
      mapBinding: {
        mapper: {
          mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
          commandPolicyVersion:
            MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
        },
      },
      verificationPolicy: { maxBoundaryEvidenceReads: 0 },
    });
    expect(JSON.stringify(first.job.input.payload)).not.toMatch(/source_url|https?:\/\//i);
  });

  it('keeps V1 and V3 operation identities distinct for the same source', () => {
    const fixture = sourceFixture();
    const request = requestFor(fixture);
    const v1 = buildMediaSourcePtsCadenceDurableJobContractV1(request);
    const v3 = buildMediaSourcePtsCadenceDurableEpochJobContractV3(request);

    expect(v3.operationIdentity).not.toBe(v1.operationIdentity);
    expect(v3.payload.mapBindingSha256).not.toBe(v1.payload.mapBindingSha256);
    expect(v3.payload.mapBinding.mapper.mapperVersion)
      .toBe(MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3);
  });

  it('rejects copied bindings and weakened external-boundary verification', () => {
    const fixture = sourceFixture();
    const contract = buildMediaSourcePtsCadenceDurableEpochJobContractV3(
      requestFor(fixture),
    );
    expect(assertMediaSourcePtsCadenceDurableEpochJobInputV3(contract.payload))
      .toEqual(contract.payload);
    expect(() => assertMediaSourcePtsCadenceDurableEpochJobInputV3({
      ...contract.payload,
      mapBindingSha256: 'f'.repeat(64),
    })).toThrow('MEDIA_SOURCE_PTS_EPOCH_JOB_MAP_BINDING_MISMATCH');
    expect(() => assertMediaSourcePtsCadenceDurableEpochJobInputV3({
      ...contract.payload,
      verificationPolicy: {
        ...contract.payload.verificationPolicy,
        maxBoundaryEvidenceReads: 1,
      },
    })).toThrow('MEDIA_SOURCE_PTS_EPOCH_JOB_VERIFICATION_POLICY_MISMATCH');
  });

  it('inherits exact source ownership and qualified ffprobe checks', () => {
    const fixture = sourceFixture();
    expect(() => buildMediaSourcePtsCadenceDurableEpochJobContractV3({
      ...requestFor(fixture), userId: 'other-user',
    })).toThrow('MEDIA_SOURCE_PTS_JOB_SOURCE_OWNER_MISMATCH');
    const unqualified = sourceFixture('ffprobe-8.1');
    expect(() => buildMediaSourcePtsCadenceDurableEpochJobContractV3(
      requestFor(unqualified),
    )).toThrow('MEDIA_SOURCE_PTS_JOB_FFPROBE_VERSION_UNAVAILABLE');
  });
});

function requestFor(fixture: ReturnType<typeof sourceFixture>) {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    orgId: null,
    assetId: 'asset-1',
    sourceVersion: fixture.sourceVersion,
    qualification: fixture.qualification,
    videoStreamIndex: 0,
  };
}

function sourceFixture(
  probeVersion = `${MEDIA_SOURCE_PROBE_VERSION_V1}; ffprobe version 8.1`,
) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'uploads/source.mov' },
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 1_000,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PROBE_VERSION_V1,
    probeVersion,
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '300',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
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
    requestId: 'media-source-probe:test-v3',
    attemptCount: 1,
    requestedAt: NOW.toISOString(),
    startedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  return { sourceVersion, qualification };
}
