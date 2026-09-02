import { DURABLE_WORKFLOW_JOB_LEASE_MS_V1 }
  from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  recoverMediaSourceAudioDurableJobsV1,
  type MediaSourceAudioDurableDispatchEnvironmentV1,
  type MediaSourceAudioQStashPublisherV1,
} from './media-source-audio-durable-dispatch-v1';
import { MEDIA_SOURCE_AUDIO_PRODUCT_DELIVERY_POLICY_V1 }
  from './media-source-audio-product-trigger-v1';

export const MEDIA_SOURCE_AUDIO_RECOVERY_STALE_MS_V1 =
  2 * DURABLE_WORKFLOW_JOB_LEASE_MS_V1;
export const MEDIA_SOURCE_AUDIO_RECOVERY_LIMIT_V1 = 10;

type RecoveryV1 = typeof recoverMediaSourceAudioDurableJobsV1;

export type MediaSourceAudioRecoveryRuntimeDependenciesV1 = Readonly<{
  jobStore?: Pick<DurableWorkflowJobStoreV1,
    'listRecoverable' | 'recordDispatch'>;
  recover?: RecoveryV1;
  environment?: MediaSourceAudioDurableDispatchEnvironmentV1;
  publisher?: Readonly<MediaSourceAudioQStashPublisherV1>;
  now?: Date;
}>;

/** Product composition for one bounded, audio-family-only stale-delivery sweep. */
export async function runMediaSourceAudioRecoveryV1(
  dependencies: MediaSourceAudioRecoveryRuntimeDependenciesV1 = {},
): Promise<Awaited<ReturnType<RecoveryV1>>> {
  const now = validDate(dependencies.now ?? new Date());
  return (dependencies.recover ?? recoverMediaSourceAudioDurableJobsV1)({
    jobStore: dependencies.jobStore ?? new DurableWorkflowJobStoreV1(),
    staleBefore: new Date(
      now.getTime() - MEDIA_SOURCE_AUDIO_RECOVERY_STALE_MS_V1,
    ),
    now,
    limit: MEDIA_SOURCE_AUDIO_RECOVERY_LIMIT_V1,
    deliveryPolicy: MEDIA_SOURCE_AUDIO_PRODUCT_DELIVERY_POLICY_V1,
    ...(dependencies.environment ? { env: dependencies.environment } : {}),
    ...(dependencies.publisher ? { publisher: dependencies.publisher } : {}),
  });
}

function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('MEDIA_SOURCE_AUDIO_RECOVERY_NOW_INVALID');
  }
  return value;
}
