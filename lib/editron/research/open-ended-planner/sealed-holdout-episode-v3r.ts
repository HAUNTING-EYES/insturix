import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeReceiptV2R,
  type ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import { buildProviderNativeToolSetFromCatalogV2R }
  from './provider-native-tool-catalog-v2r';
import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
  SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R,
  sealedHoldoutOperatorCatalogIdentityV3R,
} from './sealed-holdout-catalog-v3r';
import {
  assertSealedHoldoutCohortManifestV3R,
  type SealedHoldoutCohortManifestV3R,
} from './sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutEpisodeContextFromManifestV2R,
  SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
} from './sealed-holdout-episode-v2r';
import { SealedHoldoutOwnerSessionV2R }
  from './sealed-holdout-owner-session-v2r';

export const SEALED_HOLDOUT_EPISODE_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_EPISODE_V3R_1' as const;

export async function runSealedHoldoutEpisodeV3R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R>;
  caseId: string;
  route: Readonly<ProviderNativeRouteV2R>;
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
  operatorPresentationOrder?: readonly string[];
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
    => Promise<ProviderNativeInvokeResponseV2R>;
}): Promise<Readonly<ProviderNativeEpisodeReceiptV2R>> {
  const manifest = assertSealedHoldoutCohortManifestV3R(input.manifest);
  const expected = strings(record(manifest.sharedModelContext).callableOperatorIds);
  const operatorOrder = input.operatorPresentationOrder ?? expected;
  if (!sameSet(operatorOrder, expected)) {
    throw new Error('SEALED_HOLDOUT_V3_EPISODE_OPERATOR_SET_DRIFT');
  }
  const catalogIdentity = sealedHoldoutOperatorCatalogIdentityV3R();
  const ownerSession = new SealedHoldoutOwnerSessionV2R({
    manifest,
    caseId: input.caseId,
    semanticPolicy: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R,
    manifestValidator: assertSealedHoldoutCohortManifestV3R,
  });
  return runProviderNativeToolEpisodeV2R({
    route: input.route,
    context: buildSealedHoldoutEpisodeContextFromManifestV2R({
      manifest,
      caseId: input.caseId,
      episodeVersion: SEALED_HOLDOUT_EPISODE_VERSION_V3R,
    }),
    eligibleOperatorIds: operatorOrder,
    argumentHandoffMode: input.argumentHandoffMode,
    finishInputSchema: SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
    toolSetFactory: ({ eligibleOperatorIds, finishInputSchema }) => (
      buildProviderNativeToolSetFromCatalogV2R({
        eligibleOperatorIds,
        finishInputSchema,
        catalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
        catalogIdentity: {
          version: String(catalogIdentity.version),
          catalogSha256: String(catalogIdentity.catalogSha256),
        },
      })
    ),
    additionalInstructions: [
      'All forty planning records are represented: callable operations are tools; unavailable records are context-only and must never be fabricated as calls.',
      'Use only evidence returned by owner tools; do not infer hidden ranges, handles, fields, or evaluator expectations.',
      'The opaque C1/C2 label carries no semantic meaning. Base every choice on the request and returned tool evidence.',
    ],
    invoke: input.invoke,
    executeIsolated: (call) => ownerSession.execute(call),
  });
}

type JsonRecord = Record<string, unknown>;

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
