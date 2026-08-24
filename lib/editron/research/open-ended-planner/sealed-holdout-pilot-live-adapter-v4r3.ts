import { deepFreezeV1, hashCanonicalJsonV1 }
  from './contracts-v1';
import { createProviderNativeRouteLiveTransportV2R }
  from './provider-native-live-transport-v2r';
import { runProviderNativeToolEpisodeV2R }
  from './provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R }
  from './provider-native-tool-codecs-v2r';
import { buildProviderNativeToolSetFromCatalogV2R }
  from './provider-native-tool-catalog-v2r';
import {
  SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3,
  buildSealedHoldoutOwnerSemanticPolicyV4R3,
  sealedHoldoutOperatorCatalogIdentityV4R3,
} from './sealed-holdout-catalog-v4r3';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
  buildSealedHoldoutEpisodeContextV2R,
} from './sealed-holdout-episode-v2r';
import {
  assertSealedHoldoutGeneralisationManifestV4R2,
  type SealedHoldoutGeneralisationManifestV4R2,
} from './sealed-holdout-generalisation-cohort-v4r2';
import {
  assertSealedHoldoutGeneralisationManifestV4R3,
  type SealedHoldoutGeneralisationManifestV4R3,
} from './sealed-holdout-generalisation-cohort-v4r3';
import { SealedHoldoutOwnerSessionV2R }
  from './sealed-holdout-owner-session-v2r';
import type { SealedHoldoutPilotAuthorizedRowV4R3 }
  from './sealed-holdout-pilot-authorization-v4r3';
import type {
  SealedHoldoutPilotExecutionPortV4R3,
  SealedHoldoutPilotPortResultV4R3,
} from './sealed-holdout-pilot-runner-v4r3';
import {
  ProviderNativeRuntimeBudgetControllerV2R,
  bindProviderNativeRuntimeInputTokenBoundV2R,
} from './sealed-holdout-runtime-budget-v2r';
import { findSealedHoldoutRuntimeRouteFactV2R }
  from './sealed-holdout-runtime-route-facts-v2r';
import {
  PILOT_INPUT_TOKEN_BOUND_VERSION_V4R3,
  PILOT_MAX_INPUT_TOKENS_PER_TURN_V4R3,
  SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_PATH_V4R3,
  SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3,
  assertSealedHoldoutPilotNoSecretsV4R3,
  buildSealedHoldoutPilotAccountingV4R3,
  buildSealedHoldoutPilotAttemptIntentV4R3,
  localPilotInputTokenUpperBoundV4R3,
  resolveSealedHoldoutPilotRowV4R3,
  type SealedHoldoutPilotAttemptIntentV4R3,
  type SealedHoldoutPilotLiveAuditOwnerV4R3,
  type SealedHoldoutPilotLiveAuditReceiptV4R3,
} from './sealed-holdout-pilot-live-support-v4r3';

type JsonRecord = Record<string, unknown>;

export { SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_PATH_V4R3,
  SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3 };
export type { SealedHoldoutPilotAttemptIntentV4R3,
  SealedHoldoutPilotLiveAuditOwnerV4R3, SealedHoldoutPilotLiveAuditReceiptV4R3 };

export function createSealedHoldoutPilotLiveExecutionPortV4R3(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  predecessorManifest: Readonly<SealedHoldoutGeneralisationManifestV4R2>;
  environment: Readonly<Record<string, string | undefined>>;
  auditOwner: Readonly<SealedHoldoutPilotLiveAuditOwnerV4R3>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => string;
}>): Readonly<SealedHoldoutPilotExecutionPortV4R3> {
  const baseManifest = assertSealedHoldoutCohortManifestV2R(input.baseManifest);
  const predecessorManifest = assertSealedHoldoutGeneralisationManifestV4R2({
    value: input.predecessorManifest, baseManifest,
  });
  const manifest = assertSealedHoldoutGeneralisationManifestV4R3({
    value: input.manifest, baseManifest, predecessorManifest,
  });
  return deepFreezeV1({
    authority: 'PROVIDER_NATIVE_LIVE_TRANSPORT_RECEIPT_REQUIRED' as const,
    execute: async (executionInput) => executePilotRow({
      ...input, ...executionInput, manifest, baseManifest,
    }),
  });
}

async function executePilotRow(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  environment: Readonly<Record<string, string | undefined>>;
  auditOwner: Readonly<SealedHoldoutPilotLiveAuditOwnerV4R3>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => string;
  row: Readonly<SealedHoldoutPilotAuthorizedRowV4R3>;
  manifestSha256: string;
  authorizationSha256: string;
  maximumProviderAttempts: 1;
  automaticRetry: false;
}>): Promise<Readonly<SealedHoldoutPilotPortResultV4R3>> {
  if (input.manifestSha256 !== input.manifest.manifestSha256
    || input.maximumProviderAttempts !== 1 || input.automaticRetry !== false) {
    fail('EXECUTION_AUTHORITY_DRIFT');
  }
  const { route, caseId, operatorOrder, handoffMode, maximumCandidates } =
    resolveSealedHoldoutPilotRowV4R3({
      manifest: input.manifest, baseManifest: input.baseManifest, row: input.row,
    });
  const context = buildSealedHoldoutEpisodeContextV2R({
    manifest: input.baseManifest, caseId,
  });
  const oneTurnContext = deepFreezeV1({
    ...context,
    episodeId: `${SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3}:${input.row.rowId}`,
    budget: { ...context.budget, maxTurns: 1, maxIdenticalCalls: 1 },
  });
  const routeFact = findSealedHoldoutRuntimeRouteFactV2R(route.routeId)
    ?? fail('ROUTE_PRICE_FACT_MISSING');
  const runtimeGuard = new ProviderNativeRuntimeBudgetControllerV2R({
    guardKind: SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3,
    guardIdentitySha256: hashCanonicalJsonV1({
      manifestSha256: input.manifestSha256,
      authorizationSha256: input.authorizationSha256,
      rowAuthorizationSha256: input.row.rowAuthorizationSha256,
      route,
    }),
    authorizationSha256: input.authorizationSha256,
    inputTokenBoundVersion: PILOT_INPUT_TOKEN_BOUND_VERSION_V4R3,
    limits: {
      maxProviderTurns: 1,
      maxSelectedOperations: 1,
      maxCandidatesPerOperation: maximumCandidates,
      maxCumulativeOutputTokens: oneTurnContext.budget.maxOutputTokensPerTurn,
      maxInputTokensPerTurn: PILOT_MAX_INPUT_TOKENS_PER_TURN_V4R3,
      absoluteMaxSpendNanoUsd: input.row.absoluteMaxRowSpendMicroUsd * 1_000,
    },
    pricing: routeFact.pricing,
    countInputTokens: async (request) => bindProviderNativeRuntimeInputTokenBoundV2R({
      version: PILOT_INPUT_TOKEN_BOUND_VERSION_V4R3,
      request,
      inputTokensUpperBound: localPilotInputTokenUpperBoundV4R3(request),
      method: PILOT_INPUT_TOKEN_BOUND_VERSION_V4R3,
    }),
  });
  const transport = createProviderNativeRouteLiveTransportV2R({
    route, environment: input.environment,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
  });
  let intent: Readonly<SealedHoldoutPilotAttemptIntentV4R3> | null = null;
  const invoke = async (request: Readonly<SerializedProviderNativeTurnV2R>) => {
    if (intent) fail('SECOND_PROVIDER_ATTEMPT_FORBIDDEN');
    intent = buildSealedHoldoutPilotAttemptIntentV4R3({
      row: input.row, manifestSha256: input.manifestSha256,
      authorizationSha256: input.authorizationSha256, request,
      attemptedAt: (input.now ?? (() => new Date().toISOString()))(),
    });
    await input.auditOwner.commitAttemptIntent(intent);
    return transport.invoke(request);
  };
  const owner = new SealedHoldoutOwnerSessionV2R({
    manifest: input.baseManifest, caseId,
    semanticPolicy: buildSealedHoldoutOwnerSemanticPolicyV4R3({
      manifest: input.baseManifest,
    }),
  });
  const providerEpisode = await runProviderNativeToolEpisodeV2R({
    route, context: oneTurnContext, eligibleOperatorIds: operatorOrder,
    argumentHandoffMode: handoffMode,
    finishInputSchema: SEALED_HOLDOUT_FINISH_SCHEMA_V2R,
    toolSetFactory: ({ eligibleOperatorIds, finishInputSchema }) =>
      buildProviderNativeToolSetFromCatalogV2R({
        eligibleOperatorIds, finishInputSchema,
        catalog: SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3,
        catalogIdentity: sealedHoldoutOperatorCatalogIdentityV4R3(),
      }),
    additionalInstructions: [
      'Use only supplied evidence and exact eligible operations; never invent a missing capability.',
      'Use a typed finish disposition when the requested edit is unsupported or unverifiable.',
    ],
    invoke, runtimeGuard,
    executeIsolated: (call) => owner.execute(call),
  });
  const committedIntent = intent as Readonly<SealedHoldoutPilotAttemptIntentV4R3> | null;
  if (!committedIntent) fail('PROVIDER_ATTEMPT_MISSING');
  const transportReceipt = transport.snapshot();
  const call = transportReceipt.calls[0];
  if (transportReceipt.calls.length !== 1 || !call || call.attempt !== 1
    || call.requestHash !== committedIntent.requestSha256
    || call.returnedModelIdentity !== input.row.confirmedReturnedModelIdentity) {
    fail('TRANSPORT_RECEIPT_INVALID');
  }
  const accounting = buildSealedHoldoutPilotAccountingV4R3({
    turns: providerEpisode.turns, call,
  });
  const portResult = portResultFor({ input, providerEpisode, transportReceipt,
    call, accounting });
  const receiptMaterial = {
    version: SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3,
    authority: 'RAW_NON_SCORED_PROVIDER_PILOT_NO_PROJECT_OR_MEDIA_AUTHORITY' as const,
    intentSha256: committedIntent.intentSha256,
    portResult,
    providerEpisode: providerEpisode as unknown as Readonly<JsonRecord>,
    transportReceipt: transportReceipt as unknown as Readonly<JsonRecord>,
    accounting,
    projectReads: 0 as const, projectMutations: 0 as const, mediaWrites: 0 as const,
    secretsPersisted: false as const, stateEffects: [] as const,
  };
  assertSealedHoldoutPilotNoSecretsV4R3(receiptMaterial, input.environment);
  const auditReceipt = deepFreezeV1({
    ...receiptMaterial, receiptSha256: hashCanonicalJsonV1(receiptMaterial),
  });
  await input.auditOwner.commitCompletedAttempt(auditReceipt);
  return portResult;
}

function portResultFor(input: Readonly<{
  input: Readonly<{ row: Readonly<SealedHoldoutPilotAuthorizedRowV4R3> }>;
  providerEpisode: Readonly<Awaited<ReturnType<typeof runProviderNativeToolEpisodeV2R>>>;
  transportReceipt: Readonly<{ receiptSha256: string }>;
  call: Readonly<{ responseSha256: string; usage: Readonly<JsonRecord> }>;
  accounting: Readonly<{ accountedCostNanoUsd: number; accountingReceiptSha256: string }>;
}>): Readonly<SealedHoldoutPilotPortResultV4R3> {
  const { row } = input.input;
  return deepFreezeV1({
    rowId: row.rowId, routeId: row.routeId, provider: row.provider,
    requestedModel: row.requestedModel,
    returnedModelIdentity: row.confirmedReturnedModelIdentity,
    rowAuthorizationSha256: row.rowAuthorizationSha256,
    requestSha256: input.providerEpisode.turns[0]?.requestHash as string,
    responseSha256: input.call.responseSha256,
    transportReceiptSha256: input.transportReceipt.receiptSha256,
    providerUsageSha256: hashCanonicalJsonV1(input.call.usage),
    accountedCostNanoUsd: input.accounting.accountedCostNanoUsd,
    accountingBasis: 'PROVIDER_REPORTED_USAGE_X_FROZEN_ROUTE_PRICE' as const,
    accountingReceiptSha256: input.accounting.accountingReceiptSha256,
    episodeReceiptSha256: input.providerEpisode.receiptSha256,
    transcriptSha256: input.providerEpisode.transcriptSha256,
    terminalDisposition: input.providerEpisode.terminal.disposition,
    selectedOperatorIds: input.providerEpisode.selectedOperatorIds,
    providerAttemptCount: 1 as const, inferenceCalls: 1 as const, networkCalls: 1 as const,
    billedMicroUsd: Math.ceil(input.accounting.accountedCostNanoUsd / 1_000),
    projectReads: 0 as const, projectMutations: 0 as const, mediaWrites: 0 as const,
    secretsPersisted: false as const, stateEffects: [] as const,
  });
}

function fail(code: string): never {
  throw new Error(`SEALED_V4R3_PILOT_LIVE_ADAPTER_${code}`);
}
