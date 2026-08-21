import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  buildDev02GeneratedCompositionModelPacketV1,
} from './generated-composition-model-candidate-v1';
import {
  runGeneratedCompositionSourceProviderCallV1,
  type GeneratedCompositionDirectBenchmarkRouteV1,
  type GeneratedCompositionProviderCallV1,
} from './generated-composition-model-benchmark-v1';
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
  const route = directRoute(input.routeEntry);
  const apiKey = requiredKey(input.environment, input.routeEntry.route.provider);
  const call = await (input.runProviderCall ?? runGeneratedCompositionSourceProviderCallV1)({
    artifact, route, apiKey,
  });
  const accepted = [...call.run.attempts].reverse()
    .find(({ disposition }) => disposition === 'ARTIFACT_ACCEPTED');
  const source = call.run.artifact?.source;
  if (call.run.disposition !== 'ARTIFACT_ACCEPTED' || typeof source !== 'string' || !source.trim()) {
    throw new Error(`PROVIDER_NATIVE_DEV02_SOURCE_${call.run.disposition}`);
  }
  if (!accepted?.promptHash || !isSha(accepted.promptHash)) {
    throw new Error('PROVIDER_NATIVE_DEV02_SOURCE_PROMPT_HASH_MISSING');
  }
  const modelId = accepted.providerModel ?? route.claimedBenchmarkIdentity;
  const generationReceipt = generationReceiptMaterial(artifact.packetHash, call);
  return {
    source, modelId, promptHash: accepted.promptHash,
    orchestratorSpecSha256: input.request.orchestratorSpecSha256,
    generationReceipt,
  };
}

function directRoute(
  entry: Readonly<ProviderNativeCohortRouteV2R>,
): GeneratedCompositionDirectBenchmarkRouteV1 {
  return {
    routeId: entry.route.routeId,
    executionAdapter: 'DIRECT_PROVIDER', provider: entry.route.provider,
    requestModel: entry.route.model,
    claimedBenchmarkIdentity: entry.route.claimedModelIdentity,
    reasoningMode: entry.route.reasoningMode,
    billingDisposition: 'METERED_USD',
    pricing: { ...entry.pricing },
  };
}

function generationReceiptMaterial(
  packetHash: string,
  call: Readonly<GeneratedCompositionProviderCallV1>,
): Readonly<JsonRecord> {
  return {
    authority: 'RESEARCH_MODEL_GENERATED_SOURCE_NO_PROJECT_MUTATION',
    packetHash,
    providerRun: call.run,
    preflightCounts: call.preflightCounts,
    stateEffects: [],
  };
}

function requiredKey(
  environment: Readonly<Record<string, string | undefined>>,
  provider: 'openai' | 'google',
): string {
  const value = provider === 'openai'
    ? environment.OPENAI_API_KEY
    : environment.GEMINI_API_KEY ?? environment.GOOGLE_API_KEY;
  const normalized = value?.trim();
  if (!normalized) throw new Error(`PROVIDER_NATIVE_DEV02_SOURCE_KEY_MISSING:${provider}`);
  return normalized;
}
function isSha(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
