import { deepFreezeV1, hashCanonicalJsonV1 } from "./contracts-v1";

type JsonRecord = Record<string, unknown>;

export const STAGE25_RESUME_ZERO_SPEND_GATE_VERSION_V1 =
  "EDITRON_OE_STAGE25_RESUME_ZERO_SPEND_GATE_V1_1" as const;

export const STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1 = [
  "tests/editron/open-ended-planner-v2-stage25-episode-checkpoint.test.ts",
  "tests/editron/provider-native-project-service-process-resume-v2r.test.ts",
  "tests/editron/provider-native-plan-resumed-execution-owner-v2r.test.ts",
  "tests/editron/provider-native-episode-runtime-budget-resume-v2r.test.ts",
  "tests/editron/provider-native-failed-attempt-resume-v2r.test.ts",
  "tests/editron/provider-native-dispatch-intent-resume-v2r.test.ts",
  "tests/editron/provider-native-episode-resume-v2r.test.ts",
  "tests/editron/stage25-resume-readiness-v1.test.ts",
] as const;

export const STAGE25_RESUME_ZERO_SPEND_CREDENTIAL_NAMES_V1 = [
  "AI_GATEWAY_API_KEY",
  "DASHSCOPE_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OLLAMA_API_KEY",
  "OPENAI_API_KEY",
  "QWEN_API_KEY",
  "VERCEL_AI_GATEWAY_API_KEY",
] as const;

const EXPECTED_ASSERTION_COUNTS = new Map<string, number>([
  [STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1[0], 5],
  [STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1[1], 1],
  [STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1[2], 6],
  [STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1[3], 3],
  [STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1[4], 2],
  [STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1[5], 2],
  [STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1[6], 5],
  [STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1[7], 12],
]);

const REQUIRED_ASSERTIONS = [
  {
    sentinelId: "R1-COMMITTED-WRITER-INTERRUPTION",
    title: "replays only the committed writer prefix and executes only the suffix",
  },
  {
    sentinelId: "R1-SEPARATE-PROCESS-SUFFIX-REPRESENTATION",
    title: "replays only the committed writer prefix and executes only the suffix",
  },
  {
    sentinelId: "R1-NO-PREFIX-PROVIDER-REINVOCATION",
    title: "resumes only the suffix through opaque results and binds the final receipt",
  },
  {
    sentinelId: "R1-STALE-CHECKPOINT-REJECTION",
    title: "rejects a stale current revision before provider invocation",
  },
  {
    sentinelId: "R1-TAMPERED-CHECKPOINT-REJECTION",
    title: "rejects altered and rehashed-forged prefixes before provider invocation",
  },
  {
    sentinelId: "R1-RUNTIME-BUDGET-DRIFT-REJECTION",
    title: "rejects missing, legacy-unbound, wrong and forged accounting state",
  },
  {
    sentinelId: "R1-UNRESOLVED-DISPATCH-CONSERVATIVE-STOP",
    title: "persists and restores the sole pending reservation without claiming delivery",
  },
  {
    sentinelId: "R1-DISPATCH-DISABLED",
    title: "binds all eight public examples while readiness, dispatch and effects stay off",
  },
] as const;

const REQUIRED_SUPPORTING_ASSERTIONS = [
  {
    supportId: "COMPACTED_CONTEXT_PRESERVES_PLAN_AND_OPAQUE_RESULTS",
    title: "resumes after compaction without losing the active node or opaque result identities",
  },
  {
    supportId: "PLAN_SERVICE_DURABLE_OWNER_STORES_RESUMED_RECEIPT",
    title: "resumes through the real Plan worker and stores one owner-bound receipt",
  },
] as const;

export interface Stage25ResumeZeroSpendGateInputV1 {
  source: Readonly<{
    commitSha: string;
    treeSha: string;
    relevantScopeSha256: string;
    relevantTrackedFileCount: number;
    relevantStatusEntries: readonly string[];
  }>;
  toolchain: Readonly<{
    nodeVersion: string;
    vitestVersion: string;
  }>;
  testRun: Readonly<{
    startedAt: string;
    completedAt: string;
    report: unknown;
    runnerExitCode: number;
    automaticRetryCount: number;
    credentialNamesScrubbed: readonly string[];
    providerTransportMode: "TEST_STUBS_ONLY_NO_PROVIDER_ROUTE";
    networkObservation: "NOT_PACKET_CAPTURED";
    paidProviderDispatchAuthorized: false;
  }>;
}

export function finalizeStage25ResumeZeroSpendGateV1(
  input: Readonly<Stage25ResumeZeroSpendGateInputV1>,
): Readonly<JsonRecord> {
  sha(input.source.commitSha, "SOURCE_COMMIT");
  sha(input.source.treeSha, "SOURCE_TREE");
  sha(input.source.relevantScopeSha256, "SOURCE_SCOPE");
  if (!Number.isSafeInteger(input.source.relevantTrackedFileCount)
    || input.source.relevantTrackedFileCount < 1
    || input.source.relevantStatusEntries.length !== 0) {
    fail("SOURCE_SCOPE_DIRTY_OR_EMPTY");
  }
  if (!input.toolchain.nodeVersion.trim() || !input.toolchain.vitestVersion.trim()) {
    fail("TOOLCHAIN_INVALID");
  }
  if (input.testRun.runnerExitCode !== 0 || input.testRun.automaticRetryCount !== 0) {
    fail("RUNNER_OUTCOME_INVALID");
  }
  if (input.testRun.providerTransportMode !== "TEST_STUBS_ONLY_NO_PROVIDER_ROUTE"
    || input.testRun.networkObservation !== "NOT_PACKET_CAPTURED"
    || input.testRun.paidProviderDispatchAuthorized !== false) {
    fail("PROVIDER_CEILING_INVALID");
  }
  if (!sameOrderedStrings(
    input.testRun.credentialNamesScrubbed,
    STAGE25_RESUME_ZERO_SPEND_CREDENTIAL_NAMES_V1,
  )) {
    fail("CREDENTIAL_SCRUB_SET_INVALID");
  }
  const startedAt = instant(input.testRun.startedAt, "STARTED_AT");
  const completedAt = instant(input.testRun.completedAt, "COMPLETED_AT");
  if (completedAt < startedAt) fail("RUN_TIME_REVERSED");

  const report = record(input.testRun.report, "TEST_REPORT_INVALID");
  if (report.success !== true
    || report.numFailedTests !== 0
    || report.numPendingTests !== 0
    || report.numTodoTests !== 0
    || report.numTotalTests !== 36
    || report.numPassedTests !== report.numTotalTests) {
    fail("TEST_REPORT_NOT_PASSING");
  }
  const testResults = records(report.testResults, "TEST_RESULTS_INVALID");
  const observedFiles = testResults.map((result) => normalizeTestPath(
    text(result.name, "TEST_FILE_INVALID"),
  ));
  if (!sameStringSet(observedFiles, STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1)) {
    fail("TEST_FILE_SET_INVALID");
  }
  for (let index = 0; index < testResults.length; index += 1) {
    const assertions = records(testResults[index]!.assertionResults, "ASSERTIONS_INVALID");
    if (testResults[index]!.status !== "passed"
      || assertions.length !== EXPECTED_ASSERTION_COUNTS.get(observedFiles[index]!)) {
      fail(`TEST_FILE_ASSERTION_SET_INVALID:${observedFiles[index]}`);
    }
  }
  const assertions = testResults.flatMap((result) => (
    records(result.assertionResults, "ASSERTIONS_INVALID")
  ));
  if (assertions.some((assertion) => assertion.status !== "passed")) {
    fail("ASSERTION_FAILED_OR_SKIPPED");
  }
  const passedTitles = new Set(assertions.map((assertion) => (
    text(assertion.title, "ASSERTION_TITLE_INVALID")
  )));
  const sentinelReceipts = REQUIRED_ASSERTIONS.map(({ sentinelId, title }) => {
    if (!passedTitles.has(title)) fail(`SENTINEL_ASSERTION_MISSING:${sentinelId}`);
    const material = {
      sentinelId,
      assertionTitle: title,
      disposition: "PASS_EXECUTABLE_OWNER_TEST" as const,
    };
    return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
  });
  const supportingReceipts = REQUIRED_SUPPORTING_ASSERTIONS.map(({ supportId, title }) => {
    if (!passedTitles.has(title)) fail(`SUPPORT_ASSERTION_MISSING:${supportId}`);
    const material = {
      supportId,
      assertionTitle: title,
      disposition: "PASS_EXECUTABLE_OWNER_TEST" as const,
    };
    return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
  });

  const command = {
    runner: `vitest@${input.toolchain.vitestVersion}`,
    mode: "run" as const,
    testFiles: [...STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1],
    reporter: "json" as const,
    automaticRetryCount: 0 as const,
  };
  const material = {
    version: STAGE25_RESUME_ZERO_SPEND_GATE_VERSION_V1,
    artifactType: "Stage25ResumeZeroSpendExecutableOwnerGateV1" as const,
    authority: "LOCAL_SOURCE_BOUND_TEST_OPERATOR_NOT_PLAN_OR_PROJECT_OWNER" as const,
    source: {
      commitSha: input.source.commitSha,
      treeSha: input.source.treeSha,
      relevantScopeSha256: input.source.relevantScopeSha256,
      relevantTrackedFileCount: input.source.relevantTrackedFileCount,
      relevantWorktreeClean: true as const,
    },
    toolchain: input.toolchain,
    command,
    commandSha256: hashCanonicalJsonV1(command),
    testReportSha256: hashCanonicalJsonV1(report),
    testCounts: {
      total: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
    },
    sentinelReceipts,
    supportingReceipts,
    assessment: "PASS_ZERO_SPEND_EXECUTABLE_RESUME_GATE" as const,
    resumeReadinessDisposition: "READY_FOR_SEPARATELY_AUTHORIZED_PAID_RESUME_TRIAL" as const,
    paidResumeDisposition: "NOT_AUTHORIZED" as const,
    providerTransportMode: input.testRun.providerTransportMode,
    credentialNamesScrubbed: [...input.testRun.credentialNamesScrubbed],
    paidProviderDispatchCount: 0 as const,
    canonicalProjectMutationCount: 0 as const,
    automaticRetryCount: 0 as const,
    stateEffects: [] as const,
    startedAt: input.testRun.startedAt,
    completedAt: input.testRun.completedAt,
    proofCeiling: "LOCAL_ZERO_SPEND_EXECUTABLE_OWNER_AND_TEST_RUN" as const,
    whatHasNotBeenChecked: [
      "PAID_PROVIDER_RESUME",
      "LIVE_ATLAS_RECOVERY",
      "LIVE_QSTASH_REDELIVERY",
      "AUTHENTICATED_HOSTED_WORKER_INGRESS",
      "CANONICAL_PROJECTSERVICE_APPLY_RELOAD",
      "RENDERED_AUDIOVISUAL_ACCEPTANCE",
      "NETWORK_PACKET_CAPTURE",
    ] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function normalizeTestPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const marker = "/tests/editron/";
  const index = normalized.lastIndexOf(marker);
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort(ascii).join("|") === [...right].sort(ascii).join("|");
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function record(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as JsonRecord;
}

function records(value: unknown, code: string): JsonRecord[] {
  if (!Array.isArray(value)) fail(code);
  return value.map((entry) => record(entry, code));
}

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) fail(code);
  return value;
}

function instant(value: string, code: string): number {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
}

function sha(value: string, code: string): void {
  if (!/^[a-f0-9]{40,64}$/.test(value)) fail(code);
}

function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string): never {
  throw new Error(`STAGE25_RESUME_ZERO_SPEND_GATE_${code}`);
}
