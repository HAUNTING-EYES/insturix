import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1,
  STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1,
  finalizeStage25FinalGeneralisationSourceBoundGateV1,
  type Stage25FinalGeneralisationSourceBoundInputV1,
} from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-source-bound-gate-v1';

type JsonRecord = Record<string, unknown>;

describe('Stage 2.5 final generalisation source-bound gate V1', () => {
  it('accepts only the source-bound zero-spend evidence ceiling', () => {
    const receipt = finalizeStage25FinalGeneralisationSourceBoundGateV1(validInput());
    expect(receipt).toMatchObject({
      readiness: 'READY_FOR_PROVIDER_ACCESS_METADATA_AND_OFFICIAL_TOKEN_PREFLIGHT_NOT_INFERENCE',
      paidProviderDispatchAuthorized: false,
      providerInferenceCallCount: 0,
      canonicalProjectMutationCount: 0,
      testCounts: { total: 52, passed: 52, failed: 0 },
      proofCeiling: 'SOURCE_BOUND_ZERO_SPEND_RESEARCH_GATE',
      stateEffects: [],
    });
    expect(receipt.evidenceDisposition.href01)
      .toContain('INDEPENDENT_AGREEMENT_UNVERIFIABLE');
    expect(receipt.whatHasNotBeenChecked)
      .toContain('GOOGLE_OFFICIAL_COUNT_TOKENS_FOR_24_REQUESTS');
    const material: JsonRecord = { ...receipt };
    delete material.receiptSha256;
    expect(receipt.receiptSha256).toBe(hashCanonicalJsonV1(material));
  });

  it('rejects a dirty or unbound current Editron source scope', () => {
    const input = validInput();
    mutable(input.source).relevantStatusEntries = [' M lib/editron/unsafe.ts'];
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(input))
      .toThrow(/SOURCE_SCOPE_DIRTY_OR_INVALID/);
  });

  it('rejects dropped tests, redistributed assertions and automatic retries', () => {
    const dropped = validInput();
    records(record(dropped.testRun.report).testResults).pop();
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(dropped))
      .toThrow(/TEST_FILE_SET_INVALID/);

    const redistributed = validInput();
    records(records(record(redistributed.testRun.report).testResults)[0]!.assertionResults).pop();
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(redistributed))
      .toThrow(/TEST_COUNTS_INVALID/);

    const retry = validInput();
    mutable(retry.testRun).automaticRetryCount = 1;
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(retry))
      .toThrow(/TEST_RUN_POLICY_INVALID/);
  });

  it('rejects tampered supporting and sentinel receipts', () => {
    const support = validInput();
    mutable(support.supportingArtifacts[0]!.receipt).overallDecision = 'FAIL';
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(support))
      .toThrow(/HREF01_REVIEW_RECEIPT_HASH_INVALID/);

    const sentinel = validInput();
    mutable(sentinel.dependencyOwnerSentinels).providerInferenceCallCount = 1;
    rehash(sentinel.dependencyOwnerSentinels);
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(sentinel))
      .toThrow(/DEPENDENCY_SENTINEL_INVALID/);
  });

  it('rejects paid dispatch, incomplete captures and duplicate route-owner evidence', () => {
    const dispatch = validInput();
    mutable(dispatch.testRun).paidProviderDispatchAuthorized = true;
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(dispatch))
      .toThrow(/TEST_RUN_POLICY_INVALID/);

    const capture = validInput();
    records(capture.zeroSpendPreflight.captures).pop();
    rehash(capture.zeroSpendPreflight);
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(capture))
      .toThrow(/PREFLIGHT_INVALID/);

    const duplicate = validInput();
    (duplicate.routeOwnerReceipts as JsonRecord[])[15] = duplicate.routeOwnerReceipts[0]!;
    expect(() => finalizeStage25FinalGeneralisationSourceBoundGateV1(duplicate))
      .toThrow(/ROUTE_OWNER_IDENTITY_DUPLICATED/);
  });
});

function validInput(): Stage25FinalGeneralisationSourceBoundInputV1 {
  const counts = [10, 6, 19, 7, 5, 5];
  const testResults = STAGE25_FINAL_GENERALISATION_SOURCE_BOUND_TEST_FILES_V1
    .map((name, fileIndex) => ({
      name: `D:/workspace/${name}`,
      status: 'passed',
      assertionResults: Array.from({ length: counts[fileIndex]! }, (_, assertionIndex) => ({
        title: `test-${fileIndex}-${assertionIndex}`, status: 'passed',
      })),
    }));
  const zeroSpendPreflight = hashed({
    readiness: 'READY_FOR_PROVIDER_ACCESS_AND_OFFICIAL_TOKEN_PREFLIGHT_NOT_INFERENCE',
    dispatchAuthorized: false,
    counts: {
      contemplatedRows: 24, capturedInitialRequests: 24,
      providerInferenceCalls: 0, projectMutations: 0,
    },
    captures: Array.from({ length: 24 }, (_, index) => ({ rowId: `row-${index}` })),
  });
  const scorecardSentinels = hashed({
    assessment: 'PASS_ZERO_SPEND_SCORECARD_SENTINELS',
    providerInferenceCalls: 0, projectMutations: 0,
  });
  const dependencyOwnerSentinels = hashed({
    assessment: 'PASS_ZERO_SPEND_OWNER_EXECUTION_NO_PUBLIC_CONTRACT_GAPS',
    providerInferenceCallCount: 0, canonicalProjectMutationCount: 0,
  });
  return {
    source: {
      commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40),
      relevantScopeSha256: 'c'.repeat(64), relevantTrackedFileCount: 2_000,
      relevantStatusEntries: [],
    },
    toolchain: { nodeVersion: 'v22.23.1', vitestVersion: '1.6.1' },
    testRun: {
      startedAt: '2026-08-26T00:00:00.000Z',
      completedAt: '2026-08-26T00:00:05.000Z',
      report: {
        success: true, numTotalTests: 52, numPassedTests: 52,
        numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, testResults,
      },
      runnerExitCode: 0, automaticRetryCount: 0,
      credentialNamesScrubbed: [...STAGE25_FINAL_GENERALISATION_CREDENTIAL_NAMES_V1],
      providerTransportMode: 'LOCAL_STUBS_AND_OWNER_PROBES_ONLY',
      paidProviderDispatchAuthorized: false,
    },
    zeroSpendPreflight,
    scorecardSentinels,
    dependencyOwnerSentinels,
    routeOwnerReceipts: routeOwners(),
    supportingArtifacts: [
      support('HREF01_REVIEW', hashed({ overallDecision: 'PASS',
        independentAgreement: 'UNVERIFIABLE_SINGLE_REVIEWER' })),
      support('RHC01_PREVIEW', hashed({ proof: {
        candidateIdentity: 'PASS', routeDecision: 'NOT_ISSUED',
      } }, 'receiptHash'), 'receiptHash'),
      support('RESUME_GATE', hashed({
        assessment: 'PASS_ZERO_SPEND_EXECUTABLE_RESUME_GATE',
      })),
      support('LONG_FORM_TRIAL', hashed({
        assessment: 'PASS_LOCAL_LONG_FORM_MEDIA_AND_WINDOW_MECHANICS',
      })),
    ],
  };
}

function routeOwners(): JsonRecord[] {
  return ['RHC-01', 'RHC-02', 'RHC-03', 'RHC-04'].flatMap((taskId) =>
    ['FREE_CHOICE', 'FORCED_NATIVE', 'FORCED_GENERATED_COMPOSITION', 'FORCED_HYBRID']
      .map((arm) => hashed({
        taskId, arm, evaluation: { assessment: 'PASS_SAFE_STOP' },
        externalCalls: {
          providerInferenceCalls: 0, renderCalls: 0, databaseCalls: 0,
          canonicalProjectMutationWrites: 0,
        },
      })));
}
function support(
  artifactId: 'HREF01_REVIEW' | 'RHC01_PREVIEW' | 'RESUME_GATE' | 'LONG_FORM_TRIAL',
  receipt: JsonRecord, receiptHashField: 'receiptSha256' | 'receiptHash' = 'receiptSha256',
) {
  return {
    artifactId, relativePath: `.calibration-temp/${artifactId}.json`,
    fileSha256: hashCanonicalJsonV1({ artifactId, file: true }), receiptHashField, receipt,
  };
}
function hashed(material: JsonRecord, field = 'receiptSha256'): JsonRecord {
  return { ...material, [field]: hashCanonicalJsonV1(material) };
}
function rehash(value: Readonly<JsonRecord>): void {
  const mutableValue = mutable(value); delete mutableValue.receiptSha256;
  mutableValue.receiptSha256 = hashCanonicalJsonV1(mutableValue);
}
function mutable(value: Readonly<JsonRecord>): JsonRecord { return value as JsonRecord; }
function record(value: unknown): JsonRecord { return value as JsonRecord; }
function records(value: unknown): JsonRecord[] { return value as JsonRecord[]; }
