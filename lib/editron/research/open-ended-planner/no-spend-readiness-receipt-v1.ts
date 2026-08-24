import {
  computeExecutableImportClosureV1,
  type ExecutableImportClosureReceiptV1,
} from '../../services/executable-import-closure-v1';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';
import {
  NO_SPEND_LAUNCHER_POLICY_V1,
  NO_SPEND_POST_RUN_AUDIT_POLICY_V1,
  assertNoSpendExecutableClosureV1,
  assertStageAgainstPilotPolicyV1,
  buildNoSpendAttemptAwareEvaluatorBindingV1,
  buildNoSpendFairnessLedgerV1,
  buildNoSpendPilotPolicyV1,
  buildNoSpendSentinelClaimSetV1,
  type NoSpendAttemptAwareEvaluatorBindingInputV1,
  type NoSpendAttemptAwareEvaluatorBindingV1,
  type NoSpendFairnessLedgerInputV1,
  type NoSpendFairnessLedgerReceiptV1,
  type NoSpendPilotPolicyInputV1,
  type NoSpendPilotPolicyV1,
  type NoSpendReadinessLaneV1,
  type NoSpendReadinessStageV1,
  type NoSpendSentinelClaimInputV1,
  type NoSpendSentinelClaimSetV1,
} from './no-spend-readiness-policy-v1';

export const NO_SPEND_READINESS_DRAFT_VERSION_V1 =
  'EDITRON_OE_NO_SPEND_READINESS_DRAFT_V1_1' as const;
export const NO_SPEND_READINESS_RECEIPT_VERSION_V1 =
  'EDITRON_OE_NO_SPEND_READINESS_RECEIPT_V1_1' as const;
export const NO_SPEND_READINESS_AUTHORITY_V1 = (
  'RESEARCH_HARNESS_READINESS_ONLY_NO_SPEND_NO_DISPATCH_NO_PROJECT_OR_MEDIA_AUTHORITY'
) as const;
export const NO_SPEND_READINESS_MAX_VALIDITY_MS_V1 = 15 * 60_000;

export interface NoSpendReadinessExecutableClosureInputV1 {
  rootDir?: string;
  roots: readonly string[];
  tsconfigPath?: string | null;
  vitestConfigPath?: string | null;
  configFiles?: readonly string[];
  resources?: readonly string[];
}

export interface NoSpendReadinessDraftInputV1 {
  lane: NoSpendReadinessLaneV1;
  stage: NoSpendReadinessStageV1;
  manifestSha256: string;
  zeroInferencePreflightReceiptSha256: string;
  fairness: Readonly<NoSpendFairnessLedgerInputV1>;
  sentinelClaims: readonly Readonly<NoSpendSentinelClaimInputV1>[];
  attemptAwareEvaluator: Readonly<NoSpendAttemptAwareEvaluatorBindingInputV1>;
  pilotPolicy: Readonly<NoSpendPilotPolicyInputV1>;
  executableClosure: Readonly<NoSpendReadinessExecutableClosureInputV1>;
  createdAt: string;
  expiresAt: string;
}

export interface NoSpendReadinessSubjectV1 {
  lane: NoSpendReadinessLaneV1;
  requestedStage: NoSpendReadinessStageV1;
  manifestSha256: string;
  zeroInferencePreflightReceiptSha256: string;
  requestCaptureSetSha256: string;
  providerRouteIdentitySetSha256: string;
  contemplatedRowSetSha256: string;
  maximumProviderAttempts: number;
  absoluteMaxSpendMicroUsd: number;
}

export interface NoSpendReadinessZeroAuthorityV1 {
  dispatchAuthorized: false;
  spendAuthorizedMicroUsd: 0;
  projectReadsAuthorized: 0;
  projectMutationsAuthorized: 0;
  mediaWritesAuthorized: 0;
  effects: Readonly<{
    providerInferenceCalls: 0;
    productProjectReads: 0;
    productProjectMutations: 0;
    mediaWrites: 0;
    secretsPersisted: false;
    stateEffects: readonly [];
  }>;
}

export interface NoSpendReadinessDraftV1 extends NoSpendReadinessZeroAuthorityV1 {
  version: typeof NO_SPEND_READINESS_DRAFT_VERSION_V1;
  authority: typeof NO_SPEND_READINESS_AUTHORITY_V1;
  subject: Readonly<NoSpendReadinessSubjectV1>;
  fairnessLedger: Readonly<NoSpendFairnessLedgerReceiptV1>;
  sentinelClaims: Readonly<NoSpendSentinelClaimSetV1>;
  attemptAwareEvaluator: Readonly<NoSpendAttemptAwareEvaluatorBindingV1>;
  executableClosure: Readonly<ExecutableImportClosureReceiptV1>;
  launcherPolicy: typeof NO_SPEND_LAUNCHER_POLICY_V1;
  launcherPolicySha256: string;
  pilotPolicy: Readonly<NoSpendPilotPolicyV1>;
  postRunAuditPolicy: typeof NO_SPEND_POST_RUN_AUDIT_POLICY_V1;
  postRunAuditPolicySha256: string;
  createdAt: string;
  expiresAt: string;
  assessment: 'PENDING_LANE_SENTINEL_RECOMPUTATION';
  draftSha256: string;
}

/**
 * Reserved final shape. Phase 4B1 intentionally exports no issuer or validator:
 * caller-supplied sentinel JSON cannot establish independent lane provenance.
 */
export interface NoSpendReadinessReceiptV1 extends NoSpendReadinessZeroAuthorityV1 {
  version: typeof NO_SPEND_READINESS_RECEIPT_VERSION_V1;
  authority: typeof NO_SPEND_READINESS_AUTHORITY_V1;
  draftSha256: string;
  independentLaneSentinelExecution: Readonly<{
    version: 'EDITRON_OE_INDEPENDENT_LANE_SENTINEL_EXECUTION_V1_1';
    laneAdapterId: string;
    laneAdapterSourceSha256: string;
    recomputedSentinelResultSetSha256: string;
    executionBindingSha256: string;
  }>;
  assessment:
    | 'READY_FOR_EXPLICIT_PILOT_SPEND_APPROVAL'
    | 'READY_FOR_EXPLICIT_COHORT_SPEND_APPROVAL';
  receiptSha256: string;
}

export type AssertNoSpendReadinessDraftExpectedV1 = Readonly<
  Omit<NoSpendReadinessDraftInputV1, 'createdAt' | 'expiresAt'> & {
    nowUnixMs: number;
  }
>;

export function issueNoSpendReadinessDraftV1(
  input: Readonly<NoSpendReadinessDraftInputV1>,
): Readonly<NoSpendReadinessDraftV1> {
  assertSha(input.manifestSha256, 'MANIFEST');
  assertSha(input.zeroInferencePreflightReceiptSha256, 'ZERO_INFERENCE_PREFLIGHT');
  assertTimestampWindow(input.createdAt, input.expiresAt);

  const fairnessLedger = buildNoSpendFairnessLedgerV1(input.lane, input.fairness);
  const sentinelClaims = buildNoSpendSentinelClaimSetV1(input.lane, input.sentinelClaims);
  const attemptAwareEvaluator = buildNoSpendAttemptAwareEvaluatorBindingV1(
    input.attemptAwareEvaluator,
    sentinelClaims.claimSetSha256,
  );
  const pilotPolicy = buildNoSpendPilotPolicyV1(input.pilotPolicy);
  const stage = assertStageAgainstPilotPolicyV1(input.stage, pilotPolicy);
  const executableClosure = computeExecutableImportClosureV1({
    ...input.executableClosure,
    mode: 'verification',
    strictGit: true,
  });
  assertNoSpendExecutableClosureV1(executableClosure);

  const subject = {
    lane: input.lane,
    requestedStage: input.stage,
    manifestSha256: input.manifestSha256,
    zeroInferencePreflightReceiptSha256: input.zeroInferencePreflightReceiptSha256,
    requestCaptureSetSha256: fairnessLedger.providerRequestCaptureSetSha256,
    providerRouteIdentitySetSha256:
      hashEditronCanonicalJsonV1(pilotPolicy.providerRouteIds),
    contemplatedRowSetSha256: stage.contemplatedRowSetSha256,
    maximumProviderAttempts: stage.maximumProviderAttempts,
    absoluteMaxSpendMicroUsd: stage.absoluteMaxSpendMicroUsd,
  };
  const material = {
    version: NO_SPEND_READINESS_DRAFT_VERSION_V1,
    authority: NO_SPEND_READINESS_AUTHORITY_V1,
    subject,
    fairnessLedger,
    sentinelClaims,
    attemptAwareEvaluator,
    executableClosure,
    launcherPolicy: NO_SPEND_LAUNCHER_POLICY_V1,
    launcherPolicySha256: hashEditronCanonicalJsonV1(NO_SPEND_LAUNCHER_POLICY_V1),
    pilotPolicy,
    postRunAuditPolicy: NO_SPEND_POST_RUN_AUDIT_POLICY_V1,
    postRunAuditPolicySha256: hashEditronCanonicalJsonV1(NO_SPEND_POST_RUN_AUDIT_POLICY_V1),
    effects: {
      providerInferenceCalls: 0 as const,
      productProjectReads: 0 as const,
      productProjectMutations: 0 as const,
      mediaWrites: 0 as const,
      secretsPersisted: false as const,
      stateEffects: [] as const,
    },
    dispatchAuthorized: false as const,
    spendAuthorizedMicroUsd: 0 as const,
    projectReadsAuthorized: 0 as const,
    projectMutationsAuthorized: 0 as const,
    mediaWritesAuthorized: 0 as const,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    assessment: 'PENDING_LANE_SENTINEL_RECOMPUTATION' as const,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    draftSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNoSpendReadinessDraftV1(
  value: unknown,
  expected: AssertNoSpendReadinessDraftExpectedV1,
): Readonly<NoSpendReadinessDraftV1> {
  if (!isRecord(value)) fail('DRAFT_MISSING');
  const createdAt = value.createdAt;
  const expiresAt = value.expiresAt;
  if (typeof createdAt !== 'string' || typeof expiresAt !== 'string') {
    fail('DRAFT_TIMESTAMP_MISSING');
  }
  assertTimestampFresh(createdAt, expiresAt, expected.nowUnixMs);
  const { nowUnixMs: _nowUnixMs, ...trustedInput } = expected;
  void _nowUnixMs;
  const rebuilt = issueNoSpendReadinessDraftV1({
    ...trustedInput,
    createdAt,
    expiresAt,
  });
  if (hashEditronCanonicalJsonV1(value) !== hashEditronCanonicalJsonV1(rebuilt)) {
    fail('DRAFT_FORGED_STALE_OR_EXPECTATION_DRIFT');
  }
  return rebuilt;
}

function assertTimestampWindow(createdAt: string, expiresAt: string): void {
  const createdAtMs = strictIsoTime(createdAt, 'CREATED_AT');
  const expiresAtMs = strictIsoTime(expiresAt, 'EXPIRES_AT');
  if (expiresAtMs <= createdAtMs
    || expiresAtMs - createdAtMs > NO_SPEND_READINESS_MAX_VALIDITY_MS_V1) {
    fail('DRAFT_VALIDITY_WINDOW_INVALID');
  }
}

function assertTimestampFresh(createdAt: string, expiresAt: string, nowUnixMs: number): void {
  if (!Number.isSafeInteger(nowUnixMs) || nowUnixMs < 0) fail('NOW_INVALID');
  assertTimestampWindow(createdAt, expiresAt);
  const createdAtMs = Date.parse(createdAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (createdAtMs > nowUnixMs + 60_000 || expiresAtMs <= nowUnixMs
    || createdAtMs < nowUnixMs - NO_SPEND_READINESS_MAX_VALIDITY_MS_V1) {
    fail('DRAFT_EXPIRED_OR_NOT_FRESH');
  }
}

function strictIsoTime(value: string, label: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return time;
}

function assertSha(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail(`${label}_SHA256_INVALID`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(code: string): never {
  throw new Error(`NO_SPEND_READINESS_RECEIPT_${code}`);
}
