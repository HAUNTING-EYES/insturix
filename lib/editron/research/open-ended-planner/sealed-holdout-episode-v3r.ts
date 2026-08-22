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
  assertBudgetedSealedHoldoutEpisodeReceiptFromManifestV2R,
  buildSealedHoldoutEpisodeContextFromManifestV2R,
  runBudgetedSealedHoldoutEpisodeFromManifestV2R,
  SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
  type BudgetedSealedHoldoutEpisodeReceiptFromManifestV2R,
} from './sealed-holdout-episode-v2r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import { SealedHoldoutH04OwnerStateV3R }
  from './sealed-holdout-h04-owner-state-v3r';
import { SealedHoldoutOwnerSessionV2R }
  from './sealed-holdout-owner-session-v2r';
import type {
  SealedHoldoutInputTokenBoundV2R,
  SealedHoldoutRuntimeAuthorizationV2R,
} from './sealed-holdout-runtime-budget-v2r';

export const SEALED_HOLDOUT_EPISODE_VERSION_V3R =
  'EDITRON_OE_SEALED_HOLDOUT_EPISODE_V3R_1' as const;
export const BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_EPISODE_V3R_2_RESOURCE_BOUND_1' as const;

export type BudgetedSealedHoldoutEpisodeReceiptV3R2 = Readonly<
  Omit<BudgetedSealedHoldoutEpisodeReceiptFromManifestV2R, 'version'> & {
    version: typeof BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V3R2;
  }
>;

const V3_EPISODE_INSTRUCTIONS = [
  'All forty planning records are represented: callable operations are tools; unavailable records are context-only and must never be fabricated as calls.',
  'Use only evidence returned by owner tools; do not infer hidden ranges, handles, fields, or evaluator expectations.',
  'The opaque C1/C2 label carries no semantic meaning. Base every choice on the request and returned tool evidence.',
] as const;

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
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  const taskId = String(record(taskCase?.publicCase).taskId ?? '');
  const isolatedStateOwner = taskId === 'HOLD-04'
    ? new SealedHoldoutH04OwnerStateV3R({
      manifest,
      caseId: requireH04CaseId(input.caseId),
    })
    : undefined;
  const ownerSession = new SealedHoldoutOwnerSessionV2R({
    manifest,
    caseId: input.caseId,
    semanticPolicy: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R,
    manifestValidator: assertSealedHoldoutCohortManifestV3R,
    isolatedStateOwner,
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
    toolSetFactory: buildV3ToolSet,
    additionalInstructions: V3_EPISODE_INSTRUCTIONS,
    invoke: input.invoke,
    executeIsolated: (call) => ownerSession.execute(call),
  });
}

export function assertBudgetedSealedHoldoutEpisodeReceiptV3R2(
  value: unknown,
): Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2> {
  return assertBudgetedSealedHoldoutEpisodeReceiptFromManifestV2R(
    value,
    BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V3R2,
  ) as Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2>;
}

export async function runBudgetedSealedHoldoutEpisodeV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: string;
  route: Readonly<ProviderNativeRouteV2R>;
  authorization: Readonly<SealedHoldoutRuntimeAuthorizationV2R>;
  countInputTokens: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<Readonly<SealedHoldoutInputTokenBoundV2R>>;
  argumentHandoffMode?: ProviderNativeArgumentHandoffModeV2R;
  operatorPresentationOrder?: readonly string[];
  invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
    => Promise<ProviderNativeInvokeResponseV2R>;
}): Promise<Readonly<BudgetedSealedHoldoutEpisodeReceiptV3R2>> {
  const manifest = assertSealedHoldoutCohortManifestV3R2(input.manifest);
  const taskCase = manifest.cases.find(({ caseId }) => caseId === input.caseId);
  const taskId = String(record(taskCase?.publicCase).taskId ?? '');
  const isolatedStateOwner = taskId === 'HOLD-04'
    ? new SealedHoldoutH04OwnerStateV3R({
      manifest,
      caseId: requireH04CaseId(input.caseId),
    })
    : undefined;
  const ownerSession = new SealedHoldoutOwnerSessionV2R({
    manifest,
    caseId: input.caseId,
    semanticPolicy: SEALED_HOLDOUT_OWNER_SEMANTIC_POLICY_V3R,
    manifestValidator: assertSealedHoldoutCohortManifestV3R2,
    isolatedStateOwner,
  });
  const receipt = await runBudgetedSealedHoldoutEpisodeFromManifestV2R({
    manifest,
    manifestValidator: assertSealedHoldoutCohortManifestV3R2,
    caseId: input.caseId,
    episodeVersion: BUDGETED_SEALED_HOLDOUT_EPISODE_VERSION_V3R2,
    route: input.route,
    authorization: input.authorization,
    countInputTokens: input.countInputTokens,
    argumentHandoffMode: input.argumentHandoffMode,
    operatorPresentationOrder: input.operatorPresentationOrder,
    toolSetFactory: buildV3ToolSet,
    additionalInstructions: V3_EPISODE_INSTRUCTIONS,
    invoke: input.invoke,
    executeIsolated: (call) => ownerSession.execute(call),
  });
  return assertBudgetedSealedHoldoutEpisodeReceiptV3R2(receipt);
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
function requireH04CaseId(value: string): 'HOLD-04:C1' | 'HOLD-04:C2' {
  if (value !== 'HOLD-04:C1' && value !== 'HOLD-04:C2') {
    throw new Error('SEALED_HOLDOUT_V3_H04_CASE_BINDING_INVALID');
  }
  return value;
}

function buildV3ToolSet(input: Readonly<{
  eligibleOperatorIds: readonly string[];
  finishInputSchema?: Readonly<JsonRecord>;
}>) {
  const catalogIdentity = sealedHoldoutOperatorCatalogIdentityV3R();
  return buildProviderNativeToolSetFromCatalogV2R({
    ...input,
    catalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V3R,
    catalogIdentity: {
      version: String(catalogIdentity.version),
      catalogSha256: String(catalogIdentity.catalogSha256),
    },
  });
}
