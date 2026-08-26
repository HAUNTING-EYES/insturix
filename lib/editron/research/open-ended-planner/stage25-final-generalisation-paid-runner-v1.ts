import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { providerNativeCohortRoutesV2R }
  from './provider-native-cohort-manifest-v2r';
import { createProviderNativeRouteLiveTransportV2R,
  resolveProviderNativeCredentialsV2R }
  from './provider-native-live-transport-v2r';
import type { ProviderNativeEpisodeReceiptV2R }
  from './provider-native-tool-episode-v2r';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from './stage25-final-generalisation-cohort-v1';
import { evaluateStage25FinalGeneralisationSubmissionV1 }
  from './stage25-final-generalisation-evaluator-v1';
import { assertStage25FinalGeneralisationPaidAuthorizationV1,
  type Stage25FinalGeneralisationPaidAuthorizationV1 }
  from './stage25-final-generalisation-paid-authorization-v1';
import { assertStage25FinalGeneralisationProviderPreflightBundleV1,
  type Stage25FinalGeneralisationProviderBundleV1 }
  from './stage25-final-generalisation-provider-preflight-v1';
import { runStage25FinalGeneralisationProviderEpisodeV1,
  type Stage25FinalGeneralisationCorrectionV1,
  type Stage25FinalGeneralisationPublicTaskV1 }
  from './stage25-final-generalisation-protocol-v1';
import { createStage25FinalGeneralisationPaidDispatchV1,
  createStage25FinalGeneralisationPaidResponseV1,
  finalizeStage25FinalGeneralisationPaidRowResultV1,
  assertStage25FinalGeneralisationPaidDispatchV1,
  assertStage25FinalGeneralisationPaidResponseV1,
  assertStage25FinalGeneralisationPaidRowResultV1,
  type Stage25FinalGeneralisationPaidAttemptV1,
  type Stage25FinalGeneralisationPaidDurablePortV1,
  type Stage25FinalGeneralisationPaidRowResultV1 }
  from './stage25-final-generalisation-paid-runner-contract-v1';
import { createStage25FinalGeneralisationRuntimeGuardV1,
  finalizeStage25FinalGeneralisationScorecardRowV1,
  stage25FinalGeneralisationPerAttemptCeilingV1,
  stage25FinalGeneralisationSpentNanoUsdV1 }
  from './stage25-final-generalisation-paid-runner-support-v1';
import { finalizeStage25GeneralisationCohortV1 }
  from './stage25-generalisation-scorecard-v1';

type JsonRecord = Record<string, unknown>;
export const STAGE25_FINAL_GENERALISATION_PAID_RUN_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_PAID_RUN_V1_1' as const;

export async function runStage25FinalGeneralisationPaidCohortV1(input: {
  readinessReceipt: unknown;
  providerBundle: Readonly<Stage25FinalGeneralisationProviderBundleV1>;
  authorization: Readonly<Stage25FinalGeneralisationPaidAuthorizationV1>;
  durablePort: Readonly<Stage25FinalGeneralisationPaidDurablePortV1>;
  environment: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  now?: () => string;
  nowMs?: () => number;
}) {
  const bundle = assertStage25FinalGeneralisationProviderPreflightBundleV1(
    input.providerBundle,
  );
  const now = input.now ?? (() => new Date().toISOString());
  const nowMs = input.nowMs ?? (() => Date.now());
  const authorization = assertStage25FinalGeneralisationPaidAuthorizationV1({
    readinessReceipt: input.readinessReceipt, providerBundle: bundle,
    authorization: input.authorization, now: now(),
  });
  const credentials = resolveProviderNativeCredentialsV2R(input.environment);
  if (credentials.googleCredentialSource !== 'GOOGLE_GENERATIVE_AI_API_KEY') {
    fail('PRODUCTION_GOOGLE_KEY_REQUIRED');
  }
  const routes = providerNativeCohortRoutesV2R();
  const routeMap = new Map<string, (typeof routes)[number]>(
    routes.map((entry) => [entry.route.routeId, entry]),
  );
  const captureMap = new Map(bundle.captures.map((entry) => [entry.rowId, entry]));
  const taskMap = new Map(STAGE25_FINAL_GENERALISATION_COHORT_V1.tasks
    .map((task) => [task.taskId, task]));
  const rows: Stage25FinalGeneralisationPaidRowResultV1[] = [];
  for (const scope of authorization.authorizedRows) {
    const rowId = String(scope.rowId);
    const task = taskMap.get(String(scope.taskId)) ?? fail(`TASK_MISSING:${rowId}`);
    const routeEntry = routeMap.get(String(scope.routeId)) ?? fail(`ROUTE_MISSING:${rowId}`);
    const capture = captureMap.get(rowId) ?? fail(`CAPTURE_MISSING:${rowId}`);
    const durable = await input.durablePort.load(rowId);
    if (durable.completedRow) {
      if (durable.attempts.length) fail(`DURABLE_STATE_AMBIGUOUS:${rowId}`);
      rows.push(assertStage25FinalGeneralisationPaidRowResultV1({
        authorization, row: durable.completedRow,
      }));
      continue;
    }
    const attempts: Stage25FinalGeneralisationPaidAttemptV1[] = [];
    let correction: Stage25FinalGeneralisationCorrectionV1 | undefined;
    for (let attempt = 1 as 1 | 2; attempt <= 2; attempt += 1) {
      const saved = durable.attempts[attempt - 1];
      if (saved && saved.dispatch.attempt !== attempt) fail(`ATTEMPT_ORDER_INVALID:${rowId}`);
      if (saved && !saved.response) {
        attempts.push(unknownAttempt(saved.dispatch));
        break;
      }
      if (!saved && attempt > attempts.length + 1) {
        fail(`ATTEMPT_GAP:${rowId}`);
      }
      const result = await runAttempt({ input, authorization, scope, task, routeEntry,
        capture, durablePort: input.durablePort, attempt, correction,
        saved, now, nowMs });
      attempts.push(result);
      if (result.observation === 'TRANSPORT_RESULT_UNKNOWN_NO_RETRY'
        || !result.responseSha256 || !repairable(result)) break;
      correction = correctionFor(result);
    }
    const scorecardRow = finalizeStage25FinalGeneralisationScorecardRowV1({
      rowId, task, routeId: routeEntry.route.routeId, attempts,
    });
    const row = finalizeStage25FinalGeneralisationPaidRowResultV1({
      authorization, rowId, taskId: task.taskId, routeId: routeEntry.route.routeId,
      model: routeEntry.route.model, attempts, scorecardRow,
    });
    await input.durablePort.commitRow({ rowId, row });
    rows.push(row);
  }
  const scorecardCohort = finalizeStage25GeneralisationCohortV1({
    cohortId: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortId,
    contemplatedRowIds: authorization.authorizedRows.map(({ rowId }) => String(rowId)),
    rows: rows.map(({ scorecardRow }) => scorecardRow),
  });
  const material = {
    version: STAGE25_FINAL_GENERALISATION_PAID_RUN_VERSION_V1,
    authority: 'RESEARCH_PROVIDER_COHORT_RESULT_NO_PROJECT_AUTHORITY' as const,
    authorizationSha256: authorization.authorizationSha256,
    rowResultSha256s: rows.map(({ resultSha256 }) => resultSha256),
    scorecardCohort,
    accounting: {
      providerDispatchesAccounted: rows.reduce(
        (sum, row) => sum + row.accounting.providerDispatchesAccounted, 0),
      providerResponsesObserved: rows.reduce(
        (sum, row) => sum + row.accounting.providerResponsesObserved, 0),
      spentNanoUsd: rows.reduce((sum, row) => sum + row.accounting.spentNanoUsd, 0),
    },
    projectReads: 0 as const, projectMutations: 0 as const, stateEffects: [] as const,
  };
  if (material.accounting.providerDispatchesAccounted > 48
    || material.accounting.spentNanoUsd
      > authorization.limits.absoluteMaxCohortSpendNanoUsd) fail('COHORT_LIMIT_EXCEEDED');
  const output = deepFreezeV1({ rows, receipt: {
    ...material, receiptSha256: hashCanonicalJsonV1(material),
  } });
  const serialized = JSON.stringify(output);
  if ([credentials.openAiKey, credentials.googleKey].some((secret) => serialized.includes(secret))) {
    fail('SECRET_LEAK');
  }
  return output;
}

async function runAttempt(input: {
  input: Parameters<typeof runStage25FinalGeneralisationPaidCohortV1>[0];
  authorization: Readonly<Stage25FinalGeneralisationPaidAuthorizationV1>;
  scope: Readonly<JsonRecord>;
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>;
  routeEntry: ReturnType<typeof providerNativeCohortRoutesV2R>[number];
  capture: Readonly<Stage25FinalGeneralisationProviderBundleV1['captures'][number]>;
  durablePort: Readonly<Stage25FinalGeneralisationPaidDurablePortV1>;
  attempt: 1 | 2;
  correction?: Readonly<Stage25FinalGeneralisationCorrectionV1>;
  saved?: Readonly<{ dispatch: ReturnType<typeof assertStage25FinalGeneralisationPaidDispatchV1>;
    response?: unknown }>;
  now: () => string;
  nowMs: () => number;
}): Promise<Stage25FinalGeneralisationPaidAttemptV1> {
  const start = input.nowMs();
  let dispatch = input.saved
    ? assertStage25FinalGeneralisationPaidDispatchV1(input.saved.dispatch) : undefined;
  let responseReceipt = input.saved?.response && dispatch
    ? assertStage25FinalGeneralisationPaidResponseV1({ dispatch, response: input.saved.response })
    : undefined;
  let observation: Stage25FinalGeneralisationPaidAttemptV1['observation'] = input.saved
    ? 'PERSISTED_RESPONSE_REPLAY' : 'RESPONSE_OBSERVED';
  const transport = createProviderNativeRouteLiveTransportV2R({
    route: input.routeEntry.route, environment: input.input.environment,
    ...(input.input.fetchImpl ? { fetchImpl: input.input.fetchImpl } : {}),
  });
  const guard = createStage25FinalGeneralisationRuntimeGuardV1({
    authorization: input.authorization, scope: input.scope,
    routeEntry: input.routeEntry, capture: input.capture, attempt: input.attempt,
  });
  const episode = await runStage25FinalGeneralisationProviderEpisodeV1({
    route: input.routeEntry.route, task: input.task, runtimeGuard: guard,
    ...(input.correction ? { correction: input.correction } : {}),
    invoke: async (request) => {
      if (!dispatch) {
        if (input.attempt === 1 && request.requestHash !== input.capture.requestSha256) {
          fail(`INITIAL_REQUEST_DRIFT:${String(input.scope.rowId)}`);
        }
        dispatch = createStage25FinalGeneralisationPaidDispatchV1({
          rowId: String(input.scope.rowId), attempt: input.attempt,
          authorizationSha256: input.authorization.authorizationSha256,
          rowAuthorizationSha256: String(input.scope.rowAuthorizationSha256), request,
          reservedWorstCaseNanoUsd:
            stage25FinalGeneralisationPerAttemptCeilingV1(input.scope),
          createdAt: input.now(),
        });
        await input.durablePort.commitDispatch({ rowId: dispatch.rowId, dispatch });
      } else if (request.requestHash !== dispatch.requestSha256) {
        fail(`REPLAY_REQUEST_DRIFT:${dispatch.rowId}`);
      }
      if (responseReceipt) return { status: responseReceipt.status, body: responseReceipt.body };
      try {
        const response = await transport.invoke(request);
        responseReceipt = createStage25FinalGeneralisationPaidResponseV1({
          dispatch, status: response.status, body: response.body, receivedAt: input.now(),
        });
        await input.durablePort.commitResponse({ rowId: dispatch.rowId, response: responseReceipt });
        return response;
      } catch (error) {
        observation = 'TRANSPORT_RESULT_UNKNOWN_NO_RETRY';
        throw error;
      }
    },
  });
  if (!dispatch) fail(`REQUEST_NOT_DISPATCHED:${String(input.scope.rowId)}`);
  const submission = finishSubmission(episode);
  const evaluation = responseReceipt && responseReceipt.status >= 200
    && responseReceipt.status < 300
    ? evaluateStage25FinalGeneralisationSubmissionV1({
      task: input.task, submission: submission ?? null,
    }) : null;
  return {
    attempt: input.attempt, correction: input.attempt === 2, observation,
    dispatchReceiptSha256: dispatch.receiptSha256,
    responseReceiptSha256: responseReceipt?.receiptSha256 ?? null,
    requestSha256: dispatch.requestSha256,
    responseSha256: responseReceipt?.responseSha256 ?? null,
    episode, evaluation, latencyMs: Math.max(1, input.nowMs() - start),
    spentNanoUsd: responseReceipt
      ? stage25FinalGeneralisationSpentNanoUsdV1(episode)
      : dispatch.reservedWorstCaseNanoUsd,
  };
}

function repairable(attempt: Readonly<Stage25FinalGeneralisationPaidAttemptV1>): boolean {
  if (!attempt.episode || attempt.attempt !== 1) return false;
  if (['PROVIDER_RATE_LIMIT', 'PROVIDER_TIMEOUT', 'PROVIDER_REFUSAL', 'PROVIDER_ERROR',
    'RESOURCE_BUDGET_EXHAUSTED', 'RESOURCE_ACCOUNTING_UNVERIFIABLE']
    .includes(attempt.episode.terminal.disposition)) return false;
  return attempt.evaluation?.disposition === 'FAIL'
    || ['TOOL_PROTOCOL_FAILURE', 'STEP_BUDGET_EXHAUSTED']
      .includes(attempt.episode.terminal.disposition);
}
function correctionFor(attempt: Readonly<Stage25FinalGeneralisationPaidAttemptV1>) {
  const diagnostics = [...new Set([
    ...(attempt.evaluation?.diagnostics ?? []),
    ...(attempt.episode?.terminal.reasonCodes ?? []),
    ...records(attempt.episode?.turns.at(-1)?.diagnostics).map(String),
  ])].filter(Boolean);
  return { sourceReceiptSha256: attempt.evaluation?.receiptSha256
      ?? attempt.episode?.receiptSha256 ?? fail('CORRECTION_SOURCE_MISSING'),
    previousSubmission: attempt.episode ? finishSubmission(attempt.episode) ?? null : null,
    publicDiagnostics: diagnostics.length ? diagnostics : ['PUBLIC_PROTOCOL_CORRECTION_REQUIRED'] };
}


function unknownAttempt(dispatchInput: unknown): Stage25FinalGeneralisationPaidAttemptV1 {
  const dispatch = assertStage25FinalGeneralisationPaidDispatchV1(dispatchInput);
  return { attempt: dispatch.attempt, correction: dispatch.correction,
    observation: 'TRANSPORT_RESULT_UNKNOWN_NO_RETRY', dispatchReceiptSha256: dispatch.receiptSha256,
    responseReceiptSha256: null, requestSha256: dispatch.requestSha256,
    responseSha256: null, episode: null, evaluation: null, latencyMs: 1,
    spentNanoUsd: dispatch.reservedWorstCaseNanoUsd };
}
function finishSubmission(episode: Readonly<ProviderNativeEpisodeReceiptV2R>): unknown {
  const call = record(episode.turns.at(-1)?.modelCall);
  return call.name === 'finish_editron_research_episode' ? call.arguments : undefined;
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object'
  && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function fail(code: string): never {
  throw new Error(`STAGE25_FINAL_GENERALISATION_PAID_RUNNER_${code}`);
}
