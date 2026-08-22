import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE } from './per-attempt-budget-v2r';
import type { ProviderRouteV2 } from './provider-codecs-v2';
import type { ProviderPricingV2 } from './provider-transport-v2';
import { buildSealedHoldoutBenchmarkRoutesV2R } from './sealed-holdout-credential-preflight-v2r';
import { findSealedHoldoutRuntimeRouteFactV2R } from './sealed-holdout-runtime-route-facts-v2r';
import {
  buildStage25RouteAblationProviderManifestV1 as buildRouteAblationBaseManifestV1,
  type Stage25RouteAblationArmV1,
  type Stage25RouteAblationScopeIdV1,
} from './stage25-route-ablation-v1';

export const STAGE25_ROUTE_ABLATION_PROVIDER_MANIFEST_VERSION_V1 =
  'EDITRON_OE_STAGE25_ROUTE_ABLATION_PROVIDER_MANIFEST_V1_1' as const;
export const STAGE25_ROUTE_ABLATION_BASE_MANIFEST_SHA256_V1 =
  'b051144719b835bdc15030e18c8c7057ba0e58c6dc1f1272f7cee3e53e935619' as const;

export interface Stage25RouteAblationProviderRouteV1 {
  routeId: 'OPENAI_LUNA' | 'OPENAI_TERRA' | 'GOOGLE_FLASH';
  kind: 'openai' | 'google';
  model: string;
  modelSnapshot: string;
  reasoningMode: 'medium';
  pricing: Readonly<ProviderPricingV2>;
  pricingSource: string;
  pricingVerifiedAt: string;
  pricingValidThrough: string | null;
}

export interface Stage25RouteAblationProviderRowV1 {
  rowId: string;
  scopeId: Stage25RouteAblationScopeIdV1;
  arm: Stage25RouteAblationArmV1;
  routeId: Stage25RouteAblationProviderRouteV1['routeId'];
  packetHash: string;
  transportHash: string;
  maximumAttempts: typeof V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE;
  absoluteMaxSpendUsd: number;
}

export interface Stage25RouteAblationProviderManifestV1 {
  version: typeof STAGE25_ROUTE_ABLATION_PROVIDER_MANIFEST_VERSION_V1;
  authority: 'RESEARCH_PROVIDER_COHORT_IDENTITY_NO_DISPATCH_NO_PROJECT_AUTHORITY';
  baseManifestSha256: typeof STAGE25_ROUTE_ABLATION_BASE_MANIFEST_SHA256_V1;
  routeRoster: readonly Readonly<Stage25RouteAblationProviderRouteV1>[];
  routeRosterSha256: string;
  rows: readonly Readonly<Stage25RouteAblationProviderRowV1>[];
  absoluteMaxSpendUsd: number;
  manifestSha256: string;
}

export function buildStage25RouteAblationProviderManifestV1():
Readonly<Stage25RouteAblationProviderManifestV1> {
  const base = buildRouteAblationBaseManifestV1();
  if (base.manifestSha256 !== STAGE25_ROUTE_ABLATION_BASE_MANIFEST_SHA256_V1) {
    throw new Error('STAGE25_ROUTE_PROVIDER_BASE_MANIFEST_DRIFT');
  }
  const routeRoster = buildSealedHoldoutBenchmarkRoutesV2R().map((route) => {
    const fact = findSealedHoldoutRuntimeRouteFactV2R(route.routeId);
    if (!fact || fact.provider !== route.provider || fact.model !== route.model
      || fact.claimedModelIdentity !== route.claimedModelIdentity
      || route.reasoningMode !== 'medium') {
      throw new Error(`STAGE25_ROUTE_PROVIDER_ROUTE_FACT_DRIFT:${route.routeId}`);
    }
    return deepFreezeV1({
      routeId: route.routeId,
      kind: route.provider,
      model: route.model,
      modelSnapshot: route.claimedModelIdentity,
      reasoningMode: route.reasoningMode,
      pricing: {
        inputUsdPerMillion: fact.pricing.normalInputNanoUsdPerToken / 1_000,
        cachedInputUsdPerMillion: fact.pricing.cachedInputNanoUsdPerToken / 1_000,
        cacheWriteUsdPerMillion: fact.pricing.cacheWriteNanoUsdPerToken / 1_000,
        outputUsdPerMillion: fact.pricing.outputNanoUsdPerToken / 1_000,
      },
      pricingSource: fact.pricingSource,
      pricingVerifiedAt: fact.verifiedAt,
      pricingValidThrough: fact.validThrough,
    } satisfies Stage25RouteAblationProviderRouteV1);
  });
  const rows = base.rows.flatMap((baseRow) => routeRoster.map((route) => ({
    rowId: `${baseRow.scopeId}:${baseRow.arm}:${route.routeId}`,
    scopeId: baseRow.scopeId,
    arm: baseRow.arm,
    routeId: route.routeId,
    packetHash: baseRow.artifact.packetHash,
    transportHash: baseRow.artifact.transportHash,
    maximumAttempts: V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE,
    absoluteMaxSpendUsd: baseRow.artifact.packet.stageBudget.maxProviderCostUsd
      * V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE,
  } satisfies Stage25RouteAblationProviderRowV1)));
  if (rows.length !== 24 || new Set(rows.map(({ rowId }) => rowId)).size !== 24) {
    throw new Error('STAGE25_ROUTE_PROVIDER_ROW_SET_INVALID');
  }
  const material = {
    version: STAGE25_ROUTE_ABLATION_PROVIDER_MANIFEST_VERSION_V1,
    authority: 'RESEARCH_PROVIDER_COHORT_IDENTITY_NO_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    baseManifestSha256: STAGE25_ROUTE_ABLATION_BASE_MANIFEST_SHA256_V1,
    routeRoster,
    routeRosterSha256: hashCanonicalJsonV1(routeRoster),
    rows,
    absoluteMaxSpendUsd: roundUsd(rows.reduce((sum, row) => sum + row.absoluteMaxSpendUsd, 0)),
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertStage25RouteAblationProviderManifestV1(value: unknown):
Readonly<Stage25RouteAblationProviderManifestV1> {
  const expected = buildStage25RouteAblationProviderManifestV1();
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(expected)) {
    throw new Error('STAGE25_ROUTE_PROVIDER_MANIFEST_INVALID');
  }
  return expected;
}

export function stage25RouteAblationProviderRouteV1(
  route: Readonly<Stage25RouteAblationProviderRouteV1>,
  apiKey: string,
): ProviderRouteV2 {
  return {
    kind: route.kind, apiKey, model: route.model,
    modelSnapshot: route.modelSnapshot, reasoningMode: route.reasoningMode,
  };
}

function roundUsd(value: number): number { return Math.round(value * 1e9) / 1e9; }
