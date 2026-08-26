import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { providerNativeCohortRoutesV2R }
  from './provider-native-cohort-manifest-v2r';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from './stage25-final-generalisation-cohort-v1';
import {
  assertStage25FinalGeneralisationProviderPreflightBundleV1,
  type Stage25FinalGeneralisationProviderBundleV1,
  type Stage25FinalGeneralisationProviderCaptureV1,
} from './stage25-final-generalisation-provider-preflight-v1';
import { STAGE25_FINAL_GENERALISATION_PROVIDER_SOURCE_GATE_VERSION_V1 }
  from './stage25-final-generalisation-provider-source-gate-v1';
import {
  STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1,
  STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1,
} from './stage25-final-generalisation-protocol-v1';

type JsonRecord = Record<string, unknown>;
const AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1_000;

export const STAGE25_FINAL_GENERALISATION_PAID_AUTHORIZATION_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_PAID_AUTHORIZATION_V1_1' as const;
export const STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1 =
  'CONFIRM STAGE25 FINAL 24 ROW PAID COHORT MAX $5.8056704 NO AUTOMATIC TRANSPORT RETRY' as const;
export const STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1 = '5.8056704' as const;
export const STAGE25_FINAL_GENERALISATION_MAX_SPEND_NANO_USD_V1 = 5_805_670_400 as const;

export interface Stage25FinalGeneralisationPaidApprovalV1 {
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  confirmedCohortSha256: string;
  confirmedReadinessReceiptSha256: string;
  confirmedProviderPreflightReceiptSha256: string;
  confirmedRequestCaptureSetSha256: string;
  executeConfirmation: typeof STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1;
  confirmedMaxSpendUsd: typeof STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1;
}

export interface Stage25FinalGeneralisationPaidAuthorizationV1 {
  version: typeof STAGE25_FINAL_GENERALISATION_PAID_AUTHORIZATION_VERSION_V1;
  authority: 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  cohortSha256: string;
  readinessReceiptSha256: string;
  providerPreflightReceiptSha256: string;
  requestCaptureSetSha256: string;
  authorizedRows: readonly Readonly<JsonRecord>[];
  authorizedRowsSha256: string;
  limits: Readonly<{
    rows: 24;
    maximumProviderInferenceCalls: 48;
    maximumAttemptsPerRow: 2;
    maximumSchemaOrProtocolCorrectionsPerRow: 1;
    absoluteMaxCohortSpendNanoUsd: typeof STAGE25_FINAL_GENERALISATION_MAX_SPEND_NANO_USD_V1;
  }>;
  networkPolicy: 'MODEL_INFERENCE_ONLY_NO_INTERNAL_TRANSPORT_RETRY';
  correctionPolicy: 'PUBLIC_SCHEMA_OR_PROTOCOL_ONLY_NO_NEW_TASK_FACTS';
  projectReadsAuthorized: 0;
  projectMutationsAuthorized: 0;
  stateEffects: readonly [];
  authorizationSha256: string;
}

export function issueStage25FinalGeneralisationPaidAuthorizationV1(input: {
  readinessReceipt: unknown;
  providerBundle: Readonly<Stage25FinalGeneralisationProviderBundleV1>;
  approval: Readonly<Stage25FinalGeneralisationPaidApprovalV1>;
}): Readonly<Stage25FinalGeneralisationPaidAuthorizationV1> {
  const bundle = assertStage25FinalGeneralisationProviderPreflightBundleV1(
    input.providerBundle,
  );
  const readiness = assertReadiness(input.readinessReceipt, bundle);
  assertApproval(input.approval, readiness, bundle);
  const authorizedRows = expectedRows(bundle.captures);
  const material = {
    version: STAGE25_FINAL_GENERALISATION_PAID_AUTHORIZATION_VERSION_V1,
    authority: 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    operatorId: input.approval.operatorId,
    approvedAt: input.approval.approvedAt,
    expiresAt: input.approval.expiresAt,
    cohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    readinessReceiptSha256: text(readiness.receiptSha256),
    providerPreflightReceiptSha256: text(bundle.receipt.receiptSha256),
    requestCaptureSetSha256: text(bundle.receipt.requestCaptureSetSha256),
    authorizedRows,
    authorizedRowsSha256: hashCanonicalJsonV1(authorizedRows),
    limits: limits(),
    networkPolicy: 'MODEL_INFERENCE_ONLY_NO_INTERNAL_TRANSPORT_RETRY' as const,
    correctionPolicy: 'PUBLIC_SCHEMA_OR_PROTOCOL_ONLY_NO_NEW_TASK_FACTS' as const,
    projectReadsAuthorized: 0 as const,
    projectMutationsAuthorized: 0 as const,
    stateEffects: [] as const,
  };
  return assertStage25FinalGeneralisationPaidAuthorizationV1({
    readinessReceipt: readiness,
    providerBundle: bundle,
    authorization: {
      ...material,
      authorizationSha256: hashCanonicalJsonV1(material),
    },
    now: input.approval.approvedAt,
  });
}

export function assertStage25FinalGeneralisationPaidAuthorizationV1(input: {
  readinessReceipt: unknown;
  providerBundle: Readonly<Stage25FinalGeneralisationProviderBundleV1>;
  authorization: unknown;
  now?: string;
}): Readonly<Stage25FinalGeneralisationPaidAuthorizationV1> {
  const bundle = assertStage25FinalGeneralisationProviderPreflightBundleV1(
    input.providerBundle,
  );
  const readiness = assertReadiness(input.readinessReceipt, bundle);
  const candidate = input.authorization as Stage25FinalGeneralisationPaidAuthorizationV1;
  const rows = expectedRows(bundle.captures);
  const { authorizationSha256, ...material } = candidate;
  assertTimeWindow(candidate.approvedAt, candidate.expiresAt,
    input.now ?? new Date().toISOString());
  if (candidate.version !== STAGE25_FINAL_GENERALISATION_PAID_AUTHORIZATION_VERSION_V1
    || candidate.authority !== 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY'
    || !/^[A-Za-z0-9._-]{1,128}$/.test(candidate.operatorId)
    || candidate.cohortSha256 !== STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256
    || candidate.readinessReceiptSha256 !== readiness.receiptSha256
    || candidate.providerPreflightReceiptSha256 !== bundle.receipt.receiptSha256
    || candidate.requestCaptureSetSha256 !== bundle.receipt.requestCaptureSetSha256
    || hashCanonicalJsonV1(candidate.authorizedRows) !== hashCanonicalJsonV1(rows)
    || candidate.authorizedRowsSha256 !== hashCanonicalJsonV1(rows)
    || hashCanonicalJsonV1(candidate.limits) !== hashCanonicalJsonV1(limits())
    || candidate.networkPolicy !== 'MODEL_INFERENCE_ONLY_NO_INTERNAL_TRANSPORT_RETRY'
    || candidate.correctionPolicy !== 'PUBLIC_SCHEMA_OR_PROTOCOL_ONLY_NO_NEW_TASK_FACTS'
    || candidate.projectReadsAuthorized !== 0 || candidate.projectMutationsAuthorized !== 0
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length !== 0
    || authorizationSha256 !== hashCanonicalJsonV1(material)) fail('AUTHORIZATION_INVALID');
  return deepFreezeV1(structuredClone(candidate));
}

function assertReadiness(
  value: unknown,
  bundle: Readonly<Stage25FinalGeneralisationProviderBundleV1>,
): JsonRecord {
  const receipt = record(value);
  const source = record(receipt.source);
  const provider = record(receipt.providerPreflight);
  const calls = record(provider.networkCalls);
  const { receiptSha256, ...material } = receipt;
  if (receipt.version !== STAGE25_FINAL_GENERALISATION_PROVIDER_SOURCE_GATE_VERSION_V1
    || receipt.authority !== 'SOURCE_BOUND_PROVIDER_ACCESS_PREFLIGHT_NO_INFERENCE'
    || receipt.readiness !== 'READY_FOR_EXPLICIT_CAPPED_24_ROW_PAID_AUTHORIZATION_NOT_INFERENCE'
    || receipt.paidProviderDispatchAuthorized !== false
    || receipt.providerInferenceCallCount !== 0
    || receipt.canonicalProjectMutationCount !== 0
    || source.relevantWorktreeClean !== true
    || provider.receiptSha256 !== bundle.receipt.receiptSha256
    || provider.requestCaptureSetSha256 !== bundle.receipt.requestCaptureSetSha256
    || provider.cohortSha256 !== STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256
    || provider.absoluteTwoAttemptMaxSpendUsd !== 5.8056704
    || calls.modelMetadataGets !== 3 || calls.googleCountTokensPosts !== 8
    || calls.inferenceCalls !== 0
    || !Array.isArray(receipt.stateEffects) || receipt.stateEffects.length !== 0
    || receiptSha256 !== hashCanonicalJsonV1(material)) fail('READINESS_INVALID');
  return receipt;
}

function assertApproval(
  approval: Readonly<Stage25FinalGeneralisationPaidApprovalV1>,
  readiness: JsonRecord,
  bundle: Readonly<Stage25FinalGeneralisationProviderBundleV1>,
): void {
  assertTimeWindow(approval.approvedAt, approval.expiresAt, approval.approvedAt);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(approval.operatorId)
    || approval.confirmedCohortSha256 !== STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256
    || approval.confirmedReadinessReceiptSha256 !== readiness.receiptSha256
    || approval.confirmedProviderPreflightReceiptSha256 !== bundle.receipt.receiptSha256
    || approval.confirmedRequestCaptureSetSha256 !== bundle.receipt.requestCaptureSetSha256
    || approval.executeConfirmation !== STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1
    || approval.confirmedMaxSpendUsd !== STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1) {
    fail('APPROVAL_INVALID');
  }
}

function expectedRows(
  captures: readonly Readonly<Stage25FinalGeneralisationProviderCaptureV1>[],
): readonly Readonly<JsonRecord>[] {
  const captureMap = new Map(captures.map((capture) => [capture.rowId, capture]));
  const routeMap = new Map(providerNativeCohortRoutesV2R()
    .map((entry) => [entry.route.routeId, entry]));
  const rows = STAGE25_FINAL_GENERALISATION_COHORT_V1.rows.map((row) => {
    const capture = captureMap.get(row.rowId) ?? fail(`CAPTURE_MISSING:${row.rowId}`);
    const route = routeMap.get(row.route.routeId) ?? fail(`ROUTE_MISSING:${row.rowId}`);
    if (capture.taskId !== row.taskId || capture.routeId !== row.route.routeId
      || capture.provider !== row.route.provider || capture.model !== row.route.model) {
      fail(`CAPTURE_DRIFT:${row.rowId}`);
    }
    const material = {
      rowId: row.rowId, taskId: row.taskId, taskLane: row.taskLane,
      taskPacketSha256: row.taskPacketSha256,
      routeId: row.route.routeId, provider: row.route.provider, model: row.route.model,
      initialRequestSha256: capture.requestSha256,
      initialBoundedInputTokens: capture.boundedInputTokens,
      maximumInputTokensPerAttempt: STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1,
      maximumOutputTokensPerAttempt: STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1,
      maximumProviderAttempts: 2 as const, automaticTransportRetries: 0 as const,
      absoluteMaxRowSpendNanoUsd: maximumRowSpendNanoUsd(route),
    };
    return deepFreezeV1({ ...material,
      rowAuthorizationSha256: hashCanonicalJsonV1(material) });
  });
  const total = rows.reduce((sum, row) =>
    sum + Number(row.absoluteMaxRowSpendNanoUsd), 0);
  if (rows.length !== 24 || total !== STAGE25_FINAL_GENERALISATION_MAX_SPEND_NANO_USD_V1) {
    fail('ROW_LIMIT_INVALID');
  }
  return rows;
}

function maximumRowSpendNanoUsd(
  entry: ReturnType<typeof providerNativeCohortRoutesV2R>[number],
): number {
  const inputRate = Math.max(entry.pricing.inputUsdPerMillion,
    entry.pricing.cacheWriteUsdPerMillion);
  const perAttemptUsd = (
    STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1 * inputRate
    + STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1
      * entry.pricing.outputUsdPerMillion
  ) / 1_000_000;
  const result = Math.round(perAttemptUsd * 2 * 1_000_000_000);
  if (!Number.isSafeInteger(result) || result < 1) fail('ROW_PRICE_INVALID');
  return result;
}

function limits() {
  return { rows: 24 as const, maximumProviderInferenceCalls: 48 as const,
    maximumAttemptsPerRow: 2 as const,
    maximumSchemaOrProtocolCorrectionsPerRow: 1 as const,
    absoluteMaxCohortSpendNanoUsd:
      STAGE25_FINAL_GENERALISATION_MAX_SPEND_NANO_USD_V1 };
}
function assertTimeWindow(approvedAt: string, expiresAt: string, now: string): void {
  const approved = Date.parse(approvedAt); const expires = Date.parse(expiresAt);
  const current = Date.parse(now);
  if (![approved, expires, current].every(Number.isFinite) || expires <= approved
    || expires - approved > AUTHORIZATION_WINDOW_MS
    || current < approved || current > expires) fail('AUTHORIZATION_EXPIRED');
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object'
  && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never {
  throw new Error(`STAGE25_FINAL_GENERALISATION_PAID_${code}`);
}
