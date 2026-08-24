import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeRouteV2R, SerializedProviderNativeTurnV2R }
  from './provider-native-tool-codecs-v2r';
import { buildSealedHoldoutBenchmarkRoutesV2R }
  from './sealed-holdout-credential-preflight-v2r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from './provider-native-result-references-v2r';
import type { SealedHoldoutCohortManifestV2R }
  from './sealed-holdout-cohort-v2r';
import type { SealedHoldoutGeneralisationManifestV4R3 }
  from './sealed-holdout-generalisation-cohort-v4r3';
import type { SealedHoldoutPilotAuthorizedRowV4R3 }
  from './sealed-holdout-pilot-authorization-v4r3';
import type { SealedHoldoutPilotPortResultV4R3 }
  from './sealed-holdout-pilot-runner-v4r3';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3 =
  'EDITRON_OE_SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_V4R3_1' as const;
export const SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_PATH_V4R3 =
  'lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-adapter-v4r3.ts' as const;
export const PILOT_INPUT_TOKEN_BOUND_VERSION_V4R3 =
  'EDITRON_OE_V4R3_PILOT_LOCAL_UTF8_UPPER_BOUND_V1' as const;
export const PILOT_MAX_INPUT_TOKENS_PER_TURN_V4R3 = 500_000;
const INPUT_TOKEN_FRAMING_MARGIN = 16_384;

export interface SealedHoldoutPilotAttemptIntentV4R3 {
  version: typeof SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3;
  authority: 'WRITE_AHEAD_ONE_PROVIDER_ATTEMPT_NO_RETRY';
  rowId: string;
  routeId: string;
  manifestSha256: string;
  authorizationSha256: string;
  rowAuthorizationSha256: string;
  requestSha256: string;
  attemptedAt: string;
  maximumProviderAttempts: 1;
  automaticRetry: false;
  stateEffects: readonly [];
  intentSha256: string;
}

export interface SealedHoldoutPilotLiveAuditReceiptV4R3 {
  version: typeof SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3;
  authority: 'RAW_NON_SCORED_PROVIDER_PILOT_NO_PROJECT_OR_MEDIA_AUTHORITY';
  intentSha256: string;
  portResult: Readonly<SealedHoldoutPilotPortResultV4R3>;
  providerEpisode: Readonly<JsonRecord>;
  transportReceipt: Readonly<JsonRecord>;
  accounting: Readonly<JsonRecord>;
  projectReads: 0;
  projectMutations: 0;
  mediaWrites: 0;
  secretsPersisted: false;
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface SealedHoldoutPilotLiveAuditOwnerV4R3 {
  commitAttemptIntent(
    intent: Readonly<SealedHoldoutPilotAttemptIntentV4R3>,
  ): void | Promise<void>;
  commitCompletedAttempt(
    receipt: Readonly<SealedHoldoutPilotLiveAuditReceiptV4R3>,
  ): void | Promise<void>;
}

export interface ResolvedSealedHoldoutPilotRowV4R3 {
  plan: Readonly<JsonRecord>;
  route: Readonly<ProviderNativeRouteV2R>;
  caseId: string;
  operatorOrder: readonly string[];
  handoffMode: ProviderNativeArgumentHandoffModeV2R;
  maximumCandidates: number;
}

export function resolveSealedHoldoutPilotRowV4R3(input: Readonly<{
  manifest: Readonly<SealedHoldoutGeneralisationManifestV4R3>;
  baseManifest: Readonly<SealedHoldoutCohortManifestV2R>;
  row: Readonly<SealedHoldoutPilotAuthorizedRowV4R3>;
}>): Readonly<ResolvedSealedHoldoutPilotRowV4R3> {
  const plan = input.manifest.pilotRows.find(
    (candidate) => candidate.rowId === input.row.rowId,
  ) ?? fail('ROW_NOT_IN_MANIFEST');
  const { rowPlanSha256, ...material } = plan;
  if (rowPlanSha256 !== hashCanonicalJsonV1(material)
    || rowPlanSha256 !== input.row.rowPlanSha256 || plan.stage !== 'PILOT') {
    fail('ROW_PLAN_DRIFT');
  }
  const route = buildSealedHoldoutBenchmarkRoutesV2R().find(
    (candidate) => candidate.routeId === input.row.routeId,
  ) ?? fail('ROUTE_MISSING');
  if (hashCanonicalJsonV1(route) !== hashCanonicalJsonV1(plan.route)
    || route.provider !== input.row.provider || route.model !== input.row.requestedModel
    || route.claimedModelIdentity !== input.row.confirmedReturnedModelIdentity) {
    fail('ROUTE_BINDING_DRIFT');
  }
  const caseId = requiredText(plan.caseId, 'CASE_ID_INVALID');
  const taskCase = input.baseManifest.cases.find((candidate) => candidate.caseId === caseId)
    ?? fail('CASE_MISSING');
  const maximumCandidates = Number(
    record(record(taskCase.publicCase).resourceBudget).maxCandidates,
  );
  if (!Number.isSafeInteger(maximumCandidates) || maximumCandidates < 1) {
    fail('MAX_CANDIDATES_INVALID');
  }
  return deepFreezeV1({
    plan, route, caseId,
    operatorOrder: stringArray(plan.operatorOrder, 'OPERATOR_ORDER_INVALID'),
    handoffMode: argumentHandoffMode(plan.handoffMode), maximumCandidates,
  });
}

export function localPilotInputTokenUpperBoundV4R3(
  request: Readonly<SerializedProviderNativeTurnV2R>,
): number {
  const bytes = new TextEncoder().encode(JSON.stringify({
    endpoint: request.endpoint, body: request.body,
  })).length;
  return Math.min(
    PILOT_MAX_INPUT_TOKENS_PER_TURN_V4R3,
    bytes + INPUT_TOKEN_FRAMING_MARGIN,
  );
}

export function buildSealedHoldoutPilotAttemptIntentV4R3(input: Readonly<{
  row: Readonly<SealedHoldoutPilotAuthorizedRowV4R3>;
  manifestSha256: string;
  authorizationSha256: string;
  request: Readonly<SerializedProviderNativeTurnV2R>;
  attemptedAt: string;
}>): Readonly<SealedHoldoutPilotAttemptIntentV4R3> {
  const material = {
    version: SEALED_HOLDOUT_PILOT_LIVE_ADAPTER_VERSION_V4R3,
    authority: 'WRITE_AHEAD_ONE_PROVIDER_ATTEMPT_NO_RETRY' as const,
    rowId: input.row.rowId, routeId: input.row.routeId,
    manifestSha256: input.manifestSha256,
    authorizationSha256: input.authorizationSha256,
    rowAuthorizationSha256: input.row.rowAuthorizationSha256,
    requestSha256: input.request.requestHash,
    attemptedAt: canonicalTime(input.attemptedAt),
    maximumProviderAttempts: 1 as const, automaticRetry: false as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, intentSha256: hashCanonicalJsonV1(material) });
}

export function buildSealedHoldoutPilotAccountingV4R3(input: Readonly<{
  turns: readonly Readonly<JsonRecord>[];
  call: Readonly<{
    requestHash: string; responseSha256: string; usage: Readonly<JsonRecord>;
  }>;
}>): Readonly<{ accountedCostNanoUsd: number; accountingReceiptSha256: string }> {
  const audits = input.turns.flatMap((turn) => Array.isArray(turn.runtimeGuardAudit)
    ? turn.runtimeGuardAudit.filter(isRecord) : []);
  const afterInvoke = audits.find((audit) => audit.phase === 'AFTER_INVOKE'
    && audit.status === 'ALLOW');
  const accountedCostNanoUsd = Number(afterInvoke?.actualCostNanoUsd);
  if (!Number.isSafeInteger(accountedCostNanoUsd) || accountedCostNanoUsd < 0) {
    fail('ACCOUNTING_RECEIPT_INVALID');
  }
  const material = {
    requestSha256: input.call.requestHash,
    responseSha256: input.call.responseSha256,
    providerUsageSha256: hashCanonicalJsonV1(input.call.usage),
    accountedCostNanoUsd,
    accountingBasis: 'PROVIDER_REPORTED_USAGE_X_FROZEN_ROUTE_PRICE' as const,
  };
  return deepFreezeV1({
    accountedCostNanoUsd,
    accountingReceiptSha256: hashCanonicalJsonV1(material),
  });
}

export function assertSealedHoldoutPilotNoSecretsV4R3(
  value: unknown,
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const serialized = JSON.stringify(value);
  for (const name of ['OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY',
    'GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    const secret = environment[name]?.trim();
    if (secret && serialized.includes(secret)) fail('SECRET_PERSISTENCE_DETECTED');
  }
}

function argumentHandoffMode(value: unknown): ProviderNativeArgumentHandoffModeV2R {
  if (value !== 'DIRECT_ARGUMENTS' && value !== 'OPAQUE_RESULT_REFERENCES') {
    fail('HANDOFF_MODE_INVALID');
  }
  return value;
}
function stringArray(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || !value.length
    || value.some((entry) => typeof entry !== 'string' || !entry)) fail(code);
  return value as string[];
}
function requiredText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value;
}
function canonicalTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('TIME_INVALID');
  return value;
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function fail(code: string): never {
  throw new Error(`SEALED_V4R3_PILOT_LIVE_ADAPTER_${code}`);
}
