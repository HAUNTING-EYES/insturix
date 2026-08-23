import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertStage25LongFormProviderCohortManifestV2,
  stage25LongFormProviderMaxSpendUsdV2,
  STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2,
  type Stage25LongFormProviderCohortManifestV2,
} from './stage25-long-form-plan-provider-cohort-v2';
import type { Stage25LongFormProviderRequestCaptureV1 }
  from './stage25-long-form-plan-provider-preflight-v1';
import {
  assertStage25LongFormProviderPreflightBundleV2,
  type Stage25LongFormProviderPreflightReceiptV2,
} from './stage25-long-form-plan-provider-preflight-v2';

type JsonRecord = Record<string, unknown>;
const AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const STAGE25_LONG_FORM_PROVIDER_PAID_AUTHORIZATION_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PROVIDER_PAID_AUTHORIZATION_V2_1' as const;

export interface Stage25LongFormProviderPaidApprovalV2 {
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  confirmedManifestSha256: string;
  confirmedPreflightReceiptSha256: string;
  confirmedRequestCaptureSetSha256: string;
  executeConfirmation: typeof STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2;
  confirmedMaxSpendUsd: string;
}

export interface Stage25LongFormProviderPaidAuthorizationV2 {
  version: typeof STAGE25_LONG_FORM_PROVIDER_PAID_AUTHORIZATION_VERSION_V2;
  authority: 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  manifestSha256: string;
  preflightReceiptSha256: string;
  requestCaptureSetSha256: string;
  authorizedRows: readonly Readonly<JsonRecord>[];
  authorizedRowsSha256: string;
  limits: Readonly<{
    rows: 9;
    maximumProviderInferenceCalls: 9;
    maximumAttemptsPerRow: 1;
    absoluteMaxCohortSpendNanoUsd: number;
  }>;
  networkPolicy: 'MODEL_INFERENCE_ONLY_NO_INTERNAL_RETRY';
  projectReadsAuthorized: 0;
  projectMutationsAuthorized: 0;
  stateEffects: readonly [];
  authorizationSha256: string;
}

export function issueStage25LongFormProviderPaidAuthorizationV2(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>;
  preflight: Readonly<Stage25LongFormProviderPreflightReceiptV2>;
  captures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[];
  approval: Readonly<Stage25LongFormProviderPaidApprovalV2>;
}): Readonly<Stage25LongFormProviderPaidAuthorizationV2> {
  const manifest = assertStage25LongFormProviderCohortManifestV2(input.manifest);
  const bundle = assertStage25LongFormProviderPreflightBundleV2({
    manifest, receipt: input.preflight, requestCaptures: input.captures,
  });
  assertApproval(manifest, bundle.receipt, input.approval);
  const authorizedRows = expectedRows(manifest, input.captures);
  const material = {
    version: STAGE25_LONG_FORM_PROVIDER_PAID_AUTHORIZATION_VERSION_V2,
    authority: 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    operatorId: input.approval.operatorId,
    approvedAt: input.approval.approvedAt,
    expiresAt: input.approval.expiresAt,
    manifestSha256: manifest.manifestSha256,
    preflightReceiptSha256: bundle.receipt.receiptSha256,
    requestCaptureSetSha256: bundle.receipt.requestCaptureSetSha256,
    authorizedRows,
    authorizedRowsSha256: hashCanonicalJsonV1(authorizedRows),
    limits: {
      rows: 9 as const,
      maximumProviderInferenceCalls: 9 as const,
      maximumAttemptsPerRow: 1 as const,
      absoluteMaxCohortSpendNanoUsd: manifest.absoluteMaxSpendNanoUsd,
    },
    networkPolicy: 'MODEL_INFERENCE_ONLY_NO_INTERNAL_RETRY' as const,
    projectReadsAuthorized: 0 as const,
    projectMutationsAuthorized: 0 as const,
    stateEffects: [] as const,
  };
  return assertStage25LongFormProviderPaidAuthorizationV2({
    manifest, preflight: bundle.receipt, captures: input.captures,
    authorization: { ...material, authorizationSha256: hashCanonicalJsonV1(material) },
    now: input.approval.approvedAt,
  });
}

export function assertStage25LongFormProviderPaidAuthorizationV2(input: {
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>;
  preflight: Readonly<Stage25LongFormProviderPreflightReceiptV2>;
  captures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[];
  authorization: unknown;
  now?: string;
}): Readonly<Stage25LongFormProviderPaidAuthorizationV2> {
  const manifest = assertStage25LongFormProviderCohortManifestV2(input.manifest);
  const bundle = assertStage25LongFormProviderPreflightBundleV2({
    manifest, receipt: input.preflight, requestCaptures: input.captures,
  });
  const candidate = input.authorization as Stage25LongFormProviderPaidAuthorizationV2;
  const { authorizationSha256, ...material } = candidate;
  const rows = expectedRows(manifest, input.captures);
  assertTimeWindow(candidate.approvedAt, candidate.expiresAt, input.now ?? new Date().toISOString());
  if (candidate.version !== STAGE25_LONG_FORM_PROVIDER_PAID_AUTHORIZATION_VERSION_V2
    || candidate.authority !== 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY'
    || !/^[A-Za-z0-9._-]{1,128}$/.test(candidate.operatorId)
    || candidate.manifestSha256 !== manifest.manifestSha256
    || candidate.preflightReceiptSha256 !== bundle.receipt.receiptSha256
    || candidate.requestCaptureSetSha256 !== bundle.receipt.requestCaptureSetSha256
    || hashCanonicalJsonV1(candidate.authorizedRows) !== hashCanonicalJsonV1(rows)
    || candidate.authorizedRowsSha256 !== hashCanonicalJsonV1(rows)
    || hashCanonicalJsonV1(candidate.limits) !== hashCanonicalJsonV1({
      rows: 9, maximumProviderInferenceCalls: 9, maximumAttemptsPerRow: 1,
      absoluteMaxCohortSpendNanoUsd: manifest.absoluteMaxSpendNanoUsd,
    })
    || candidate.networkPolicy !== 'MODEL_INFERENCE_ONLY_NO_INTERNAL_RETRY'
    || candidate.projectReadsAuthorized !== 0 || candidate.projectMutationsAuthorized !== 0
    || candidate.stateEffects.length !== 0
    || authorizationSha256 !== hashCanonicalJsonV1(material)) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_AUTHORIZATION_INVALID');
  }
  return deepFreezeV1(structuredClone(candidate));
}

function expectedRows(
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>,
  captures: readonly Readonly<Stage25LongFormProviderRequestCaptureV1>[],
): readonly Readonly<JsonRecord>[] {
  const captureMap = new Map(captures.map((capture) => [capture.rowId, capture]));
  return manifest.rows.map((row) => {
    const capture = captureMap.get(row.rowId);
    if (!capture) throw new Error(`STAGE25_LONG_FORM_PROVIDER_CAPTURE_MISSING:${row.rowId}`);
    const material = {
      rowId: row.rowId, routeId: row.routeId, model: row.model,
      presentationOrdinal: row.presentationOrdinal,
      requestSha256: capture.request.requestHash,
      boundedInputTokens: capture.boundedInputTokens,
      maxOutputTokens: manifest.baseManifest.maxOutputTokensPerRow,
      absoluteMaxRowSpendNanoUsd: row.absoluteMaxRowSpendNanoUsd,
    };
    return { ...material, rowAuthorizationSha256: hashCanonicalJsonV1(material) };
  });
}

function assertApproval(
  manifest: Readonly<Stage25LongFormProviderCohortManifestV2>,
  preflight: Readonly<Stage25LongFormProviderPreflightReceiptV2>,
  approval: Readonly<Stage25LongFormProviderPaidApprovalV2>,
): void {
  assertTimeWindow(approval.approvedAt, approval.expiresAt, approval.approvedAt);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(approval.operatorId)
    || approval.confirmedManifestSha256 !== manifest.manifestSha256
    || approval.confirmedPreflightReceiptSha256 !== preflight.receiptSha256
    || approval.confirmedRequestCaptureSetSha256 !== preflight.requestCaptureSetSha256
    || approval.executeConfirmation !== STAGE25_LONG_FORM_PROVIDER_CONFIRMATION_V2
    || approval.confirmedMaxSpendUsd !== stage25LongFormProviderMaxSpendUsdV2(manifest)) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_APPROVAL_INVALID');
  }
}
function assertTimeWindow(approvedAt: string, expiresAt: string, now: string): void {
  const approved = Date.parse(approvedAt);
  const expires = Date.parse(expiresAt);
  const current = Date.parse(now);
  if (![approved, expires, current].every(Number.isFinite) || expires <= approved
    || expires - approved > AUTHORIZATION_WINDOW_MS || current < approved || current > expires) {
    throw new Error('STAGE25_LONG_FORM_PROVIDER_PAID_AUTHORIZATION_EXPIRED');
  }
}
