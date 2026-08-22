import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertSealedHoldoutCohortManifestV3R2,
  type SealedHoldoutCohortManifestV3R2,
} from './sealed-holdout-cohort-v3r2';
import {
  assertSealedHoldoutGeneralisationManifestV4R,
  type SealedHoldoutGeneralisationManifestV4R,
} from './sealed-holdout-generalisation-cohort-v4r';
import {
  assertSealedHoldoutGeneralisationPreflightReceiptV4R,
  SEALED_HOLDOUT_GENERALISATION_INPUT_TOKEN_LIMIT_V4R,
  type SealedHoldoutGeneralisationPreflightReceiptV4R,
} from './sealed-holdout-generalisation-preflight-v4r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_GENERALISATION_PAID_AUTHORIZATION_VERSION_V4R =
  'EDITRON_OE_STAGE25_GENERALISATION_PAID_AUTHORIZATION_V4R_1' as const;
export const SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R = deepFreezeV1({
  version: 'EDITRON_OE_STAGE25_GENERALISATION_ZERO_INFERENCE_GATE_V4R_1',
  commitSha: '100bed4aca50d2b476443634e45dd67d6b823e63',
  testPath: 'tests/editron/sealed-holdout-generalisation-preflight-v4r.test.ts',
  testSourceSha256: 'c2d7b1e095f4e5efbcc36c21c07ffb980ecd90441b5aaf72a7671d0b44e617ce',
  passedTestFiles: 2,
  passedTests: 7,
  externalNetworkCalls: 0,
  externalInferenceCalls: 0,
  realProjectReads: 0,
  realProjectMutations: 0,
} as const);

const MAX_AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_ROW_SPEND_MICRO_USD = 10_000_000;
const MAX_COHORT_SPEND_MICRO_USD = 300_000_000;

export interface SealedHoldoutGeneralisationPaidApprovalV4R {
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  confirmedGeneralisationManifestSha256: string;
  confirmedPreflightReceiptSha256: string;
  confirmedRequestCaptureSetSha256: string;
  zeroInferenceGate: typeof SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R;
  maxSpendMicroUsdPerRow: number;
  absoluteMaxCohortSpendMicroUsd: number;
}

export interface SealedHoldoutGeneralisationPaidAuthorizationV4R {
  version: typeof SEALED_HOLDOUT_GENERALISATION_PAID_AUTHORIZATION_VERSION_V4R;
  authority: 'RESEARCH_V4R_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  generalisationManifestSha256: string;
  baseManifestSha256: string;
  cap2CurrentTruthManifestSha256: string;
  rowSetSha256: string;
  routeSetSha256: string;
  preflightReceiptSha256: string;
  requestCaptureSetSha256: string;
  zeroInferenceGate: typeof SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R;
  authorizedRows: readonly Readonly<JsonRecord>[];
  authorizedRowsSha256: string;
  limits: Readonly<{
    authorizedRows: 45;
    authorizedProviderTurns: number;
    authorizedGoogleCountTokensCalls: number;
    maxInputTokensPerTurn: number;
    maxSpendMicroUsdPerRow: number;
    absoluteMaxCohortSpendMicroUsd: number;
  }>;
  networkPolicy: 'MODEL_INFERENCE_AND_GOOGLE_COUNT_TOKENS_ONLY';
  projectReadsAuthorized: 0;
  projectMutationsAuthorized: 0;
  assessment: 'AUTHORIZED_CURRENT_V4R_RESEARCH_PROVIDER_DISPATCH';
  stateEffects: readonly [];
  authorizationSha256: string;
}

export function issueSealedHoldoutGeneralisationPaidAuthorizationV4R(input: Readonly<{
  generalisationManifest: Readonly<SealedHoldoutGeneralisationManifestV4R>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  preflight: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>;
  approval: Readonly<SealedHoldoutGeneralisationPaidApprovalV4R>;
}>): Readonly<SealedHoldoutGeneralisationPaidAuthorizationV4R> {
  const manifest = assertSealedHoldoutGeneralisationManifestV4R(input.generalisationManifest);
  const base = assertBase(manifest, input.baseManifest);
  const preflight = assertSealedHoldoutGeneralisationPreflightReceiptV4R({
    manifest,
    value: input.preflight,
  });
  assertApproval(manifest, preflight, input.approval);
  const authorizedRows = buildAuthorizedRows(manifest, base,
    input.approval.maxSpendMicroUsdPerRow);
  const material = {
    version: SEALED_HOLDOUT_GENERALISATION_PAID_AUTHORIZATION_VERSION_V4R,
    authority: 'RESEARCH_V4R_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    operatorId: input.approval.operatorId,
    approvedAt: input.approval.approvedAt,
    expiresAt: input.approval.expiresAt,
    generalisationManifestSha256: manifest.manifestSha256,
    baseManifestSha256: base.manifestSha256,
    cap2CurrentTruthManifestSha256: text(record(manifest.cap2CurrentTruthBinding).manifestSha256),
    rowSetSha256: manifest.rowSetSha256,
    routeSetSha256: manifest.routeSetSha256,
    preflightReceiptSha256: preflight.receiptSha256,
    requestCaptureSetSha256: preflight.requestCaptureSetSha256,
    zeroInferenceGate: SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
    authorizedRows,
    authorizedRowsSha256: hashCanonicalJsonV1(authorizedRows),
    limits: {
      authorizedRows: 45 as const,
      authorizedProviderTurns: sum(authorizedRows, 'maximumProviderTurns'),
      authorizedGoogleCountTokensCalls: sum(authorizedRows, 'maximumGoogleCountTokensCalls'),
      maxInputTokensPerTurn: SEALED_HOLDOUT_GENERALISATION_INPUT_TOKEN_LIMIT_V4R,
      maxSpendMicroUsdPerRow: input.approval.maxSpendMicroUsdPerRow,
      absoluteMaxCohortSpendMicroUsd: input.approval.absoluteMaxCohortSpendMicroUsd,
    },
    networkPolicy: 'MODEL_INFERENCE_AND_GOOGLE_COUNT_TOKENS_ONLY' as const,
    projectReadsAuthorized: 0 as const,
    projectMutationsAuthorized: 0 as const,
    assessment: 'AUTHORIZED_CURRENT_V4R_RESEARCH_PROVIDER_DISPATCH' as const,
    stateEffects: [] as const,
  };
  return assertSealedHoldoutGeneralisationPaidAuthorizationV4R({
    generalisationManifest: manifest,
    baseManifest: base,
    preflight,
    authorization: { ...material, authorizationSha256: hashCanonicalJsonV1(material) },
    now: input.approval.approvedAt,
  });
}

export function assertSealedHoldoutGeneralisationPaidAuthorizationV4R(input: Readonly<{
  generalisationManifest: Readonly<SealedHoldoutGeneralisationManifestV4R>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  preflight: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>;
  authorization: unknown;
  now?: string;
}>): Readonly<SealedHoldoutGeneralisationPaidAuthorizationV4R> {
  const manifest = assertSealedHoldoutGeneralisationManifestV4R(input.generalisationManifest);
  const base = assertBase(manifest, input.baseManifest);
  const preflight = assertSealedHoldoutGeneralisationPreflightReceiptV4R({
    manifest,
    value: input.preflight,
  });
  if (!isRecord(input.authorization)) fail('SEALED_V4R_PAID_AUTHORIZATION_MISSING');
  const candidate = input.authorization as unknown as
    SealedHoldoutGeneralisationPaidAuthorizationV4R;
  const { authorizationSha256, ...material } = candidate;
  const expectedRows = buildAuthorizedRows(manifest, base,
    Number(record(candidate.limits).maxSpendMicroUsdPerRow));
  const limits = record(candidate.limits);
  assertTimeWindow(candidate.approvedAt, candidate.expiresAt,
    input.now ?? new Date().toISOString());
  if (candidate.version !== SEALED_HOLDOUT_GENERALISATION_PAID_AUTHORIZATION_VERSION_V4R
    || candidate.authority !== 'RESEARCH_V4R_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY'
    || !/^[A-Za-z0-9._-]{1,128}$/.test(candidate.operatorId)
    || candidate.generalisationManifestSha256 !== manifest.manifestSha256
    || candidate.baseManifestSha256 !== base.manifestSha256
    || candidate.cap2CurrentTruthManifestSha256
      !== text(record(manifest.cap2CurrentTruthBinding).manifestSha256)
    || candidate.rowSetSha256 !== manifest.rowSetSha256
    || candidate.routeSetSha256 !== manifest.routeSetSha256
    || candidate.preflightReceiptSha256 !== preflight.receiptSha256
    || candidate.requestCaptureSetSha256 !== preflight.requestCaptureSetSha256
    || !same(candidate.zeroInferenceGate,
      SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R)
    || !same(candidate.authorizedRows, expectedRows)
    || candidate.authorizedRowsSha256 !== hashCanonicalJsonV1(expectedRows)
    || limits.authorizedRows !== 45
    || limits.authorizedProviderTurns !== sum(expectedRows, 'maximumProviderTurns')
    || limits.authorizedGoogleCountTokensCalls
      !== sum(expectedRows, 'maximumGoogleCountTokensCalls')
    || limits.maxInputTokensPerTurn !== SEALED_HOLDOUT_GENERALISATION_INPUT_TOKEN_LIMIT_V4R
    || !validSpendLimits(limits, 45)
    || candidate.networkPolicy !== 'MODEL_INFERENCE_AND_GOOGLE_COUNT_TOKENS_ONLY'
    || candidate.projectReadsAuthorized !== 0 || candidate.projectMutationsAuthorized !== 0
    || candidate.assessment !== 'AUTHORIZED_CURRENT_V4R_RESEARCH_PROVIDER_DISPATCH'
    || candidate.stateEffects.length !== 0
    || authorizationSha256 !== hashCanonicalJsonV1(material)) {
    fail('SEALED_V4R_PAID_AUTHORIZATION_INVALID');
  }
  return deepFreezeV1(structuredClone(candidate));
}

function buildAuthorizedRows(manifest: Readonly<SealedHoldoutGeneralisationManifestV4R>,
  base: Readonly<SealedHoldoutCohortManifestV3R2>, rowSpendMicroUsd: number) {
  if (!Number.isSafeInteger(rowSpendMicroUsd) || rowSpendMicroUsd < 1
    || rowSpendMicroUsd > MAX_ROW_SPEND_MICRO_USD) {
    fail('SEALED_V4R_ROW_SPEND_LIMIT_INVALID');
  }
  return manifest.rows.map((row) => {
    const taskCase = base.cases.find(({ caseId }) => caseId === text(row.caseId))
      ?? fail(`SEALED_V4R_AUTH_CASE_MISSING:${text(row.caseId)}`);
    const budget = record(taskCase.publicCase.resourceBudget);
    const maximumProviderTurns = Math.min(32, positiveInteger(budget.maxNodes) + 3);
    const route = record(row.route);
    const material = {
      rowId: text(row.rowId),
      rowPlanSha256: text(row.rowPlanSha256),
      caseId: text(row.caseId),
      publicCaseSha256: taskCase.publicCaseSha256,
      routeId: text(route.routeId),
      routeSha256: text(row.routeSha256),
      handoffMode: text(row.handoffMode),
      orderId: text(row.orderId),
      operatorOrderSha256: text(row.operatorOrderSha256),
      maximumProviderTurns,
      maximumGoogleCountTokensCalls: route.provider === 'google' ? maximumProviderTurns : 0,
      maxCumulativeOutputTokens: positiveInteger(budget.maxOutputTokens),
      absoluteMaxRowSpendMicroUsd: rowSpendMicroUsd,
    };
    return deepFreezeV1({ ...material, rowAuthorizationSha256: hashCanonicalJsonV1(material) });
  });
}

function assertApproval(manifest: Readonly<SealedHoldoutGeneralisationManifestV4R>,
  preflight: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>,
  approval: Readonly<SealedHoldoutGeneralisationPaidApprovalV4R>) {
  assertTimeWindow(approval.approvedAt, approval.expiresAt, approval.approvedAt);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(approval.operatorId)
    || approval.confirmedGeneralisationManifestSha256 !== manifest.manifestSha256
    || approval.confirmedPreflightReceiptSha256 !== preflight.receiptSha256
    || approval.confirmedRequestCaptureSetSha256 !== preflight.requestCaptureSetSha256
    || !same(approval.zeroInferenceGate,
      SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R)
    || !validSpendLimits(approval as unknown as JsonRecord, 45)) {
    fail('SEALED_V4R_PAID_APPROVAL_INVALID');
  }
}

function assertBase(manifest: Readonly<SealedHoldoutGeneralisationManifestV4R>,
  value: Readonly<SealedHoldoutCohortManifestV3R2>) {
  const base = assertSealedHoldoutCohortManifestV3R2(value);
  if (text(record(manifest.baseCohortIdentity).manifestSha256) !== base.manifestSha256) {
    fail('SEALED_V4R_PAID_BASE_BINDING_INVALID');
  }
  return base;
}
function assertTimeWindow(approvedAt: string, expiresAt: string, now: string): void {
  const approved = Date.parse(approvedAt);
  const expires = Date.parse(expiresAt);
  const current = Date.parse(now);
  if (![approved, expires, current].every(Number.isFinite) || expires <= approved
    || expires - approved > MAX_AUTHORIZATION_WINDOW_MS
    || current < approved || current > expires) {
    fail('SEALED_V4R_PAID_AUTHORIZATION_EXPIRED_OR_INVALID');
  }
}
function validSpendLimits(value: Readonly<JsonRecord>, rowCount: number): boolean {
  const row = Number(value.maxSpendMicroUsdPerRow);
  const cohort = Number(value.absoluteMaxCohortSpendMicroUsd);
  return Number.isSafeInteger(row) && row > 0 && row <= MAX_ROW_SPEND_MICRO_USD
    && Number.isSafeInteger(cohort) && cohort >= row
    && cohort <= MAX_COHORT_SPEND_MICRO_USD && cohort <= row * rowCount;
}
function sum(rows: readonly Readonly<JsonRecord>[], field: string): number {
  return rows.reduce((total, row) => total + positiveInteger(row[field], true), 0);
}
function positiveInteger(value: unknown, allowZero = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1)) {
    fail('SEALED_V4R_PAID_INTEGER_INVALID');
  }
  return Number(value);
}
function same(left: unknown, right: unknown): boolean {
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never { throw new Error(code); }
