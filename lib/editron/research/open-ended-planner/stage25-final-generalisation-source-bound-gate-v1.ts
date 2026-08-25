import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_GATE_VERSION_V1 =
  'EDITRON_OE_STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_GATE_V1_1' as const;
export const STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1 = [
  'tests/editron/stage25-final-generalisation-v1.test.ts',
  'tests/editron/stage25-generalisation-scorecard-v1.test.ts',
  'tests/editron/open-ended-planner-v2-stage25-dependency-diversity-holdout.test.ts',
  'tests/editron/stage25-heldout-route-owner-materialization-v1.test.ts',
  'tests/editron/stage25-project-service-conflict-trial-v1.test.ts',
  'tests/editron/stage25-final-generalisation-source-bound-gate-v1.test.ts',
] as const;
export const STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1 = [
  'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'AI_GATEWAY_API_KEY',
  'QWEN_API_KEY', 'EDITRON_QWEN_TOKEN_PLAN_KEY', 'VERCEL_OIDC_TOKEN',
] as const;

export interface Stage25SourceBoundArtifactV1 {
  artifactId: 'HREF01_REVIEW' | 'RHC01_PREVIEW' | 'RESUME_GATE' | 'LONG_FORM_TRIAL';
  relativePath: string;
  fileSha256: string;
  receiptHashField: 'receiptSha256' | 'receiptHash';
  receipt: Readonly<JsonRecord>;
}

export interface Stage25FinalGeneralisationSourceBoundInputV1 {
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
    providerTransportMode: 'LOCAL_STUBS_AND_OWNER_PROBES_ONLY';
    paidProviderDispatchAuthorized: false;
  }>;
  zeroSpendPreflight: Readonly<JsonRecord>;
  scorecardSentinels: Readonly<JsonRecord>;
  dependencyOwnerSentinels: Readonly<JsonRecord>;
  routeOwnerReceipts: readonly Readonly<JsonRecord>[];
  supportingArtifacts: readonly Readonly<Stage25SourceBoundArtifactV1>[];
}

export function finalizeStage25FinalGeneralisationSourceBoundGateV1(
  input: Readonly<Stage25FinalGeneralisationSourceBoundInputV1>,
) {
  validateSource(input.source);
  validateToolchain(input.toolchain);
  const testCounts = validateTestRun(input.testRun);
  validateZeroSpendPreflight(input.zeroSpendPreflight);
  validateSentinelReceipt(input.scorecardSentinels,
    'PASS_ZERO_SPEND_SCORECARD_SENTINELS', 'SCORECARD');
  validateSentinelReceipt(input.dependencyOwnerSentinels,
    'PASS_ZERO_SPEND_OWNER_EXECUTION_NO_PUBLIC_CONTRACT_GAPS', 'DEPENDENCY');
  validateRouteOwners(input.routeOwnerReceipts);
  const support = validateSupportingArtifacts(input.supportingArtifacts);
  const material = {
    version: STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_GATE_VERSION_V1,
    artifactType: 'Stage25FinalGeneralisationSourceBoundGateReceiptV1' as const,
    authority: 'LOCAL_SOURCE_BOUND_ZERO_SPEND_RESEARCH_GATE_NOT_PROJECT_OWNER' as const,
    source: {
      ...input.source,
      relevantWorktreeClean: true as const,
    },
    toolchain: input.toolchain,
    command: {
      runner: `vitest@${input.toolchain.vitestVersion}`,
      testFiles: STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1,
      automaticRetryCount: 0 as const,
      providerTransportMode: input.testRun.providerTransportMode,
    },
    testCounts,
    zeroSpendPreflightReceiptSha256: String(input.zeroSpendPreflight.receiptSha256),
    scorecardSentinelReceiptSha256: String(input.scorecardSentinels.receiptSha256),
    dependencyOwnerSentinelReceiptSha256:
      String(input.dependencyOwnerSentinels.receiptSha256),
    routeOwnerReceiptSha256s: input.routeOwnerReceipts
      .map(({ receiptSha256 }) => String(receiptSha256)).sort(compare),
    supportingArtifacts: support,
    evidenceDisposition: {
      href01: 'PASS_SINGLE_QUALIFIED_OWNER_INDEPENDENT_AGREEMENT_UNVERIFIABLE',
      rhc01: 'THREE_RENDERED_RESEARCH_PREVIEWS_CAPTURED_UNJUDGED',
      resume: 'PASS_LOCAL_ZERO_SPEND_EXECUTABLE_OWNER',
      longForm: 'PASS_LOCAL_SYNTHETIC_LONG_DURATION_MEDIA_MECHANICS',
      projectConflict: 'PASS_CURRENT_TEST_FIXTURE_ONE_CUT_OWNER_ONLY',
    },
    readiness:
      'READY_FOR_PROVIDER_ACCESS_METADATA_AND_OFFICIAL_TOKEN_PREFLIGHT_NOT_INFERENCE' as const,
    paidProviderDispatchAuthorized: false as const,
    providerInferenceCallCount: 0 as const,
    canonicalProjectMutationCount: 0 as const,
    stateEffects: [] as const,
    proofCeiling: 'SOURCE_BOUND_ZERO_SPEND_RESEARCH_GATE' as const,
    whatHasNotBeenChecked: [
      'GOOGLE_OFFICIAL_COUNT_TOKENS_FOR_24_REQUESTS',
      'CURRENT_PROVIDER_MODEL_AND_PRICING_METADATA',
      'PAID_MODEL_GENERALISATION_COHORT',
      'RHC02_RHC03_RHC04_RENDERED_CANDIDATES',
      'SECOND_INDEPENDENT_HREF01_REVIEWER',
      'BLIND_EDITOR_REVIEW_OF_NEW_MODEL_OUTPUTS',
      'CANONICAL_PROJECTSERVICE_MODEL_DRIVEN_MUTATION',
      'REAL_CREATIVE_LONG_FORM_MEDIA',
      'PRODUCT_GO_MODIFY_OR_NO_GO',
    ] as const,
    startedAt: input.testRun.startedAt,
    completedAt: input.testRun.completedAt,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function validateSource(source: Stage25FinalGeneralisationSourceBoundInputV1['source']): void {
  if (!/^[a-f0-9]{40}$/.test(source.commitSha) || !/^[a-f0-9]{40}$/.test(source.treeSha)
    || !isSha(source.relevantScopeSha256) || !Number.isSafeInteger(source.relevantTrackedFileCount)
    || source.relevantTrackedFileCount <= 0 || source.relevantStatusEntries.length) {
    fail('SOURCE_SCOPE_DIRTY_OR_INVALID');
  }
}
function validateToolchain(toolchain: Stage25FinalGeneralisationSourceBoundInputV1['toolchain']): void {
  if (!/^v\d+/.test(toolchain.nodeVersion) || !/^\d+\.\d+\.\d+/.test(toolchain.vitestVersion)) {
    fail('TOOLCHAIN_INVALID');
  }
}
function validateTestRun(testRun: Stage25FinalGeneralisationSourceBoundInputV1['testRun']) {
  if (testRun.runnerExitCode !== 0 || testRun.automaticRetryCount !== 0
    || testRun.paidProviderDispatchAuthorized
    || testRun.providerTransportMode !== 'LOCAL_STUBS_AND_OWNER_PROBES_ONLY'
    || !sameSet(testRun.credentialNamesScrubbed,
      STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1)) fail('TEST_RUN_POLICY_INVALID');
  const report = record(testRun.report);
  const results = records(report.testResults);
  const names = results.map(({ name }) => normalizePath(String(name)));
  if (!sameSet(names, STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1)) {
    fail('TEST_FILE_SET_INVALID');
  }
  const assertions = results.flatMap(({ assertionResults }) => records(assertionResults));
  const passed = assertions.filter(({ status }) => status === 'passed').length;
  if (report.success !== true || report.numTotalTests !== 52 || report.numPassedTests !== 52
    || report.numFailedTests !== 0 || report.numPendingTests !== 0
    || report.numTodoTests !== 0 || assertions.length !== 52 || passed !== 52) {
    fail('TEST_COUNTS_INVALID');
  }
  return { total: 52 as const, passed: 52 as const, failed: 0 as const };
}
function validateZeroSpendPreflight(value: Readonly<JsonRecord>): void {
  assertHashed(value, 'receiptSha256', 'PREFLIGHT');
  const counts = record(value.counts);
  if (value.readiness !== 'READY_FOR_PROVIDER_ACCESS_AND_OFFICIAL_TOKEN_PREFLIGHT_NOT_INFERENCE'
    || value.dispatchAuthorized !== false || counts.contemplatedRows !== 24
    || counts.capturedInitialRequests !== 24 || counts.providerInferenceCalls !== 0
    || counts.projectMutations !== 0 || records(value.captures).length !== 24) fail('PREFLIGHT_INVALID');
}
function validateSentinelReceipt(value: Readonly<JsonRecord>, assessment: string, code: string): void {
  assertHashed(value, 'receiptSha256', code);
  const providerCalls = value.providerInferenceCallCount ?? value.providerInferenceCalls;
  const projectMutations = value.canonicalProjectMutationCount ?? value.projectMutations;
  if (value.assessment !== assessment || providerCalls !== 0
    || projectMutations !== 0) fail(`${code}_SENTINEL_INVALID`);
}
function validateRouteOwners(values: readonly Readonly<JsonRecord>[]): void {
  if (values.length !== 16) fail('ROUTE_OWNER_COUNT_INVALID');
  const identities = new Set<string>();
  for (const value of values) {
    assertHashed(value, 'receiptSha256', 'ROUTE_OWNER');
    const calls = record(value.externalCalls);
    if (record(value.evaluation).assessment !== 'PASS_SAFE_STOP'
      || calls.providerInferenceCalls !== 0 || calls.renderCalls !== 0
      || calls.databaseCalls !== 0 || calls.canonicalProjectMutationWrites !== 0) {
      fail('ROUTE_OWNER_INVALID');
    }
    identities.add(`${String(value.taskId)}:${String(value.arm)}`);
  }
  if (identities.size !== 16) fail('ROUTE_OWNER_IDENTITY_DUPLICATED');
}
function validateSupportingArtifacts(values: readonly Readonly<Stage25SourceBoundArtifactV1>[]) {
  const expected = ['HREF01_REVIEW', 'LONG_FORM_TRIAL', 'RESUME_GATE', 'RHC01_PREVIEW'];
  if (!sameSet(values.map(({ artifactId }) => artifactId), expected)) fail('SUPPORT_SET_INVALID');
  return [...values].sort((a, b) => compare(a.artifactId, b.artifactId)).map((entry) => {
    if (!entry.relativePath.startsWith('.calibration-temp/') || !isSha(entry.fileSha256)) {
      fail(`SUPPORT_PATH_OR_FILE_HASH_INVALID:${entry.artifactId}`);
    }
    assertHashed(entry.receipt, entry.receiptHashField, entry.artifactId);
    validateSupportSemantics(entry.artifactId, entry.receipt);
    return { artifactId: entry.artifactId, relativePath: entry.relativePath,
      fileSha256: entry.fileSha256, receiptSha256: String(entry.receipt[entry.receiptHashField]) };
  });
}
function validateSupportSemantics(id: Stage25SourceBoundArtifactV1['artifactId'], value: Readonly<JsonRecord>): void {
  if (id === 'HREF01_REVIEW' && (value.overallDecision !== 'PASS'
    || value.independentAgreement !== 'UNVERIFIABLE_SINGLE_REVIEWER')) fail('HREF01_SEMANTICS_INVALID');
  if (id === 'RHC01_PREVIEW' && (record(value.proof).candidateIdentity !== 'PASS'
    || record(value.proof).routeDecision !== 'NOT_ISSUED')) fail('RHC01_SEMANTICS_INVALID');
  if (id === 'RESUME_GATE'
    && value.assessment !== 'PASS_ZERO_SPEND_EXECUTABLE_RESUME_GATE') fail('RESUME_SEMANTICS_INVALID');
  if (id === 'LONG_FORM_TRIAL'
    && value.assessment !== 'PASS_LOCAL_LONG_FORM_MEDIA_AND_WINDOW_MECHANICS') fail('LONG_FORM_SEMANTICS_INVALID');
}
function assertHashed(value: Readonly<JsonRecord>, field: string, code: string): void {
  const claimed = value[field]; const material = { ...value }; delete material[field];
  if (!isSha(claimed) || hashCanonicalJsonV1(material) !== claimed) fail(`${code}_RECEIPT_HASH_INVALID`);
}
function normalizePath(value: string): string { const path = value.replace(/\\/g, '/'); return STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1.find((name) => path.endsWith(name)) ?? path; }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }
function sameSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === left.length && right.every((value) => left.includes(value)); }
function isSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code: string): never { throw new Error(`STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_${code}`); }
