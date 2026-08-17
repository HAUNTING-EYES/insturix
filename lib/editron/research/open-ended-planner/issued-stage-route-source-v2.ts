import { deepFreezeV1 } from './contracts-v1';
import type { ProviderKindV2 } from './provider-codecs-v2';

interface IssuedStageRouteFactV2 {
  routeId: 'OPENAI_LUNA' | 'OPENAI_TERRA' | 'GOOGLE_FLASH_LITE' | 'GOOGLE_FLASH';
  provider: ProviderKindV2;
  requestModel: string;
  claimedBenchmarkIdentity: string;
  identityStatus: 'PROVIDER_ROUTE_NO_DATED_SNAPSHOT' | 'PROVIDER_STABLE_ROUTE';
  reasoningMode: string;
  supportedArms: readonly string[];
  pricing: {
    inputUsdPerMillion: number;
    cachedInputUsdPerMillion: number | null;
    cacheWriteUsdPerMillion: number | null;
    outputUsdPerMillion: number;
  };
  pricingSource: string;
  modelSource: string;
  counter: {
    method: 'OFFLINE_TEXT_UTF8_BOUND_PLUS_IMAGE_ALLOWANCE' | 'PROVIDER_COUNT_TOKENS';
    networkRequired: boolean;
    endpoint: string | null;
    evidenceStatus: 'CONSERVATIVE_LOCAL_BOUND' | 'OFFICIAL_PROVIDER_ENDPOINT';
  };
  nativeIdentityFields: readonly string[];
}

/**
 * Route provenance for the already-issued 2026-08-14 Stage 2-4 plans.
 *
 * These stages are historical benchmark artifacts, so they must not rebuild
 * themselves from the mutable development roster. A new provider route or
 * model identity requires a new stage plan version instead of rewriting the
 * identity of an issued plan.
 */
const ISSUED_STAGE_ROUTE_SOURCE_V2 = deepFreezeV1({
  planVersion: 'EDITRON_OE_DEVELOPMENT_SMOKE_PREFLIGHT_V2',
  evidenceAsOf: '2026-08-14',
  planHash: 'eff3c660dc98618a4eea6d8f63ebdd426fe3fee2b527d9bc23211aa1807d1c8e',
  routes: [
    {
      routeId: 'OPENAI_LUNA', provider: 'openai', requestModel: 'gpt-5.6-luna',
      claimedBenchmarkIdentity: 'gpt-5.6-luna', identityStatus: 'PROVIDER_ROUTE_NO_DATED_SNAPSHOT',
      reasoningMode: 'medium', supportedArms: ['REFERENCE_IMAGE_SEQUENCE_EVIDENCE'],
      pricing: { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, cacheWriteUsdPerMillion: 1.25, outputUsdPerMillion: 6 },
      pricingSource: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
      modelSource: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
      counter: { method: 'OFFLINE_TEXT_UTF8_BOUND_PLUS_IMAGE_ALLOWANCE', networkRequired: false, endpoint: null, evidenceStatus: 'CONSERVATIVE_LOCAL_BOUND' },
      nativeIdentityFields: ['response.id', 'response.model'],
    },
    {
      routeId: 'OPENAI_TERRA', provider: 'openai', requestModel: 'gpt-5.6-terra',
      claimedBenchmarkIdentity: 'gpt-5.6-terra', identityStatus: 'PROVIDER_ROUTE_NO_DATED_SNAPSHOT',
      reasoningMode: 'medium', supportedArms: ['REFERENCE_IMAGE_SEQUENCE_EVIDENCE'],
      pricing: { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, cacheWriteUsdPerMillion: 3.125, outputUsdPerMillion: 15 },
      pricingSource: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
      modelSource: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
      counter: { method: 'OFFLINE_TEXT_UTF8_BOUND_PLUS_IMAGE_ALLOWANCE', networkRequired: false, endpoint: null, evidenceStatus: 'CONSERVATIVE_LOCAL_BOUND' },
      nativeIdentityFields: ['response.id', 'response.model'],
    },
    {
      routeId: 'GOOGLE_FLASH_LITE', provider: 'google', requestModel: 'gemini-3.5-flash-lite',
      claimedBenchmarkIdentity: 'gemini-3.5-flash-lite', identityStatus: 'PROVIDER_STABLE_ROUTE',
      reasoningMode: 'minimal', supportedArms: ['REFERENCE_IMAGE_SEQUENCE_EVIDENCE', 'REFERENCE_NATIVE_VIDEO_EVIDENCE'],
      pricing: { inputUsdPerMillion: 0.3, cachedInputUsdPerMillion: null, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 2.5 },
      pricingSource: 'https://ai.google.dev/gemini-api/docs/latest-model',
      modelSource: 'https://ai.google.dev/gemini-api/docs/latest-model',
      counter: { method: 'PROVIDER_COUNT_TOKENS', networkRequired: true, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:countTokens', evidenceStatus: 'OFFICIAL_PROVIDER_ENDPOINT' },
      nativeIdentityFields: ['response.responseId', 'response.modelVersion'],
    },
    {
      routeId: 'GOOGLE_FLASH', provider: 'google', requestModel: 'gemini-3.6-flash',
      claimedBenchmarkIdentity: 'gemini-3.6-flash', identityStatus: 'PROVIDER_STABLE_ROUTE',
      reasoningMode: 'medium', supportedArms: ['REFERENCE_IMAGE_SEQUENCE_EVIDENCE', 'REFERENCE_NATIVE_VIDEO_EVIDENCE'],
      pricing: { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 3.75 },
      pricingSource: 'https://ai.google.dev/gemini-api/docs/pricing',
      modelSource: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash',
      counter: { method: 'PROVIDER_COUNT_TOKENS', networkRequired: true, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:countTokens', evidenceStatus: 'OFFICIAL_PROVIDER_ENDPOINT' },
      nativeIdentityFields: ['response.responseId', 'response.modelVersion'],
    },
  ] satisfies readonly IssuedStageRouteFactV2[],
});

export function getIssuedStageRouteSourceV2(): typeof ISSUED_STAGE_ROUTE_SOURCE_V2 {
  return ISSUED_STAGE_ROUTE_SOURCE_V2;
}
