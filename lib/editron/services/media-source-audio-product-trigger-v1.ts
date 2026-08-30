import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import type { DurableWorkflowQStashDeliveryPolicyV1 }
  from './durable-workflow-qstash-dispatch-v1';
import {
  MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1,
  createMediaSourceAudioArtifactAssetMongoPortsV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from './media-source-audio-artifact-asset-owner-v1';
import {
  dispatchMediaSourceAudioDurableJobV1,
  type MediaSourceAudioDurableDispatchEnvironmentV1,
  type MediaSourceAudioQStashPublisherV1,
} from './media-source-audio-durable-dispatch-v1';
import { createOrGetMediaSourceAudioDurableJobV1 }
  from './media-source-audio-durable-job-v1';
import {
  MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_DEFAULT_POLICY_V1,
} from './media-source-audio-private-artifact-v1';
import {
  assertMediaSourceAudioSampleEpochResourcePolicyV1,
  createMediaSourceAudioStreamBindingV1,
  type MediaSourceAudioSampleEpochResourcePolicyV1,
} from './media-source-audio-sample-epoch-map-v1';
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
import { readNativeMediaExactAudioStreamIndexesV1 }
  from './native-media-exact-audio-evidence-v1';

/** Transport policy only; resource and source semantics are job-bound. */
export const MEDIA_SOURCE_AUDIO_PRODUCT_DELIVERY_POLICY_V1 =
  deepFreezeEditronJsonV1({
    retries: 2,
    retryDelayMs: 30_000,
    timeoutSeconds: 300,
  } satisfies DurableWorkflowQStashDeliveryPolicyV1);

const RESOURCE_POLICY_ENVIRONMENT_KEYS_V1 = Object.freeze([
  'EDITRON_MEDIA_AUDIO_POLICY_VERSION',
  'EDITRON_MEDIA_AUDIO_MAX_SOURCE_BYTES',
  'EDITRON_MEDIA_AUDIO_MAX_CANONICAL_JSON_BYTES',
  'EDITRON_MEDIA_AUDIO_MAX_DECODED_FRAME_ENTRIES',
  'EDITRON_MEDIA_AUDIO_MAX_EPOCH_ENTRIES',
  'EDITRON_MEDIA_AUDIO_MAX_DECODED_SAMPLE_FRAMES',
  'EDITRON_MEDIA_AUDIO_MAX_DECODED_PCM_BYTES',
  'EDITRON_MEDIA_AUDIO_TIMEOUT_MS',
] as const);

const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const POSITIVE_DECIMAL_INTEGER = /^[1-9][0-9]*$/;

export interface MediaSourceAudioProductTriggerEnvironmentV1
  extends MediaSourceAudioDurableDispatchEnvironmentV1 {
  EDITRON_MEDIA_AUDIO_POLICY_VERSION?: string;
  EDITRON_MEDIA_AUDIO_MAX_SOURCE_BYTES?: string;
  EDITRON_MEDIA_AUDIO_MAX_CANONICAL_JSON_BYTES?: string;
  EDITRON_MEDIA_AUDIO_MAX_DECODED_FRAME_ENTRIES?: string;
  EDITRON_MEDIA_AUDIO_MAX_EPOCH_ENTRIES?: string;
  EDITRON_MEDIA_AUDIO_MAX_DECODED_SAMPLE_FRAMES?: string;
  EDITRON_MEDIA_AUDIO_MAX_DECODED_PCM_BYTES?: string;
  EDITRON_MEDIA_AUDIO_TIMEOUT_MS?: string;
}

type JobStoreV1 = Pick<
  DurableWorkflowJobStoreV1,
  'createOrGet' | 'recordDispatch'
>;

type DispatchV1 = typeof dispatchMediaSourceAudioDurableJobV1;

export type MediaSourceAudioProductTriggerResultV1 = Readonly<
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
        | 'MEDIA_KIND_NOT_AUDIO_OR_VIDEO'
        | 'AUDIO_STREAM_EVIDENCE_INVALID'
        | 'AUDIO_STREAM_LIMIT_EXCEEDED'
        | 'NO_AUDIO_PROOF_REQUIRED'
        | 'SOURCE_EXCEEDS_RESOURCE_POLICY';
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
      jobId: string | null;
      created: boolean;
      reason:
        | 'RESOURCE_POLICY_NOT_CONFIGURED'
        | 'RESOURCE_POLICY_INVALID'
        | 'DISPATCH_RUNTIME_UNAVAILABLE'
        | 'QSTASH_PUBLISH_REJECTED'
        | 'QSTASH_MESSAGE_ID_MISSING'
        | 'QSTASH_MESSAGE_ID_INVALID'
        | 'DISPATCH_RECEIPT_NOT_RECORDED';
    }
>;

export type MediaSourceAudioProductTriggerDependenciesV1 = Readonly<{
  assetStore?: Pick<MediaSourceAudioArtifactAssetStorePortsV1, 'load'>;
  jobStore?: JobStoreV1;
  dispatch?: DispatchV1;
  deliveryPolicy?: DurableWorkflowQStashDeliveryPolicyV1;
  environment?: MediaSourceAudioProductTriggerEnvironmentV1;
  publisher?: Readonly<MediaSourceAudioQStashPublisherV1>;
  now?: Date;
}>;

/**
 * Reloads the authoritative measured source, persists the exact source-bound
 * audio job, and only then attempts signed delivery. No resource limits,
 * audio stream, or source version are inferred by this trigger.
 */
export async function triggerQualifiedMediaSourceAudioMaterializationV1(
  inputMessage: MediaSourceQualificationWorkerMessageV1,
  dependencies: MediaSourceAudioProductTriggerDependenciesV1 = {},
): Promise<MediaSourceAudioProductTriggerResultV1> {
  const message = assertMediaSourceQualificationWorkerMessageV1(inputMessage);
  const assetStore = dependencies.assetStore
    ?? await createMediaSourceAudioArtifactAssetMongoPortsV1();
  const asset = await assetStore.load(message.assetId, message.userId);
  if (!asset) return frozen({ disposition: 'NOT_ELIGIBLE', reason: 'ASSET_NOT_FOUND' });

  const qualificationRecord = objectRecord(asset.sourceQualificationV1);
  if (!qualificationRecord) fail('MEDIA_SOURCE_AUDIO_PRODUCT_QUALIFICATION_INVALID');
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
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_QUALIFICATION_STATUS_INVALID');
  }

  let sourceVersion: Readonly<MediaSourceVersionV1>;
  try {
    sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
  } catch {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_SOURCE_VERSION_INVALID');
  }
  if (sourceVersion.mediaKind !== 'audio' && sourceVersion.mediaKind !== 'video') {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'MEDIA_KIND_NOT_AUDIO_OR_VIDEO',
    });
  }
  if (asset.type !== sourceVersion.mediaKind) {
    fail('MEDIA_SOURCE_AUDIO_PRODUCT_ASSET_KIND_MISMATCH');
  }

  const qualification = qualificationRecord as unknown as
    MediaSourceQualificationRecordV1;
  const streamIndexes = readNativeMediaExactAudioStreamIndexesV1(asset);
  if (streamIndexes === null || !hasValidObservationHash(qualificationRecord)) {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'AUDIO_STREAM_EVIDENCE_INVALID',
    });
  }
  if (streamIndexes.length === 0) {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'NO_AUDIO_PROOF_REQUIRED',
    });
  }
  if (streamIndexes.length > MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_MAX_STREAMS_V1) {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'AUDIO_STREAM_LIMIT_EXCEEDED',
    });
  }

  let maximumChannelCount = 0;
  try {
    for (const audioStreamIndex of streamIndexes) {
      const binding = createMediaSourceAudioStreamBindingV1({
        sourceVersion,
        qualification,
        audioStreamIndex,
      });
      maximumChannelCount = Math.max(maximumChannelCount, binding.channelCount);
    }
  } catch {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'AUDIO_STREAM_EVIDENCE_INVALID',
    });
  }

  const resourcePolicy = resolveProductResourcePolicy(
    dependencies.environment ?? process.env,
    sourceVersion,
    maximumChannelCount,
  );
  if (resourcePolicy.disposition === 'NOT_CONFIGURED') {
    return frozen({
      disposition: 'DELIVERY_DEFERRED',
      jobId: null,
      created: false,
      reason: 'RESOURCE_POLICY_NOT_CONFIGURED',
    });
  }
  if (resourcePolicy.disposition === 'INVALID') {
    return frozen({
      disposition: 'DELIVERY_DEFERRED',
      jobId: null,
      created: false,
      reason: 'RESOURCE_POLICY_INVALID',
    });
  }
  if (sourceVersion.byteLength > resourcePolicy.maximumSourceBytes) {
    return frozen({
      disposition: 'NOT_ELIGIBLE',
      reason: 'SOURCE_EXCEEDS_RESOURCE_POLICY',
    });
  }

  const actor = actorFromSourceOwner(sourceVersion, message.userId);
  const request = {
    assetId: message.assetId,
    sourceVersion,
    qualification,
    resourcePolicy: resourcePolicy.policy,
  };
  const jobStore = dependencies.jobStore ?? new DurableWorkflowJobStoreV1();
  const prepared = await createOrGetMediaSourceAudioDurableJobV1({
    jobStore,
    request: { ...actor, ...request },
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });

  let dispatched: Awaited<ReturnType<DispatchV1>>;
  try {
    dispatched = await (dependencies.dispatch
      ?? dispatchMediaSourceAudioDurableJobV1)({
      actor,
      request,
      jobStore,
      deliveryPolicy: dependencies.deliveryPolicy
        ?? MEDIA_SOURCE_AUDIO_PRODUCT_DELIVERY_POLICY_V1,
      ...(dependencies.environment ? { env: dependencies.environment } : {}),
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

export class MediaSourceAudioProductTriggerErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'MediaSourceAudioProductTriggerErrorV1';
  }
}

type ResourcePolicyResolutionV1 = Readonly<
  | { disposition: 'NOT_CONFIGURED' }
  | { disposition: 'INVALID' }
  | {
      disposition: 'CONFIGURED';
      maximumSourceBytes: number;
      policy: MediaSourceAudioSampleEpochResourcePolicyV1;
    }
>;

function resolveProductResourcePolicy(
  environment: MediaSourceAudioProductTriggerEnvironmentV1,
  sourceVersion: Readonly<MediaSourceVersionV1>,
  maximumChannelCount: number,
): ResourcePolicyResolutionV1 {
  const values = RESOURCE_POLICY_ENVIRONMENT_KEYS_V1.map((key) => (
    requiredEnvironmentValue(environment[key])
  ));
  if (values.some((value) => value === null)) {
    return frozen({ disposition: 'NOT_CONFIGURED' });
  }
  const [policyVersion, maximumSourceBytesText, maximumCanonicalJsonBytesText,
    maximumDecodedFrameEntriesText, maximumEpochEntriesText,
    maximumDecodedSampleFramesText, maximumDecodedPcmBytesText,
    timeoutText] = values as readonly string[];
  try {
    if (!POLICY_VERSION.test(policyVersion!)) throw new Error('POLICY_VERSION_INVALID');
    const maximumSourceBytes = positiveInteger(maximumSourceBytesText!);
    const maximumDecodedSampleFrames = positiveInteger(
      maximumDecodedSampleFramesText!,
    );
    const maximumDecodedPcmBytes = positiveInteger(maximumDecodedPcmBytesText!);
    const privateStorageCapacity = BigInt(
      MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_DEFAULT_POLICY_V1.maxChunkBytes,
    ) * BigInt(
      MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_DEFAULT_POLICY_V1.maxChunkCount,
    );
    const requiredPcmCapacity = BigInt(maximumDecodedSampleFrames)
      * BigInt(maximumChannelCount) * BigInt(4);
    if (BigInt(maximumDecodedPcmBytes) > privateStorageCapacity
      || requiredPcmCapacity > BigInt(maximumDecodedPcmBytes)) {
      throw new Error('POLICY_PCM_CAPACITY_INVALID');
    }
    const policy = assertMediaSourceAudioSampleEpochResourcePolicyV1({
      policyVersion,
      maxSourceBytes: sourceVersion.byteLength,
      maxCanonicalJsonBytes: positiveInteger(maximumCanonicalJsonBytesText!),
      maxDecodedFrameEntries: positiveInteger(maximumDecodedFrameEntriesText!),
      maxEpochEntries: positiveInteger(maximumEpochEntriesText!),
      maxDecodedSampleFrames: maximumDecodedSampleFrames,
      maxDecodedPcmBytes: maximumDecodedPcmBytes,
      timeoutMs: positiveInteger(timeoutText!),
    });
    return frozen({
      disposition: 'CONFIGURED',
      maximumSourceBytes,
      policy: deepFreezeEditronJsonV1(policy),
    });
  } catch {
    return frozen({ disposition: 'INVALID' });
  }
}

function actorFromSourceOwner(
  sourceVersion: Readonly<MediaSourceVersionV1>,
  userId: string,
): Readonly<{ tenantId: string; userId: string; orgId: string | null }> {
  if (sourceVersion.owner.kind === 'USER') {
    if (sourceVersion.owner.userId !== userId) {
      fail('MEDIA_SOURCE_AUDIO_PRODUCT_SOURCE_OWNER_MISMATCH');
    }
    return frozen({ tenantId: sourceVersion.owner.userId, userId, orgId: null });
  }
  return frozen({
    tenantId: sourceVersion.owner.orgId,
    userId,
    orgId: sourceVersion.owner.orgId,
  });
}

function hasValidObservationHash(
  qualification: Record<string, unknown>,
): boolean {
  const observation = objectRecord(qualification.observation);
  if (!observation) return false;
  const { observationSha256, ...material } = observation;
  return typeof observationSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(observationSha256)
    && observationSha256 === hashEditronCanonicalJsonV1(material);
}

function positiveInteger(value: string): number {
  if (!POSITIVE_DECIMAL_INTEGER.test(value)) throw new Error('INTEGER_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('INTEGER_INVALID');
  return parsed;
}

function requiredEnvironmentValue(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function fail(code: string): never {
  throw new MediaSourceAudioProductTriggerErrorV1(code);
}

function frozen<const T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
