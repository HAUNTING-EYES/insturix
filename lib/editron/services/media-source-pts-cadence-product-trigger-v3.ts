import { deepFreezeEditronJsonV1 } from './canonical-json-v1';
import { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import type { DurableWorkflowQStashDeliveryPolicyV1 }
  from './durable-workflow-qstash-dispatch-v1';
import {
  dispatchMediaSourcePtsCadenceDurableEpochJobV3,
  type MediaSourcePtsCadenceDurableEpochDispatchEnvironmentV3,
  type MediaSourcePtsCadenceEpochQStashPublisherV3,
} from './media-source-pts-cadence-durable-dispatch-v3';
import { createOrGetMediaSourcePtsCadenceDurableEpochJobV3 }
  from './media-source-pts-cadence-durable-job-binding-v3';
import {
  createMediaSourcePtsCadenceMapAssetMongoPortsV3,
  type MediaSourcePtsCadenceMapAssetStorePortsV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  assertMediaSourceQualificationWorkerMessageV1,
  type MediaSourceQualificationWorkerMessageV1,
} from './media-source-qualification-runtime-v1';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

/** Operational transport policy; source and mapping semantics remain job-bound. */
export const MEDIA_SOURCE_PTS_CADENCE_PRODUCT_DELIVERY_POLICY_V3 =
  deepFreezeEditronJsonV1({
    retries: 2,
    retryDelayMs: 30_000,
    timeoutSeconds: 300,
  } satisfies DurableWorkflowQStashDeliveryPolicyV1);

type JobStoreV3 = Pick<
  DurableWorkflowJobStoreV1,
  'createOrGet' | 'recordDispatch'
>;

type DispatchV3 = typeof dispatchMediaSourcePtsCadenceDurableEpochJobV3;

export type MediaSourcePtsCadenceProductTriggerResultV3 = Readonly<
  | {
      disposition: 'NOT_READY';
      reason: 'QUALIFICATION_NOT_TERMINAL';
    }
  | {
      disposition: 'NOT_ELIGIBLE';
      reason:
        | 'ASSET_NOT_FOUND'
        | 'SOURCE_BINDING_SUPERSEDED'
        | 'QUALIFICATION_UNVERIFIABLE'
        | 'MEDIA_KIND_NOT_VIDEO'
        | 'VIDEO_STREAM_MISSING'
        | 'VIDEO_STREAM_SELECTION_REQUIRED';
    }
  | {
      disposition: 'SCHEDULED';
      jobId: string;
      created: boolean;
      delivery:
        | 'CONFIRMED'
        | 'ALREADY_CONFIRMED'
        | 'JOB_ALREADY_ACTIVE_OR_TERMINAL';
      messageId: string | null;
    }
  | {
      disposition: 'DELIVERY_DEFERRED';
      jobId: string;
      created: boolean;
      reason:
        | 'DISPATCH_RUNTIME_UNAVAILABLE'
        | 'QSTASH_PUBLISH_REJECTED'
        | 'QSTASH_MESSAGE_ID_MISSING'
        | 'QSTASH_MESSAGE_ID_INVALID'
        | 'DISPATCH_RECEIPT_NOT_RECORDED';
    }
>;

export type MediaSourcePtsCadenceProductTriggerDependenciesV3 = Readonly<{
  assetStore?: Pick<MediaSourcePtsCadenceMapAssetStorePortsV3, 'load'>;
  jobStore?: JobStoreV3;
  dispatch?: DispatchV3;
  deliveryPolicy?: DurableWorkflowQStashDeliveryPolicyV1;
  environment?: MediaSourcePtsCadenceDurableEpochDispatchEnvironmentV3;
  publisher?: Readonly<MediaSourcePtsCadenceEpochQStashPublisherV3>;
  now?: Date;
}>;

/**
 * Reloads the authoritative post-qualification asset, persists the exact V3
 * job intent, and only then attempts signed delivery. A transport outage can
 * therefore delay work, but cannot erase the requested scan.
 */
export async function triggerQualifiedMediaSourcePtsCadenceV3(
  inputMessage: MediaSourceQualificationWorkerMessageV1,
  dependencies: MediaSourcePtsCadenceProductTriggerDependenciesV3 = {},
): Promise<MediaSourcePtsCadenceProductTriggerResultV3> {
  const message = assertMediaSourceQualificationWorkerMessageV1(inputMessage);
  const assetStore = dependencies.assetStore
    ?? await createMediaSourcePtsCadenceMapAssetMongoPortsV3();
  const asset = await assetStore.load(message.assetId, message.userId);
  if (!asset) return frozen({ disposition: 'NOT_ELIGIBLE', reason: 'ASSET_NOT_FOUND' });

  const qualificationRecord = objectRecord(asset.sourceQualificationV1);
  if (!qualificationRecord) {
    throw new MediaSourcePtsCadenceProductTriggerErrorV3(
      'MEDIA_SOURCE_PTS_PRODUCT_QUALIFICATION_INVALID',
    );
  }
  if (qualificationRecord.sourceBindingSha256 !== message.sourceBindingSha256) {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'SOURCE_BINDING_SUPERSEDED',
    });
  }
  if (qualificationRecord.status === 'PENDING'
    || qualificationRecord.status === 'PROBING') {
    return frozen({
      disposition: 'NOT_READY',
      reason: 'QUALIFICATION_NOT_TERMINAL',
    });
  }
  if (qualificationRecord.status === 'UNVERIFIABLE') {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'QUALIFICATION_UNVERIFIABLE',
    });
  }
  if (qualificationRecord.status !== 'MEASURED_TECHNICAL') {
    throw new MediaSourcePtsCadenceProductTriggerErrorV3(
      'MEDIA_SOURCE_PTS_PRODUCT_QUALIFICATION_STATUS_INVALID',
    );
  }

  let sourceVersion: Readonly<MediaSourceVersionV1>;
  try {
    sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
  } catch {
    throw new MediaSourcePtsCadenceProductTriggerErrorV3(
      'MEDIA_SOURCE_PTS_PRODUCT_SOURCE_VERSION_INVALID',
    );
  }
  if (sourceVersion.mediaKind !== 'video') {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'MEDIA_KIND_NOT_VIDEO',
    });
  }
  if (asset.type !== 'video') {
    throw new MediaSourcePtsCadenceProductTriggerErrorV3(
      'MEDIA_SOURCE_PTS_PRODUCT_ASSET_KIND_MISMATCH',
    );
  }

  const videoStreamSelection = selectOnlyVideoStreamIndex(
    qualificationRecord.observation,
  );
  if (videoStreamSelection.disposition !== 'SELECTED') {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: videoStreamSelection.reason,
    });
  }

  const qualification = qualificationRecord as unknown as
    MediaSourceQualificationRecordV1;
  const actor = actorFromSourceOwner(sourceVersion, message.userId);
  const request = {
    assetId: message.assetId,
    sourceVersion,
    qualification,
    videoStreamIndex: videoStreamSelection.videoStreamIndex,
  };
  const jobStore = dependencies.jobStore ?? new DurableWorkflowJobStoreV1();
  const prepared = await createOrGetMediaSourcePtsCadenceDurableEpochJobV3({
    jobStore,
    request: { ...actor, ...request },
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });

  let dispatched: Awaited<ReturnType<DispatchV3>>;
  try {
    dispatched = await (dependencies.dispatch
      ?? dispatchMediaSourcePtsCadenceDurableEpochJobV3)({
      actor,
      request,
      jobStore,
      deliveryPolicy: dependencies.deliveryPolicy
        ?? MEDIA_SOURCE_PTS_CADENCE_PRODUCT_DELIVERY_POLICY_V3,
      ...(dependencies.environment
        ? { env: dependencies.environment }
        : {}),
      ...(dependencies.publisher ? { publisher: dependencies.publisher } : {}),
      ...(dependencies.now ? { now: dependencies.now } : {}),
    });
  } catch {
    return frozen({
      disposition: 'DELIVERY_DEFERRED',
      jobId: prepared.job.jobId,
      created: prepared.created,
      reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
    });
  }

  switch (dispatched.state) {
    case 'dispatched':
      return frozen({
        disposition: 'SCHEDULED',
        jobId: prepared.job.jobId,
        created: prepared.created,
        delivery: 'CONFIRMED',
        messageId: dispatched.messageId,
      });
    case 'already_dispatched':
      return frozen({
        disposition: 'SCHEDULED',
        jobId: prepared.job.jobId,
        created: prepared.created,
        delivery: 'ALREADY_CONFIRMED',
        messageId: dispatched.messageId,
      });
    case 'not_dispatchable':
      return frozen({
        disposition: 'SCHEDULED',
        jobId: prepared.job.jobId,
        created: prepared.created,
        delivery: 'JOB_ALREADY_ACTIVE_OR_TERMINAL',
        messageId: null,
      });
    case 'dispatch_unconfirmed':
      return frozen({
        disposition: 'DELIVERY_DEFERRED',
        jobId: prepared.job.jobId,
        created: prepared.created,
        reason: dispatched.reason,
      });
    case 'delivery_unknown':
      return frozen({
        disposition: 'DELIVERY_DEFERRED',
        jobId: prepared.job.jobId,
        created: prepared.created,
        reason: dispatched.reason,
      });
  }
}

export class MediaSourcePtsCadenceProductTriggerErrorV3 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'MediaSourcePtsCadenceProductTriggerErrorV3';
  }
}

function actorFromSourceOwner(
  sourceVersion: Readonly<MediaSourceVersionV1>,
  userId: string,
): Readonly<{ tenantId: string; userId: string; orgId: string | null }> {
  if (sourceVersion.owner.kind === 'USER') {
    if (sourceVersion.owner.userId !== userId) {
      throw new MediaSourcePtsCadenceProductTriggerErrorV3(
        'MEDIA_SOURCE_PTS_PRODUCT_SOURCE_OWNER_MISMATCH',
      );
    }
    return frozen({ tenantId: sourceVersion.owner.userId, userId, orgId: null });
  }
  return frozen({
    tenantId: sourceVersion.owner.orgId,
    userId,
    orgId: sourceVersion.owner.orgId,
  });
}

function selectOnlyVideoStreamIndex(value: unknown): Readonly<
  | { disposition: 'SELECTED'; videoStreamIndex: number }
  | {
      disposition: 'NOT_SELECTED';
      reason: 'VIDEO_STREAM_MISSING' | 'VIDEO_STREAM_SELECTION_REQUIRED';
    }
> {
  const observation = objectRecord(value);
  if (!observation || !Array.isArray(observation.videoStreams)) {
    throw new MediaSourcePtsCadenceProductTriggerErrorV3(
      'MEDIA_SOURCE_PTS_PRODUCT_OBSERVATION_INVALID',
    );
  }
  if (observation.videoStreams.length === 0) {
    return frozen({
      disposition: 'NOT_SELECTED',
      reason: 'VIDEO_STREAM_MISSING',
    });
  }
  if (observation.videoStreams.length !== 1) {
    return frozen({
      disposition: 'NOT_SELECTED',
      reason: 'VIDEO_STREAM_SELECTION_REQUIRED',
    });
  }
  const stream = objectRecord(observation.videoStreams[0]);
  if (!stream || !Number.isSafeInteger(stream.streamIndex)
    || Number(stream.streamIndex) < 0) {
    throw new MediaSourcePtsCadenceProductTriggerErrorV3(
      'MEDIA_SOURCE_PTS_PRODUCT_VIDEO_STREAM_INVALID',
    );
  }
  return frozen({
    disposition: 'SELECTED',
    videoStreamIndex: Number(stream.streamIndex),
  });
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function frozen<const T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
