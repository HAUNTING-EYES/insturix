import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { hashDurableWorkflowJobJsonV1 }
  from './durable-workflow-job-v1';
import {
  MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1,
  MediaProxyMasterR2MultipartCoordinatorErrorV1,
  type MediaProxyMasterR2MultipartCoordinatorV1,
} from './media-proxy-master-r2-multipart-coordinator-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactPolicyV1,
  type MediaProxyMasterR2PreparedArtifactPolicyV1,
} from './media-proxy-master-r2-prepared-artifact-policy-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV1,
  type MediaProxyMasterR2PrivateBoundSinglePutPublisherV1,
} from './media-proxy-master-r2-private-publication-policy-v1';
import {
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2,
  assertMediaProxyMasterR2PrivatePublicationPolicyV2,
  selectMediaProxyMasterR2PublicationPathV2,
  type MediaProxyMasterR2PrivatePublicationPolicyV2,
  type MediaProxyMasterR2PublicationSelectionV2,
} from './media-proxy-master-r2-private-publication-policy-v2';
import {
  MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2,
  MediaProxyMasterTranscodeDurableAttemptPortErrorV2,
  type MediaProxyMasterPublicationOwnerV2,
} from './media-proxy-master-transcode-durable-attempt-v2';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  assertMediaProxyMasterTranscodeDurableJobV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2,
  readMediaProxyMasterTranscodeDurableResumeStateV2,
  type MediaProxyMasterTranscodeDurablePreparedStateV2,
} from './media-proxy-master-transcode-durable-result-v2';
import { expectedMediaProxyMasterTranscodeR2ObjectKeyV1 }
  from './media-proxy-master-trusted-transcode-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

type EligibleSelectionV2 = Extract<
  MediaProxyMasterR2PublicationSelectionV2,
  { disposition: 'ELIGIBLE' }
>;
type PublishInputV2 = Parameters<MediaProxyMasterPublicationOwnerV2['publish']>[0];

const RETRYABLE_MULTIPART_CODES = new Set([
  'ABORTED',
  'ABORT_STATE_CHANGED',
  'CANCELLATION_STATE_INVALID',
  'CLEANUP_RETRY_REQUIRED',
  'CLEANUP_STATE_CHANGED',
  'COMPLETION_READY_STATE_CHANGED',
  'EXPIRED_LEASE_REQUIRES_NEW_TOKEN',
  'LEASE_HELD_BY_ANOTHER_WORKER',
  'LEASE_LOST',
  'PART_UPLOAD_DID_NOT_REACH_COMPLETION_READY',
  'RECORD_MISSING',
  'STATE_PASS_LIMIT_EXCEEDED',
  'UPLOAD_STATE_CHANGED',
]);
const RETRYABLE_SINGLE_PUT_MESSAGES = new Set([
  'MEDIA_PROXY_MASTER_R2_HEAD_FAILED',
  'MEDIA_PROXY_MASTER_R2_LOCAL_FILE_READ_FAILED',
  'MEDIA_PROXY_MASTER_R2_PUBLISH_ABORTED',
  'MEDIA_PROXY_MASTER_R2_READ_FAILED',
  'MEDIA_PROXY_MASTER_R2_WRITE_FAILED',
]);

/**
 * The sole V2 path adapter. It validates the persisted preparation and then
 * delegates byte movement to the existing single-PUT or multipart owner.
 */
export function createMediaProxyMasterTranscodePublicationOwnerV2(
  input: Readonly<{
    publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV2;
    preparedArtifactPolicy: MediaProxyMasterR2PreparedArtifactPolicyV1;
    singlePut: MediaProxyMasterR2PrivateBoundSinglePutPublisherV1;
    multipartCoordinator: Readonly<MediaProxyMasterR2MultipartCoordinatorV1>;
  }>,
): Readonly<MediaProxyMasterPublicationOwnerV2> {
  const publicationPolicy = assertMediaProxyMasterR2PrivatePublicationPolicyV2(
    input.publicationPolicy,
  );
  const preparedArtifactPolicy =
    assertMediaProxyMasterR2PreparedArtifactPolicyV1(
      input.preparedArtifactPolicy,
    );
  const singlePutPolicy = assertMediaProxyMasterR2PrivatePublicationPolicyV1(
    input.singlePut?.publicationPolicy,
  );
  if (typeof input.singlePut?.publisher?.publish !== 'function'
    || typeof input.multipartCoordinator?.publishOrResume !== 'function'
    || preparedArtifactPolicy.publicationPolicy.policySha256
      !== publicationPolicy.policySha256
    || singlePutPolicy.policySha256
      !== publicationPolicy.singlePut.policy.policySha256) {
    fail('CONSTRUCTION_BINDING_INVALID', false);
  }

  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2,
    ownerVersion:
      MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2,
    publicationPolicySha256: publicationPolicy.policySha256,
    preparedArtifactPolicySha256: preparedArtifactPolicy.policySha256,
    async publish(value: PublishInputV2) {
      const context = publicationContext(
        value,
        publicationPolicy,
        preparedArtifactPolicy,
      );
      let sourceVersion: Readonly<MediaSourceVersionV1>;
      if (context.selection.path === 'SINGLE_PUT') {
        try {
          sourceVersion = await input.singlePut.publisher.publish({
            ...publicationArtifact(context, value),
            ...(value.abortSignal ? { abortSignal: value.abortSignal } : {}),
          });
        } catch (error) {
          throw classifySinglePutFailure(error, value.abortSignal);
        }
      } else {
        try {
          const attempt = multipartAttemptIdentity(value);
          const result = await input.multipartCoordinator.publishOrResume({
            artifact: {
              jobId: value.job.jobId,
              tenantId: context.jobInput.tenantId,
              userId: context.jobInput.userId,
              orgId: context.jobInput.orgId,
              owner: context.jobInput.command.masterSourceVersion.owner,
              assetId: context.jobInput.assetId,
              bucketName: publicationPolicy.singlePut.policy.bucketName,
              storagePolicyVersion:
                publicationPolicy.singlePut.policy.storagePolicyVersion,
              publicationPolicySha256: publicationPolicy.policySha256,
              objectKey: value.objectKey,
              contentSha256: value.contentSha256,
              byteLength: value.byteLength,
              commandSha256: context.jobInput.command.commandSha256,
              outputProbeSha256:
                context.preparedState.preparedEvidence.outputProbe.probeSha256,
            },
            localPath: value.localPath,
            leaseOwnerId: requireLeaseOwner(value),
            leaseTokenSha256: attempt.leaseTokenSha256,
            completionAttemptId: attempt.completionAttemptId,
            ...(value.abortSignal ? { abortSignal: value.abortSignal } : {}),
          });
          if (result.version
              !== MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1
            || result.disposition !== 'PUBLISHED') {
            fail('MULTIPART_RESULT_INVALID', false);
          }
          sourceVersion = result.sourceVersion;
        } catch (error) {
          throw classifyMultipartFailure(error, value.abortSignal);
        }
      }
      return assertExactPublishedSource(sourceVersion, context, value);
    },
  });
}

function publicationContext(
  value: PublishInputV2,
  publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV2,
  preparedArtifactPolicy: MediaProxyMasterR2PreparedArtifactPolicyV1,
): Readonly<{
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  preparedState: MediaProxyMasterTranscodeDurablePreparedStateV2;
  selection: EligibleSelectionV2;
}> {
  try {
    const boundJobInput = assertMediaProxyMasterTranscodeDurableJobV2(value.job);
    const jobInput = assertMediaProxyMasterTranscodeDurableJobInputV2(
      value.jobInput,
    );
    const preparedState =
      assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2(
        value.preparedState,
        value.job,
      );
    const resume = readMediaProxyMasterTranscodeDurableResumeStateV2(value.job);
    const selection = selectMediaProxyMasterR2PublicationPathV2({
      policy: jobInput.publicationPolicy,
      actualByteLength: value.byteLength,
      artifactSource: 'DURABLE_REOPENABLE_FILE',
    });
    if (value.job.status !== 'running' || value.job.attemptCount < 1
      || value.job.cancelRequestedAt !== null
      || value.job.leaseOwnerId === null || value.job.leaseExpiresAt === null
      || hashDurableWorkflowJobJsonV1(boundJobInput)
        !== hashDurableWorkflowJobJsonV1(jobInput)
      || jobInput.publicationPolicy.policySha256
        !== publicationPolicy.policySha256
      || jobInput.preparedArtifactPolicy.policySha256
        !== preparedArtifactPolicy.policySha256
      || !resume
      || resume.disposition !== 'DURABLE_PREPARED_ARTIFACT_PERSISTED'
      || hashDurableWorkflowJobJsonV1(resume)
        !== hashDurableWorkflowJobJsonV1(preparedState)
      || selection.disposition !== 'ELIGIBLE'
      || hashDurableWorkflowJobJsonV1(selection)
        !== hashDurableWorkflowJobJsonV1(value.selection)
      || !path.isAbsolute(value.localPath)
      || value.contentType !== 'video/mp4'
      || value.contentSha256
        !== preparedState.preparedArtifactReference.artifactContentSha256
      || value.byteLength
        !== preparedState.preparedArtifactReference.artifactByteLength
      || value.contentSha256
        !== preparedState.preparedEvidence.outputProbe.proxyContentSha256
      || value.byteLength
        !== preparedState.preparedEvidence.outputProbe.proxyByteLength
      || value.objectKey !== expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
        command: jobInput.command,
        proxyContentSha256: value.contentSha256,
      })
      || (value.abortSignal !== undefined
        && !isAbortSignal(value.abortSignal))) {
      fail('INPUT_BINDING_INVALID', false);
    }
    return Object.freeze({ jobInput, preparedState, selection });
  } catch (error) {
    if (error instanceof MediaProxyMasterTranscodeDurableAttemptPortErrorV2) {
      throw error;
    }
    fail('INPUT_INVALID', false);
  }
}

function publicationArtifact(
  context: ReturnType<typeof publicationContext>,
  value: PublishInputV2,
) {
  return {
    localPath: value.localPath,
    objectKey: value.objectKey,
    contentType: 'video/mp4' as const,
    contentSha256: value.contentSha256,
    byteLength: value.byteLength,
    owner: context.jobInput.command.masterSourceVersion.owner,
    assetId: context.jobInput.assetId,
    commandSha256: context.jobInput.command.commandSha256,
    outputProbeSha256:
      context.preparedState.preparedEvidence.outputProbe.probeSha256,
  };
}

function assertExactPublishedSource(
  value: unknown,
  context: ReturnType<typeof publicationContext>,
  input: PublishInputV2,
): Readonly<MediaSourceVersionV1> {
  let source: MediaSourceVersionV1;
  try {
    source = assertMediaSourceVersionV1(value);
  } catch {
    fail('PUBLISHED_SOURCE_INVALID', false);
  }
  if (source.assetId !== context.jobInput.assetId
    || source.mediaKind !== 'video'
    || source.byteLength !== input.byteLength
    || source.contentSha256 !== input.contentSha256
    || hashDurableWorkflowJobJsonV1(source.owner)
      !== hashDurableWorkflowJobJsonV1(
        context.jobInput.command.masterSourceVersion.owner,
      )
    || source.storageVersion.locator.provider !== 'R2'
    || source.storageVersion.locator.objectKey !== input.objectKey) {
    fail('PUBLISHED_SOURCE_SUBSTITUTED', false);
  }
  return source;
}

function multipartAttemptIdentity(input: PublishInputV2) {
  const nonce = randomUUID();
  return Object.freeze({
    leaseTokenSha256: hashDurableWorkflowJobJsonV1({
      version: 'EDITRON_MEDIA_PROXY_MASTER_MULTIPART_LEASE_ATTEMPT_V1',
      jobId: input.job.jobId,
      attemptCount: input.job.attemptCount,
      nonce,
    }),
    completionAttemptId:
      `mpmcomplete-${input.job.attemptCount}-${nonce}`,
  });
}

function requireLeaseOwner(input: PublishInputV2): string {
  if (!input.job.leaseOwnerId) fail('LEASE_OWNER_MISSING', false);
  return input.job.leaseOwnerId;
}

function classifyMultipartFailure(
  error: unknown,
  abortSignal?: AbortSignal,
): MediaProxyMasterTranscodeDurableAttemptPortErrorV2 {
  if (error instanceof MediaProxyMasterTranscodeDurableAttemptPortErrorV2) {
    return error;
  }
  if (abortSignal?.aborted) return portError('PUBLICATION_ABORTED', true);
  if (error instanceof MediaProxyMasterR2MultipartCoordinatorErrorV1) {
    return portError(
      `MULTIPART_${error.code}`,
      RETRYABLE_MULTIPART_CODES.has(error.code),
    );
  }
  return portError('MULTIPART_EXTERNAL_FAILURE', true);
}

function classifySinglePutFailure(
  error: unknown,
  abortSignal?: AbortSignal,
): MediaProxyMasterTranscodeDurableAttemptPortErrorV2 {
  if (error instanceof MediaProxyMasterTranscodeDurableAttemptPortErrorV2) {
    return error;
  }
  if (abortSignal?.aborted) return portError('PUBLICATION_ABORTED', true);
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('MEDIA_PROXY_MASTER_R2_')) {
    return portError(
      `SINGLE_PUT_${message.slice('MEDIA_PROXY_MASTER_R2_'.length)}`,
      RETRYABLE_SINGLE_PUT_MESSAGES.has(message),
    );
  }
  return portError('SINGLE_PUT_EXTERNAL_FAILURE', true);
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return !!value && typeof value === 'object'
    && typeof (value as AbortSignal).aborted === 'boolean'
    && typeof (value as AbortSignal).addEventListener === 'function';
}

function portError(
  code: string,
  retryable: boolean,
): MediaProxyMasterTranscodeDurableAttemptPortErrorV2 {
  return new MediaProxyMasterTranscodeDurableAttemptPortErrorV2(
    code,
    retryable,
  );
}

function fail(code: string, retryable: boolean): never {
  throw portError(code, retryable);
}
