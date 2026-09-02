import { DURABLE_WORKFLOW_JOB_LEASE_MS_V1 }
  from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  recoverMediaSourcePtsCadenceDurableEpochJobsV3,
  type MediaSourcePtsCadenceDurableEpochDispatchEnvironmentV3,
  type MediaSourcePtsCadenceEpochQStashPublisherV3,
} from './media-source-pts-cadence-durable-dispatch-v3';
import { MEDIA_SOURCE_PTS_CADENCE_PRODUCT_DELIVERY_POLICY_V3 }
  from './media-source-pts-cadence-product-trigger-v3';

export const MEDIA_SOURCE_PTS_CADENCE_RECOVERY_STALE_MS_V3 =
  2 * DURABLE_WORKFLOW_JOB_LEASE_MS_V1;
export const MEDIA_SOURCE_PTS_CADENCE_RECOVERY_LIMIT_V3 = 10;

type RecoveryV3 = typeof recoverMediaSourcePtsCadenceDurableEpochJobsV3;

export type MediaSourcePtsCadenceRecoveryRuntimeDependenciesV3 = Readonly<{
  jobStore?: Pick<DurableWorkflowJobStoreV1,
    'listRecoverable' | 'recordDispatch'>;
  recover?: RecoveryV3;
  environment?: MediaSourcePtsCadenceDurableEpochDispatchEnvironmentV3;
  publisher?: Readonly<MediaSourcePtsCadenceEpochQStashPublisherV3>;
  now?: Date;
}>;

/** Product composition for one bounded, V3-only stale-delivery sweep. */
export async function runMediaSourcePtsCadenceRecoveryV3(
  dependencies: MediaSourcePtsCadenceRecoveryRuntimeDependenciesV3 = {},
): Promise<Awaited<ReturnType<RecoveryV3>>> {
  const now = validDate(dependencies.now ?? new Date());
  return (dependencies.recover
    ?? recoverMediaSourcePtsCadenceDurableEpochJobsV3)({
    jobStore: dependencies.jobStore ?? new DurableWorkflowJobStoreV1(),
    staleBefore: new Date(
      now.getTime() - MEDIA_SOURCE_PTS_CADENCE_RECOVERY_STALE_MS_V3,
    ),
    now,
    limit: MEDIA_SOURCE_PTS_CADENCE_RECOVERY_LIMIT_V3,
    deliveryPolicy: MEDIA_SOURCE_PTS_CADENCE_PRODUCT_DELIVERY_POLICY_V3,
    ...(dependencies.environment
      ? { env: dependencies.environment }
      : {}),
    ...(dependencies.publisher ? { publisher: dependencies.publisher } : {}),
  });
}

function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_RECOVERY_NOW_INVALID');
  }
  return value;
}
