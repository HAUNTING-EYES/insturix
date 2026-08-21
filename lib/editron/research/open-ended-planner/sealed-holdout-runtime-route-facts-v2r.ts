import { deepFreezeV1 } from './contracts-v1';
import type { ProviderNativeRouteV2R }
  from './provider-native-tool-codecs-v2r';
import type { SealedHoldoutRuntimePricingV2R }
  from './sealed-holdout-runtime-budget-v2r';

export const SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R =
  'EDITRON_OE_PROVIDER_PRICE_SNAPSHOT_2026_08_22_V1' as const;

export type SealedHoldoutCounterActionV2R = 'LOCAL_OPENAI_O200K_ESTIMATE'
  | 'GOOGLE_COUNT_TOKENS_CONTEXT_EGRESS';

export interface SealedHoldoutRuntimeRouteFactV2R {
  routeId: ProviderNativeRouteV2R['routeId'];
  provider: ProviderNativeRouteV2R['provider'];
  model: string;
  claimedModelIdentity: string;
  pricing: Readonly<SealedHoldoutRuntimePricingV2R>;
  pricingSource: string;
  verifiedAt: '2026-08-22';
  validThrough: string | null;
  counterAction: SealedHoldoutCounterActionV2R;
}

const ROUTE_FACTS: readonly Readonly<SealedHoldoutRuntimeRouteFactV2R>[] =
  deepFreezeV1([
    routeFact('OPENAI_LUNA', 'openai', 'gpt-5.6-luna', {
      normalInputNanoUsdPerToken: 200,
      cachedInputNanoUsdPerToken: 20,
      cacheWriteNanoUsdPerToken: 250,
      outputNanoUsdPerToken: 1_200,
    }, 'https://developers.openai.com/api/docs/models/gpt-5.6-luna', null),
    routeFact('OPENAI_TERRA', 'openai', 'gpt-5.6-terra', {
      normalInputNanoUsdPerToken: 2_000,
      cachedInputNanoUsdPerToken: 200,
      cacheWriteNanoUsdPerToken: 2_500,
      outputNanoUsdPerToken: 12_000,
    }, 'https://developers.openai.com/api/docs/models/gpt-5.6-terra', null),
    routeFact('GOOGLE_FLASH', 'google', 'gemini-3.7-flash', {
      normalInputNanoUsdPerToken: 750,
      cachedInputNanoUsdPerToken: 75,
      // Interactions reports no cache-write token class. Equal-to-input is the
      // conservative reservation rate if a future response starts reporting it.
      cacheWriteNanoUsdPerToken: 750,
      outputNanoUsdPerToken: 3_750,
    }, 'https://ai.google.dev/gemini-api/docs/pricing', '2026-12-31T23:59:59.999Z'),
  ]);

export function findSealedHoldoutRuntimeRouteFactV2R(
  routeId: ProviderNativeRouteV2R['routeId'],
): Readonly<SealedHoldoutRuntimeRouteFactV2R> | null {
  return ROUTE_FACTS.find((fact) => fact.routeId === routeId) ?? null;
}

function routeFact(
  routeId: SealedHoldoutRuntimeRouteFactV2R['routeId'],
  provider: SealedHoldoutRuntimeRouteFactV2R['provider'],
  model: string,
  pricing: Readonly<SealedHoldoutRuntimePricingV2R>,
  pricingSource: string,
  validThrough: string | null,
): SealedHoldoutRuntimeRouteFactV2R {
  return {
    routeId, provider, model, claimedModelIdentity: model, pricing,
    pricingSource, verifiedAt: '2026-08-22', validThrough,
    counterAction: provider === 'openai'
      ? 'LOCAL_OPENAI_O200K_ESTIMATE'
      : 'GOOGLE_COUNT_TOKENS_CONTEXT_EGRESS',
  };
}
