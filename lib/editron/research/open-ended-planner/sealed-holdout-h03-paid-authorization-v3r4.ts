import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeNoSpendPreflightReceiptV2R }
  from './provider-native-cohort-manifest-v2r';
import {
  assertSealedH03ProviderCohortManifestV3R4,
  type SealedH03ProviderCohortManifestV3R4,
} from './sealed-holdout-h03-provider-cohort-v3r4';
import {
  SEALED_H03_PROVIDER_PREFLIGHT_VERSION_V3R4,
  type runSealedH03ProviderNoInferencePreflightV3R4,
} from './sealed-holdout-h03-provider-preflight-v3r4';

type JsonRecord = Record<string, unknown>;
type H03Preflight = Awaited<ReturnType<typeof runSealedH03ProviderNoInferencePreflightV3R4>>;

export const SEALED_H03_PAID_AUTHORIZATION_VERSION_V3R4 =
  'EDITRON_OE_SEALED_H03_PAID_AUTHORIZATION_V3R4_1' as const;
export const SEALED_H03_OPERATOR_PREFLIGHT_VERSION_V3R4 =
  'EDITRON_OE_SEALED_H03_PROVIDER_OPERATOR_PREFLIGHT_V3R4_1' as const;

export interface SealedH03SandboxEnvironmentV3R4 {
  snapshotId: string;
  snapshotCommit: string;
}
export interface SealedH03PaidAuthorizationV3R4 {
  version: typeof SEALED_H03_PAID_AUTHORIZATION_VERSION_V3R4;
  authority: 'BOUNDED_RESEARCH_PROVIDER_AND_SANDBOX_EXECUTION_NO_PROJECT_MUTATION';
  authorizationId: string;
  operatorId: string;
  approvedAt: string;
  expiresAt: string;
  manifestSha256: string;
  providerInfrastructureReceiptSha256: string;
  h03PreflightReceiptSha256: string;
  operatorPreflightReceiptSha256: string;
  executionCommitSha: string;
  runnerSourceSha256: string;
  sandboxEnvironment: Readonly<SealedH03SandboxEnvironmentV3R4>;
  authorizedRows: readonly Readonly<JsonRecord>[];
  limits: Readonly<{ authorizedRowCount: 18; maximumProviderHttpRequests: number;
    absoluteMaxSpendMicroUsd: 11_673_000 }>;
  projectReadsAuthorized: 0;
  projectMutationsAuthorized: 0;
  stateEffects: readonly [];
  authorizationSha256: string;
}

export function issueSealedH03PaidAuthorizationV3R4(input: Readonly<{
  manifest: Readonly<SealedH03ProviderCohortManifestV3R4>;
  providerInfrastructureReceipt: Readonly<ProviderNativeNoSpendPreflightReceiptV2R>;
  h03PreflightReceipt: Readonly<H03Preflight>;
  operatorPreflightReceipt: Readonly<JsonRecord>;
  approval: Readonly<{
    operatorId: string; approvedAt: string; expiresAt: string;
    confirmedManifestSha256: string;
    confirmedH03PreflightReceiptSha256: string;
    confirmedOperatorPreflightReceiptSha256: string;
    confirmedAbsoluteMaxSpendUsd: 11.673;
    executionCommitSha: string; runnerSourceSha256: string;
    sandboxEnvironment: Readonly<SealedH03SandboxEnvironmentV3R4>;
  }>;
  nowUnixMs?: number;
}>): Readonly<SealedH03PaidAuthorizationV3R4> {
  const manifest = assertSealedH03ProviderCohortManifestV3R4(input.manifest);
  const now = input.nowUnixMs ?? Date.now();
  assertPreflightChain(input, manifest, now);
  const approval = input.approval;
  const approvedAtMs = Date.parse(approval.approvedAt);
  const expiresAtMs = Date.parse(approval.expiresAt);
  if (!approval.operatorId.trim() || !Number.isFinite(approvedAtMs)
    || !Number.isFinite(expiresAtMs) || approvedAtMs > now + 60_000
    || approvedAtMs < now - 5 * 60_000 || expiresAtMs <= now + 5 * 60_000
    || expiresAtMs > approvedAtMs + 24 * 60 * 60_000
    || approval.operatorId.trim() !== input.operatorPreflightReceipt.operatorId
    || approval.confirmedManifestSha256 !== manifest.manifestSha256
    || approval.confirmedH03PreflightReceiptSha256 !== input.h03PreflightReceipt.receiptSha256
    || approval.confirmedOperatorPreflightReceiptSha256
      !== input.operatorPreflightReceipt.receiptSha256
    || approval.confirmedAbsoluteMaxSpendUsd !== 11.673
    || !/^[a-f0-9]{40}$/.test(approval.executionCommitSha)
    || !/^[a-f0-9]{64}$/.test(approval.runnerSourceSha256)
    || !isSandboxEnvironment(approval.sandboxEnvironment)) {
    fail('SEALED_H03_V3R4_PAID_AUTHORIZATION_APPROVAL_INVALID');
  }
  const authorizedRows = manifest.rows.map((row) => deepFreezeV1({
    rowId: row.rowId, routeId: row.routeId, armId: row.armId,
    repetition: row.repetition,
    maximumProviderHttpRequests: row.maximumProviderHttpRequests,
    absoluteMaxRowSpendUsd: row.absoluteMaxRowSpendUsd,
  }));
  const maximumProviderHttpRequests = authorizedRows.reduce(
    (sum, row) => sum + Number(row.maximumProviderHttpRequests), 0);
  if (authorizedRows.length !== 18 || maximumProviderHttpRequests !== 54
    || manifest.absoluteMaxSpendUsd !== 11.673) {
    fail('SEALED_H03_V3R4_PAID_AUTHORIZATION_LIMIT_DRIFT');
  }
  const material = {
    version: SEALED_H03_PAID_AUTHORIZATION_VERSION_V3R4,
    authority: 'BOUNDED_RESEARCH_PROVIDER_AND_SANDBOX_EXECUTION_NO_PROJECT_MUTATION' as const,
    authorizationId: `h03-v3r4-${approval.approvedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`,
    operatorId: approval.operatorId.trim(), approvedAt: approval.approvedAt,
    expiresAt: approval.expiresAt, manifestSha256: manifest.manifestSha256,
    providerInfrastructureReceiptSha256: input.providerInfrastructureReceipt.receiptSha256,
    h03PreflightReceiptSha256: input.h03PreflightReceipt.receiptSha256,
    operatorPreflightReceiptSha256: String(input.operatorPreflightReceipt.receiptSha256),
    executionCommitSha: approval.executionCommitSha,
    runnerSourceSha256: approval.runnerSourceSha256,
    sandboxEnvironment: approval.sandboxEnvironment,
    authorizedRows,
    limits: { authorizedRowCount: 18 as const, maximumProviderHttpRequests,
      absoluteMaxSpendMicroUsd: 11_673_000 as const },
    projectReadsAuthorized: 0 as const,
    projectMutationsAuthorized: 0 as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, authorizationSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedH03PaidAuthorizationV3R4(value: unknown, expected: Readonly<{
  manifest: Readonly<SealedH03ProviderCohortManifestV3R4>;
  executionCommitSha: string; runnerSourceSha256: string;
  sandboxEnvironment: Readonly<SealedH03SandboxEnvironmentV3R4>;
  nowUnixMs?: number;
}>): Readonly<SealedH03PaidAuthorizationV3R4> {
  if (!isRecord(value)) fail('SEALED_H03_V3R4_PAID_AUTHORIZATION_MISSING');
  const candidate = value as unknown as SealedH03PaidAuthorizationV3R4;
  const { authorizationSha256, ...material } = candidate;
  const manifest = assertSealedH03ProviderCohortManifestV3R4(expected.manifest);
  const rows = manifest.rows.map((row) => ({
    rowId: row.rowId, routeId: row.routeId, armId: row.armId,
    repetition: row.repetition, maximumProviderHttpRequests: row.maximumProviderHttpRequests,
    absoluteMaxRowSpendUsd: row.absoluteMaxRowSpendUsd,
  }));
  const now = expected.nowUnixMs ?? Date.now();
  if (candidate.version !== SEALED_H03_PAID_AUTHORIZATION_VERSION_V3R4
    || candidate.authority
      !== 'BOUNDED_RESEARCH_PROVIDER_AND_SANDBOX_EXECUTION_NO_PROJECT_MUTATION'
    || candidate.manifestSha256 !== manifest.manifestSha256
    || candidate.executionCommitSha !== expected.executionCommitSha
    || candidate.runnerSourceSha256 !== expected.runnerSourceSha256
    || !isSandboxEnvironment(candidate.sandboxEnvironment)
    || hashCanonicalJsonV1(candidate.sandboxEnvironment)
      !== hashCanonicalJsonV1(expected.sandboxEnvironment)
    || Date.parse(candidate.approvedAt) > now || Date.parse(candidate.expiresAt) <= now
    || candidate.authorizedRows.length !== 18
    || hashCanonicalJsonV1(candidate.authorizedRows) !== hashCanonicalJsonV1(rows)
    || candidate.limits.authorizedRowCount !== 18
    || candidate.limits.maximumProviderHttpRequests !== 54
    || candidate.limits.absoluteMaxSpendMicroUsd !== 11_673_000
    || candidate.projectReadsAuthorized !== 0 || candidate.projectMutationsAuthorized !== 0
    || candidate.stateEffects.length || authorizationSha256 !== hashCanonicalJsonV1(material)) {
    fail('SEALED_H03_V3R4_PAID_AUTHORIZATION_DRIFT');
  }
  return deepFreezeV1(candidate);
}

function assertPreflightChain(input: Readonly<{
  providerInfrastructureReceipt: Readonly<ProviderNativeNoSpendPreflightReceiptV2R>;
  h03PreflightReceipt: Readonly<H03Preflight>;
  operatorPreflightReceipt: Readonly<JsonRecord>;
}>, manifest: Readonly<SealedH03ProviderCohortManifestV3R4>, nowUnixMs: number): void {
  const infrastructure = input.providerInfrastructureReceipt;
  const { receiptSha256: infrastructureSha, ...infrastructureMaterial } = infrastructure;
  const h03 = input.h03PreflightReceipt;
  const { receiptSha256: h03Sha, ...h03Material } = h03;
  const operator = input.operatorPreflightReceipt;
  const { receiptSha256: operatorSha, ...operatorMaterial } = operator;
  const operatorCreatedAt = Date.parse(String(operator.createdAt ?? ''));
  if (infrastructure.infrastructureAssessment !== 'PASS'
    || infrastructure.dispatchAssessment !== 'PASS_READY'
    || infrastructure.networkCalls.inferenceCalls !== 0
    || infrastructure.secretsPersisted !== false || infrastructure.stateEffects.length
    || infrastructure.sandboxCredential.expiresAtUnixSeconds * 1_000 < nowUnixMs + 300_000
    || infrastructureSha !== hashCanonicalJsonV1(infrastructureMaterial)
    || h03.version !== SEALED_H03_PROVIDER_PREFLIGHT_VERSION_V3R4
    || h03.manifestSha256 !== manifest.manifestSha256
    || h03.providerInfrastructureReceiptSha256 !== infrastructureSha
    || h03.infrastructureAssessment !== 'PASS'
    || h03.dispatchAssessment !== 'PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION'
    || h03.plannedRowCount !== 18 || h03.absoluteMaxSpendUsd !== 11.673
    || h03.networkCalls.inferenceCalls !== 0 || h03.secretsPersisted !== false
    || h03.stateEffects.length || h03Sha !== hashCanonicalJsonV1(h03Material)
    || operator.version !== SEALED_H03_OPERATOR_PREFLIGHT_VERSION_V3R4
    || operator.manifestSha256 !== manifest.manifestSha256
    || operator.providerInfrastructureReceiptSha256 !== infrastructureSha
    || operator.h03PreflightReceiptSha256 !== h03Sha
    || operator.dispatchAuthorized !== false || operator.inferenceCalls !== 0
    || operator.projectReads !== 0 || operator.projectMutations !== 0
    || operator.absoluteMaxSpendUsd !== 11.673 || operator.secretsPersisted !== false
    || !Array.isArray(operator.stateEffects) || operator.stateEffects.length !== 0
    || !Number.isFinite(operatorCreatedAt) || operatorCreatedAt < nowUnixMs - 7_200_000
    || operatorSha !== hashCanonicalJsonV1(operatorMaterial)) {
    fail('SEALED_H03_V3R4_PAID_AUTHORIZATION_PREFLIGHT_CHAIN_INVALID');
  }
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isSandboxEnvironment(value: unknown): value is SealedH03SandboxEnvironmentV3R4 {
  return isRecord(value) && /^snap_[A-Za-z0-9]{20,64}$/.test(String(value.snapshotId ?? ''))
    && /^[a-f0-9]{40}$/.test(String(value.snapshotCommit ?? ''));
}
function fail(code: string): never { throw new Error(code); }
