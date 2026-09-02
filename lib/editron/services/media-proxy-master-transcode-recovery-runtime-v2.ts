import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import { recoverMediaProxyMasterTranscodeDurableJobsV1 }
  from './media-proxy-master-transcode-durable-dispatch-v1';
import { recoverMediaProxyMasterTranscodeDurableJobsV2 }
  from './media-proxy-master-transcode-durable-dispatch-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
} from './media-proxy-master-transcode-durable-job-v1';
import { MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2 }
  from './media-proxy-master-transcode-durable-job-v2';
import {
  resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1,
} from './media-proxy-master-transcode-operational-policy-environment-v1';
import type { MediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from './media-proxy-master-transcode-operational-policy-registry-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_LIMIT_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_STALE_MS_V1,
  type MediaProxyMasterTranscodeRecoveryEnvironmentV1,
} from './media-proxy-master-transcode-recovery-runtime-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_RUNTIME_VERSION_V2 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_RUNTIME_V2' as const;

type RecoveryV1 = typeof recoverMediaProxyMasterTranscodeDurableJobsV1;
type RecoveryV2 = typeof recoverMediaProxyMasterTranscodeDurableJobsV2;

export async function runMediaProxyMasterTranscodeRecoveryV2(
  dependencies: Readonly<{
    jobStore?: Pick<DurableWorkflowJobStoreV1,
      'listRecoverable' | 'recordDispatch'>;
    recoverV1?: RecoveryV1;
    recoverV2?: RecoveryV2;
    environment?: MediaProxyMasterTranscodeRecoveryEnvironmentV1;
    policyRegistry?: Readonly<
      MediaProxyMasterTranscodeOperationalPolicyRegistryV1
    >;
    publisher?: Parameters<RecoveryV1>[0]['publisher'];
    now?: Date;
  }> = {},
) {
  const now = validDate(dependencies.now ?? new Date());
  const environment = dependencies.environment ?? processEnvironment();
  const policyRegistry = dependencies.policyRegistry
    ?? deploymentPolicyRegistry(environment);
  const jobStore = dependencies.jobStore ?? new DurableWorkflowJobStoreV1();
  const common = {
    jobStore,
    staleBefore: new Date(
      now.getTime() - MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_STALE_MS_V1,
    ),
    now,
    limit: MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_LIMIT_V1,
    policyRegistry,
    env: environment,
    ...(dependencies.publisher ? { publisher: dependencies.publisher } : {}),
  };
  const [v2, v1] = await Promise.all([
    (dependencies.recoverV2
      ?? recoverMediaProxyMasterTranscodeDurableJobsV2)(common),
    (dependencies.recoverV1
      ?? recoverMediaProxyMasterTranscodeDurableJobsV1)(common),
  ]);
  const results = Object.freeze([
    ...v2.results.map((result) => Object.freeze({
      schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
      ...result,
    })),
    ...v1.results.map((result) => Object.freeze({
      schemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
      ...result,
    })),
  ]);
  return Object.freeze({
    version: MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_RUNTIME_VERSION_V2,
    schemas: Object.freeze({ v1, v2 }),
    results,
  });
}

function deploymentPolicyRegistry(
  environment: MediaProxyMasterTranscodeRecoveryEnvironmentV1,
) {
  const resolved =
    resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1(
      environment,
    );
  if (!resolved.configured) {
    fail(`OPERATIONAL_POLICY_${resolved.reason}`);
  }
  return resolved.registry;
}

function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail('NOW_INVALID');
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

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeRecoveryRuntimeErrorV2(code);
}

export class MediaProxyMasterTranscodeRecoveryRuntimeErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_V2_${code}`);
    this.name = 'MediaProxyMasterTranscodeRecoveryRuntimeErrorV2';
  }
}
