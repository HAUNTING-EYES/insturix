import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1 }
  from '@/lib/editron/services/media-proxy-master-r2-multipart-coordinator-v1';
import { MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publisher-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2,
  selectMediaProxyMasterR2PublicationPathV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import { createMediaProxyMasterTranscodePreparedResumeStateV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v2';
import { createMediaProxyMasterTranscodePublicationOwnerV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-publication-owner-v2';
import { expectedMediaProxyMasterTranscodeR2ObjectKeyV1 }
  from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import {
  buildMediaProxyMasterTranscodeV2Fixture,
  createMediaProxyMasterTranscodePreparedStateV2Fixture,
  withMediaProxyMasterTranscodeResumeV2Fixture,
} from './helpers/media-proxy-master-transcode-v2-fixture';

describe('MediaProxyMasterTranscodePublicationOwnerV2', () => {
  it('routes an eligible small artifact only to the bound single-PUT owner',
    async () => {
      const fixture = publicationFixture();

      await expect(fixture.owner.publish(fixture.input))
        .resolves.toEqual(fixture.sourceVersion);
      expect(fixture.singlePublish).toHaveBeenCalledWith(expect.objectContaining({
        localPath: fixture.input.localPath,
        objectKey: fixture.input.objectKey,
        contentSha256: fixture.input.contentSha256,
        byteLength: fixture.input.byteLength,
        commandSha256: fixture.jobInput.command.commandSha256,
        outputProbeSha256:
          fixture.preparedState.preparedEvidence.outputProbe.probeSha256,
      }));
      expect(fixture.multipartPublish).not.toHaveBeenCalled();
    });

  it('routes a large durable artifact only to the multipart coordinator',
    async () => {
      const byteLength = MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1 + 1;
      const fixture = publicationFixture({
        artifactByteLength: byteLength,
        maxOutputBytes: byteLength,
      });

      await expect(fixture.owner.publish(fixture.input))
        .resolves.toEqual(fixture.sourceVersion);
      expect(fixture.input.selection.path).toBe('DURABLE_MULTIPART');
      expect(fixture.singlePublish).not.toHaveBeenCalled();
      expect(fixture.multipartPublish).toHaveBeenCalledWith({
        artifact: expect.objectContaining({
          jobId: fixture.job.jobId,
          publicationPolicySha256:
            fixture.jobInput.publicationPolicy.policySha256,
          byteLength,
          objectKey: fixture.input.objectKey,
        }),
        localPath: fixture.input.localPath,
        leaseOwnerId: fixture.job.leaseOwnerId,
        leaseTokenSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        completionAttemptId: expect.stringMatching(/^mpmcomplete-1-/),
      });
    });

  it('rejects an injected path or altered job input before either owner',
    async () => {
      const fixture = publicationFixture();
      const forgedSelection = {
        disposition: 'ELIGIBLE',
        path: 'DURABLE_MULTIPART',
        actualByteLength: fixture.input.byteLength,
        multipartPlan: { partSize: 5_242_880, totalParts: 1 },
        policySha256: fixture.jobInput.publicationPolicy.policySha256,
      } as const;
      await expect(fixture.owner.publish({
        ...fixture.input,
        selection: forgedSelection,
      })).rejects.toMatchObject({ retryable: false });
      await expect(fixture.owner.publish({
        ...fixture.input,
        jobInput: { ...fixture.jobInput, assetId: 'asset-substituted' },
      })).rejects.toMatchObject({ retryable: false });
      expect(fixture.singlePublish).not.toHaveBeenCalled();
      expect(fixture.multipartPublish).not.toHaveBeenCalled();
    });

  it('permanently rejects a substituted publisher result', async () => {
    const fixture = publicationFixture();
    fixture.singlePublish.mockResolvedValueOnce(createPublishedSource(
      fixture,
      hash('substituted-content'),
    ));

    await expect(fixture.owner.publish(fixture.input)).rejects.toMatchObject({
      code: 'PUBLISHED_SOURCE_SUBSTITUTED',
      retryable: false,
    });
  });

  it('classifies a transient single-PUT transport failure as retryable',
    async () => {
      const fixture = publicationFixture();
      fixture.singlePublish.mockRejectedValueOnce(
        new Error('MEDIA_PROXY_MASTER_R2_WRITE_FAILED'),
      );

      await expect(fixture.owner.publish(fixture.input)).rejects.toMatchObject({
        code: 'SINGLE_PUT_WRITE_FAILED',
        retryable: true,
      });
      expect(fixture.multipartPublish).not.toHaveBeenCalled();
    });

  it('rejects construction with a substituted bound single-PUT policy', () => {
    const fixture = publicationFixture();
    const substituted = createMediaProxyMasterR2PrivatePublicationPolicyV2({
      bucketName: 'editron-media-proxy-private-other',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    });

    expect(() => createMediaProxyMasterTranscodePublicationOwnerV2({
      publicationPolicy: fixture.jobInput.publicationPolicy,
      preparedArtifactPolicy: fixture.jobInput.preparedArtifactPolicy,
      singlePut: {
        publicationPolicy: substituted.singlePut.policy,
        publisher: { publish: fixture.singlePublish },
      },
      multipartCoordinator: { publishOrResume: fixture.multipartPublish },
    })).toThrow('CONSTRUCTION_BINDING_INVALID');
  });
});

function publicationFixture(options: Readonly<{
  artifactByteLength?: number;
  maxOutputBytes?: number;
}> = {}) {
  const fixture = buildMediaProxyMasterTranscodeV2Fixture(options);
  const preparedState =
    createMediaProxyMasterTranscodePreparedStateV2Fixture(fixture);
  const resume = createMediaProxyMasterTranscodePreparedResumeStateV2({
    job: fixture.job,
    preparedState,
  });
  const job = withMediaProxyMasterTranscodeResumeV2Fixture(
    fixture.job,
    1,
    resume,
    '2026-08-30T00:12:02.500Z',
  );
  const jobInput = fixture.contract.payload;
  const probe = preparedState.preparedEvidence.outputProbe;
  const selection = selectMediaProxyMasterR2PublicationPathV2({
    policy: jobInput.publicationPolicy,
    actualByteLength: probe.proxyByteLength,
    artifactSource: 'DURABLE_REOPENABLE_FILE',
  });
  if (selection.disposition !== 'ELIGIBLE') {
    throw new Error('TEST_PUBLICATION_SELECTION_REQUIRED');
  }
  const objectKey = expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
    command: jobInput.command,
    proxyContentSha256: probe.proxyContentSha256,
  });
  const sourceVersion = createPublishedSource({
    jobInput,
    input: { objectKey, byteLength: probe.proxyByteLength },
  }, probe.proxyContentSha256);
  const singlePublish = vi.fn(async () => sourceVersion);
  const multipartPublish = vi.fn(async () => ({
    version: MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1,
    disposition: 'PUBLISHED' as const,
    record: {} as never,
    sourceVersion,
  }));
  const owner = createMediaProxyMasterTranscodePublicationOwnerV2({
    publicationPolicy: jobInput.publicationPolicy,
    preparedArtifactPolicy: jobInput.preparedArtifactPolicy,
    singlePut: {
      publicationPolicy: jobInput.publicationPolicy.singlePut.policy,
      publisher: { publish: singlePublish },
    },
    multipartCoordinator: { publishOrResume: multipartPublish },
  });
  return {
    ...fixture,
    job,
    jobInput,
    preparedState,
    selection,
    sourceVersion,
    singlePublish,
    multipartPublish,
    owner,
    input: {
      job,
      jobInput,
      preparedState,
      selection,
      localPath: path.resolve('tmp/proxy-v2.mp4'),
      objectKey,
      contentType: 'video/mp4' as const,
      contentSha256: probe.proxyContentSha256,
      byteLength: probe.proxyByteLength,
    },
  };
}

function createPublishedSource(
  fixture: Readonly<{
    jobInput: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>[
      'contract'
    ]['payload'];
    input: Readonly<{ objectKey: string; byteLength: number }>;
  }>,
  contentSha256: string,
) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: fixture.input.objectKey },
    byteLength: fixture.input.byteLength,
    providerVersion: { kind: 'R2_ETAG', value: 'published-etag' },
  });
  return createMediaSourceVersionV1({
    owner: fixture.jobInput.command.masterSourceVersion.owner,
    assetId: fixture.jobInput.assetId,
    mediaKind: 'video',
    byteLength: fixture.input.byteLength,
    contentSha256,
    storageVersion,
  });
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
