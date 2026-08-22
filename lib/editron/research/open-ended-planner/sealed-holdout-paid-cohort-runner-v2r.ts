import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { HoldoutMediaManifestV2R }
  from './holdout-media-materializer-v2r';
import {
  createProviderNativeLiveTransportV2R,
  resolveProviderNativeCredentialsV2R,
} from './provider-native-live-transport-v2r';
import type {
  ProviderNativeInvokeResponseV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertSealedHoldoutPaidDispatchAuthorizationV2R,
  type SealedHoldoutPaidDispatchAuthorizationV2R,
} from './sealed-holdout-paid-dispatch-authorization-v2r';
import {
  buildSealedHoldoutBenchmarkRoutesV2R,
  buildSealedHoldoutPresentationOrderV2R,
  SEALED_HOLDOUT_HANDOFF_ARMS_V2R,
  assertSealedHoldoutCredentialPreflightReceiptV2R,
  type SealedHoldoutCredentialPreflightReceiptV2R,
} from './sealed-holdout-credential-preflight-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  evaluateBudgetedSealedHoldoutTraceV2R,
  evaluateBudgetedSealedHoldoutTraceV3R2,
  type BudgetedSealedHoldoutEvaluationReceiptV2R,
  type BudgetedSealedHoldoutEvaluationReceiptV3R2,
} from './sealed-holdout-evaluator-v2r';
import { runBudgetedSealedHoldoutEpisodeV2R }
  from './sealed-holdout-episode-v2r';
import {
  runBudgetedSealedHoldoutEpisodeV3R2,
} from './sealed-holdout-episode-v3r';
import {
  proveSealedHoldoutPaidOutcomeV2R,
  proveSealedHoldoutPaidOutcomeV3R2,
  type SealedHoldoutPaidProofInputV2R,
  type SealedHoldoutPaidProofInputV3R2,
  type SealedHoldoutPaidProofSummaryV2R,
} from './sealed-holdout-paid-proof-adapter-v2r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import {
  assertSealedHoldoutGeneralisationManifestV4R,
  type SealedHoldoutGeneralisationManifestV4R,
} from './sealed-holdout-generalisation-cohort-v4r';
import {
  assertSealedHoldoutGeneralisationPaidAuthorizationV4R,
  type SealedHoldoutGeneralisationPaidAuthorizationV4R,
} from './sealed-holdout-generalisation-paid-authorization-v4r';
import {
  assertSealedHoldoutGeneralisationPreflightReceiptV4R,
  type SealedHoldoutGeneralisationPreflightReceiptV4R,
  type SealedHoldoutGeneralisationRequestCaptureV4R,
} from './sealed-holdout-generalisation-preflight-v4r';
import {
  SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R,
  buildSealedHoldoutRuntimeAccountingBindingV2R,
  buildSealedHoldoutRuntimeAccountingBindingV3R2,
  type SealedHoldoutRuntimeAccountingApprovalV2R,
} from './sealed-holdout-runtime-route-binding-v2r';
import {
  findSealedHoldoutRuntimeRouteFactV2R,
  SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R,
} from './sealed-holdout-runtime-route-facts-v2r';
import {
  assertBudgetedSealedHoldoutSelectedOperationTraceV2R,
  assertBudgetedSealedHoldoutSelectedOperationTraceV3R2,
  buildBudgetedSealedHoldoutSelectedOperationTraceV2R,
  buildBudgetedSealedHoldoutSelectedOperationTraceV3R2,
} from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
type RowStatus = 'PASS_CLAIM_PROOF' | 'FAIL_HIDDEN_EVALUATION'
  | 'FAIL_CLAIM_PROOF' | 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE'
  | 'NOT_EVALUATED_RESOURCE_GUARD';

interface SealedHoldoutPaidRowPlanV2R {
  rowIndex: number;
  rowId: string;
  captureId: string;
  caseId: string;
  publicCaseSha256: string;
  route: Readonly<ProviderNativeRouteV2R>;
  routeSha256: string;
  handoffMode: ProviderNativeArgumentHandoffModeV2R;
  orderId?: string;
  operatorOrder: readonly string[];
  operatorOrderSha256: string;
  initialRequestSha256: string;
  manifestRowPlanSha256?: string;
  rowPlanSha256: string;
}

const SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_PAID_COHORT_RUNNER_V2R_1' as const;
export const SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V4R =
  'EDITRON_OE_STAGE25_GENERALISATION_PAID_COHORT_RUNNER_V4R_1' as const;

type PaidAuthorizationV2R = Readonly<SealedHoldoutPaidDispatchAuthorizationV2R
  | SealedHoldoutGeneralisationPaidAuthorizationV4R>;
type PaidEvaluationV2R = Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R
  | BudgetedSealedHoldoutEvaluationReceiptV3R2>;

interface SealedHoldoutPaidCohortVariantV2R {
  version: typeof SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R
    | typeof SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V4R;
  rowCount: 45 | 96;
  manifestSha256: string;
  cap2CurrentTruthManifestSha256: string;
  preflightReceiptSha256: string;
  requestCaptureSetSha256: string;
  rows: readonly Readonly<SealedHoldoutPaidRowPlanV2R>[];
  authorization: PaidAuthorizationV2R;
  assertAuthorization: (now: string) => void;
  buildRouteBinding: (input: Readonly<{
    rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
    rowSpendMicroUsd: number;
    googleApiKey: string;
    fetchImpl: typeof fetch;
    now: string;
  }>) => ReturnType<typeof buildSealedHoldoutRuntimeAccountingBindingV2R>;
  execute: (input: Readonly<{
    rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
    routeBinding: ReturnType<typeof buildSealedHoldoutRuntimeAccountingBindingV2R>;
    invoke: (request: Readonly<SerializedProviderNativeTurnV2R>)
      => Promise<ProviderNativeInvokeResponseV2R>;
    mediaManifest: Readonly<HoldoutMediaManifestV2R>;
    proofRoot: string;
  }>) => Promise<Readonly<{
    episode: Readonly<JsonRecord>;
    trace: Readonly<JsonRecord>;
    evaluation: PaidEvaluationV2R;
    proof: Readonly<JsonRecord>;
  }>>;
  validatePersistedEvaluation: (
    row: Readonly<JsonRecord>,
    expected: Readonly<SealedHoldoutPaidRowPlanV2R>,
  ) => void;
}

interface SealedHoldoutPaidCohortRunnerDependenciesV2R {
  fetchImpl?: typeof fetch;
  transportFactory?: typeof createProviderNativeLiveTransportV2R;
  proofExecutor?: (
    input: Readonly<SealedHoldoutPaidProofInputV2R>,
  ) => Promise<Readonly<SealedHoldoutPaidProofSummaryV2R>>;
  now?: () => string;
  uniqueId?: () => string;
}

interface SealedHoldoutPaidCohortRunInputV2R {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  credentialPreflight: Readonly<SealedHoldoutCredentialPreflightReceiptV2R>;
  paidAuthorization: Readonly<SealedHoldoutPaidDispatchAuthorizationV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputRoot: string;
  implementationCommitSha: string;
  runnerSourceSha256: string;
  environment: Readonly<Record<string, string | undefined>>;
  dependencies?: Readonly<SealedHoldoutPaidCohortRunnerDependenciesV2R>;
}

interface SealedHoldoutPaidCohortRunnerDependenciesV4R
extends Omit<SealedHoldoutPaidCohortRunnerDependenciesV2R, 'proofExecutor'> {
  proofExecutor?: (
    input: Readonly<SealedHoldoutPaidProofInputV3R2>,
  ) => Promise<Readonly<SealedHoldoutPaidProofSummaryV2R>>;
}

export interface SealedHoldoutPaidCohortRunInputV4R {
  generalisationManifest: Readonly<SealedHoldoutGeneralisationManifestV4R>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  credentialPreflight: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>;
  requestCaptures: readonly Readonly<SealedHoldoutGeneralisationRequestCaptureV4R>[];
  paidAuthorization: Readonly<SealedHoldoutGeneralisationPaidAuthorizationV4R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputRoot: string;
  implementationCommitSha: string;
  runnerSourceSha256: string;
  environment: Readonly<Record<string, string | undefined>>;
  dependencies?: Readonly<SealedHoldoutPaidCohortRunnerDependenciesV4R>;
}

interface SealedHoldoutPaidCohortReceiptV2R {
  version: typeof SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R;
  authority: 'RESEARCH_PROVIDER_COHORT_NO_PROJECT_AUTHORITY';
  runContractSha256: string;
  authorizationSha256: string;
  rowCount: 96;
  rowSummaries: readonly Readonly<JsonRecord>[];
  statusCounts: Readonly<Record<RowStatus, number>>;
  providerInferenceCalls: number;
  googleCountTokensCalls: number;
  providerTurns: number;
  spentNanoUsd: number;
  projectReads: 0;
  projectMutations: 0;
  stateEffects: readonly [];
  assessment: 'RAW_EXECUTED_PENDING_FROZEN_INTERPRETATION';
  receiptSha256: string;
}

export interface SealedHoldoutPaidCohortReceiptV4R {
  version: typeof SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V4R;
  authority: 'RESEARCH_PROVIDER_COHORT_NO_PROJECT_AUTHORITY';
  runContractSha256: string;
  authorizationSha256: string;
  rowCount: 45;
  rowSummaries: readonly Readonly<JsonRecord>[];
  statusCounts: Readonly<Record<RowStatus, number>>;
  providerInferenceCalls: number;
  googleCountTokensCalls: number;
  providerTurns: number;
  spentNanoUsd: number;
  projectReads: 0;
  projectMutations: 0;
  stateEffects: readonly [];
  assessment: 'RAW_EXECUTED_PENDING_FROZEN_INTERPRETATION';
  receiptSha256: string;
}

interface SealedHoldoutPaidCohortCoreInputV2R {
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputRoot: string;
  implementationCommitSha: string;
  runnerSourceSha256: string;
  environment: Readonly<Record<string, string | undefined>>;
  dependencies?: Readonly<Omit<SealedHoldoutPaidCohortRunnerDependenciesV2R, 'proofExecutor'>>;
  variant: Readonly<SealedHoldoutPaidCohortVariantV2R>;
}

export async function runSealedHoldoutPaidCohortV2R(
  input: Readonly<SealedHoldoutPaidCohortRunInputV2R>,
): Promise<Readonly<SealedHoldoutPaidCohortReceiptV2R>> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const credential = assertSealedHoldoutCredentialPreflightReceiptV2R(
    input.credentialPreflight,
  );
  // Validate immutable authorization material at issuance time first. Expiry is
  // checked again immediately before every new provider row, never for reads.
  const authorization = assertSealedHoldoutPaidDispatchAuthorizationV2R({
    manifest, credentialPreflight: credential,
    authorization: input.paidAuthorization,
    now: input.paidAuthorization.approvedAt,
  });
  const variant = buildHistoricalRunnerVariant({
    input, manifest, credential, authorization,
  });
  return runPaidCohortCore({
    ...input,
    variant,
    dependencies: input.dependencies,
  }) as Promise<Readonly<SealedHoldoutPaidCohortReceiptV2R>>;
}

export async function runSealedHoldoutPaidCohortV4R(
  input: Readonly<SealedHoldoutPaidCohortRunInputV4R>,
): Promise<Readonly<SealedHoldoutPaidCohortReceiptV4R>> {
  const generalisationManifest = assertSealedHoldoutGeneralisationManifestV4R(
    input.generalisationManifest,
  );
  const baseManifest = assertSealedHoldoutCohortManifestV3R2(input.baseManifest);
  if (text(record(generalisationManifest.baseCohortIdentity).manifestSha256)
    !== baseManifest.manifestSha256) {
    fail('SEALED_PAID_V4R_BASE_MANIFEST_DRIFT');
  }
  const credential = assertSealedHoldoutGeneralisationPreflightReceiptV4R({
    manifest: generalisationManifest,
    value: input.credentialPreflight,
  });
  if (hashCanonicalJsonV1(input.requestCaptures) !== credential.requestCaptureSetSha256) {
    fail('SEALED_PAID_V4R_REQUEST_CAPTURE_SET_DRIFT');
  }
  const authorization = assertSealedHoldoutGeneralisationPaidAuthorizationV4R({
    generalisationManifest,
    baseManifest,
    preflight: credential,
    authorization: input.paidAuthorization,
    now: input.paidAuthorization.approvedAt,
  });
  const variant = buildCurrentRunnerVariant({
    input, generalisationManifest, baseManifest, credential, authorization,
  });
  return runPaidCohortCore({
    ...input,
    variant,
    dependencies: input.dependencies,
  }) as Promise<Readonly<SealedHoldoutPaidCohortReceiptV4R>>;
}

async function runPaidCohortCore(
  input: Readonly<SealedHoldoutPaidCohortCoreInputV2R>,
): Promise<Readonly<JsonRecord>> {
  const variant = input.variant;
  const authorization = variant.authorization;
  const dependencies = input.dependencies ?? {};
  const now = dependencies.now ?? (() => new Date().toISOString());
  const uniqueId = dependencies.uniqueId ?? randomUUID;
  const rows = variant.rows;
  const contract = buildRunContract(input, variant);
  await initializeRunRoot(input.outputRoot, contract);
  const completePath = join(input.outputRoot, 'cohort-receipt.json');
  if (await exists(completePath)) {
    return readAndValidateCohortReceipt(
      completePath, input.outputRoot, contract, variant,
    );
  }
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  const completed: JsonRecord[] = [];
  for (const rowPlan of rows) {
    const paths = rowPaths(input.outputRoot, rowPlan);
    if (await exists(paths.row)) {
      if (!await exists(paths.attempt)) fail(`SEALED_PAID_ROW_ATTEMPT_MISSING:${rowPlan.rowId}`);
      await readAndValidateAttempt(paths.attempt, contract, rowPlan);
      completed.push(await readAndValidateRow(paths.row, contract, rowPlan, variant));
      continue;
    }
    if (await exists(paths.attempt)) {
      fail(`SEALED_PAID_ROW_PRIOR_ATTEMPT_INDETERMINATE:${rowPlan.rowId}`);
    }
    variant.assertAuthorization(now());
    const totals = aggregateRows(completed);
    const remainingMicroUsd = Math.floor((
      authorization.limits.absoluteMaxCohortSpendMicroUsd * 1_000
        - totals.spentNanoUsd
    ) / 1_000);
    if (remainingMicroUsd < 1) fail('SEALED_PAID_COHORT_SPEND_EXHAUSTED');
    const rowSpendMicroUsd = Math.min(
      authorization.limits.maxSpendMicroUsdPerRow,
      remainingMicroUsd,
    );
    const network = createAuditedFetch(
      dependencies.fetchImpl ?? fetch,
      rowPlan.route,
    );
    const routeBinding = buildRouteBinding({
      variant, rowPlan, rowSpendMicroUsd,
      googleApiKey: credentials.googleKey, fetchImpl: network.fetchImpl, now: now(),
    });
    const transport = (dependencies.transportFactory
      ?? createProviderNativeLiveTransportV2R)({
      environment: input.environment,
      fetchImpl: network.fetchImpl,
      maxTransientAttempts: 1,
    });
    const exchanges: JsonRecord[] = [];
    let invokeCount = 0;
    const invoke = async (request: Readonly<SerializedProviderNativeTurnV2R>) => {
      invokeCount += 1;
      if (invokeCount === 1 && request.requestHash !== rowPlan.initialRequestSha256) {
        fail(`SEALED_PAID_INITIAL_REQUEST_DRIFT:${rowPlan.rowId}`);
      }
      try {
        const response = await transport.invoke(request);
        exchanges.push(exchange(request, response, exchanges.length + 1));
        return response;
      } catch (error) {
        exchanges.push(exchangeFailure(request, error, exchanges.length + 1));
        throw error;
      }
    };
    await writeJsonOnce(paths.attempt, attemptReceipt(contract, rowPlan, now()));
    try {
      const outcome = await variant.execute({
        rowPlan, routeBinding, invoke, mediaManifest: input.mediaManifest,
        proofRoot: join(input.outputRoot, 'proof-attempts',
          `${rowArtifactStem(rowPlan.rowId)}-${safe(uniqueId())}`),
      });
      const transportReceipt = transport.snapshot();
      const row = buildRowReceipt({
        version: variant.version,
        contract, rowPlan, routeBindingReceipt: routeBinding.receipt,
        ...outcome,
        transportReceipt, networkAudit: network.snapshot(), exchanges,
        firstRequestVerified: invokeCount > 0,
      });
      assertNoSecrets(row, input.environment);
      await writeJsonOnce(paths.row, row);
      completed.push(row);
      assertAuthorizedTotals(aggregateRows(completed), authorization);
    } catch (error) {
      await writeFailure(input.outputRoot, contract, rowPlan, error, uniqueId(), now());
      throw error;
    }
  }
  const cohort = buildCohortReceipt(contract, variant, completed);
  assertNoSecrets(cohort, input.environment);
  await writeJsonOnce(completePath, cohort);
  return cohort;
}

function buildRowPlans(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
  credential: Readonly<SealedHoldoutCredentialPreflightReceiptV2R>,
): readonly Readonly<SealedHoldoutPaidRowPlanV2R>[] {
  const callableIds = strings(record(manifest.sharedModelContext).callableOperatorIds);
  const routes = buildSealedHoldoutBenchmarkRoutesV2R();
  const plans: SealedHoldoutPaidRowPlanV2R[] = [];
  for (const taskCase of manifest.cases) {
    const operatorOrder = buildSealedHoldoutPresentationOrderV2R(taskCase.caseId, callableIds);
    for (const route of routes) for (const handoffMode of SEALED_HOLDOUT_HANDOFF_ARMS_V2R) {
      const captureId = `${taskCase.caseId}:${route.routeId}:${handoffMode}`;
      const check = records(credential.checks).find((entry) => entry.captureId === captureId);
      if (!check || check.requestSha256 === undefined) fail(`SEALED_PAID_CAPTURE_MISSING:${captureId}`);
      if (check.caseId !== taskCase.caseId || check.routeId !== route.routeId
        || check.model !== route.model || check.handoffMode !== handoffMode
        || check.publicCaseSha256 !== taskCase.publicCaseSha256) {
        fail(`SEALED_PAID_CAPTURE_BINDING_DRIFT:${captureId}`);
      }
      const material = {
        rowIndex: plans.length + 1,
        rowId: `${String(plans.length + 1).padStart(3, '0')}-${safe(captureId)}`,
        captureId, caseId: taskCase.caseId, publicCaseSha256: taskCase.publicCaseSha256,
        route, routeSha256: hashCanonicalJsonV1(route), handoffMode,
        operatorOrder, operatorOrderSha256: hashCanonicalJsonV1(operatorOrder),
        initialRequestSha256: text(check.requestSha256),
      };
      if (material.operatorOrderSha256 !== text(check.operatorOrderSha256)) {
        fail(`SEALED_PAID_OPERATOR_ORDER_DRIFT:${captureId}`);
      }
      plans.push({ ...material, rowPlanSha256: hashCanonicalJsonV1(material) });
    }
  }
  if (plans.length !== 96) fail('SEALED_PAID_ROW_PLAN_COUNT_INVALID');
  return deepFreezeV1(plans);
}

function buildHistoricalRunnerVariant(input: Readonly<{
  input: Readonly<SealedHoldoutPaidCohortRunInputV2R>;
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  credential: Readonly<SealedHoldoutCredentialPreflightReceiptV2R>;
  authorization: Readonly<SealedHoldoutPaidDispatchAuthorizationV2R>;
}>): Readonly<SealedHoldoutPaidCohortVariantV2R> {
  const proofExecutor = input.input.dependencies?.proofExecutor
    ?? proveSealedHoldoutPaidOutcomeV2R;
  return deepFreezeV1({
    version: SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R,
    rowCount: 96 as const,
    manifestSha256: input.manifest.manifestSha256,
    cap2CurrentTruthManifestSha256:
      text(record(input.manifest.cap2CurrentTruthBinding).manifestSha256),
    preflightReceiptSha256: input.credential.receiptSha256,
    requestCaptureSetSha256: input.credential.requestCaptureSetSha256,
    rows: buildRowPlans(input.manifest, input.credential),
    authorization: input.authorization,
    assertAuthorization: (now: string) => {
      assertSealedHoldoutPaidDispatchAuthorizationV2R({
        manifest: input.manifest,
        credentialPreflight: input.credential,
        authorization: input.authorization,
        now,
      });
    },
    buildRouteBinding: (bindingInput) => buildHistoricalRouteBinding({
      ...bindingInput,
      manifest: input.manifest,
      authorization: input.authorization,
    }),
    execute: async (executionInput) => {
      const episode = await runBudgetedSealedHoldoutEpisodeV2R({
        manifest: input.manifest,
        caseId: executionInput.rowPlan.caseId,
        route: executionInput.rowPlan.route,
        authorization: executionInput.routeBinding.authorization,
        countInputTokens: executionInput.routeBinding.countInputTokens,
        argumentHandoffMode: executionInput.rowPlan.handoffMode,
        operatorPresentationOrder: executionInput.rowPlan.operatorOrder,
        invoke: executionInput.invoke,
      });
      const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV2R({
        manifest: input.manifest,
        caseId: executionInput.rowPlan.caseId,
        budgetedEpisode: episode,
      });
      const evaluation = evaluateBudgetedSealedHoldoutTraceV2R({
        manifest: input.manifest,
        caseId: executionInput.rowPlan.caseId,
        trace,
      });
      const proof = await runProofIfEligible({
        evaluation,
        execute: () => proofExecutor({
          manifest: input.manifest,
          caseId: executionInput.rowPlan.caseId,
          trace,
          evaluation,
          mediaManifest: executionInput.mediaManifest,
          outputDirectory: executionInput.proofRoot,
        }),
      });
      return {
        episode: episode as unknown as Readonly<JsonRecord>,
        trace: trace as unknown as Readonly<JsonRecord>,
        evaluation,
        proof,
      };
    },
    validatePersistedEvaluation: (row, expected) => {
      const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV2R(row.trace);
      const evaluation = evaluateBudgetedSealedHoldoutTraceV2R({
        manifest: input.manifest,
        caseId: expected.caseId,
        trace,
      });
      assertPersistedEvaluation(row, expected, evaluation);
    },
  });
}

function buildCurrentRunnerVariant(input: Readonly<{
  input: Readonly<SealedHoldoutPaidCohortRunInputV4R>;
  generalisationManifest: Readonly<SealedHoldoutGeneralisationManifestV4R>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  credential: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>;
  authorization: Readonly<SealedHoldoutGeneralisationPaidAuthorizationV4R>;
}>): Readonly<SealedHoldoutPaidCohortVariantV2R> {
  const proofExecutor = input.input.dependencies?.proofExecutor
    ?? proveSealedHoldoutPaidOutcomeV3R2;
  return deepFreezeV1({
    version: SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V4R,
    rowCount: 45 as const,
    manifestSha256: input.generalisationManifest.manifestSha256,
    cap2CurrentTruthManifestSha256:
      text(record(input.generalisationManifest.cap2CurrentTruthBinding).manifestSha256),
    preflightReceiptSha256: input.credential.receiptSha256,
    requestCaptureSetSha256: input.credential.requestCaptureSetSha256,
    rows: buildCurrentRowPlans(input),
    authorization: input.authorization,
    assertAuthorization: (now: string) => {
      assertSealedHoldoutGeneralisationPaidAuthorizationV4R({
        generalisationManifest: input.generalisationManifest,
        baseManifest: input.baseManifest,
        preflight: input.credential,
        authorization: input.authorization,
        now,
      });
    },
    buildRouteBinding: (bindingInput) => buildCurrentRouteBinding({
      ...bindingInput,
      manifest: input.baseManifest,
      authorization: input.authorization,
    }),
    execute: async (executionInput) => {
      const episode = await runBudgetedSealedHoldoutEpisodeV3R2({
        manifest: input.baseManifest,
        caseId: executionInput.rowPlan.caseId,
        route: executionInput.rowPlan.route,
        authorization: executionInput.routeBinding.authorization,
        countInputTokens: executionInput.routeBinding.countInputTokens,
        argumentHandoffMode: executionInput.rowPlan.handoffMode,
        operatorPresentationOrder: executionInput.rowPlan.operatorOrder,
        invoke: executionInput.invoke,
      });
      const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV3R2({
        manifest: input.baseManifest,
        caseId: executionInput.rowPlan.caseId,
        budgetedEpisode: episode,
      });
      const evaluation = evaluateBudgetedSealedHoldoutTraceV3R2({
        manifest: input.baseManifest,
        caseId: executionInput.rowPlan.caseId,
        trace,
      });
      const proof = await runProofIfEligible({
        evaluation,
        execute: () => proofExecutor({
          manifest: input.baseManifest,
          caseId: executionInput.rowPlan.caseId,
          budgetedEpisode: episode,
          trace,
          evaluation,
          mediaManifest: executionInput.mediaManifest,
          outputDirectory: executionInput.proofRoot,
        }),
      });
      return {
        episode: episode as unknown as Readonly<JsonRecord>,
        trace: trace as unknown as Readonly<JsonRecord>,
        evaluation,
        proof,
      };
    },
    validatePersistedEvaluation: (row, expected) => {
      const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV3R2(row.trace);
      const evaluation = evaluateBudgetedSealedHoldoutTraceV3R2({
        manifest: input.baseManifest,
        caseId: expected.caseId,
        trace,
      });
      assertPersistedEvaluation(row, expected, evaluation);
    },
  });
}

function buildCurrentRowPlans(input: Readonly<{
  generalisationManifest: Readonly<SealedHoldoutGeneralisationManifestV4R>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  credential: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>;
  authorization: Readonly<SealedHoldoutGeneralisationPaidAuthorizationV4R>;
  input: Readonly<SealedHoldoutPaidCohortRunInputV4R>;
}>): readonly Readonly<SealedHoldoutPaidRowPlanV2R>[] {
  const plans = input.generalisationManifest.rows.map((row) => {
    const rowId = text(row.rowId);
    const capture = input.input.requestCaptures.find((entry) => entry.rowId === rowId);
    const check = records(input.credential.checks).find((entry) => entry.rowId === rowId);
    const authorized = input.authorization.authorizedRows.find((entry) => entry.rowId === rowId);
    const taskCase = input.baseManifest.cases.find(({ caseId }) => caseId === text(row.caseId));
    const route = routeFromCurrentRow(row);
    const rowIndex = number(row.rowIndex);
    const operatorOrder = strings(row.operatorOrder);
    if (!capture || !check || !authorized || !taskCase
      || rowIndex < 1 || operatorOrder.length !== 33
      || capture.rowPlanSha256 !== row.rowPlanSha256
      || check.rowPlanSha256 !== row.rowPlanSha256
      || authorized.rowPlanSha256 !== row.rowPlanSha256
      || capture.caseId !== row.caseId || check.caseId !== row.caseId
      || capture.routeId !== route.routeId || authorized.routeId !== route.routeId
      || capture.handoffMode !== row.handoffMode || authorized.handoffMode !== row.handoffMode
      || authorized.orderId !== row.orderId
      || capture.operatorOrderSha256 !== row.operatorOrderSha256
      || authorized.operatorOrderSha256 !== row.operatorOrderSha256
      || hashCanonicalJsonV1(operatorOrder) !== row.operatorOrderSha256
      || check.requestSha256 !== capture.request.requestHash) {
      fail(`SEALED_PAID_V4R_ROW_BINDING_DRIFT:${rowId}`);
    }
    const material = {
      rowIndex, rowId, captureId: capture.captureId,
      caseId: text(row.caseId), publicCaseSha256: taskCase.publicCaseSha256,
      route, routeSha256: text(row.routeSha256),
      handoffMode: capture.handoffMode,
      orderId: text(row.orderId), operatorOrder,
      operatorOrderSha256: text(row.operatorOrderSha256),
      initialRequestSha256: capture.request.requestHash,
      manifestRowPlanSha256: text(row.rowPlanSha256),
    };
    return { ...material, rowPlanSha256: hashCanonicalJsonV1(material) };
  });
  if (plans.length !== 45 || new Set(plans.map(({ rowId }) => rowId)).size !== 45) {
    fail('SEALED_PAID_V4R_ROW_PLAN_COUNT_INVALID');
  }
  return deepFreezeV1(plans);
}

function routeFromCurrentRow(row: Readonly<JsonRecord>): Readonly<ProviderNativeRouteV2R> {
  const route = buildSealedHoldoutBenchmarkRoutesV2R().find(
    ({ routeId }) => routeId === text(record(row.route).routeId),
  );
  if (!route || hashCanonicalJsonV1(route) !== row.routeSha256) {
    fail(`SEALED_PAID_V4R_ROUTE_DRIFT:${text(row.rowId)}`);
  }
  return route;
}

function buildRunContract(
  input: Readonly<SealedHoldoutPaidCohortCoreInputV2R>,
  variant: Readonly<SealedHoldoutPaidCohortVariantV2R>,
): Readonly<JsonRecord> {
  requireSha(input.runnerSourceSha256, 'SEALED_PAID_RUNNER_SOURCE_SHA_INVALID');
  if (!/^[a-f0-9]{40}$/.test(input.implementationCommitSha)) {
    fail('SEALED_PAID_IMPLEMENTATION_COMMIT_INVALID');
  }
  const material = {
    version: variant.version,
    authority: 'RESEARCH_PROVIDER_COHORT_NO_PROJECT_AUTHORITY',
    implementationCommitSha: input.implementationCommitSha,
    runnerSourceSha256: input.runnerSourceSha256,
    manifestSha256: variant.manifestSha256,
    cap2CurrentTruthManifestSha256: variant.cap2CurrentTruthManifestSha256,
    credentialPreflightReceiptSha256: variant.preflightReceiptSha256,
    requestCaptureSetSha256: variant.requestCaptureSetSha256,
    authorizationSha256: variant.authorization.authorizationSha256,
    mediaManifestSha256: input.mediaManifest.manifestSha256,
    rowPlanSetSha256: hashCanonicalJsonV1(variant.rows),
    rowCount: variant.rowCount,
    projectReadsAuthorized: 0,
    projectMutationsAuthorized: 0,
    stateEffects: [],
  };
  return deepFreezeV1({ ...material, contractSha256: hashCanonicalJsonV1(material) });
}

function buildRouteBinding(input: Readonly<{
  variant: Readonly<SealedHoldoutPaidCohortVariantV2R>;
  rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
  rowSpendMicroUsd: number;
  googleApiKey: string;
  fetchImpl: typeof fetch;
  now: string;
}>): ReturnType<typeof buildSealedHoldoutRuntimeAccountingBindingV2R> {
  return input.variant.buildRouteBinding(input);
}

function buildHistoricalRouteBinding(input: Readonly<{
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  authorization: Readonly<SealedHoldoutPaidDispatchAuthorizationV2R>;
  rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
  rowSpendMicroUsd: number;
  googleApiKey: string;
  fetchImpl: typeof fetch;
  now: string;
}>): ReturnType<typeof buildSealedHoldoutRuntimeAccountingBindingV2R> {
  const route = input.rowPlan.route;
  const approval = buildRuntimeApproval(input);
  return buildSealedHoldoutRuntimeAccountingBindingV2R({
    manifest: input.manifest, caseId: approval.caseId, route, approval,
    googleApiKey: route.provider === 'google' ? input.googleApiKey : undefined,
    fetchImpl: input.fetchImpl, now: input.now,
  });
}

function buildCurrentRouteBinding(input: Readonly<{
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  authorization: Readonly<SealedHoldoutGeneralisationPaidAuthorizationV4R>;
  rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
  rowSpendMicroUsd: number;
  googleApiKey: string;
  fetchImpl: typeof fetch;
  now: string;
}>): ReturnType<typeof buildSealedHoldoutRuntimeAccountingBindingV3R2> {
  const route = input.rowPlan.route;
  const approval = buildRuntimeApproval(input);
  return buildSealedHoldoutRuntimeAccountingBindingV3R2({
    manifest: input.manifest, caseId: approval.caseId, route, approval,
    googleApiKey: route.provider === 'google' ? input.googleApiKey : undefined,
    fetchImpl: input.fetchImpl, now: input.now,
  });
}

function buildRuntimeApproval(input: Readonly<{
  manifest: Readonly<{ manifestSha256: string }>;
  authorization: PaidAuthorizationV2R;
  rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
  rowSpendMicroUsd: number;
}>): SealedHoldoutRuntimeAccountingApprovalV2R {
  const route = input.rowPlan.route;
  const fact = findSealedHoldoutRuntimeRouteFactV2R(route.routeId);
  if (!fact) fail(`SEALED_PAID_ROUTE_FACT_MISSING:${route.routeId}`);
  return {
    version: SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R,
    pricingSnapshotVersion: SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R,
    operatorId: input.authorization.operatorId,
    approvedAt: input.authorization.approvedAt,
    manifestSha256: input.manifest.manifestSha256,
    caseId: input.rowPlan.caseId,
    publicCaseSha256: input.rowPlan.publicCaseSha256,
    routeSha256: input.rowPlan.routeSha256,
    counterAction: fact.counterAction,
    providerContextEgress: route.provider === 'google'
      ? 'ALLOW_GOOGLE_COUNT_TOKENS_ONLY' : 'DENY',
    maxInputTokensPerTurn: input.authorization.limits.maxInputTokensPerTurn,
    absoluteMaxSpendMicroUsd: input.rowSpendMicroUsd,
    inferenceCallsAuthorized: 0,
  };
}

async function runProofIfEligible(input: Readonly<{
  evaluation: PaidEvaluationV2R;
  execute: () => Promise<Readonly<SealedHoldoutPaidProofSummaryV2R>>;
}>): Promise<Readonly<JsonRecord>> {
  if (!['PASS', 'READY_FOR_PROOF'].includes(input.evaluation.assessment)) {
    return deepFreezeV1({ attempted: false });
  }
  try {
    const receipt = await input.execute();
    requireSha(receipt.receiptSha256, 'SEALED_PAID_PROOF_RECEIPT_HASH_INVALID');
    if (receipt.stateEffects.length) fail('SEALED_PAID_PROOF_STATE_EFFECT_INVALID');
    return deepFreezeV1({ attempted: true, passed: true, receipt });
  } catch (error) {
    return deepFreezeV1({ attempted: true, passed: false, error: errorMessage(error) });
  }
}

function buildRowReceipt(input: Readonly<{
  version: SealedHoldoutPaidCohortVariantV2R['version'];
  contract: Readonly<JsonRecord>; rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
  routeBindingReceipt: Readonly<JsonRecord>; episode: Readonly<JsonRecord>;
  trace: Readonly<JsonRecord>;
  evaluation: PaidEvaluationV2R;
  proof: Readonly<JsonRecord>; transportReceipt: Readonly<JsonRecord>;
  networkAudit: readonly Readonly<JsonRecord>[]; exchanges: readonly Readonly<JsonRecord>[];
  firstRequestVerified: boolean;
}>): Readonly<JsonRecord> {
  const status = rowStatus(input.evaluation, input.proof);
  const material = {
    version: input.version,
    authority: 'RAW_PROVIDER_ROW_NO_PROJECT_AUTHORITY',
    runContractSha256: text(input.contract.contractSha256),
    rowPlan: input.rowPlan,
    rowPlanSha256: text(input.rowPlan.rowPlanSha256),
    firstRequestVerified: input.firstRequestVerified,
    routeBindingReceipt: input.routeBindingReceipt,
    episode: input.episode, trace: input.trace, evaluation: input.evaluation,
    proof: input.proof, providerExchanges: input.exchanges,
    transportReceipt: input.transportReceipt, networkAudit: input.networkAudit,
    status, projectReads: 0, projectMutations: 0, stateEffects: [],
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function rowStatus(
  evaluation: PaidEvaluationV2R,
  proof: Readonly<JsonRecord>,
): RowStatus {
  if (evaluation.assessment === 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE') {
    return 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE';
  }
  if (evaluation.assessment === 'NOT_EVALUATED_RESOURCE_GUARD') {
    return 'NOT_EVALUATED_RESOURCE_GUARD';
  }
  if (evaluation.assessment === 'FAIL') return 'FAIL_HIDDEN_EVALUATION';
  return proof.passed === true ? 'PASS_CLAIM_PROOF' : 'FAIL_CLAIM_PROOF';
}

function createAuditedFetch(base: typeof fetch, route: Readonly<ProviderNativeRouteV2R>): Readonly<{
  fetchImpl: typeof fetch; snapshot: () => readonly Readonly<JsonRecord>[];
}> {
  const calls: JsonRecord[] = [];
  const countTokens = `https://generativelanguage.googleapis.com/v1beta/models/${route.model}:countTokens`;
  const allowed = new Set([
    'https://api.openai.com/v1/responses',
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    countTokens,
  ]);
  const fetchImpl: typeof fetch = async (request, init) => {
    const endpoint = request instanceof Request ? request.url : String(request);
    if (!allowed.has(endpoint)) fail(`SEALED_PAID_NETWORK_ENDPOINT_FORBIDDEN:${endpoint}`);
    const requestMaterial = {
      endpoint, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null,
    };
    try {
      const response = await base(request, init);
      calls.push({ ...requestMaterial, requestSha256: hashCanonicalJsonV1(requestMaterial), responseStatus: response.status });
      return response;
    } catch (error) {
      calls.push({ ...requestMaterial, requestSha256: hashCanonicalJsonV1(requestMaterial), error: errorMessage(error) });
      throw error;
    }
  };
  return deepFreezeV1({
    fetchImpl,
    snapshot: () => deepFreezeV1(calls.map(({ body: _body, ...call }) => call)),
  });
}

function exchange(
  request: Readonly<SerializedProviderNativeTurnV2R>,
  response: Readonly<ProviderNativeInvokeResponseV2R>,
  ordinal: number,
): Readonly<JsonRecord> {
  return deepFreezeV1({
    ordinal, request, responseStatus: response.status, responseBody: response.body,
    responseSha256: hashCanonicalJsonV1(response.body),
  });
}
function exchangeFailure(
  request: Readonly<SerializedProviderNativeTurnV2R>, error: unknown, ordinal: number,
): Readonly<JsonRecord> {
  return deepFreezeV1({ ordinal, request, error: errorMessage(error) });
}

async function initializeRunRoot(root: string, contract: Readonly<JsonRecord>): Promise<void> {
  await mkdir(dirname(root), { recursive: true });
  if (!await exists(root)) await mkdir(root, { recursive: false });
  await Promise.all([
    mkdir(join(root, 'attempts'), { recursive: true }),
    mkdir(join(root, 'rows'), { recursive: true }),
    mkdir(join(root, 'failures'), { recursive: true }),
    mkdir(join(root, 'proof-attempts'), { recursive: true }),
  ]);
  const path = join(root, 'run-contract.json');
  if (await exists(path)) {
    const existing = await readJson(path);
    if (hashCanonicalJsonV1(existing) !== hashCanonicalJsonV1(contract)) {
      fail('SEALED_PAID_RUN_CONTRACT_DRIFT');
    }
    return;
  }
  await writeJsonOnce(path, contract);
}

function rowPaths(root: string, row: Readonly<SealedHoldoutPaidRowPlanV2R>): Readonly<{ attempt: string; row: string }> {
  const name = sealedHoldoutPaidRowArtifactNameV2R(row.rowId);
  return { attempt: join(root, 'attempts', name), row: join(root, 'rows', name) };
}

export function sealedHoldoutPaidRowArtifactNameV2R(rowId: string): string {
  const stem = safe(rowId);
  if (!stem) fail('SEALED_PAID_ROW_ARTIFACT_ID_INVALID');
  return `${stem}--${hashCanonicalJsonV1(rowId).slice(0, 16)}.json`;
}

function rowArtifactStem(rowId: string): string {
  return sealedHoldoutPaidRowArtifactNameV2R(rowId).slice(0, -'.json'.length);
}

function attemptReceipt(
  contract: Readonly<JsonRecord>, row: Readonly<JsonRecord>, startedAt: string,
): Readonly<JsonRecord> {
  const material = {
    version: contract.version,
    runContractSha256: contract.contractSha256,
    rowPlanSha256: row.rowPlanSha256,
    startedAt,
    disposition: 'STARTED_PROVIDER_ROW_NO_AUTOMATIC_RETRY_AFTER_CRASH',
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

async function readAndValidateRow(
  path: string, contract: Readonly<JsonRecord>,
  expected: Readonly<SealedHoldoutPaidRowPlanV2R>,
  variant: Readonly<SealedHoldoutPaidCohortVariantV2R>,
): Promise<Readonly<JsonRecord>> {
  const row = record(await readJson(path));
  const { receiptSha256, ...material } = row;
  if (receiptSha256 !== hashCanonicalJsonV1(material)
    || row.version !== variant.version
    || row.runContractSha256 !== contract.contractSha256
    || row.rowPlanSha256 !== expected.rowPlanSha256
    || hashCanonicalJsonV1(row.rowPlan) !== hashCanonicalJsonV1(expected)
    || typeof row.firstRequestVerified !== 'boolean'
    || row.projectReads !== 0 || row.projectMutations !== 0
    || !Array.isArray(row.stateEffects) || row.stateEffects.length !== 0) {
    fail(`SEALED_PAID_ROW_RECEIPT_DRIFT:${text(expected.rowId)}`);
  }
  variant.validatePersistedEvaluation(row, expected);
  return deepFreezeV1(row);
}

function assertPersistedEvaluation(
  row: Readonly<JsonRecord>,
  expected: Readonly<SealedHoldoutPaidRowPlanV2R>,
  evaluation: PaidEvaluationV2R,
): void {
  if (hashCanonicalJsonV1(evaluation) !== hashCanonicalJsonV1(row.evaluation)) {
    fail(`SEALED_PAID_ROW_EVALUATION_DRIFT:${text(expected.rowId)}`);
  }
}

async function readAndValidateAttempt(
  path: string, contract: Readonly<JsonRecord>, expected: Readonly<SealedHoldoutPaidRowPlanV2R>,
): Promise<void> {
  const attempt = record(await readJson(path));
  const { receiptSha256, ...material } = attempt;
  if (receiptSha256 !== hashCanonicalJsonV1(material)
    || attempt.version !== contract.version
    || attempt.runContractSha256 !== contract.contractSha256
    || attempt.rowPlanSha256 !== expected.rowPlanSha256
    || attempt.disposition !== 'STARTED_PROVIDER_ROW_NO_AUTOMATIC_RETRY_AFTER_CRASH') {
    fail(`SEALED_PAID_ROW_ATTEMPT_DRIFT:${expected.rowId}`);
  }
}

function aggregateRows(rows: readonly Readonly<JsonRecord>[]): Readonly<{
  spentNanoUsd: number; providerTurns: number; inferenceCalls: number; googleCountTokensCalls: number;
}> {
  const totals = { spentNanoUsd: 0, providerTurns: 0, inferenceCalls: 0, googleCountTokensCalls: 0 };
  for (const row of rows) {
    const usage = record(record(row.episode).runtimeBudget).usage;
    const transportCalls = records(record(row.transportReceipt).calls);
    const network = records(row.networkAudit);
    totals.spentNanoUsd += number(record(usage).spentNanoUsd);
    totals.providerTurns += number(record(usage).providerTurns);
    totals.inferenceCalls += transportCalls.length;
    totals.googleCountTokensCalls += network.filter(({ endpoint }) =>
      typeof endpoint === 'string' && endpoint.endsWith(':countTokens')).length;
  }
  return totals;
}

function assertAuthorizedTotals(
  totals: ReturnType<typeof aggregateRows>,
  authorization: PaidAuthorizationV2R,
): void {
  if (totals.spentNanoUsd > authorization.limits.absoluteMaxCohortSpendMicroUsd * 1_000
    || totals.providerTurns > authorization.limits.authorizedProviderTurns
    || totals.inferenceCalls > authorization.limits.authorizedProviderTurns
    || totals.googleCountTokensCalls > authorization.limits.authorizedGoogleCountTokensCalls) {
    fail('SEALED_PAID_COHORT_AUTHORIZED_TOTAL_EXCEEDED');
  }
}

function buildCohortReceipt(
  contract: Readonly<JsonRecord>,
  variant: Readonly<SealedHoldoutPaidCohortVariantV2R>,
  rows: readonly Readonly<JsonRecord>[],
): Readonly<JsonRecord> {
  if (rows.length !== variant.rowCount) fail('SEALED_PAID_COHORT_ROW_COUNT_INVALID');
  const totals = aggregateRows(rows);
  assertAuthorizedTotals(totals, variant.authorization);
  const statusCounts = Object.fromEntries([
    'PASS_CLAIM_PROOF', 'FAIL_HIDDEN_EVALUATION', 'FAIL_CLAIM_PROOF',
    'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE', 'NOT_EVALUATED_RESOURCE_GUARD',
  ].map((status) => [status, rows.filter((row) => row.status === status).length])) as Record<RowStatus, number>;
  const rowSummaries = rows.map((row) => {
    const plan = record(row.rowPlan);
    return {
      rowId: plan.rowId, caseId: plan.caseId,
      routeId: record(plan.route).routeId, handoffMode: plan.handoffMode,
      ...(plan.orderId === undefined ? {} : { orderId: plan.orderId }),
      ...(plan.manifestRowPlanSha256 === undefined
        ? {} : { manifestRowPlanSha256: plan.manifestRowPlanSha256 }),
      status: row.status, receiptSha256: row.receiptSha256,
    };
  });
  const material = {
    version: variant.version,
    authority: 'RESEARCH_PROVIDER_COHORT_NO_PROJECT_AUTHORITY' as const,
    runContractSha256: text(contract.contractSha256),
    authorizationSha256: variant.authorization.authorizationSha256,
    rowCount: variant.rowCount, rowSummaries, statusCounts,
    providerInferenceCalls: totals.inferenceCalls,
    googleCountTokensCalls: totals.googleCountTokensCalls,
    providerTurns: totals.providerTurns, spentNanoUsd: totals.spentNanoUsd,
    projectReads: 0 as const, projectMutations: 0 as const, stateEffects: [] as const,
    assessment: 'RAW_EXECUTED_PENDING_FROZEN_INTERPRETATION' as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

async function readAndValidateCohortReceipt(
  path: string, root: string, contract: Readonly<JsonRecord>,
  variant: Readonly<SealedHoldoutPaidCohortVariantV2R>,
): Promise<Readonly<JsonRecord>> {
  const receipt = record(await readJson(path));
  const { receiptSha256, ...material } = receipt;
  if (receiptSha256 !== hashCanonicalJsonV1(material)
    || receipt.runContractSha256 !== contract.contractSha256) {
    fail('SEALED_PAID_COHORT_RECEIPT_DRIFT');
  }
  const rows: JsonRecord[] = [];
  for (const plan of variant.rows) {
    const paths = rowPaths(root, plan);
    if (!await exists(paths.attempt)) fail(`SEALED_PAID_ROW_ATTEMPT_MISSING:${plan.rowId}`);
    await readAndValidateAttempt(paths.attempt, contract, plan);
    rows.push(await readAndValidateRow(paths.row, contract, plan, variant));
  }
  const expected = buildCohortReceipt(contract, variant, rows);
  if (hashCanonicalJsonV1(receipt) !== hashCanonicalJsonV1(expected)) {
    fail('SEALED_PAID_COHORT_RECEIPT_DRIFT');
  }
  return expected;
}

async function writeFailure(
  root: string, contract: Readonly<JsonRecord>, row: Readonly<JsonRecord>, error: unknown,
  id: string, failedAt: string,
): Promise<void> {
  const material = {
    version: contract.version,
    authority: 'HARNESS_FAILURE_NO_PROJECT_AUTHORITY',
    runContractSha256: contract.contractSha256,
    rowPlanSha256: row.rowPlanSha256,
    failedAt, error: errorMessage(error), stateEffects: [],
  };
  await writeJsonOnce(join(root, 'failures',
    `${rowArtifactStem(text(row.rowId))}-${safe(id)}.json`), {
    ...material, receiptSha256: hashCanonicalJsonV1(material),
  });
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error) {
    if (record(error).code === 'ENOENT') return false;
    throw error;
  }
}
async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}
async function writeJsonOnce(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
function assertNoSecrets(value: unknown, environment: Readonly<Record<string, string | undefined>>): void {
  const serialized = JSON.stringify(value);
  for (const name of ['OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    const secret = environment[name]?.trim();
    if (secret && secret.length >= 16 && serialized.includes(secret)) fail('SEALED_PAID_SECRET_LEAK');
  }
}
function requireSha(value: string, code: string): void { if (!/^[a-f0-9]{64}$/.test(value)) fail(code); }
function safe(value: string): string { return value.replace(/[^A-Za-z0-9._-]/g, '-'); }
function errorMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 2_000); }
function fail(code: string): never { throw new Error(code); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : 0; }
