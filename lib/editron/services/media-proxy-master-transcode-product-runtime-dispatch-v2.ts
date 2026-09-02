import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
} from './media-proxy-master-transcode-durable-job-v1';
import { MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2 }
  from './media-proxy-master-transcode-durable-job-v2';
import {
  runMediaProxyMasterTranscodeProductRuntimeV1,
  type MediaProxyMasterTranscodeProductRuntimeResultV1,
} from './media-proxy-master-transcode-product-runtime-v1';
import { runMediaProxyMasterTranscodeProductRuntimeV2 }
  from './media-proxy-master-transcode-product-runtime-v2';

type RuntimeRequestV2 = Readonly<{ jobId: string; workerId: string }>;
type RuntimeRunnerV2 = (
  request: RuntimeRequestV2,
) => Promise<MediaProxyMasterTranscodeProductRuntimeResultV1>;
type SchemaProbeStoreV2 = Pick<
  DurableWorkflowJobStoreV1,
  'getForWorkerExecution'
>;

/** Selects one immutable durable-job schema before any runtime can claim it. */
export async function runMediaProxyMasterTranscodeProductRuntimeDispatchV2(
  request: RuntimeRequestV2,
  dependencies: Readonly<{
    jobStore?: SchemaProbeStoreV2;
    runV1?: RuntimeRunnerV2;
    runV2?: RuntimeRunnerV2;
  }> = {},
): Promise<MediaProxyMasterTranscodeProductRuntimeResultV1> {
  const jobStore = dependencies.jobStore ?? new DurableWorkflowJobStoreV1();
  const scope = {
    jobId: request.jobId,
    operationOwner: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
    operationKind: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  } as const;
  const v2 = await jobStore.getForWorkerExecution({
    ...scope,
    inputSchemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
  });
  if (v2) {
    return (dependencies.runV2
      ?? ((value) => runMediaProxyMasterTranscodeProductRuntimeV2(
        value,
        { jobStore: jobStore as never },
      )))(request);
  }
  const v1 = await jobStore.getForWorkerExecution({
    ...scope,
    inputSchemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
  });
  if (v1) {
    return (dependencies.runV1
      ?? ((value) => runMediaProxyMasterTranscodeProductRuntimeV1(
        value,
        { jobStore: jobStore as never },
      )))(request);
  }
  return Object.freeze({ kind: 'skipped', reason: 'not_found' });
}
