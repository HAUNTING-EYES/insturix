import type { MediaSourcePtsCadenceBoundarySemanticVerifierV3 }
  from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  pollMediaSourcePtsCadenceEpochScanV3,
  isMediaSourcePtsCadenceEpochScanTransportConfiguredV3,
  submitMediaSourcePtsCadenceEpochScanV3,
} from './media-source-pts-cadence-epoch-scan-transport-v3';
import type { ModalProxyAuthEnvironmentV1 } from './modal-proxy-auth-v1';
import { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  runMediaSourcePtsCadenceDurableEpochWorkerV3,
  type MediaSourcePtsCadenceDurableEpochPublisherResultV3,
  type MediaSourcePtsCadenceDurableEpochWorkerPortsV3,
  type MediaSourcePtsCadenceDurableEpochWorkerResultV3,
} from './media-source-pts-cadence-durable-worker-v3';
import {
  createMediaSourcePtsCadenceMapAssetMongoPortsV3,
  persistMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStorePortsV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import {
  publishMediaSourcePtsCadenceScanV3,
  type MediaSourcePtsCadenceScanPublicationResultV3,
} from './media-source-pts-cadence-scan-publisher-v3';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import { resolveVerifiedMediaSourceUrlV1 }
  from './media-source-qualification-runtime-v1';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

export type MediaSourcePtsCadenceDurableEpochRuntimeEnvironmentV3 =
  MediaSourcePtsCadenceR2RuntimeEnvironmentV1 & ModalProxyAuthEnvironmentV1;

export type MediaSourcePtsCadenceDurableEpochRuntimeResultV3 =
  | MediaSourcePtsCadenceDurableEpochWorkerResultV3
  | Readonly<{
      kind: 'runtime_unavailable';
      reason:
        | 'SCAN_TRANSPORT_NOT_CONFIGURED'
        | 'PRIVATE_STORAGE_NOT_CONFIGURED'
        | 'MEDIA_ASSET_OWNER_UNAVAILABLE';
    }>;

type PrivateRuntimeV3 = ReturnType<
  typeof createMediaSourcePtsCadenceR2RuntimePortsV1
>;
type FullPublisherV3 = typeof publishMediaSourcePtsCadenceScanV3;

export type MediaSourcePtsCadenceDurableEpochRuntimeDependenciesV3 = Readonly<{
  environment?: MediaSourcePtsCadenceDurableEpochRuntimeEnvironmentV3;
  jobStore?: Parameters<
    typeof runMediaSourcePtsCadenceDurableEpochWorkerV3
  >[0]['jobStore'];
  transportConfigured?: (
    environment: MediaSourcePtsCadenceDurableEpochRuntimeEnvironmentV3,
  ) => boolean;
  createPrivateRuntime?: (
    environment: MediaSourcePtsCadenceDurableEpochRuntimeEnvironmentV3,
  ) => PrivateRuntimeV3;
  createAssetStorePorts?: () =>
    Promise<MediaSourcePtsCadenceMapAssetStorePortsV3>;
  resolveVerifiedSourceUrl?: typeof resolveVerifiedMediaSourceUrlV1;
  submitScan?: MediaSourcePtsCadenceDurableEpochWorkerPortsV3['submitScan'];
  pollScan?: MediaSourcePtsCadenceDurableEpochWorkerPortsV3['pollScan'];
  publishScan?: FullPublisherV3;
  boundarySemanticVerifier?: MediaSourcePtsCadenceBoundarySemanticVerifierV3;
  clock?: () => Date;
  retryDelayMs?: number;
  pollDelayMs?: number;
}>;

/**
 * Composes every V3 external owner before a durable claim. It deliberately
 * exposes no route and does not create jobs, projects or retry authority.
 */
export async function runMediaSourcePtsCadenceDurableEpochRuntimeV3(
  input: Readonly<{ jobId: string; workerId: string }>,
  dependencies: MediaSourcePtsCadenceDurableEpochRuntimeDependenciesV3 = {},
): Promise<MediaSourcePtsCadenceDurableEpochRuntimeResultV3> {
  const environment = dependencies.environment ?? process.env;
  const transportConfigured = dependencies.transportConfigured
    ?? isMediaSourcePtsCadenceEpochScanTransportConfiguredV3;
  if (!transportConfigured(environment)) {
    return {
      kind: 'runtime_unavailable',
      reason: 'SCAN_TRANSPORT_NOT_CONFIGURED',
    };
  }

  let privateRuntime: PrivateRuntimeV3;
  try {
    privateRuntime = (dependencies.createPrivateRuntime
      ?? createMediaSourcePtsCadenceR2RuntimePortsV1)(environment);
  } catch {
    return {
      kind: 'runtime_unavailable',
      reason: 'PRIVATE_STORAGE_NOT_CONFIGURED',
    };
  }

  let assetStorePorts: MediaSourcePtsCadenceMapAssetStorePortsV3;
  try {
    assetStorePorts = await (dependencies.createAssetStorePorts
      ?? createMediaSourcePtsCadenceMapAssetMongoPortsV3)();
  } catch {
    return {
      kind: 'runtime_unavailable',
      reason: 'MEDIA_ASSET_OWNER_UNAVAILABLE',
    };
  }

  const workerPorts = createMediaSourcePtsCadenceDurableEpochRuntimeWorkerPortsV3({
    assetStorePorts,
    privateRuntime,
    resolveVerifiedSourceUrl: dependencies.resolveVerifiedSourceUrl
      ?? resolveVerifiedMediaSourceUrlV1,
    submitScan: dependencies.submitScan
      ?? ((submission) => submitMediaSourcePtsCadenceEpochScanV3(
        submission,
        { environment },
      )),
    pollScan: dependencies.pollScan
      ?? ((job) => pollMediaSourcePtsCadenceEpochScanV3(
        job,
        { environment },
      )),
    publishScan: dependencies.publishScan
      ?? publishMediaSourcePtsCadenceScanV3,
    boundarySemanticVerifier: dependencies.boundarySemanticVerifier
      ?? noExternalBoundarySemanticVerifierV3(),
  });

  return runMediaSourcePtsCadenceDurableEpochWorkerV3({
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

export function createMediaSourcePtsCadenceDurableEpochRuntimeWorkerPortsV3(
  input: Readonly<{
    assetStorePorts: MediaSourcePtsCadenceMapAssetStorePortsV3;
    privateRuntime: PrivateRuntimeV3;
    resolveVerifiedSourceUrl: typeof resolveVerifiedMediaSourceUrlV1;
    submitScan: MediaSourcePtsCadenceDurableEpochWorkerPortsV3['submitScan'];
    pollScan: MediaSourcePtsCadenceDurableEpochWorkerPortsV3['pollScan'];
    publishScan: FullPublisherV3;
    boundarySemanticVerifier: MediaSourcePtsCadenceBoundarySemanticVerifierV3;
  }>,
): MediaSourcePtsCadenceDurableEpochWorkerPortsV3 {
  return {
    loadCurrentSource: async ({ assetId, userId }) => {
      const asset = await input.assetStorePorts.load(assetId, userId);
      if (!asset) return null;
      return {
        sourceVersion: assertMediaSourceVersionV1(asset.sourceVersionV1),
        qualification: qualificationRecord(asset.sourceQualificationV1),
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
    publishScan: async ({ claimExpiresAt, ...publicationInput }) => {
      if (!Number.isFinite(claimExpiresAt.getTime())
        || claimExpiresAt.getTime() <= publicationInput.now().getTime()) {
        return {
          disposition: 'REJECTED',
          reason: 'CLAIM_EXPIRY_INVALID',
        };
      }
      return adaptPublisherResult(await input.publishScan({
        ...publicationInput,
        stagingReader: input.privateRuntime.stagingReader,
        descriptorPort: input.privateRuntime.descriptorPort,
        artifactPort: input.privateRuntime.artifactPort,
        epochIndexWriter: input.privateRuntime.epochIndexWriter,
        epochArtifactReader: input.privateRuntime.epochArtifactReader,
        boundarySemanticVerifier: input.boundarySemanticVerifier,
        stateOwner: {
          load: input.assetStorePorts.load,
          persist: (persistInput) =>
            persistMediaSourcePtsCadenceMapAssetStateV3(
              persistInput,
              input.assetStorePorts,
            ),
        },
      }));
    },
  };
}

function adaptPublisherResult(
  result: MediaSourcePtsCadenceScanPublicationResultV3,
): MediaSourcePtsCadenceDurableEpochPublisherResultV3 {
  switch (result.disposition) {
    case 'COMPLETED':
    case 'ALREADY_COMPLETE': {
      const terminalReceiptSha256 = result.state.sourcePtsCadenceMapV3
        .terminalReceipt?.terminalReceiptSha256;
      return terminalReceiptSha256
        ? { disposition: result.disposition, terminalReceiptSha256 }
        : { disposition: 'REJECTED', reason: 'TERMINAL_RECEIPT_MISSING' };
    }
    case 'UNVERIFIABLE':
      return {
        disposition: 'UNVERIFIABLE',
        diagnostic: result.diagnostic,
        terminalReceiptSha256: result.state?.sourcePtsCadenceMapV3
          .terminalReceipt?.terminalReceiptSha256 ?? null,
      };
    case 'RETRYABLE':
      return { disposition: 'RETRYABLE', reason: result.reason };
    case 'BUSY':
      return { disposition: 'BUSY', activeClaimId: result.activeClaimId };
    case 'REJECTED':
      return { disposition: 'REJECTED', reason: result.reason };
  }
}

function noExternalBoundarySemanticVerifierV3(
): MediaSourcePtsCadenceBoundarySemanticVerifierV3 {
  return Object.freeze({
    verify: async () => ({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'EXTERNAL_BOUNDARY_SEMANTIC_VERIFIER_NOT_CONFIGURED',
    }),
  });
}

/** The worker immediately rebuilds and validates this record against the job. */
function qualificationRecord(value: unknown): MediaSourceQualificationRecordV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_SOURCE_PTS_EPOCH_RUNTIME_QUALIFICATION_INVALID');
  }
  return value as MediaSourceQualificationRecordV1;
}
