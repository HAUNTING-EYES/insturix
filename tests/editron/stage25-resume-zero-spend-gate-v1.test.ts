import { describe, expect, it } from "vitest";

import { hashCanonicalJsonV1 }
  from "@/lib/editron/research/open-ended-planner/contracts-v1";
import {
  STAGE25_RESUME_ZERO_SPEND_CREDENTIAL_NAMES_V1,
  STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1,
  finalizeStage25ResumeZeroSpendGateV1,
  type Stage25ResumeZeroSpendGateInputV1,
} from "@/lib/editron/research/open-ended-planner/stage25-resume-zero-spend-gate-v1";

type JsonRecord = Record<string, unknown>;

const TITLES: readonly (readonly string[])[] = [
  [
    "resumes after compaction without losing the active node or opaque result identities",
    "checkpoint filler 2", "checkpoint filler 3", "checkpoint filler 4", "checkpoint filler 5",
  ],
  ["replays only the committed writer prefix and executes only the suffix"],
  [
    "resumes through the real Plan worker and stores one owner-bound receipt",
    "plan filler 2", "plan filler 3", "plan filler 4", "plan filler 5", "plan filler 6",
  ],
  [
    "rejects missing, legacy-unbound, wrong and forged accounting state",
    "budget filler 2", "budget filler 3",
  ],
  ["failed-attempt filler 1", "failed-attempt filler 2"],
  [
    "persists and restores the sole pending reservation without claiming delivery",
    "dispatch filler 2",
  ],
  [
    "resumes only the suffix through opaque results and binds the final receipt",
    "rejects a stale current revision before provider invocation",
    "rejects altered and rehashed-forged prefixes before provider invocation",
    "episode filler 4", "episode filler 5",
  ],
  [
    "binds all eight public examples while readiness, dispatch and effects stay off",
    "readiness filler 2", "readiness filler 3", "readiness filler 4",
    "readiness filler 5", "readiness filler 6", "readiness filler 7",
    "readiness filler 8", "readiness filler 9", "readiness filler 10",
    "readiness filler 11", "readiness filler 12",
  ],
];

describe("Stage 2.5 source-bound zero-spend resume gate V1", () => {
  it("promotes executable owner evidence only to the separately authorized paid-trial gate", () => {
    const receipt = finalizeStage25ResumeZeroSpendGateV1(validInput());

    expect(receipt).toMatchObject({
      assessment: "PASS_ZERO_SPEND_EXECUTABLE_RESUME_GATE",
      resumeReadinessDisposition: "READY_FOR_SEPARATELY_AUTHORIZED_PAID_RESUME_TRIAL",
      paidResumeDisposition: "NOT_AUTHORIZED",
      paidProviderDispatchCount: 0,
      canonicalProjectMutationCount: 0,
      automaticRetryCount: 0,
      stateEffects: [],
      proofCeiling: "LOCAL_ZERO_SPEND_EXECUTABLE_OWNER_AND_TEST_RUN",
      testCounts: { total: 36, passed: 36, failed: 0 },
    });
    expect((receipt.sentinelReceipts as JsonRecord[])).toHaveLength(8);
    expect((receipt.supportingReceipts as JsonRecord[]).map(({ supportId }) => supportId))
      .toEqual([
        "COMPACTED_CONTEXT_PRESERVES_PLAN_AND_OPAQUE_RESULTS",
        "PLAN_SERVICE_DURABLE_OWNER_STORES_RESUMED_RECEIPT",
      ]);
    expect(receipt.whatHasNotBeenChecked).toContain("PAID_PROVIDER_RESUME");
    expect(receipt.whatHasNotBeenChecked).toContain("NETWORK_PACKET_CAPTURE");
    expect(Object.isFrozen(receipt)).toBe(true);
    const material = { ...receipt };
    delete material.receiptSha256;
    expect(receipt.receiptSha256).toBe(hashCanonicalJsonV1(material));
  });

  it("rejects a dirty Editron scope before interpreting green tests", () => {
    const input = validInput();
    (input.source as unknown as { relevantStatusEntries: string[] }).relevantStatusEntries = [
      " M lib/editron/unsafe.ts",
    ];
    expect(() => finalizeStage25ResumeZeroSpendGateV1(input))
      .toThrow("STAGE25_RESUME_ZERO_SPEND_GATE_SOURCE_SCOPE_DIRTY_OR_EMPTY");
  });

  it("rejects dropped tests, redistributed assertions and non-passing status", () => {
    const missing = validInput();
    report(missing).testResults = results(missing).slice(0, -1);
    expect(() => finalizeStage25ResumeZeroSpendGateV1(missing))
      .toThrow("STAGE25_RESUME_ZERO_SPEND_GATE_TEST_FILE_SET_INVALID");

    const redistributed = validInput();
    const assertions = results(redistributed)[0]!.assertionResults as JsonRecord[];
    assertions.pop();
    expect(() => finalizeStage25ResumeZeroSpendGateV1(redistributed))
      .toThrow("STAGE25_RESUME_ZERO_SPEND_GATE_TEST_FILE_ASSERTION_SET_INVALID");

    const failed = validInput();
    (results(failed)[0]!.assertionResults as JsonRecord[])[0]!.status = "failed";
    expect(() => finalizeStage25ResumeZeroSpendGateV1(failed))
      .toThrow("STAGE25_RESUME_ZERO_SPEND_GATE_ASSERTION_FAILED_OR_SKIPPED");
  });

  it("rejects missing compaction/PlanService support and missing public sentinels", () => {
    const missingCompaction = validInput();
    (results(missingCompaction)[0]!.assertionResults as JsonRecord[])[0]!.title = "replacement";
    expect(() => finalizeStage25ResumeZeroSpendGateV1(missingCompaction))
      .toThrow("SUPPORT_ASSERTION_MISSING:COMPACTED_CONTEXT_PRESERVES_PLAN_AND_OPAQUE_RESULTS");

    const missingSentinel = validInput();
    (results(missingSentinel)[6]!.assertionResults as JsonRecord[])[1]!.title = "replacement";
    expect(() => finalizeStage25ResumeZeroSpendGateV1(missingSentinel))
      .toThrow("SENTINEL_ASSERTION_MISSING:R1-STALE-CHECKPOINT-REJECTION");
  });

  it("rejects credential scrub drift, retries and paid dispatch authorization", () => {
    const credentials = validInput();
    (credentials.testRun as unknown as { credentialNamesScrubbed: string[] })
      .credentialNamesScrubbed = [
      ...STAGE25_RESUME_ZERO_SPEND_CREDENTIAL_NAMES_V1,
    ].reverse();
    expect(() => finalizeStage25ResumeZeroSpendGateV1(credentials))
      .toThrow("STAGE25_RESUME_ZERO_SPEND_GATE_CREDENTIAL_SCRUB_SET_INVALID");

    const retry = validInput();
    (retry.testRun as { automaticRetryCount: number }).automaticRetryCount = 1;
    expect(() => finalizeStage25ResumeZeroSpendGateV1(retry))
      .toThrow("STAGE25_RESUME_ZERO_SPEND_GATE_RUNNER_OUTCOME_INVALID");

    const dispatch = validInput() as unknown as JsonRecord;
    (dispatch.testRun as JsonRecord).paidProviderDispatchAuthorized = true;
    expect(() => finalizeStage25ResumeZeroSpendGateV1(
      dispatch as unknown as Stage25ResumeZeroSpendGateInputV1,
    )).toThrow("STAGE25_RESUME_ZERO_SPEND_GATE_PROVIDER_CEILING_INVALID");
  });
});

function validInput(): Stage25ResumeZeroSpendGateInputV1 {
  const testResults = STAGE25_RESUME_ZERO_SPEND_TEST_FILES_V1.map((name, index) => ({
    name: `D:/workspace/${name}`,
    status: "passed",
    assertionResults: TITLES[index]!.map((title) => ({ title, status: "passed" })),
  }));
  return {
    source: {
      commitSha: "a".repeat(40),
      treeSha: "b".repeat(40),
      relevantScopeSha256: "c".repeat(64),
      relevantTrackedFileCount: 640,
      relevantStatusEntries: [],
    },
    toolchain: { nodeVersion: "v24.10.0", vitestVersion: "1.6.1" },
    testRun: {
      startedAt: "2026-08-26T00:00:00.000Z",
      completedAt: "2026-08-26T00:00:03.000Z",
      report: {
        success: true,
        numTotalTests: 36,
        numPassedTests: 36,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        testResults,
      },
      runnerExitCode: 0,
      automaticRetryCount: 0,
      credentialNamesScrubbed: [...STAGE25_RESUME_ZERO_SPEND_CREDENTIAL_NAMES_V1],
      providerTransportMode: "TEST_STUBS_ONLY_NO_PROVIDER_ROUTE",
      networkObservation: "NOT_PACKET_CAPTURED",
      paidProviderDispatchAuthorized: false,
    },
  };
}

function report(input: Stage25ResumeZeroSpendGateInputV1): JsonRecord {
  return input.testRun.report as JsonRecord;
}

function results(input: Stage25ResumeZeroSpendGateInputV1): JsonRecord[] {
  return report(input).testResults as JsonRecord[];
}
