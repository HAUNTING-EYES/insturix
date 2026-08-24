import type { ExecutableImportClosureReceiptV1 }
  from '../../services/executable-import-closure-v1';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';
import { assertNoSpendExecutableClosureV1 }
  from './no-spend-readiness-policy-v1';

export const NO_SPEND_LANE_INTEGRITY_RECEIPT_VERSION_V2 =
  'EDITRON_OE_NO_SPEND_LANE_INTEGRITY_RECEIPT_V2_1' as const;
export const NO_SPEND_LANE_INTEGRITY_AUTHORITY_V2 =
  'RESEARCH_INTEGRITY_ONLY_NO_SPEND_NO_DISPATCH_NO_PROJECT_OR_MEDIA_AUTHORITY' as const;

export type NoSpendLaneIntegrityIdV2 =
  | 'SEALED_HOLDOUT_GENERALISATION_V4R2'
  | 'STAGE25_LONG_FORM_PROVIDER_V3';

export interface NoSpendLaneIntegrityReceiptV2 {
  version: typeof NO_SPEND_LANE_INTEGRITY_RECEIPT_VERSION_V2;
  authority: typeof NO_SPEND_LANE_INTEGRITY_AUTHORITY_V2;
  lane: NoSpendLaneIntegrityIdV2;
  successorManifestSha256: string;
  sentinelExecution: Readonly<{
    receiptVersion: string;
    receiptSha256: string;
    claimSetSha256: string;
    sentinelCount: number;
    assessment: string;
  }>;
  executableClosure: Readonly<ExecutableImportClosureReceiptV1>;
  dispatchAuthorized: false;
  spendAuthorizedMicroUsd: 0;
  providerInferenceCalls: 0;
  networkCalls: 0;
  projectReads: 0;
  projectMutations: 0;
  mediaWrites: 0;
  secretsPersisted: false;
  stateEffects: readonly [];
  assessment: 'PASS_CURRENT_SOURCE_INTEGRITY_READY_FOR_ZERO_INFERENCE_RESCORE_ONLY';
  receiptSha256: string;
}

export function buildNoSpendLaneIntegrityReceiptV2(input: Readonly<{
  lane: NoSpendLaneIntegrityIdV2;
  successorManifestSha256: string;
  sentinelExecution: NoSpendLaneIntegrityReceiptV2['sentinelExecution'];
  executableClosure: Readonly<ExecutableImportClosureReceiptV1>;
  expectedRoots: readonly string[];
}>): Readonly<NoSpendLaneIntegrityReceiptV2> {
  assertSha(input.successorManifestSha256, 'MANIFEST');
  assertSha(input.sentinelExecution.receiptSha256, 'SENTINEL_RECEIPT');
  assertSha(input.sentinelExecution.claimSetSha256, 'SENTINEL_CLAIM_SET');
  assertIdentifier(input.sentinelExecution.receiptVersion, 'SENTINEL_RECEIPT_VERSION');
  assertIdentifier(input.sentinelExecution.assessment, 'SENTINEL_ASSESSMENT');
  if (!Number.isSafeInteger(input.sentinelExecution.sentinelCount)
    || input.sentinelExecution.sentinelCount < 1) {
    fail('SENTINEL_COUNT_INVALID');
  }
  assertNoSpendExecutableClosureV1(input.executableClosure);
  const expectedRoots = canonicalStrings(input.expectedRoots);
  if (!sameStrings(input.executableClosure.roots, expectedRoots)) {
    fail('EXECUTABLE_CLOSURE_ROOT_SET_DRIFT');
  }
  const material = {
    version: NO_SPEND_LANE_INTEGRITY_RECEIPT_VERSION_V2,
    authority: NO_SPEND_LANE_INTEGRITY_AUTHORITY_V2,
    lane: input.lane,
    successorManifestSha256: input.successorManifestSha256,
    sentinelExecution: { ...input.sentinelExecution },
    executableClosure: input.executableClosure,
    dispatchAuthorized: false as const,
    spendAuthorizedMicroUsd: 0 as const,
    providerInferenceCalls: 0 as const,
    networkCalls: 0 as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    mediaWrites: 0 as const,
    secretsPersisted: false as const,
    stateEffects: [] as const,
    assessment: 'PASS_CURRENT_SOURCE_INTEGRITY_READY_FOR_ZERO_INFERENCE_RESCORE_ONLY' as const,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  }) as Readonly<NoSpendLaneIntegrityReceiptV2>;
}

export function assertNoSpendLaneIntegrityReceiptV2(input: Readonly<{
  value: unknown;
  lane: NoSpendLaneIntegrityIdV2;
  successorManifestSha256: string;
  sentinelExecution: NoSpendLaneIntegrityReceiptV2['sentinelExecution'];
  expectedRoots: readonly string[];
}>): Readonly<NoSpendLaneIntegrityReceiptV2> {
  if (!isRecord(input.value) || !isRecord(input.value.executableClosure)) {
    fail('RECEIPT_MISSING');
  }
  const rebuilt = buildNoSpendLaneIntegrityReceiptV2({
    lane: input.lane,
    successorManifestSha256: input.successorManifestSha256,
    sentinelExecution: input.sentinelExecution,
    executableClosure: input.value.executableClosure as unknown as
      ExecutableImportClosureReceiptV1,
    expectedRoots: input.expectedRoots,
  });
  if (hashEditronCanonicalJsonV1(input.value) !== hashEditronCanonicalJsonV1(rebuilt)) {
    fail('RECEIPT_FORGED_OR_EXPECTATION_DRIFT');
  }
  return rebuilt;
}

function canonicalStrings(values: readonly string[]): string[] {
  const normalized = [...values].sort(compare);
  if (!normalized.length || new Set(normalized).size !== normalized.length
    || normalized.some((value) => !value.trim() || value !== value.replaceAll('\\', '/'))) {
    fail('EXPECTED_ROOT_SET_INVALID');
  }
  return normalized;
}
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function assertSha(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail(`${label}_SHA256_INVALID`);
}
function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u.test(value)) fail(`${label}_INVALID`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function fail(code: string): never {
  throw new Error(`NO_SPEND_LANE_INTEGRITY_V2_${code}`);
}
