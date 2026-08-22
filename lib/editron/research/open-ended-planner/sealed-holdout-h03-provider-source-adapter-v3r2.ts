import { hashCanonicalJsonV1 } from './contracts-v1';
import { runGeneratedCompositionSourceProviderCallV1 }
  from './generated-composition-model-benchmark-v1';
import type { ProviderNativeCohortRouteV2R }
  from './provider-native-cohort-manifest-v2r';
import { generateProviderNativeSourceFromPacketV2R }
  from './provider-native-generated-source-adapter-v2r';
import type { SealedH03SourceGeneratorV3R2 }
  from './sealed-holdout-h03-source-executor-v3r2';

type JsonRecord = Record<string, unknown>;
type H03SourceRequest = Parameters<SealedH03SourceGeneratorV3R2>[0];

/**
 * Metered H03 source adapter. The sealed owner has already authorized the
 * operation; this seam only dispatches the exact hash-bound packet and returns
 * untrusted source to the existing verifier.
 */
export async function generateSealedH03ProviderSourceV3R2(input: {
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  request: Readonly<H03SourceRequest>;
  runProviderCall?: typeof runGeneratedCompositionSourceProviderCallV1;
}) {
  assertRequestBinding(input.routeEntry, input.request);
  const generated = await generateProviderNativeSourceFromPacketV2R({
    routeEntry: input.routeEntry,
    environment: input.environment,
    artifact: input.request.packet,
    ...(input.runProviderCall ? { runProviderCall: input.runProviderCall } : {}),
  });
  return {
    ...generated,
    orchestratorSpecSha256: input.request.orchestratorSpecSha256,
  };
}

function assertRequestBinding(
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>,
  request: Readonly<H03SourceRequest>,
): void {
  if (hashCanonicalJsonV1(routeEntry.route) !== hashCanonicalJsonV1(request.route)) {
    throw new Error('SEALED_H03_PROVIDER_SOURCE_ROUTE_DRIFT');
  }
  if (hashCanonicalJsonV1(request.arguments) !== request.orchestratorSpecSha256) {
    throw new Error('SEALED_H03_PROVIDER_SOURCE_ORCHESTRATOR_HASH_DRIFT');
  }
  const packet = request.packet.packet;
  const modelInput = record(packet.modelInput);
  const operation = record(modelInput.orchestratorOperationRequest);
  const packetRepair = record(modelInput.repair);
  const hasPacketRepair = Object.keys(packetRepair).length > 0;
  if (request.packet.packetHash !== hashCanonicalJsonV1(packet)
    || packet.taskId !== 'HOLD-03'
    || operation.argumentsSha256 !== request.orchestratorSpecSha256
    || hashCanonicalJsonV1(record(operation.arguments))
      !== request.orchestratorSpecSha256
    || hasPacketRepair !== Boolean(request.repair)
    || (request.repair
      && hashCanonicalJsonV1(packetRepair) !== hashCanonicalJsonV1(request.repair))
    || request.candidateOrdinal !== (request.repair ? 1 : 0)) {
    throw new Error('SEALED_H03_PROVIDER_SOURCE_PACKET_DRIFT');
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
