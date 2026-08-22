import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertStage25RouteAblationProviderManifestV1,
  type Stage25RouteAblationProviderManifestV1,
} from './stage25-route-ablation-provider-manifest-v1';
import {
  assertStage25RouteAblationPreflightReceiptV1,
  type Stage25RouteAblationPreflightReceiptV1,
  type Stage25RouteAblationRequestCaptureV1,
} from './stage25-route-ablation-provider-preflight-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_ROUTE_ABLATION_PAID_AUTHORIZATION_VERSION_V1 =
  'EDITRON_OE_STAGE25_ROUTE_ABLATION_PAID_AUTHORIZATION_V1_1' as const;
export const STAGE25_ROUTE_ABLATION_ZERO_INFERENCE_GATE_V1 = deepFreezeV1({
  version: 'EDITRON_OE_STAGE25_ROUTE_ABLATION_ZERO_INFERENCE_GATE_V1_1',
  implementationCommitSha: '18ac28f9b',
  focusedTestPath: 'tests/editron/stage25-route-ablation-provider-preflight-v1.test.ts',
  passedRouteAndPreflightTests: 11,
  externalInferenceCalls: 0,
  projectReads: 0,
  projectMutations: 0,
} as const);

const AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_SPEND_MICRO_USD_PER_ROW = 1_400_000;
const MAX_COHORT_SPEND_MICRO_USD = 33_600_000;

export interface Stage25RouteAblationPaidApprovalV1 {
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  confirmedManifestSha256: string;
  confirmedPreflightReceiptSha256: string;
  confirmedRequestCaptureSetSha256: string;
  executeConfirmation: 'YES_I_CONFIRM_24_STAGE25_ROUTE_ROWS';
  confirmedMaxSpendUsd: '33.60';
}

export interface Stage25RouteAblationPaidAuthorizationV1 {
  version: typeof STAGE25_ROUTE_ABLATION_PAID_AUTHORIZATION_VERSION_V1;
  authority: 'RESEARCH_STAGE2_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  manifestSha256: string;
  preflightReceiptSha256: string;
  requestCaptureSetSha256: string;
  zeroInferenceGate: typeof STAGE25_ROUTE_ABLATION_ZERO_INFERENCE_GATE_V1;
  authorizedRows: readonly Readonly<JsonRecord>[];
  authorizedRowsSha256: string;
  limits: Readonly<{
    rows: 24;
    maximumProviderInferenceCalls: 48;
    maximumGoogleRepairCountTokensCalls: 8;
    maxSpendMicroUsdPerRow: 1_400_000;
    absoluteMaxCohortSpendMicroUsd: 33_600_000;
  }>;
  networkPolicy: 'MODEL_INFERENCE_PLUS_GOOGLE_REPAIR_COUNT_TOKENS_ONLY';
  projectReadsAuthorized: 0;
  projectMutationsAuthorized: 0;
  stateEffects: readonly [];
  authorizationSha256: string;
}

export function issueStage25RouteAblationPaidAuthorizationV1(input: {
  manifest: Readonly<Stage25RouteAblationProviderManifestV1>;
  preflight: Readonly<Stage25RouteAblationPreflightReceiptV1>;
  captures: readonly Readonly<Stage25RouteAblationRequestCaptureV1>[];
  approval: Readonly<Stage25RouteAblationPaidApprovalV1>;
}): Readonly<Stage25RouteAblationPaidAuthorizationV1> {
  const manifest = assertStage25RouteAblationProviderManifestV1(input.manifest);
  const preflight = assertPreflightBundle(manifest, input.preflight, input.captures);
  assertApproval(manifest, preflight, input.approval);
  const authorizedRows = manifest.rows.map((row) => {
    const material = {
      rowId: row.rowId, routeId: row.routeId, packetHash: row.packetHash,
      maximumAttempts: row.maximumAttempts,
      absoluteMaxRowSpendMicroUsd: MAX_SPEND_MICRO_USD_PER_ROW,
    };
    return deepFreezeV1({ ...material, rowAuthorizationSha256: hashCanonicalJsonV1(material) });
  });
  const material = {
    version: STAGE25_ROUTE_ABLATION_PAID_AUTHORIZATION_VERSION_V1,
    authority: 'RESEARCH_STAGE2_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    operatorId: input.approval.operatorId,
    approvedAt: input.approval.approvedAt,
    expiresAt: input.approval.expiresAt,
    manifestSha256: manifest.manifestSha256,
    preflightReceiptSha256: preflight.receiptSha256,
    requestCaptureSetSha256: preflight.requestCaptureSetSha256,
    zeroInferenceGate: STAGE25_ROUTE_ABLATION_ZERO_INFERENCE_GATE_V1,
    authorizedRows,
    authorizedRowsSha256: hashCanonicalJsonV1(authorizedRows),
    limits: {
      rows: 24 as const, maximumProviderInferenceCalls: 48 as const,
      maximumGoogleRepairCountTokensCalls: 8 as const,
      maxSpendMicroUsdPerRow: MAX_SPEND_MICRO_USD_PER_ROW,
      absoluteMaxCohortSpendMicroUsd: MAX_COHORT_SPEND_MICRO_USD,
    },
    networkPolicy: 'MODEL_INFERENCE_PLUS_GOOGLE_REPAIR_COUNT_TOKENS_ONLY' as const,
    projectReadsAuthorized: 0 as const, projectMutationsAuthorized: 0 as const,
    stateEffects: [] as const,
  };
  return assertStage25RouteAblationPaidAuthorizationV1({
    manifest, preflight, captures: input.captures,
    authorization: { ...material, authorizationSha256: hashCanonicalJsonV1(material) },
    now: input.approval.approvedAt,
  });
}

export function assertStage25RouteAblationPaidAuthorizationV1(input: {
  manifest: Readonly<Stage25RouteAblationProviderManifestV1>;
  preflight: Readonly<Stage25RouteAblationPreflightReceiptV1>;
  captures: readonly Readonly<Stage25RouteAblationRequestCaptureV1>[];
  authorization: unknown;
  now?: string;
}): Readonly<Stage25RouteAblationPaidAuthorizationV1> {
  const manifest = assertStage25RouteAblationProviderManifestV1(input.manifest);
  const preflight = assertPreflightBundle(manifest, input.preflight, input.captures);
  const candidate = record(input.authorization) as unknown as Stage25RouteAblationPaidAuthorizationV1;
  const { authorizationSha256, ...material } = candidate;
  assertTimeWindow(candidate.approvedAt, candidate.expiresAt, input.now ?? new Date().toISOString());
  const expectedRows = manifest.rows.map((row) => {
    const rowMaterial = {
      rowId: row.rowId, routeId: row.routeId, packetHash: row.packetHash,
      maximumAttempts: row.maximumAttempts,
      absoluteMaxRowSpendMicroUsd: MAX_SPEND_MICRO_USD_PER_ROW,
    };
    return { ...rowMaterial, rowAuthorizationSha256: hashCanonicalJsonV1(rowMaterial) };
  });
  if (candidate.version !== STAGE25_ROUTE_ABLATION_PAID_AUTHORIZATION_VERSION_V1
    || candidate.authority !== 'RESEARCH_STAGE2_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY'
    || !/^[A-Za-z0-9._-]{1,128}$/.test(candidate.operatorId)
    || candidate.manifestSha256 !== manifest.manifestSha256
    || candidate.preflightReceiptSha256 !== preflight.receiptSha256
    || candidate.requestCaptureSetSha256 !== preflight.requestCaptureSetSha256
    || !same(candidate.zeroInferenceGate, STAGE25_ROUTE_ABLATION_ZERO_INFERENCE_GATE_V1)
    || !same(candidate.authorizedRows, expectedRows)
    || candidate.authorizedRowsSha256 !== hashCanonicalJsonV1(expectedRows)
    || !same(candidate.limits, {
      rows: 24, maximumProviderInferenceCalls: 48,
      maximumGoogleRepairCountTokensCalls: 8,
      maxSpendMicroUsdPerRow: MAX_SPEND_MICRO_USD_PER_ROW,
      absoluteMaxCohortSpendMicroUsd: MAX_COHORT_SPEND_MICRO_USD,
    })
    || candidate.networkPolicy !== 'MODEL_INFERENCE_PLUS_GOOGLE_REPAIR_COUNT_TOKENS_ONLY'
    || candidate.projectReadsAuthorized !== 0 || candidate.projectMutationsAuthorized !== 0
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length !== 0
    || authorizationSha256 !== hashCanonicalJsonV1(material)) {
    throw new Error('STAGE25_ROUTE_PAID_AUTHORIZATION_INVALID');
  }
  return deepFreezeV1(structuredClone(candidate));
}

export function assertStage25RouteAblationPreflightBundleV1(input: {
  manifest: Readonly<Stage25RouteAblationProviderManifestV1>;
  preflight: Readonly<Stage25RouteAblationPreflightReceiptV1>;
  captures: readonly Readonly<Stage25RouteAblationRequestCaptureV1>[];
}): Readonly<Stage25RouteAblationPreflightReceiptV1> {
  return assertPreflightBundle(
    assertStage25RouteAblationProviderManifestV1(input.manifest), input.preflight, input.captures,
  );
}

function assertPreflightBundle(manifest: Readonly<Stage25RouteAblationProviderManifestV1>,
  receiptValue: Readonly<Stage25RouteAblationPreflightReceiptV1>,
  captures: readonly Readonly<Stage25RouteAblationRequestCaptureV1>[]) {
  const receipt = assertStage25RouteAblationPreflightReceiptV1(receiptValue, manifest);
  const rows = new Map(manifest.rows.map((row) => [row.rowId, row]));
  const checks = new Map(receipt.checks.map((check) => [text(check.rowId), check]));
  if (captures.length !== 24 || hashCanonicalJsonV1(captures) !== receipt.requestCaptureSetSha256
    || new Set(captures.map(({ captureId }) => captureId)).size !== 24) {
    throw new Error('STAGE25_ROUTE_PREFLIGHT_BUNDLE_INVALID');
  }
  for (const capture of captures) {
    const row = rows.get(capture.rowId);
    const check = checks.get(capture.rowId);
    if (!row || capture.captureId !== capture.rowId || capture.routeId !== row.routeId
      || capture.packetHash !== row.packetHash || 'headers' in capture.request
      || capture.request.requestHash !== text(check?.requestSha256)
      || capture.request.requestHash !== hashCanonicalJsonV1({
        endpoint: capture.request.endpoint, body: capture.request.body,
      })) throw new Error(`STAGE25_ROUTE_PREFLIGHT_CAPTURE_INVALID:${capture.rowId}`);
  }
  return receipt;
}

function assertApproval(manifest: Readonly<Stage25RouteAblationProviderManifestV1>,
  preflight: Readonly<Stage25RouteAblationPreflightReceiptV1>,
  approval: Readonly<Stage25RouteAblationPaidApprovalV1>): void {
  assertTimeWindow(approval.approvedAt, approval.expiresAt, approval.approvedAt);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(approval.operatorId)
    || approval.confirmedManifestSha256 !== manifest.manifestSha256
    || approval.confirmedPreflightReceiptSha256 !== preflight.receiptSha256
    || approval.confirmedRequestCaptureSetSha256 !== preflight.requestCaptureSetSha256
    || approval.executeConfirmation !== 'YES_I_CONFIRM_24_STAGE25_ROUTE_ROWS'
    || approval.confirmedMaxSpendUsd !== '33.60') {
    throw new Error('STAGE25_ROUTE_PAID_APPROVAL_INVALID');
  }
}
function assertTimeWindow(approvedAt: string, expiresAt: string, now: string): void {
  const approved = Date.parse(approvedAt); const expires = Date.parse(expiresAt); const current = Date.parse(now);
  if (![approved, expires, current].every(Number.isFinite) || expires <= approved
    || expires - approved > AUTHORIZATION_WINDOW_MS || current < approved || current > expires) {
    throw new Error('STAGE25_ROUTE_PAID_AUTHORIZATION_EXPIRED');
  }
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
