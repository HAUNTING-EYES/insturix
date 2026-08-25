import type { ModalProxyAuthEnvironmentV1 } from './modal-proxy-auth-v1';
import { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  runMediaSourcePtsCadenceDurableWorkerV1,
  type MediaSourcePtsCadenceDurableFinalizerResultV1,
  type MediaSourcePtsCadenceDurableWorkerPortsV1,
  type MediaSourcePtsCadenceDurableWorkerResultV1,
} from './media-source-pts-cadence-durable-worker-v1';
import {
  createMediaSourcePtsCadenceMapAssetMongoPortsV2,
  persistMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetStorePortsV2,
} from './media-source-pts-cadence-map-asset-store-v2';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import { finalizeMediaSourcePtsCadenceScanV1 } from './media-source-pts-cadence-scan-finalizer-v1';
import {
  isMediaSourcePtsCadenceScanTransportConfiguredV1,
  pollMediaSourcePtsCadenceScanV1,
  submitMediaSourcePtsCadenceScanV1,
} from './media-source-pts-cadence-scan-transport-v1';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import { resolveVerifiedMediaSourceUrlV1 } from './media-source-qualification-runtime-v1';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

export type MediaSourcePtsCadenceDurableRuntimeEnvironmentV1 =
  MediaSourcePtsCadenceR2RuntimeEnvironmentV1 & ModalProxyAuthEnvironmentV1;

export type MediaSourcePtsCadenceDurableRuntimeResultV1 =
  | MediaSourcePtsCadenceDurableWorkerResultV1
  | Readonly<{
      kind: 'runtime_unavailable';
      reason:
        | 'SCAN_TRANSPORT_NOT_CONFIGURED'
        | 'PRIVATE_STORAGE_NOT_CONFIGURED'
        | 'MEDIA_ASSET_OWNER_UNAVAILABLE';
    }>;

type PrivateRuntimeV1 = ReturnType<typeof createMediaSourcePtsCadenceR2RuntimePortsV1>;
type FullFinalizerV1 = typeof finalizeMediaSourcePtsCadenceScanV1;

export type MediaSourcePtsCadenceDurableRuntimeDependenciesV1 = Readonly<{
  environment?: MediaSourcePtsCadenceDurableRuntimeEnvironmentV1;
  jobStore?: Parameters<typeof runMediaSourcePtsCadenceDurableWorkerV1>[0]['jobStore'];
  transportConfigured?: (
    environment: MediaSourcePtsCadenceDurableRuntimeEnvironmentV1,
  ) => boolean;
  createPrivateRuntime?: (
    environment: MediaSourcePtsCadenceDurableRuntimeEnvironmentV1,
  ) => PrivateRuntimeV1;
  createAssetStorePorts?: () => Promise<MediaSourcePtsCadenceMapAssetStorePortsV2>;
  resolveVerifiedSourceUrl?: typeof resolveVerifiedMediaSourceUrlV1;
  submitScan?: MediaSourcePtsCadenceDurableWorkerPortsV1['submitScan'];
  pollScan?: MediaSourcePtsCadenceDurableWorkerPortsV1['pollScan'];
  finalizeScan?: FullFinalizerV1;
  clock?: () => Date;
  retryDelayMs?: number;
  pollDelayMs?: number;
}>;

/**
 * Composes existing owners before claiming a durable attempt. It exposes no
 * route and creates no project, timeline, media registry or retry authority.
 */
export async function runMediaSourcePtsCadenceDurableRuntimeV1(
  input: Readonly<{ jobId: string; workerId: string }>,
  dependencies: MediaSourcePtsCadenceDurableRuntimeDependenciesV1 = {},
): Promise<MediaSourcePtsCadenceDurableRuntimeResultV1> {
  const environment = dependencies.environment ?? process.env;
  const transportConfigured = dependencies.transportConfigured
    ?? isMediaSourcePtsCadenceScanTransportConfiguredV1;
  if (!transportConfigured(environment)) {
    return { kind: 'runtime_unavailable', reason: 'SCAN_TRANSPORT_NOT_CONFIGURED' };
  }

  let privateRuntime: PrivateRuntimeV1;
  try {
    privateRuntime = (dependencies.createPrivateRuntime
      ?? createMediaSourcePtsCadenceR2RuntimePortsV1)(environment);
  } catch {
    return { kind: 'runtime_unavailable', reason: 'PRIVATE_STORAGE_NOT_CONFIGURED' };
  }

  let assetStorePorts: MediaSourcePtsCadenceMapAssetStorePortsV2;
  try {
    assetStorePorts = await (dependencies.createAssetStorePorts
      ?? createMediaSourcePtsCadenceMapAssetMongoPortsV2)();
  } catch {
    return { kind: 'runtime_unavailable', reason: 'MEDIA_ASSET_OWNER_UNAVAILABLE' };
  }

  const workerPorts = createMediaSourcePtsCadenceDurableRuntimeWorkerPortsV1({
    assetStorePorts,
    privateRuntime,
    resolveVerifiedSourceUrl: dependencies.resolveVerifiedSourceUrl
      ?? resolveVerifiedMediaSourceUrlV1,
    submitScan: dependencies.submitScan
      ?? ((submission) => submitMediaSourcePtsCadenceScanV1(
        submission,
        { environment },
      )),
    pollScan: dependencies.pollScan
      ?? ((job) => pollMediaSourcePtsCadenceScanV1(job, { environment })),
    finalizeScan: dependencies.finalizeScan ?? finalizeMediaSourcePtsCadenceScanV1,
  });

  return runMediaSourcePtsCadenceDurableWorkerV1({
    jobStore: dependencies.jobStore ?? new DurableWorkflowJobStoreV1(),
    ports: workerPorts,
    jobId: input.jobId,
    workerId: input.workerId,
    ...(dependencies.clock ? { clock: dependencies.clock } : {}),
    ...(dependencies.retryDelayMs !== undefined
      ? { retryDelayMs: dependencies.retryDelayMs }
      : {}),
    ...(dependencies.pollDelayMs !== undefined
      ? { pollDelayMs: dependencies.pollDelayMs }
      : {}),
  });
}

export function createMediaSourcePtsCadenceDurableRuntimeWorkerPortsV1(
  input: Readonly<{
    assetStorePorts: MediaSourcePtsCadenceMapAssetStorePortsV2;
    privateRuntime: PrivateRuntimeV1;
    resolveVerifiedSourceUrl: typeof resolveVerifiedMediaSourceUrlV1;
    submitScan: MediaSourcePtsCadenceDurableWorkerPortsV1['submitScan'];
    pollScan: MediaSourcePtsCadenceDurableWorkerPortsV1['pollScan'];
    finalizeScan: FullFinalizerV1;
  }>,
): MediaSourcePtsCadenceDurableWorkerPortsV1 {
  return {
    loadCurrentSource: async ({ assetId, userId }) => {
      const asset = await input.assetStorePorts.load(assetId, userId);
      if (!asset) return null;
      const qualification = qualificationRecord(asset.sourceQualificationV1);
      return {
        sourceVersion: assertMediaSourceVersionV1(asset.sourceVersionV1),
        qualification,
      };
    },
    resolveVerifiedSourceUrl: async ({ qualification }) => {
      const resolved = await input.resolveVerifiedSourceUrl(qualification);
      if (resolved.disposition !== 'AVAILABLE') {
        return {
          disposition: 'UNVERIFIABLE',
          diagnostic: resolved.result.diagnostics[0]
            ?? 'MEDIA_SOURCE_SIGNED_URL_UNAVAILABLE',
          retryable: true,
        };
      }
      return {
        disposition: 'AVAILABLE',
        sourceUrl: resolved.sourceUrl,
        storageVersionSha256: resolved.storageVersion.storageVersionSha256,
      };
    },
    submitScan: input.submitScan,
    pollScan: input.pollScan,
    finalizeScan: async (finalizerInput) => adaptFinalizerResult(
      await input.finalizeScan({
        ...finalizerInput,
        stagingReader: input.privateRuntime.stagingReader,
        descriptorPort: input.privateRuntime.descriptorPort,
        artifactPort: input.privateRuntime.artifactPort,
        lifecycleManifestReader: input.privateRuntime.lifecycleManifestReader,
        stateOwner: {
          load: input.assetStorePorts.load,
          persist: (persistInput) => persistMediaSourcePtsCadenceMapAssetStateV2(
            persistInput,
            input.assetStorePorts,
          ),
        },
      }),
    ),
  };
}

function adaptFinalizerResult(
  result: Awaited<ReturnType<FullFinalizerV1>>,
): MediaSourcePtsCadenceDurableFinalizerResultV1 {
  switch (result.disposition) {
    case 'COMPLETED':
    case 'ALREADY_COMPLETE': {
      const terminalReceiptSha256 = result.state.sourcePtsCadenceMapV2
        .terminalReceipt?.terminalReceiptSha256;
      return terminalReceiptSha256
        ? { disposition: result.disposition, terminalReceiptSha256 }
        : { disposition: 'REJECTED', reason: 'TERMINAL_RECEIPT_MISSING' };
    }
    case 'BUSY':
      return { disposition: 'BUSY', activeClaimId: result.activeClaimId };
    case 'REJECTED':
      return { disposition: 'REJECTED', reason: result.reason };
    case 'UNVERIFIABLE':
      return { disposition: 'UNVERIFIABLE', diagnostic: result.diagnostic };
  }
}

/** The worker immediately rebuilds and validates this record against the job. */
function qualificationRecord(value: unknown): MediaSourceQualificationRecordV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_SOURCE_PTS_RUNTIME_QUALIFICATION_INVALID');
  }
  return value as MediaSourceQualificationRecordV1;
}
