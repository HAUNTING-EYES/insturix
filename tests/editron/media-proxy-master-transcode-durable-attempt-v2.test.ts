import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2,
  MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2,
  runMediaProxyMasterTranscodeDurableAttemptV2,
  type MediaProxyMasterCurrentAssetOwnerV2,
  type MediaProxyMasterPreparationOwnerV2,
  type MediaProxyMasterPublicationOwnerV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-attempt-v2';
import {
  createMediaProxyMasterTranscodePreparedResumeStateV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v2';
import { MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_EXPIRES_AT,
  buildMediaProxyMasterTranscodeV2Fixture,
  createMediaProxyMasterTranscodePreparedStateV2Fixture,
  withMediaProxyMasterTranscodeResumeV2Fixture,
} from './helpers/media-proxy-master-transcode-v2-fixture';

describe('MediaProxyMasterTranscodeDurableAttemptV2', () => {
  it('crosses preparation, publication, and terminal boundaries in order', async () => {
    const fixture = attemptFixture();
    const prepared = await runAttempt(fixture, fixture.contract.job,
      '2026-08-30T00:12:01.600Z');
    expect(prepared).toMatchObject({
      kind: 'persist_resume',
      disposition: 'PREPARED_ARTIFACT',
      expectedSequence: 0,
    });
    expect(fixture.stage).toHaveBeenCalledTimes(1);
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(fixture.release).toHaveBeenCalledTimes(1);
    expect(fixture.resolveCurrent).toHaveBeenCalledTimes(2);
    if (prepared.kind !== 'persist_resume') throw new Error('PREPARE_FAILED');

    const preparedJob = withMediaProxyMasterTranscodeResumeV2Fixture(
      fixture.contract.job,
      1,
      prepared.resumeState,
      '2026-08-30T00:12:01.750Z',
    );
    fixture.resolveCurrent.mockClear();
    const published = await runAttempt(fixture, preparedJob,
      '2026-08-30T00:12:02.000Z');
    expect(published).toMatchObject({
      kind: 'persist_resume',
      disposition: 'TRUSTED_RESULT',
      expectedSequence: 1,
    });
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.reopen).toHaveBeenCalledTimes(1);
    expect(fixture.publish).toHaveBeenCalledTimes(1);
    expect(fixture.resolveCurrent).toHaveBeenCalledTimes(2);
    expect(fixture.publish.mock.calls[0]?.[0].selection).toMatchObject({
      disposition: 'ELIGIBLE',
      path: 'SINGLE_PUT',
    });
    if (published.kind !== 'persist_resume') throw new Error('PUBLISH_FAILED');

    const resultJob = withMediaProxyMasterTranscodeResumeV2Fixture(
      fixture.contract.job,
      2,
      published.resumeState,
      '2026-08-30T00:12:02.500Z',
    );
    fixture.resolveCurrent.mockClear();
    const terminal = await runAttempt(fixture, resultJob,
      '2026-08-30T00:12:03.000Z');
    expect(terminal).toMatchObject({
      kind: 'complete',
      receipt: { disposition: 'PASS' },
    });
    expect(fixture.resolveCurrent).not.toHaveBeenCalled();
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.publish).toHaveBeenCalledTimes(1);
  });

  it('rechecks the current asset after staging before proposing sequence one', async () => {
    const fixture = attemptFixture();
    fixture.resolveCurrent
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce(null);

    await expect(runAttempt(fixture, fixture.contract.job,
      '2026-08-30T00:12:01.600Z'))
      .rejects.toMatchObject({ code: 'CURRENT_ASSET_UNAVAILABLE', retryable: true });
    expect(fixture.stage).toHaveBeenCalledTimes(1);
    expect(fixture.release).toHaveBeenCalledTimes(1);
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it('resumes publication without re-encoding and keeps failure retryable', async () => {
    const fixture = attemptFixture();
    const preparedState =
      createMediaProxyMasterTranscodePreparedStateV2Fixture(fixture.contract);
    const resume = createMediaProxyMasterTranscodePreparedResumeStateV2({
      job: fixture.contract.job,
      preparedState,
    });
    const preparedJob = withMediaProxyMasterTranscodeResumeV2Fixture(
      fixture.contract.job,
      1,
      resume,
      '2026-08-30T00:12:01.750Z',
    );
    fixture.publish.mockRejectedValueOnce(new Error('R2_UNAVAILABLE'));

    await expect(runAttempt(fixture, preparedJob,
      '2026-08-30T00:12:02.000Z'))
      .rejects.toMatchObject({ code: 'PUBLICATION_FAILED', retryable: true });
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(fixture.reopen).toHaveBeenCalledTimes(1);
    expect(fixture.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects owner substitution before touching media or storage', async () => {
    const fixture = attemptFixture();
    const publicationOwner = {
      ...fixture.publicationOwner,
      publicationPolicySha256: 'f'.repeat(64),
    };

    await expect(runMediaProxyMasterTranscodeDurableAttemptV2({
      ...attemptInput(fixture, fixture.contract.job),
      publicationOwner,
      clock: () => new Date('2026-08-30T00:12:01.600Z'),
    })).rejects.toMatchObject({ code: 'OWNER_BINDING_MISMATCH', retryable: false });
    expect(fixture.resolveCurrent).not.toHaveBeenCalled();
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(fixture.stage).not.toHaveBeenCalled();
  });

  it('normalizes malformed preparation and substituted publication results', async () => {
    const malformed = attemptFixture();
    malformed.prepare.mockResolvedValueOnce({ disposition: 'PREPARED' } as never);
    await expect(runAttempt(malformed, malformed.contract.job,
      '2026-08-30T00:12:01.600Z'))
      .rejects.toMatchObject({ code: 'PREPARATION_RESULT_FIELDS_INVALID' });
    expect(malformed.stage).not.toHaveBeenCalled();

    const invalidDiagnostic = attemptFixture();
    invalidDiagnostic.prepare.mockResolvedValueOnce({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_UNDECLARED',
    } as never);
    await expect(runAttempt(invalidDiagnostic, invalidDiagnostic.contract.job,
      '2026-08-30T00:12:01.600Z'))
      .rejects.toMatchObject({ code: 'PREPARATION_DIAGNOSTIC_INVALID' });
    expect(invalidDiagnostic.stage).not.toHaveBeenCalled();

    const substituted = attemptFixture();
    const preparedState =
      createMediaProxyMasterTranscodePreparedStateV2Fixture(substituted.contract);
    const resume = createMediaProxyMasterTranscodePreparedResumeStateV2({
      job: substituted.contract.job,
      preparedState,
    });
    const preparedJob = withMediaProxyMasterTranscodeResumeV2Fixture(
      substituted.contract.job,
      1,
      resume,
      '2026-08-30T00:12:01.750Z',
    );
    substituted.publish.mockResolvedValueOnce({
      ...substituted.contract.seedReceipt.proxyEncode.sourceVersion,
      assetId: 'substituted-asset',
    } as never);
    await expect(runAttempt(substituted, preparedJob,
      '2026-08-30T00:12:02.000Z'))
      .rejects.toMatchObject({ code: 'PUBLICATION_RESULT_INVALID' });
  });
});

function attemptFixture() {
  const contract = buildMediaProxyMasterTranscodeV2Fixture({
    retainUntil: MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_EXPIRES_AT,
  });
  const resolveCurrent = vi.fn<
    Parameters<MediaProxyMasterCurrentAssetOwnerV2['resolve']>,
    ReturnType<MediaProxyMasterCurrentAssetOwnerV2['resolve']>
  >(
    async () => ({} as never),
  );
  const currentAssetOwner: MediaProxyMasterCurrentAssetOwnerV2 = {
    ownerId: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2,
    ownerVersion: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2,
    runtimePolicyBindingSha256: contract.contract.payload.runtimePolicy.bindingSha256,
    resolve: resolveCurrent,
  };
  const release = vi.fn(async () => undefined);
  const revalidateSource = vi.fn(async () => undefined);
  const preparedLocalPath = path.resolve('fixture-prepared-proxy.mp4');
  const prepare = vi.fn(async () => ({
    disposition: 'PREPARED' as const,
    lease: {
      evidence: {
        runtime: contract.contract.payload.runtimePolicy.executionProfile,
        process: contract.preparedEvidence.process,
        masterLocalFileEvidence:
          contract.preparedEvidence.masterLocalFileEvidence,
        outputProbe: contract.preparedEvidence.outputProbe,
        outputVideoStreamIndex:
          contract.preparedEvidence.outputVideoStreamIndex,
        outputAudioStreamIndexes:
          contract.preparedEvidence.outputAudioStreamIndexes,
      },
      abortSignal: new AbortController().signal,
      timeoutSignal: new AbortController().signal,
      async useLocalArtifact<T>(consumer: (localPath: string) => Promise<T>) {
        return consumer(preparedLocalPath);
      },
      revalidateSource,
      release,
    },
  }));
  const preparationOwner: MediaProxyMasterPreparationOwnerV2 = {
    ownerId: MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2,
    ownerVersion: contract.contract.payload.command.policy.policyVersion,
    runtimePolicyBindingSha256: contract.contract.payload.runtimePolicy.bindingSha256,
    prepare,
  };
  const stage = vi.fn(async () => contract.preparedArtifactReference);
  const reopen = vi.fn(async (input: Readonly<{ outputPath: string }>) => {
    await writeFile(input.outputPath, 'reopened-proxy');
    return {
      localPath: input.outputPath,
      byteLength: contract.preparedEvidence.outputProbe.proxyByteLength,
      contentSha256: contract.preparedEvidence.outputProbe.proxyContentSha256,
      artifactHandle: contract.preparedArtifactReference.artifactHandle,
    };
  });
  const publish = vi.fn<
    Parameters<MediaProxyMasterPublicationOwnerV2['publish']>,
    ReturnType<MediaProxyMasterPublicationOwnerV2['publish']>
  >(
    async () => contract.seedReceipt.proxyEncode.sourceVersion,
  );
  const publicationOwner: MediaProxyMasterPublicationOwnerV2 = {
    ownerId: MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2,
    ownerVersion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2,
    publicationPolicySha256: contract.contract.payload.publicationPolicy.policySha256,
    preparedArtifactPolicySha256:
      contract.contract.payload.preparedArtifactPolicy.policySha256,
    publish,
  };
  return {
    contract,
    currentAssetOwner,
    preparationOwner,
    preparedArtifactStore: { stage, reopen },
    publicationOwner,
    resolveCurrent,
    prepare,
    release,
    revalidateSource,
    stage,
    reopen,
    publish,
  };
}

function attemptInput(
  fixture: ReturnType<typeof attemptFixture>,
  job: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>['job'],
) {
  return {
    job,
    budgetAuthorizationReceiptSha256:
      fixture.contract.budgetAuthorization.authorizationSha256,
    currentAssetOwner: fixture.currentAssetOwner,
    preparationOwner: fixture.preparationOwner,
    preparedArtifactStore: fixture.preparedArtifactStore,
    publicationOwner: fixture.publicationOwner,
  };
}

function runAttempt(
  fixture: ReturnType<typeof attemptFixture>,
  job: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>['job'],
  now: string,
) {
  return runMediaProxyMasterTranscodeDurableAttemptV2({
    ...attemptInput(fixture, job),
    clock: () => new Date(now),
  });
}
