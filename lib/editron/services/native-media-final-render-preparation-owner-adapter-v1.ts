import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import {
  assertNativeMediaFinalRenderPreparationJobInputV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_KIND_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_OWNER_V1,
  type NativeMediaFinalRenderPreparationJobInputV1,
} from './native-media-final-render-preparation-job-v1';
import {
  createNativeMediaFinalRenderPreparationResultV1,
} from './native-media-final-render-preparation-result-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1,
} from './native-media-final-render-preparation-runtime-policy-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
  type NativeMediaFinalRenderArtifactPreparerPortV1,
} from './native-media-final-render-materializer-v1';
import {
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_ID_V1,
  type NativeMediaFinalRenderArtifactPreparationOwnerV1,
} from './native-media-final-render-preparation-worker-v1';

export {
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1,
} from './native-media-final-render-preparation-runtime-policy-v1';

const MAX_HEARTBEAT_INTERVAL_MS_V1 = Math.floor(DURABLE_WORKFLOW_JOB_LEASE_MS_V1 / 3);
const DIAGNOSTIC = /^[A-Z0-9_]{1,200}$/;

export type NativeMediaFinalRenderPreparationHeartbeatPolicyV1 = Readonly<{
  policyVersion: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1;
  durableLeaseMs: typeof DURABLE_WORKFLOW_JOB_LEASE_MS_V1;
  heartbeatIntervalMs: number;
  policySha256: string;
}>;

export function createNativeMediaFinalRenderPreparationHeartbeatPolicyV1(
  input: Readonly<{ heartbeatIntervalMs: number }>,
): NativeMediaFinalRenderPreparationHeartbeatPolicyV1 {
  if (!Number.isSafeInteger(input?.heartbeatIntervalMs)
    || input.heartbeatIntervalMs < 1
    || input.heartbeatIntervalMs > MAX_HEARTBEAT_INTERVAL_MS_V1) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_INVALID');
  }
  const material = {
    policyVersion: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1,
    durableLeaseMs: DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
    heartbeatIntervalMs: input.heartbeatIntervalMs,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

/**
 * Adapts the sole exact artifact preparer to the generic durable worker. The
 * sequential pump prevents overlapping lease renewals and aborts media work if
 * the worker no longer owns the durable lease or observes cancellation.
 */
export function createNativeMediaFinalRenderPreparationOwnerAdapterV1(input: Readonly<{
  artifactPreparer: NativeMediaFinalRenderArtifactPreparerPortV1;
  heartbeatPolicy: NativeMediaFinalRenderPreparationHeartbeatPolicyV1;
  wait?: (input: Readonly<{ delayMs: number; abortSignal: AbortSignal }>) => Promise<void>;
}>): NativeMediaFinalRenderArtifactPreparationOwnerV1 {
  if (!input || typeof input.artifactPreparer?.prepare !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_ADAPTER_PORT_INVALID');
  }
  const heartbeatPolicy = assertHeartbeatPolicy(input.heartbeatPolicy);
  const wait = input.wait ?? waitForDelay;
  if (typeof wait !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_ADAPTER_WAIT_INVALID');
  }

  const owner: NativeMediaFinalRenderArtifactPreparationOwnerV1 = {
    ownerId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_ID_V1,
    ownerVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
    heartbeatPolicyOwnerId:
      NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_OWNER_ID_V1,
    heartbeatPolicyOwnerVersion:
      NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1,
    heartbeatPolicySha256: heartbeatPolicy.policySha256,
    async prepare(ownerInput) {
      const jobInput = assertAdapterJobScope(ownerInput.job, ownerInput.jobInput);
      if (typeof ownerInput.lifecycle?.heartbeat !== 'function') {
        throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_ADAPTER_LIFECYCLE_INVALID');
      }
      const workController = new AbortController();
      const pumpController = new AbortController();
      let heartbeatFailure: unknown = null;
      const pump = runHeartbeatPump({
        heartbeat: ownerInput.lifecycle.heartbeat,
        heartbeatPolicy,
        wait,
        stopSignal: pumpController.signal,
      }).catch((error: unknown) => {
        heartbeatFailure = error;
        workController.abort();
      });

      let outcome: Awaited<ReturnType<typeof input.artifactPreparer.prepare>> | null = null;
      let preparationFailure: unknown = null;
      try {
        outcome = await input.artifactPreparer.prepare({
          userId: jobInput.userId,
          projectId: jobInput.projectId,
          sequenceId: jobInput.sequenceId,
          projectRevision: jobInput.projectRevision,
          request: jobInput.exactSourceRequest,
          abortSignal: workController.signal,
        });
      } catch (error) {
        preparationFailure = error;
      } finally {
        pumpController.abort();
        await pump;
      }

      if (heartbeatFailure) throw heartbeatFailure;
      if (preparationFailure) throw preparationFailure;
      if (!outcome || outcome.disposition === 'UNVERIFIABLE') {
        return unverifiableOutcome({
          job: ownerInput.job,
          jobInput,
          heartbeatPolicy,
          diagnosticCode: outcome?.diagnostic,
        });
      }
      const validated = createNativeMediaFinalRenderPreparationResultV1({
        jobInput,
        jobInputBindingSha256: ownerInput.job.input.bindingSha256,
        artifact: outcome.artifact,
        publishHandle: outcome.publishHandle,
      });
      return Object.freeze({
        disposition: 'PREPARED' as const,
        artifact: validated.artifact,
        publishHandle: validated.publishHandle,
      });
    },
  };
  return Object.freeze(owner);
}

async function runHeartbeatPump(input: Readonly<{
  heartbeat(): Promise<void>;
  heartbeatPolicy: NativeMediaFinalRenderPreparationHeartbeatPolicyV1;
  wait(input: Readonly<{ delayMs: number; abortSignal: AbortSignal }>): Promise<void>;
  stopSignal: AbortSignal;
}>): Promise<void> {
  while (!input.stopSignal.aborted) {
    await input.wait({
      delayMs: input.heartbeatPolicy.heartbeatIntervalMs,
      abortSignal: input.stopSignal,
    });
    if (input.stopSignal.aborted) return;
    await input.heartbeat();
  }
}

function assertHeartbeatPolicy(
  value: NativeMediaFinalRenderPreparationHeartbeatPolicyV1,
): NativeMediaFinalRenderPreparationHeartbeatPolicyV1 {
  if (!value || value.policyVersion
      !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_VERSION_V1
    || value.durableLeaseMs !== DURABLE_WORKFLOW_JOB_LEASE_MS_V1) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_INVALID');
  }
  const rebuilt = createNativeMediaFinalRenderPreparationHeartbeatPolicyV1({
    heartbeatIntervalMs: value.heartbeatIntervalMs,
  });
  if (value.policySha256 !== rebuilt.policySha256
    || Object.keys(value).sort().join(',')
      !== Object.keys(rebuilt).sort().join(',')) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_HEARTBEAT_POLICY_INVALID');
  }
  return rebuilt;
}

function assertAdapterJobScope(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  input: NativeMediaFinalRenderPreparationJobInputV1,
): NativeMediaFinalRenderPreparationJobInputV1 {
  const jobInput = assertNativeMediaFinalRenderPreparationJobInputV1(input);
  if (!job
    || job.operationOwner !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_OWNER_V1
    || job.operationKind !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_KIND_V1
    || job.userId !== jobInput.userId || job.projectId !== jobInput.projectId
    || job.input?.schemaId !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1
    || job.input.bindingSha256 !== hashDurableWorkflowJobJsonV1(jobInput)
    || hashDurableWorkflowJobJsonV1(job.input.payload)
      !== job.input.bindingSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PREPARATION_ADAPTER_JOB_BINDING_INVALID');
  }
  return jobInput;
}

function unverifiableOutcome(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  jobInput: NativeMediaFinalRenderPreparationJobInputV1;
  heartbeatPolicy: NativeMediaFinalRenderPreparationHeartbeatPolicyV1;
  diagnosticCode: string | null | undefined;
}>) {
  const diagnosticCode = typeof input.diagnosticCode === 'string'
    && DIAGNOSTIC.test(input.diagnosticCode)
    ? input.diagnosticCode
    : 'NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PREPARATION_UNVERIFIABLE';
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    diagnosticCode,
    proofSha256: hashEditronCanonicalJsonV1({
      version: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OWNER_PROOF_V1',
      jobId: input.job.jobId,
      jobInputBindingSha256: input.job.input.bindingSha256,
      exactSourceRequestSha256: input.jobInput.exactSourceRequestSha256,
      heartbeatPolicySha256: input.heartbeatPolicy.policySha256,
      diagnosticCode,
    }),
  });
}

function waitForDelay(input: Readonly<{
  delayMs: number;
  abortSignal: AbortSignal;
}>): Promise<void> {
  if (input.abortSignal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.abortSignal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, input.delayMs);
    input.abortSignal.addEventListener('abort', finish, { once: true });
    if (input.abortSignal.aborted) finish();
  });
}
