import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeEpisodeReceiptV2R }
  from './provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R }
  from './provider-native-tool-codecs-v2r';
import type { Stage25FinalGeneralisationEvaluationV1 }
  from './stage25-final-generalisation-evaluator-v1';
import type { Stage25FinalGeneralisationPaidAuthorizationV1 }
  from './stage25-final-generalisation-paid-authorization-v1';
import type { Stage25GeneralisationRowReceiptV1 }
  from './stage25-generalisation-scorecard-v1';

export const STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_V1_1' as const;

export interface Stage25FinalGeneralisationPaidDispatchV1 {
  version: typeof STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_VERSION_V1;
  artifactType: 'Stage25FinalGeneralisationPaidDispatchV1';
  authority: 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  rowId: string;
  attempt: 1 | 2;
  correction: boolean;
  authorizationSha256: string;
  rowAuthorizationSha256: string;
  request: Readonly<SerializedProviderNativeTurnV2R>;
  requestSha256: string;
  reservedWorstCaseNanoUsd: number;
  createdAt: string;
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface Stage25FinalGeneralisationPaidResponseV1 {
  version: typeof STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_VERSION_V1;
  artifactType: 'Stage25FinalGeneralisationPaidResponseV1';
  authority: 'RESEARCH_PROVIDER_RESPONSE_NO_PROJECT_AUTHORITY';
  rowId: string;
  attempt: 1 | 2;
  dispatchReceiptSha256: string;
  requestSha256: string;
  status: number;
  body: unknown;
  responseSha256: string;
  receivedAt: string;
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface Stage25FinalGeneralisationPaidAttemptV1 {
  attempt: 1 | 2;
  correction: boolean;
  observation: 'RESPONSE_OBSERVED' | 'PERSISTED_RESPONSE_REPLAY'
    | 'TRANSPORT_RESULT_UNKNOWN_NO_RETRY';
  dispatchReceiptSha256: string;
  responseReceiptSha256: string | null;
  requestSha256: string;
  responseSha256: string | null;
  episode: Readonly<ProviderNativeEpisodeReceiptV2R> | null;
  evaluation: Readonly<Stage25FinalGeneralisationEvaluationV1> | null;
  latencyMs: number;
  spentNanoUsd: number;
}

export interface Stage25FinalGeneralisationPaidRowResultV1 {
  version: typeof STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_VERSION_V1;
  artifactType: 'Stage25FinalGeneralisationPaidRowResultV1';
  authority: 'RESEARCH_PROVIDER_RESULT_NO_PROJECT_AUTHORITY';
  rowId: string;
  taskId: string;
  routeId: string;
  model: string;
  authorizationSha256: string;
  attempts: readonly Readonly<Stage25FinalGeneralisationPaidAttemptV1>[];
  scorecardRow: Readonly<Stage25GeneralisationRowReceiptV1>;
  accounting: Readonly<{
    providerDispatchesAccounted: number;
    providerResponsesObserved: number;
    spentNanoUsd: number;
  }>;
  projectReads: 0;
  projectMutations: 0;
  stateEffects: readonly [];
  resultSha256: string;
}

export interface Stage25FinalGeneralisationPaidDurableStateV1 {
  completedRow?: Readonly<Stage25FinalGeneralisationPaidRowResultV1>;
  attempts: readonly Readonly<{
    dispatch: Readonly<Stage25FinalGeneralisationPaidDispatchV1>;
    response?: Readonly<Stage25FinalGeneralisationPaidResponseV1>;
  }>[];
}

export interface Stage25FinalGeneralisationPaidDurablePortV1 {
  load(rowId: string): Promise<Readonly<Stage25FinalGeneralisationPaidDurableStateV1>>;
  /** Atomically creates the write-ahead intent; an existing attempt must fail. */
  commitDispatch(input: Readonly<{
    rowId: string;
    dispatch: Readonly<Stage25FinalGeneralisationPaidDispatchV1>;
  }>): Promise<void>;
  /** Atomically binds one response to its already-persisted dispatch. */
  commitResponse(input: Readonly<{
    rowId: string;
    response: Readonly<Stage25FinalGeneralisationPaidResponseV1>;
  }>): Promise<void>;
  /** Atomically stores the row and supersedes all pending attempt state. */
  commitRow(input: Readonly<{
    rowId: string;
    row: Readonly<Stage25FinalGeneralisationPaidRowResultV1>;
  }>): Promise<void>;
}

export function createStage25FinalGeneralisationPaidDispatchV1(input: {
  rowId: string;
  attempt: 1 | 2;
  authorizationSha256: string;
  rowAuthorizationSha256: string;
  request: Readonly<SerializedProviderNativeTurnV2R>;
  reservedWorstCaseNanoUsd: number;
  createdAt: string;
}): Readonly<Stage25FinalGeneralisationPaidDispatchV1> {
  const material = {
    version: STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_VERSION_V1,
    artifactType: 'Stage25FinalGeneralisationPaidDispatchV1' as const,
    authority: 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    rowId: input.rowId, attempt: input.attempt,
    correction: input.attempt === 2,
    authorizationSha256: input.authorizationSha256,
    rowAuthorizationSha256: input.rowAuthorizationSha256,
    request: input.request, requestSha256: input.request.requestHash,
    reservedWorstCaseNanoUsd: input.reservedWorstCaseNanoUsd,
    createdAt: input.createdAt, stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function createStage25FinalGeneralisationPaidResponseV1(input: {
  dispatch: Readonly<Stage25FinalGeneralisationPaidDispatchV1>;
  status: number;
  body: unknown;
  receivedAt: string;
}): Readonly<Stage25FinalGeneralisationPaidResponseV1> {
  const material = {
    version: STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_VERSION_V1,
    artifactType: 'Stage25FinalGeneralisationPaidResponseV1' as const,
    authority: 'RESEARCH_PROVIDER_RESPONSE_NO_PROJECT_AUTHORITY' as const,
    rowId: input.dispatch.rowId, attempt: input.dispatch.attempt,
    dispatchReceiptSha256: input.dispatch.receiptSha256,
    requestSha256: input.dispatch.requestSha256,
    status: input.status, body: input.body,
    responseSha256: hashCanonicalJsonV1(input.body),
    receivedAt: input.receivedAt, stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export function finalizeStage25FinalGeneralisationPaidRowResultV1(input: {
  authorization: Readonly<Stage25FinalGeneralisationPaidAuthorizationV1>;
  rowId: string;
  taskId: string;
  routeId: string;
  model: string;
  attempts: readonly Readonly<Stage25FinalGeneralisationPaidAttemptV1>[];
  scorecardRow: Readonly<Stage25GeneralisationRowReceiptV1>;
}): Readonly<Stage25FinalGeneralisationPaidRowResultV1> {
  const spentNanoUsd = input.attempts.reduce((sum, attempt) => sum + attempt.spentNanoUsd, 0);
  const material = {
    version: STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_VERSION_V1,
    artifactType: 'Stage25FinalGeneralisationPaidRowResultV1' as const,
    authority: 'RESEARCH_PROVIDER_RESULT_NO_PROJECT_AUTHORITY' as const,
    rowId: input.rowId, taskId: input.taskId, routeId: input.routeId, model: input.model,
    authorizationSha256: input.authorization.authorizationSha256,
    attempts: input.attempts,
    scorecardRow: input.scorecardRow,
    accounting: {
      providerDispatchesAccounted: input.attempts.length,
      providerResponsesObserved: input.attempts.filter(({ responseSha256 }) => responseSha256).length,
      spentNanoUsd,
    },
    projectReads: 0 as const, projectMutations: 0 as const, stateEffects: [] as const,
  };
  return assertStage25FinalGeneralisationPaidRowResultV1({
    authorization: input.authorization,
    row: { ...material, resultSha256: hashCanonicalJsonV1(material) },
  });
}

export function assertStage25FinalGeneralisationPaidRowResultV1(input: {
  authorization: Readonly<Stage25FinalGeneralisationPaidAuthorizationV1>;
  row: unknown;
}): Readonly<Stage25FinalGeneralisationPaidRowResultV1> {
  const row = input.row as Stage25FinalGeneralisationPaidRowResultV1;
  const scope = input.authorization.authorizedRows.find(({ rowId }) => rowId === row?.rowId);
  const { resultSha256, ...material } = row;
  const attempts = row.attempts ?? [];
  const spent = attempts.reduce((sum, attempt) => sum + attempt.spentNanoUsd, 0);
  if (!scope || row.version !== STAGE25_FINAL_GENERALISATION_PAID_RUNNER_CONTRACT_VERSION_V1
    || row.authority !== 'RESEARCH_PROVIDER_RESULT_NO_PROJECT_AUTHORITY'
    || row.taskId !== scope.taskId || row.routeId !== scope.routeId || row.model !== scope.model
    || row.authorizationSha256 !== input.authorization.authorizationSha256
    || attempts.length < 1 || attempts.length > 2
    || attempts.some((attempt, index) => attempt.attempt !== index + 1
      || attempt.correction !== (attempt.attempt === 2)
      || !Number.isSafeInteger(attempt.spentNanoUsd) || attempt.spentNanoUsd < 0
      || !Number.isFinite(attempt.latencyMs) || attempt.latencyMs <= 0)
    || row.scorecardRow.rowId !== row.rowId
    || row.accounting.providerDispatchesAccounted !== attempts.length
    || row.accounting.providerResponsesObserved
      !== attempts.filter(({ responseSha256 }) => responseSha256).length
    || row.accounting.spentNanoUsd !== spent
    || spent > Number(scope.absoluteMaxRowSpendNanoUsd)
    || row.projectReads !== 0 || row.projectMutations !== 0 || row.stateEffects.length !== 0
    || resultSha256 !== hashCanonicalJsonV1(material)) fail('ROW_INVALID');
  return deepFreezeV1(structuredClone(row));
}

export function assertStage25FinalGeneralisationPaidDispatchV1(
  value: unknown,
): Readonly<Stage25FinalGeneralisationPaidDispatchV1> {
  const dispatch = value as Stage25FinalGeneralisationPaidDispatchV1;
  const { receiptSha256, ...material } = dispatch;
  if (![1, 2].includes(dispatch.attempt) || dispatch.correction !== (dispatch.attempt === 2)
    || dispatch.requestSha256 !== dispatch.request.requestHash
    || dispatch.request.requestHash !== hashCanonicalJsonV1({
      endpoint: dispatch.request.endpoint, body: dispatch.request.body,
    }) || !Number.isSafeInteger(dispatch.reservedWorstCaseNanoUsd)
    || dispatch.reservedWorstCaseNanoUsd < 1 || dispatch.stateEffects.length !== 0
    || receiptSha256 !== hashCanonicalJsonV1(material)) fail('DISPATCH_INVALID');
  return deepFreezeV1(structuredClone(dispatch));
}

export function assertStage25FinalGeneralisationPaidResponseV1(input: {
  dispatch: Readonly<Stage25FinalGeneralisationPaidDispatchV1>;
  response: unknown;
}): Readonly<Stage25FinalGeneralisationPaidResponseV1> {
  const response = input.response as Stage25FinalGeneralisationPaidResponseV1;
  const { receiptSha256, ...material } = response;
  if (response.rowId !== input.dispatch.rowId || response.attempt !== input.dispatch.attempt
    || response.dispatchReceiptSha256 !== input.dispatch.receiptSha256
    || response.requestSha256 !== input.dispatch.requestSha256
    || !Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599
    || response.responseSha256 !== hashCanonicalJsonV1(response.body)
    || response.stateEffects.length !== 0
    || receiptSha256 !== hashCanonicalJsonV1(material)) fail('RESPONSE_INVALID');
  return deepFreezeV1(structuredClone(response));
}

function fail(code: string): never {
  throw new Error(`STAGE25_FINAL_GENERALISATION_PAID_RUNNER_${code}`);
}
