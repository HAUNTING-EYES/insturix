import { DURABLE_WORKFLOW_JOB_LEASE_MS_V1 }
  from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  recoverMediaProxyMasterTranscodeDurableJobsV1,
  type MediaProxyMasterTranscodeDurableDispatchEnvironmentV1,
  type MediaProxyMasterTranscodeQStashPublisherV1,
} from './media-proxy-master-transcode-durable-dispatch-v1';
import {
  resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1,
  type MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1,
} from './media-proxy-master-transcode-operational-policy-environment-v1';
import type { MediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from './media-proxy-master-transcode-operational-policy-registry-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_STALE_MS_V1 =
  2 * DURABLE_WORKFLOW_JOB_LEASE_MS_V1;
export const MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_LIMIT_V1 = 10;

type RecoveryV1 = typeof recoverMediaProxyMasterTranscodeDurableJobsV1;

export type MediaProxyMasterTranscodeRecoveryEnvironmentV1 =
  MediaProxyMasterTranscodeDurableDispatchEnvironmentV1
  & MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1;

export type MediaProxyMasterTranscodeRecoveryRuntimeDependenciesV1 = Readonly<{
  jobStore?: Pick<DurableWorkflowJobStoreV1,
    'listRecoverable' | 'recordDispatch'>;
  recover?: RecoveryV1;
  environment?: MediaProxyMasterTranscodeRecoveryEnvironmentV1;
  policyRegistry?: Readonly<
    MediaProxyMasterTranscodeOperationalPolicyRegistryV1
  >;
  publisher?: Readonly<MediaProxyMasterTranscodeQStashPublisherV1>;
  now?: Date;
}>;

/** Product composition for one bounded proxy-transcode stale-delivery sweep. */
export async function runMediaProxyMasterTranscodeRecoveryV1(
  dependencies: MediaProxyMasterTranscodeRecoveryRuntimeDependenciesV1 = {},
): Promise<Awaited<ReturnType<RecoveryV1>>> {
  const now = validDate(dependencies.now ?? new Date());
  const environment = dependencies.environment ?? processEnvironment();
  const policyRegistry = dependencies.policyRegistry
    ?? deploymentPolicyRegistry(environment);
  return (dependencies.recover
    ?? recoverMediaProxyMasterTranscodeDurableJobsV1)({
    jobStore: dependencies.jobStore ?? new DurableWorkflowJobStoreV1(),
    staleBefore: new Date(
      now.getTime() - MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_STALE_MS_V1,
    ),
    now,
    limit: MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_LIMIT_V1,
    policyRegistry,
    env: environment,
    ...(dependencies.publisher ? { publisher: dependencies.publisher } : {}),
  });
}

function deploymentPolicyRegistry(
  environment: MediaProxyMasterTranscodeRecoveryEnvironmentV1,
): Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1> {
  const resolved =
    resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1(
      environment,
    );
  if (!resolved.configured) {
    throw new MediaProxyMasterTranscodeRecoveryRuntimeErrorV1(
      `OPERATIONAL_POLICY_${resolved.reason}`,
    );
  }
  return resolved.registry;
}

function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new MediaProxyMasterTranscodeRecoveryRuntimeErrorV1('NOW_INVALID');
  }
  return value;
}

function processEnvironment(): MediaProxyMasterTranscodeRecoveryEnvironmentV1 {
  return {
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_JSON:
      process.env
        .EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_REGISTRY_JSON,
  };
}

export class MediaProxyMasterTranscodeRecoveryRuntimeErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_${code}`);
    this.name = 'MediaProxyMasterTranscodeRecoveryRuntimeErrorV1';
  }
}
