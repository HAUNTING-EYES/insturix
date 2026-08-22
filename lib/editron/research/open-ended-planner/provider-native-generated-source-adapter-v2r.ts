import {
  runGeneratedCompositionSourceProviderCallV1,
  type GeneratedCompositionDirectBenchmarkRouteV1,
  type GeneratedCompositionProviderCallV1,
} from './generated-composition-model-benchmark-v1';
import type { ProviderNativeCohortRouteV2R }
  from './provider-native-cohort-manifest-v2r';
import type { HashedStagePacketV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;

export interface ProviderNativeGeneratedSourceResultV2R {
  source: string;
  modelId: string;
  promptHash: string;
  generationReceipt: Readonly<JsonRecord>;
}

/**
 * Shared transport seam only. Creative authorization and source verification
 * remain with the task owner; this adapter cannot read or mutate a project.
 */
export async function generateProviderNativeSourceFromPacketV2R(input: {
  routeEntry: Readonly<ProviderNativeCohortRouteV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  artifact: Readonly<HashedStagePacketV2>;
  runProviderCall?: typeof runGeneratedCompositionSourceProviderCallV1;
}): Promise<Readonly<ProviderNativeGeneratedSourceResultV2R>> {
  const route = directRoute(input.routeEntry);
  const apiKey = requiredKey(input.environment, input.routeEntry.route.provider);
  const call = await (input.runProviderCall ?? runGeneratedCompositionSourceProviderCallV1)({
    artifact: input.artifact,
    route,
    apiKey,
  });
  const accepted = [...call.run.attempts].reverse()
    .find(({ disposition }) => disposition === 'ARTIFACT_ACCEPTED');
  const source = call.run.artifact?.source;
  if (call.run.disposition !== 'ARTIFACT_ACCEPTED'
    || typeof source !== 'string' || !source.trim()) {
    throw new Error(`PROVIDER_NATIVE_GENERATED_SOURCE_${call.run.disposition}`);
  }
  if (!accepted?.promptHash || !isSha(accepted.promptHash)) {
    throw new Error('PROVIDER_NATIVE_GENERATED_SOURCE_PROMPT_HASH_MISSING');
  }
  return {
    source,
    modelId: accepted.providerModel ?? route.claimedBenchmarkIdentity,
    promptHash: accepted.promptHash,
    generationReceipt: generationReceiptMaterial(input.artifact.packetHash, call),
  };
}

function directRoute(
  entry: Readonly<ProviderNativeCohortRouteV2R>,
): GeneratedCompositionDirectBenchmarkRouteV1 {
  return {
    routeId: entry.route.routeId,
    executionAdapter: 'DIRECT_PROVIDER',
    provider: entry.route.provider,
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
  if (!normalized) throw new Error(`PROVIDER_NATIVE_GENERATED_SOURCE_KEY_MISSING:${provider}`);
  return normalized;
}

function isSha(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
