import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildDev02GeneratedCompositionModelPacketV1,
} from './generated-composition-model-candidate-v1';
import {
  runGeneratedCompositionSourceProviderCallV1,
} from './generated-composition-model-benchmark-v1';
import { generateProviderNativeSourceFromPacketV2R }
  from './provider-native-generated-source-adapter-v2r';
import type {
  ProviderNativeDev02GeneratedSourceV2R,
} from './provider-native-dev02-connected-episode-v2r';
import type { ProviderNativeCohortRouteV2R } from './provider-native-cohort-manifest-v2r';

type JsonRecord = Record<string, unknown>;

export async function generateProviderNativeDev02SourceV2R(input: {
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  apiImplementationHash: string;
  request: Readonly<{
    arguments: Readonly<JsonRecord>;
    orchestratorSpecSha256: string;
    candidateOrdinal: 0 | 1;
    repair?: Parameters<typeof buildDev02GeneratedCompositionModelPacketV1>[0]['repair'];
  }>;
  runProviderCall?: typeof runGeneratedCompositionSourceProviderCallV1;
}): Promise<Readonly<ProviderNativeDev02GeneratedSourceV2R>> {
  if (!isSha(input.apiImplementationHash)) throw new Error('PROVIDER_NATIVE_DEV02_API_HASH_INVALID');
  if (hashCanonicalJsonV1(input.request.arguments) !== input.request.orchestratorSpecSha256) {
    throw new Error('PROVIDER_NATIVE_DEV02_ORCHESTRATOR_SPEC_HASH_DRIFT');
  }
  const artifact = buildDev02GeneratedCompositionModelPacketV1({
    apiImplementationHash: input.apiImplementationHash,
    orchestratorSpec: input.request.arguments,
    ...(input.request.repair ? { repair: input.request.repair } : {}),
  });
  const generated = await generateProviderNativeSourceFromPacketV2R({
    artifact,
    routeEntry: input.routeEntry,
    environment: input.environment,
    ...(input.runProviderCall ? { runProviderCall: input.runProviderCall } : {}),
  });
  return {
    ...generated,
    orchestratorSpecSha256: input.request.orchestratorSpecSha256,
  };
}
function isSha(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
