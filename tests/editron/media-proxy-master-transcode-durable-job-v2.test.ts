import { describe, expect, it } from 'vitest';

import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { createMediaProxyMasterR2PreparedArtifactPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  assertMediaProxyMasterTranscodeDurableJobV2,
  buildMediaProxyMasterTranscodeDurableJobContractV2,
  createOrGetMediaProxyMasterTranscodeDurableJobV2,
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v2';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
  type MediaProxyMasterTranscodeCommandV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { R2_MAX_OBJECT_BYTES } from '@/lib/editron/services/r2-upload-limits';
import { buildMediaProxyMasterTranscodeBudgetFixtureV1 }
  from './helpers/media-proxy-master-transcode-budget-fixture';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const NOW = new Date('2026-08-30T18:00:00.000Z');

describe('MediaProxyMasterTranscodeDurableJobV2', () => {
  it('creates and replays one policy-v2 and prepared-artifact-bound job', async () => {
    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    );
    const request = jobRequest();
    const first = await createOrGetMediaProxyMasterTranscodeDurableJobV2({
      jobStore, request, now: NOW,
    });
    const replay = await createOrGetMediaProxyMasterTranscodeDurableJobV2({
      jobStore, request, now: new Date(NOW.getTime() + 1_000),
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.job.jobId).toBe(first.job.jobId);
    expect(first.job.input.schemaId)
      .toBe(MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2);
    expect(first.job.operationId).toMatch(/^mpmtrans2_[a-f0-9]{64}$/);
    expect(assertMediaProxyMasterTranscodeDurableJobV2(first.job))
      .toEqual(first.job.input.payload);
    expect(first.job.dependencies.map(({ dependencyId }) => dependencyId))
      .toContain('prepared-artifact-policy');
  });

  it('admits multipart-sized output while rejecting provider object overflow', () => {
    const large = jobRequest({ maxOutputBytes: 6 * GiB });
    expect(buildMediaProxyMasterTranscodeDurableJobContractV2(large)
      .payload.command.policy.maxOutputBytes).toBe(6 * GiB);

    const overflow = jobRequest({ maxOutputBytes: R2_MAX_OBJECT_BYTES + 1 });
    expect(() => buildMediaProxyMasterTranscodeDurableJobContractV2(overflow))
      .toThrow('PUBLICATION_CAPABILITY_MISMATCH');
  });

  it('rejects publication/preparation substitution and copied ownership', () => {
    const request = jobRequest();
    const contract = buildMediaProxyMasterTranscodeDurableJobContractV2(request);
    expect(assertMediaProxyMasterTranscodeDurableJobInputV2(contract.payload))
      .toEqual(contract.payload);

    const otherPublication = createMediaProxyMasterR2PrivatePublicationPolicyV2({
      ...storageScope(),
      storagePolicyVersion: 'other-private-policy-v1',
    });
    expect(() => buildMediaProxyMasterTranscodeDurableJobContractV2({
      ...request,
      publicationPolicy: otherPublication,
    })).toThrow('PREPARED_PUBLICATION_POLICY_MISMATCH');
    expect(() => buildMediaProxyMasterTranscodeDurableJobContractV2({
      ...request,
      userId: 'copied-user',
    })).toThrow('OWNER_SCOPE_MISMATCH');
  });

  it('changes identity for prepared policy and rejects snapshot tampering', async () => {
    const request = jobRequest();
    const otherPrepared = createPreparedPolicy(
      request.publicationPolicy,
      6 * MiB,
    );
    expect(buildMediaProxyMasterTranscodeDurableJobContractV2({
      ...request,
      preparedArtifactPolicy: otherPrepared,
    }).operationIdentity).not.toBe(
      buildMediaProxyMasterTranscodeDurableJobContractV2(request)
        .operationIdentity,
    );

    const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
    const jobStore = new DurableWorkflowJobStoreV1(
      async () => collection.asCollection(),
    );
    const { job } = await createOrGetMediaProxyMasterTranscodeDurableJobV2({
      jobStore, request, now: NOW,
    });
    expect(() => assertMediaProxyMasterTranscodeDurableJobV2({
      ...job,
      dependencies: job.dependencies.filter(
        ({ dependencyId }) => dependencyId !== 'prepared-artifact-policy',
      ),
    })).toThrow('JOB_BINDING_MISMATCH');
    expect(() => assertMediaProxyMasterTranscodeDurableJobV2({
      ...job,
      expiresAt: new Date(Date.parse(job.expiresAt) + 1).toISOString(),
    })).toThrow('JOB_BINDING_MISMATCH');
  });
});

function jobRequest(
  options: Readonly<{ maxOutputBytes?: number }> = {},
) {
  const fixture = buildMediaProxyMasterTranscodeBudgetFixtureV1();
  const command = withMaxOutput(
    fixture.command,
    options.maxOutputBytes ?? fixture.command.policy.maxOutputBytes,
  );
  const publicationPolicy =
    createMediaProxyMasterR2PrivatePublicationPolicyV2(storageScope());
  return {
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command,
    publicationPolicy,
    preparedArtifactPolicy: createPreparedPolicy(
      publicationPolicy,
      5 * MiB,
    ),
    runtimePolicy: fixture.runtimePolicy,
    budgetReservation: {
      reservationId: fixture.reservation.reservationId,
      bindingSha256: fixture.reservation.reservationSha256,
    },
  };
}

function withMaxOutput(
  command: MediaProxyMasterTranscodeCommandV1,
  maxOutputBytes: number,
) {
  const source = command.policy;
  const policy = createMediaProxyMasterTranscodePolicyV1({
    presentationPolicy: source.presentationPolicy,
    timestampOriginPolicy: source.timestampOriginPolicy,
    container: source.container,
    videoCodec: source.videoCodec,
    pixelFormat: source.pixelFormat,
    scalingPolicy: source.scalingPolicy,
    maximumWidth: source.maximumWidth,
    maximumHeight: source.maximumHeight,
    videoCrf: source.videoCrf,
    videoPreset: source.videoPreset,
    keyframeIntervalSeconds: source.keyframeIntervalSeconds,
    audioPolicy: source.audioPolicy,
    audioCodec: source.audioCodec,
    audioBitrateBitsPerSecond: source.audioBitrateBitsPerSecond,
    maxSourceBytes: source.maxSourceBytes,
    maxOutputBytes,
    timeoutMs: source.timeoutMs,
  });
  return createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: command.transcodeJobId,
    policy,
    masterSourceVersion: command.masterSourceVersion,
    masterTimeMap: command.masterTimeMap,
    masterVideoStreamIndex: command.masterVideoStreamIndex,
    masterAudioStreamIndexes: command.masterAudioStreamIndexes,
  });
}

function createPreparedPolicy(
  publicationPolicy: ReturnType<
    typeof createMediaProxyMasterR2PrivatePublicationPolicyV2
  >,
  targetChunkBytes: number,
) {
  return createMediaProxyMasterR2PreparedArtifactPolicyV1({
    publicationPolicy,
    targetChunkBytes,
    maximumManifestBytes: 8 * MiB,
  });
}

function storageScope() {
  return {
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
  };
}
