import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeRouteV2R }
  from './provider-native-tool-codecs-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import {
  assertSealedHoldoutCohortManifestV2R,
  type SealedHoldoutCohortManifestV2R,
} from './sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutCredentialPreflightReceiptV2R,
  buildSealedHoldoutBenchmarkRoutesV2R,
  SEALED_HOLDOUT_HANDOFF_ARMS_V2R,
  SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R,
  type SealedHoldoutCredentialPreflightReceiptV2R,
} from './sealed-holdout-credential-preflight-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_PAID_DISPATCH_AUTHORIZATION_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_PAID_DISPATCH_AUTHORIZATION_V2R_1' as const;
export const SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R = deepFreezeV1({
  version: 'EDITRON_OE_COMPLETE_ZERO_INFERENCE_GATE_V2R_1',
  commitSha: '051f7be27f32743154c4712a9c08bf03ea8d851f',
  testPath: 'tests/editron/sealed-holdout-complete-zero-inference-v2r.test.ts',
  testSourceSha256: '83b6d02c9a0a44fd1bf0fc8a588cea8b182e6a45b700518c0c91e1fe98757ae6',
  passedTestFiles: 10,
  passedTests: 34,
  externalNetworkCalls: 0,
  externalInferenceCalls: 0,
  realProjectMutations: 0,
} as const);

const MAX_AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_COHORT_SPEND_MICRO_USD = 300_000_000;
const MAX_ROW_SPEND_MICRO_USD = 10_000_000;

export interface SealedHoldoutPaidDispatchApprovalV2R {
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  confirmedCredentialPreflightReceiptSha256: string;
  confirmedRequestCaptureSetSha256: string;
  zeroInferenceGate: typeof SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R;
  maxSpendMicroUsdPerRow: number;
  absoluteMaxCohortSpendMicroUsd: number;
}

export interface SealedHoldoutPaidDispatchAuthorizationV2R {
  version: typeof SEALED_HOLDOUT_PAID_DISPATCH_AUTHORIZATION_VERSION_V2R;
  authority: 'RESEARCH_PAID_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY';
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  manifestSha256: string;
  cap2CurrentTruthManifestSha256: string;
  credentialPreflightReceiptSha256: string;
  requestCaptureSetSha256: string;
  zeroInferenceGate: typeof SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R;
  caseIds: readonly string[];
  routes: readonly Readonly<ProviderNativeRouteV2R & { routeSha256: string }>[];
  handoffModes: readonly ProviderNativeArgumentHandoffModeV2R[];
  limits: Readonly<{
    authorizedRows: number;
    authorizedProviderTurns: number;
    authorizedGoogleCountTokensCalls: number;
    maxInputTokensPerTurn: number;
    maxSpendMicroUsdPerRow: number;
    absoluteMaxCohortSpendMicroUsd: number;
  }>;
  networkPolicy: 'MODEL_INFERENCE_AND_GOOGLE_COUNT_TOKENS_ONLY';
  projectReadsAuthorized: 0;
  projectMutationsAuthorized: 0;
  assessment: 'AUTHORIZED_SEALED_RESEARCH_PROVIDER_DISPATCH';
  stateEffects: readonly [];
  authorizationSha256: string;
}

export function issueSealedHoldoutPaidDispatchAuthorizationV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  credentialPreflight: Readonly<SealedHoldoutCredentialPreflightReceiptV2R>;
  approval: Readonly<SealedHoldoutPaidDispatchApprovalV2R>;
}): Readonly<SealedHoldoutPaidDispatchAuthorizationV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const credentialPreflight = assertSealedHoldoutCredentialPreflightReceiptV2R(
    input.credentialPreflight,
  );
  assertApproval(manifest, credentialPreflight, input.approval);
  const caseIds = manifest.cases.map(({ caseId }) => caseId);
  const routes = buildSealedHoldoutBenchmarkRoutesV2R().map((route) => ({
    ...route,
    routeSha256: hashCanonicalJsonV1(route),
  }));
  const turnsPerRouteArm = manifest.cases.reduce((sum, taskCase) => {
    const maxNodes = positiveInteger(
      record(taskCase.publicCase.resourceBudget).maxNodes,
      'SEALED_PAID_DISPATCH_MAX_NODES_INVALID',
    );
    return sum + Math.min(32, maxNodes + 3);
  }, 0);
  const authorizedRows = caseIds.length * routes.length * SEALED_HOLDOUT_HANDOFF_ARMS_V2R.length;
  const material = {
    version: SEALED_HOLDOUT_PAID_DISPATCH_AUTHORIZATION_VERSION_V2R,
    authority: 'RESEARCH_PAID_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY' as const,
    operatorId: input.approval.operatorId,
    approvedAt: input.approval.approvedAt,
    expiresAt: input.approval.expiresAt,
    manifestSha256: manifest.manifestSha256,
    cap2CurrentTruthManifestSha256: text(record(manifest.cap2CurrentTruthBinding).manifestSha256),
    credentialPreflightReceiptSha256: credentialPreflight.receiptSha256,
    requestCaptureSetSha256: credentialPreflight.requestCaptureSetSha256,
    zeroInferenceGate: SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
    caseIds,
    routes,
    handoffModes: SEALED_HOLDOUT_HANDOFF_ARMS_V2R,
    limits: {
      authorizedRows,
      authorizedProviderTurns: turnsPerRouteArm * routes.length
        * SEALED_HOLDOUT_HANDOFF_ARMS_V2R.length,
      authorizedGoogleCountTokensCalls: turnsPerRouteArm
        * SEALED_HOLDOUT_HANDOFF_ARMS_V2R.length,
      maxInputTokensPerTurn: SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R,
      maxSpendMicroUsdPerRow: input.approval.maxSpendMicroUsdPerRow,
      absoluteMaxCohortSpendMicroUsd: input.approval.absoluteMaxCohortSpendMicroUsd,
    },
    networkPolicy: 'MODEL_INFERENCE_AND_GOOGLE_COUNT_TOKENS_ONLY' as const,
    projectReadsAuthorized: 0 as const,
    projectMutationsAuthorized: 0 as const,
    assessment: 'AUTHORIZED_SEALED_RESEARCH_PROVIDER_DISPATCH' as const,
    stateEffects: [] as const,
  };
  return assertSealedHoldoutPaidDispatchAuthorizationV2R({
    manifest,
    credentialPreflight,
    authorization: {
      ...material,
      authorizationSha256: hashCanonicalJsonV1(material),
    },
    now: input.approval.approvedAt,
  });
}

export function assertSealedHoldoutPaidDispatchAuthorizationV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  credentialPreflight: Readonly<SealedHoldoutCredentialPreflightReceiptV2R>;
  authorization: unknown;
  now?: string;
}): Readonly<SealedHoldoutPaidDispatchAuthorizationV2R> {
  const manifest = assertSealedHoldoutCohortManifestV2R(input.manifest);
  const credentialPreflight = assertSealedHoldoutCredentialPreflightReceiptV2R(
    input.credentialPreflight,
  );
  if (!isRecord(input.authorization)) fail('SEALED_PAID_DISPATCH_AUTHORIZATION_MISSING');
  const candidate = input.authorization as unknown as SealedHoldoutPaidDispatchAuthorizationV2R;
  const { authorizationSha256, ...material } = candidate;
  const expectedCases = manifest.cases.map(({ caseId }) => caseId);
  const expectedRoutes = buildSealedHoldoutBenchmarkRoutesV2R().map((route) => ({
    ...route,
    routeSha256: hashCanonicalJsonV1(route),
  }));
  const limits = record(candidate.limits);
  const expectedTurnsPerRouteArm = manifest.cases.reduce((sum, taskCase) => (
    sum + Math.min(32, positiveInteger(
      record(taskCase.publicCase.resourceBudget).maxNodes,
      'SEALED_PAID_DISPATCH_MAX_NODES_INVALID',
    ) + 3)
  ), 0);
  const expectedRows = expectedCases.length * expectedRoutes.length
    * SEALED_HOLDOUT_HANDOFF_ARMS_V2R.length;
  assertTimeWindow(candidate.approvedAt, candidate.expiresAt, input.now ?? new Date().toISOString());
  if (candidate.version !== SEALED_HOLDOUT_PAID_DISPATCH_AUTHORIZATION_VERSION_V2R
    || candidate.authority !== 'RESEARCH_PAID_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY'
    || !/^[A-Za-z0-9._-]{1,128}$/.test(candidate.operatorId)
    || candidate.manifestSha256 !== manifest.manifestSha256
    || candidate.cap2CurrentTruthManifestSha256
      !== text(record(manifest.cap2CurrentTruthBinding).manifestSha256)
    || candidate.credentialPreflightReceiptSha256 !== credentialPreflight.receiptSha256
    || candidate.requestCaptureSetSha256 !== credentialPreflight.requestCaptureSetSha256
    || credentialPreflight.manifestSha256 !== manifest.manifestSha256
    || credentialPreflight.cap2CurrentTruthManifestSha256
      !== text(record(manifest.cap2CurrentTruthBinding).manifestSha256)
    || hashCanonicalJsonV1(candidate.zeroInferenceGate)
      !== hashCanonicalJsonV1(SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R)
    || !sameJson(candidate.caseIds, expectedCases)
    || !sameJson(candidate.routes, expectedRoutes)
    || !sameJson(candidate.handoffModes, SEALED_HOLDOUT_HANDOFF_ARMS_V2R)
    || limits.authorizedRows !== expectedRows
    || limits.authorizedProviderTurns !== expectedTurnsPerRouteArm
      * expectedRoutes.length * SEALED_HOLDOUT_HANDOFF_ARMS_V2R.length
    || limits.authorizedGoogleCountTokensCalls !== expectedTurnsPerRouteArm
      * SEALED_HOLDOUT_HANDOFF_ARMS_V2R.length
    || limits.maxInputTokensPerTurn !== SEALED_HOLDOUT_INITIAL_INPUT_TOKEN_LIMIT_V2R
    || !validSpendLimits(limits, expectedRows)
    || candidate.networkPolicy !== 'MODEL_INFERENCE_AND_GOOGLE_COUNT_TOKENS_ONLY'
    || candidate.projectReadsAuthorized !== 0 || candidate.projectMutationsAuthorized !== 0
    || candidate.assessment !== 'AUTHORIZED_SEALED_RESEARCH_PROVIDER_DISPATCH'
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length !== 0
    || authorizationSha256 !== hashCanonicalJsonV1(material)) {
    fail('SEALED_PAID_DISPATCH_AUTHORIZATION_INVALID');
  }
  return deepFreezeV1(structuredClone(candidate));
}

function assertApproval(
  manifest: Readonly<SealedHoldoutCohortManifestV2R>,
  credential: Readonly<SealedHoldoutCredentialPreflightReceiptV2R>,
  approval: Readonly<SealedHoldoutPaidDispatchApprovalV2R>,
): void {
  assertTimeWindow(approval.approvedAt, approval.expiresAt, approval.approvedAt);
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(approval.operatorId)
    || approval.confirmedCredentialPreflightReceiptSha256 !== credential.receiptSha256
    || approval.confirmedRequestCaptureSetSha256 !== credential.requestCaptureSetSha256
    || credential.manifestSha256 !== manifest.manifestSha256
    || hashCanonicalJsonV1(approval.zeroInferenceGate)
      !== hashCanonicalJsonV1(SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R)
    || !validSpendLimits({
      maxSpendMicroUsdPerRow: approval.maxSpendMicroUsdPerRow,
      absoluteMaxCohortSpendMicroUsd: approval.absoluteMaxCohortSpendMicroUsd,
    }, manifest.cases.length * buildSealedHoldoutBenchmarkRoutesV2R().length
      * SEALED_HOLDOUT_HANDOFF_ARMS_V2R.length)) {
    fail('SEALED_PAID_DISPATCH_APPROVAL_INVALID');
  }
}

function assertTimeWindow(approvedAt: string, expiresAt: string, now: string): void {
  const approved = Date.parse(approvedAt);
  const expires = Date.parse(expiresAt);
  const current = Date.parse(now);
  if (![approved, expires, current].every(Number.isFinite)
    || expires <= approved || expires - approved > MAX_AUTHORIZATION_WINDOW_MS
    || current < approved || current > expires) {
    fail('SEALED_PAID_DISPATCH_AUTHORIZATION_EXPIRED_OR_INVALID');
  }
}

function validSpendLimits(limits: Readonly<JsonRecord>, expectedRows: number): boolean {
  const row = Number(limits.maxSpendMicroUsdPerRow);
  const cohort = Number(limits.absoluteMaxCohortSpendMicroUsd);
  return Number.isSafeInteger(row) && row > 0 && row <= MAX_ROW_SPEND_MICRO_USD
    && Number.isSafeInteger(cohort) && cohort >= row
    && cohort <= MAX_COHORT_SPEND_MICRO_USD && cohort <= row * expectedRows;
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(code);
  return Number(value);
}
function sameJson(left: unknown, right: unknown): boolean {
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never { throw new Error(code); }
