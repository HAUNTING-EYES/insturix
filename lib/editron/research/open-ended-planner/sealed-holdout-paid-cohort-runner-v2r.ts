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
  type BudgetedSealedHoldoutEvaluationReceiptV2R,
} from './sealed-holdout-evaluator-v2r';
import { runBudgetedSealedHoldoutEpisodeV2R }
  from './sealed-holdout-episode-v2r';
import {
  proveSealedHoldoutPaidOutcomeV2R,
  type SealedHoldoutPaidProofInputV2R,
  type SealedHoldoutPaidProofSummaryV2R,
} from './sealed-holdout-paid-proof-adapter-v2r';
import {
  SEALED_HOLDOUT_RUNTIME_ROUTE_BINDING_VERSION_V2R,
  buildSealedHoldoutRuntimeAccountingBindingV2R,
  type SealedHoldoutRuntimeAccountingApprovalV2R,
} from './sealed-holdout-runtime-route-binding-v2r';
import {
  findSealedHoldoutRuntimeRouteFactV2R,
  SEALED_HOLDOUT_RUNTIME_PRICE_SNAPSHOT_VERSION_V2R,
} from './sealed-holdout-runtime-route-facts-v2r';
import {
  assertBudgetedSealedHoldoutSelectedOperationTraceV2R,
  buildBudgetedSealedHoldoutSelectedOperationTraceV2R,
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
  operatorOrder: readonly string[];
  operatorOrderSha256: string;
  initialRequestSha256: string;
  rowPlanSha256: string;
}

const SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_PAID_COHORT_RUNNER_V2R_1' as const;

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
  const dependencies = input.dependencies ?? {};
  const now = dependencies.now ?? (() => new Date().toISOString());
  const uniqueId = dependencies.uniqueId ?? randomUUID;
  const rows = buildRowPlans(manifest, credential);
  const contract = buildRunContract(input, authorization, rows);
  await initializeRunRoot(input.outputRoot, contract);
  const completePath = join(input.outputRoot, 'cohort-receipt.json');
  if (await exists(completePath)) {
    return readAndValidateCohortReceipt(
      completePath, input.outputRoot, contract, rows, manifest, authorization,
    );
  }
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  const completed: JsonRecord[] = [];
  for (const rowPlan of rows) {
    const paths = rowPaths(input.outputRoot, rowPlan);
    if (await exists(paths.row)) {
      if (!await exists(paths.attempt)) fail(`SEALED_PAID_ROW_ATTEMPT_MISSING:${rowPlan.rowId}`);
      await readAndValidateAttempt(paths.attempt, contract, rowPlan);
      completed.push(await readAndValidateRow(paths.row, contract, rowPlan, manifest));
      continue;
    }
    if (await exists(paths.attempt)) {
      fail(`SEALED_PAID_ROW_PRIOR_ATTEMPT_INDETERMINATE:${rowPlan.rowId}`);
    }
    assertSealedHoldoutPaidDispatchAuthorizationV2R({
      manifest, credentialPreflight: credential, authorization, now: now(),
    });
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
      manifest, authorization, rowPlan, rowSpendMicroUsd,
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
      const episode = await runBudgetedSealedHoldoutEpisodeV2R({
        manifest, caseId: rowPlan.caseId, route: rowPlan.route,
        authorization: routeBinding.authorization,
        countInputTokens: routeBinding.countInputTokens,
        argumentHandoffMode: rowPlan.handoffMode,
        operatorPresentationOrder: rowPlan.operatorOrder,
        invoke,
      });
      const trace = buildBudgetedSealedHoldoutSelectedOperationTraceV2R({
        manifest, caseId: rowPlan.caseId, budgetedEpisode: episode,
      });
      const evaluation = evaluateBudgetedSealedHoldoutTraceV2R({
        manifest, caseId: rowPlan.caseId, trace,
      });
      const proof = await runProofIfEligible({
        manifest, rowPlan, trace, evaluation,
        mediaManifest: input.mediaManifest,
        proofRoot: join(input.outputRoot, 'proof-attempts', `${rowPlan.rowId}-${uniqueId()}`),
        proofExecutor: dependencies.proofExecutor ?? proveSealedHoldoutPaidOutcomeV2R,
      });
      const transportReceipt = transport.snapshot();
      const row = buildRowReceipt({
        contract, rowPlan, routeBindingReceipt: routeBinding.receipt,
        episode, trace, evaluation, proof,
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
  const cohort = buildCohortReceipt(contract, authorization, completed);
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

function buildRunContract(
  input: Readonly<SealedHoldoutPaidCohortRunInputV2R>,
  authorization: Readonly<SealedHoldoutPaidDispatchAuthorizationV2R>,
  rows: readonly Readonly<SealedHoldoutPaidRowPlanV2R>[],
): Readonly<JsonRecord> {
  requireSha(input.runnerSourceSha256, 'SEALED_PAID_RUNNER_SOURCE_SHA_INVALID');
  if (!/^[a-f0-9]{40}$/.test(input.implementationCommitSha)) {
    fail('SEALED_PAID_IMPLEMENTATION_COMMIT_INVALID');
  }
  const material = {
    version: SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R,
    authority: 'RESEARCH_PROVIDER_COHORT_NO_PROJECT_AUTHORITY',
    implementationCommitSha: input.implementationCommitSha,
    runnerSourceSha256: input.runnerSourceSha256,
    manifestSha256: input.manifest.manifestSha256,
    cap2CurrentTruthManifestSha256: text(record(input.manifest.cap2CurrentTruthBinding).manifestSha256),
    credentialPreflightReceiptSha256: input.credentialPreflight.receiptSha256,
    requestCaptureSetSha256: input.credentialPreflight.requestCaptureSetSha256,
    authorizationSha256: authorization.authorizationSha256,
    mediaManifestSha256: input.mediaManifest.manifestSha256,
    rowPlanSetSha256: hashCanonicalJsonV1(rows),
    rowCount: rows.length,
    projectReadsAuthorized: 0,
    projectMutationsAuthorized: 0,
    stateEffects: [],
  };
  return deepFreezeV1({ ...material, contractSha256: hashCanonicalJsonV1(material) });
}

function buildRouteBinding(input: Readonly<{
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  authorization: Readonly<SealedHoldoutPaidDispatchAuthorizationV2R>;
  rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
  rowSpendMicroUsd: number;
  googleApiKey: string;
  fetchImpl: typeof fetch;
  now: string;
}>): ReturnType<typeof buildSealedHoldoutRuntimeAccountingBindingV2R> {
  const route = input.rowPlan.route;
  const fact = findSealedHoldoutRuntimeRouteFactV2R(route.routeId);
  if (!fact) fail(`SEALED_PAID_ROUTE_FACT_MISSING:${route.routeId}`);
  const approval: SealedHoldoutRuntimeAccountingApprovalV2R = {
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
  return buildSealedHoldoutRuntimeAccountingBindingV2R({
    manifest: input.manifest, caseId: approval.caseId, route, approval,
    googleApiKey: route.provider === 'google' ? input.googleApiKey : undefined,
    fetchImpl: input.fetchImpl, now: input.now,
  });
}

async function runProofIfEligible(input: Readonly<{
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
  trace: ReturnType<typeof buildBudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  proofRoot: string;
  proofExecutor: (value: Readonly<SealedHoldoutPaidProofInputV2R>)
    => Promise<Readonly<SealedHoldoutPaidProofSummaryV2R>>;
}>): Promise<Readonly<JsonRecord>> {
  if (!['PASS', 'READY_FOR_PROOF'].includes(input.evaluation.assessment)) {
    return deepFreezeV1({ attempted: false });
  }
  try {
    const receipt = await input.proofExecutor({
      manifest: input.manifest, caseId: input.rowPlan.caseId,
      trace: input.trace, evaluation: input.evaluation,
      mediaManifest: input.mediaManifest, outputDirectory: input.proofRoot,
    });
    requireSha(receipt.receiptSha256, 'SEALED_PAID_PROOF_RECEIPT_HASH_INVALID');
    if (receipt.stateEffects.length) fail('SEALED_PAID_PROOF_STATE_EFFECT_INVALID');
    return deepFreezeV1({ attempted: true, passed: true, receipt });
  } catch (error) {
    return deepFreezeV1({ attempted: true, passed: false, error: errorMessage(error) });
  }
}

function buildRowReceipt(input: Readonly<{
  contract: Readonly<JsonRecord>; rowPlan: Readonly<SealedHoldoutPaidRowPlanV2R>;
  routeBindingReceipt: Readonly<JsonRecord>; episode: Readonly<JsonRecord>;
  trace: ReturnType<typeof buildBudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  proof: Readonly<JsonRecord>; transportReceipt: Readonly<JsonRecord>;
  networkAudit: readonly Readonly<JsonRecord>[]; exchanges: readonly Readonly<JsonRecord>[];
  firstRequestVerified: boolean;
}>): Readonly<JsonRecord> {
  const status = rowStatus(input.evaluation, input.proof);
  const material = {
    version: SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R,
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
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>,
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
  const name = `${row.rowId}.json`;
  return { attempt: join(root, 'attempts', name), row: join(root, 'rows', name) };
}

function attemptReceipt(
  contract: Readonly<JsonRecord>, row: Readonly<JsonRecord>, startedAt: string,
): Readonly<JsonRecord> {
  const material = {
    version: SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R,
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
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
): Promise<Readonly<JsonRecord>> {
  const row = record(await readJson(path));
  const { receiptSha256, ...material } = row;
  if (receiptSha256 !== hashCanonicalJsonV1(material)
    || row.runContractSha256 !== contract.contractSha256
    || row.rowPlanSha256 !== expected.rowPlanSha256
    || hashCanonicalJsonV1(row.rowPlan) !== hashCanonicalJsonV1(expected)) {
    fail(`SEALED_PAID_ROW_RECEIPT_DRIFT:${text(expected.rowId)}`);
  }
  const trace = assertBudgetedSealedHoldoutSelectedOperationTraceV2R(row.trace);
  const evaluation = evaluateBudgetedSealedHoldoutTraceV2R({
    manifest, caseId: expected.caseId, trace,
  });
  if (hashCanonicalJsonV1(evaluation) !== hashCanonicalJsonV1(row.evaluation)) {
    fail(`SEALED_PAID_ROW_EVALUATION_DRIFT:${text(expected.rowId)}`);
  }
  return deepFreezeV1(row);
}

async function readAndValidateAttempt(
  path: string, contract: Readonly<JsonRecord>, expected: Readonly<SealedHoldoutPaidRowPlanV2R>,
): Promise<void> {
  const attempt = record(await readJson(path));
  const { receiptSha256, ...material } = attempt;
  if (receiptSha256 !== hashCanonicalJsonV1(material)
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
  authorization: Readonly<SealedHoldoutPaidDispatchAuthorizationV2R>,
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
  authorization: Readonly<SealedHoldoutPaidDispatchAuthorizationV2R>,
  rows: readonly Readonly<JsonRecord>[],
): Readonly<SealedHoldoutPaidCohortReceiptV2R> {
  if (rows.length !== 96) fail('SEALED_PAID_COHORT_ROW_COUNT_INVALID');
  const totals = aggregateRows(rows);
  assertAuthorizedTotals(totals, authorization);
  const statusCounts = Object.fromEntries([
    'PASS_CLAIM_PROOF', 'FAIL_HIDDEN_EVALUATION', 'FAIL_CLAIM_PROOF',
    'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE', 'NOT_EVALUATED_RESOURCE_GUARD',
  ].map((status) => [status, rows.filter((row) => row.status === status).length])) as Record<RowStatus, number>;
  const rowSummaries = rows.map((row) => ({
    rowId: record(row.rowPlan).rowId, caseId: record(row.rowPlan).caseId,
    routeId: record(record(row.rowPlan).route).routeId,
    handoffMode: record(row.rowPlan).handoffMode,
    status: row.status, receiptSha256: row.receiptSha256,
  }));
  const material = {
    version: SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R,
    authority: 'RESEARCH_PROVIDER_COHORT_NO_PROJECT_AUTHORITY' as const,
    runContractSha256: text(contract.contractSha256),
    authorizationSha256: authorization.authorizationSha256,
    rowCount: 96 as const, rowSummaries, statusCounts,
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
  plans: readonly Readonly<SealedHoldoutPaidRowPlanV2R>[],
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
  authorization: Readonly<SealedHoldoutPaidDispatchAuthorizationV2R>,
): Promise<Readonly<SealedHoldoutPaidCohortReceiptV2R>> {
  const receipt = record(await readJson(path));
  const { receiptSha256, ...material } = receipt;
  if (receiptSha256 !== hashCanonicalJsonV1(material)
    || receipt.runContractSha256 !== contract.contractSha256) {
    fail('SEALED_PAID_COHORT_RECEIPT_DRIFT');
  }
  const rows: JsonRecord[] = [];
  for (const plan of plans) {
    const paths = rowPaths(root, plan);
    if (!await exists(paths.attempt)) fail(`SEALED_PAID_ROW_ATTEMPT_MISSING:${plan.rowId}`);
    await readAndValidateAttempt(paths.attempt, contract, plan);
    rows.push(await readAndValidateRow(paths.row, contract, plan, manifest));
  }
  const expected = buildCohortReceipt(contract, authorization, rows);
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
    version: SEALED_HOLDOUT_PAID_COHORT_RUNNER_VERSION_V2R,
    authority: 'HARNESS_FAILURE_NO_PROJECT_AUTHORITY',
    runContractSha256: contract.contractSha256,
    rowPlanSha256: row.rowPlanSha256,
    failedAt, error: errorMessage(error), stateEffects: [],
  };
  await writeJsonOnce(join(root, 'failures', `${text(row.rowId)}-${safe(id)}.json`), {
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
