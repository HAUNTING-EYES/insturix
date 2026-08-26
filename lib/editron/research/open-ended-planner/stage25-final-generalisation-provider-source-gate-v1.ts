import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertStage25FinalGeneralisationProviderPreflightBundleV1,
  type Stage25FinalGeneralisationProviderBundleV1,
} from './stage25-final-generalisation-provider-preflight-v1';
import {
  STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1,
  STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1,
} from './stage25-final-generalisation-source-bound-gate-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_FINAL_GENERALISATION_PROVIDER_SOURCE_GATE_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_PROVIDER_SOURCE_GATE_V1_2' as const;
export const STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1 = [
  ...STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1,
  'tests/editron/stage25-final-generalisation-provider-preflight-v1.test.ts',
  'tests/editron/stage25-final-generalisation-provider-source-gate-v1.test.ts',
  'tests/editron/stage25-final-generalisation-paid-authorization-v1.test.ts',
  'tests/editron/stage25-final-generalisation-paid-runner-v1.test.ts',
] as const;
export const STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1 = 70 as const;
export const STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1 = [
  ...STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1,
  'GOOGLE_GENERATIVE_AI_API_KEY',
] as const;

export interface Stage25FinalProviderSourceGateInputV1 {
  source: Readonly<{
    commitSha: string;
    treeSha: string;
    relevantScopeSha256: string;
    relevantTrackedFileCount: number;
    relevantStatusEntries: readonly string[];
  }>;
  toolchain: Readonly<{ nodeVersion: string; vitestVersion: string }>;
  testRun: Readonly<{
    startedAt: string;
    completedAt: string;
    report: unknown;
    runnerExitCode: 0;
    automaticRetryCount: 0;
    credentialNamesScrubbed: readonly string[];
  }>;
  providerBundle: Readonly<Stage25FinalGeneralisationProviderBundleV1>;
  providerReceiptFileSha256: string;
  requestCapturesFileSha256: string;
}

export function finalizeStage25FinalGeneralisationProviderSourceGateV1(
  input: Readonly<Stage25FinalProviderSourceGateInputV1>,
) {
  validateSource(input.source);
  validateToolchain(input.toolchain);
  const testCounts = validateTestRun(input.testRun);
  const bundle = assertStage25FinalGeneralisationProviderPreflightBundleV1(
    input.providerBundle,
  );
  if (!isSha(input.providerReceiptFileSha256)
    || !isSha(input.requestCapturesFileSha256)) fail('ARTIFACT_FILE_HASH_INVALID');
  const provider = bundle.receipt;
  const material = {
    version: STAGE25_FINAL_GENERALISATION_PROVIDER_SOURCE_GATE_VERSION_V1,
    artifactType: 'Stage25FinalGeneralisationProviderSourceGateReceiptV1' as const,
    authority: 'SOURCE_BOUND_PROVIDER_ACCESS_PREFLIGHT_NO_INFERENCE' as const,
    source: { ...input.source, relevantWorktreeClean: true as const },
    toolchain: input.toolchain,
    command: {
      runner: `vitest@${input.toolchain.vitestVersion}`,
      testFiles: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1,
      automaticRetryCount: 0 as const,
      providerTransportMode:
        'ALLOWLISTED_MODEL_METADATA_AND_GOOGLE_COUNT_TOKENS_ONLY' as const,
    },
    testCounts,
    providerPreflight: {
      receiptSha256: text(provider.receiptSha256),
      receiptFileSha256: input.providerReceiptFileSha256,
      requestCaptureSetSha256: text(provider.requestCaptureSetSha256),
      requestCapturesFileSha256: input.requestCapturesFileSha256,
      cohortSha256: text(provider.cohortSha256),
      pricingEvidenceSha256: text(provider.pricingEvidenceSha256),
      modelMetadata: provider.modelMetadata,
      networkCalls: provider.networkCalls,
      initialAttemptCostUpperBoundUsd: provider.initialAttemptCostUpperBoundUsd,
      absoluteTwoAttemptMaxSpendUsd: provider.absoluteTwoAttemptMaxSpendUsd,
    },
    readiness: 'READY_FOR_EXPLICIT_CAPPED_24_ROW_PAID_AUTHORIZATION_NOT_INFERENCE' as const,
    paidProviderDispatchAuthorized: false as const,
    providerInferenceCallCount: 0 as const,
    canonicalProjectMutationCount: 0 as const,
    stateEffects: [] as const,
    proofCeiling: 'SOURCE_BOUND_PROVIDER_ACCESS_AND_TOKEN_PREFLIGHT' as const,
    whatHasNotBeenChecked: [
      'PAID_24_ROW_MODEL_GENERALISATION_COHORT',
      'MODEL_OUTPUT_SEMANTIC_AUDIT',
      'RHC02_RHC03_RHC04_RENDERED_CANDIDATES',
      'BLIND_EDITOR_QUALITY_AND_CORRECTION_TIME',
      'CANONICAL_PROJECTSERVICE_MODEL_DRIVEN_MUTATION',
      'FINAL_STAGE25_GO_MODIFY_OR_NO_GO',
    ] as const,
    startedAt: input.testRun.startedAt,
    completedAt: input.testRun.completedAt,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function validateSource(source: Stage25FinalProviderSourceGateInputV1['source']): void {
  if (!/^[a-f0-9]{40}$/.test(source.commitSha) || !/^[a-f0-9]{40}$/.test(source.treeSha)
    || !isSha(source.relevantScopeSha256)
    || !Number.isSafeInteger(source.relevantTrackedFileCount)
    || source.relevantTrackedFileCount < 1 || source.relevantStatusEntries.length) {
    fail('SOURCE_SCOPE_DIRTY_OR_INVALID');
  }
}
function validateToolchain(toolchain: Stage25FinalProviderSourceGateInputV1['toolchain']): void {
  if (!/^v\d+/.test(toolchain.nodeVersion) || !/^\d+\.\d+\.\d+/.test(toolchain.vitestVersion)) {
    fail('TOOLCHAIN_INVALID');
  }
}
function validateTestRun(testRun: Stage25FinalProviderSourceGateInputV1['testRun']) {
  if (testRun.runnerExitCode !== 0 || testRun.automaticRetryCount !== 0
    || !sameSet(testRun.credentialNamesScrubbed,
      STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1)) {
    fail('TEST_RUN_POLICY_INVALID');
  }
  const report = record(testRun.report);
  const results = records(report.testResults);
  const names = results.map(({ name }) => normalizePath(text(name)));
  const assertions = results.flatMap(({ assertionResults }) => records(assertionResults));
  const passed = assertions.filter(({ status }) => status === 'passed').length;
  if (!sameSet(names, STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1)
    || report.success !== true
    || report.numTotalTests !== STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1
    || report.numPassedTests !== STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1
    || report.numFailedTests !== 0 || report.numPendingTests !== 0
    || report.numTodoTests !== 0
    || assertions.length !== STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1
    || passed !== STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1) {
    fail('TEST_REPORT_INVALID');
  }
  return { total: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    passed: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1, failed: 0 as const };
}
function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1
    .find((name) => normalized.endsWith(name)) ?? normalized;
}
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && right.every((value) => left.includes(value));
}
function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object'
  && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function fail(code: string): never { throw new Error(`STAGE25_FINAL_PROVIDER_SOURCE_GATE_${code}`); }
