import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1';
import { preflightStage25FinalGeneralisationProvidersV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-preflight-v1';
import {
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1,
  finalizeStage25FinalGeneralisationProviderSourceGateV1,
  type Stage25FinalProviderSourceGateInputV1,
} from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-source-gate-v1';

type ProviderBundle = Awaited<ReturnType<
  typeof preflightStage25FinalGeneralisationProvidersV1
>>;
type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T[Key] extends object ? Mutable<T[Key]> : T[Key];
};
let providerBundle: ProviderBundle;

beforeAll(async () => {
  providerBundle = await preflightStage25FinalGeneralisationProvidersV1({
    confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    operatorId: 'admin',
    environment: { OPENAI_API_KEY: 'openai-secret',
      GOOGLE_GENERATIVE_AI_API_KEY: 'google-secret' },
    fetchImpl: mockFetch,
    now: '2026-08-26T12:00:00.000Z',
  });
});

describe('Stage 2.5 final provider source gate V1', () => {
  it('issues only a source-bound readiness receipt for explicit paid authorization', () => {
    const receipt = finalizeStage25FinalGeneralisationProviderSourceGateV1(base());
    expect(receipt).toMatchObject({
      authority: 'SOURCE_BOUND_PROVIDER_ACCESS_PREFLIGHT_NO_INFERENCE',
      testCounts: { total: 70, passed: 70, failed: 0 },
      readiness: 'READY_FOR_EXPLICIT_CAPPED_24_ROW_PAID_AUTHORIZATION_NOT_INFERENCE',
      paidProviderDispatchAuthorized: false,
      providerInferenceCallCount: 0,
      canonicalProjectMutationCount: 0,
    });
    expect(receipt.providerPreflight).toMatchObject({
      receiptSha256: providerBundle.receipt.receiptSha256,
      requestCaptureSetSha256: providerBundle.receipt.requestCaptureSetSha256,
      networkCalls: { modelMetadataGets: 3, googleCountTokensPosts: 8,
        inferenceCalls: 0 },
    });
  });

  it('rejects dirty or malformed source identity', () => {
    const dirty = mutableBase();
    dirty.source.relevantStatusEntries = ['M lib/editron/unsafe.ts'];
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(dirty))
      .toThrow('SOURCE_SCOPE_DIRTY_OR_INVALID');
    const wrongCommit = mutableBase();
    wrongCommit.source.commitSha = 'not-a-commit';
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(wrongCommit))
      .toThrow('SOURCE_SCOPE_DIRTY_OR_INVALID');
  });

  it('rejects missing, redistributed, failed or retried tests', () => {
    const missing = mutableBase();
    report(missing).testResults.pop();
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(missing))
      .toThrow('TEST_REPORT_INVALID');
    const failed = mutableBase();
    report(failed).numPassedTests = 69 as never;
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(failed))
      .toThrow('TEST_REPORT_INVALID');
    const retried = mutableBase();
    retried.testRun.automaticRetryCount = 1 as never;
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(retried))
      .toThrow('TEST_RUN_POLICY_INVALID');
  });

  it('rejects a rehashed forged provider receipt or capture set', () => {
    const forged = mutableBase();
    const receipt = forged.providerBundle.receipt as Record<string, unknown>;
    receipt.projectReads = 1;
    const { receiptSha256: _hash, ...material } = receipt;
    receipt.receiptSha256 = hashCanonicalJsonV1(material);
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(forged))
      .toThrow('BUNDLE_INVALID');
    const capture = mutableBase();
    capture.providerBundle.captures[0] = {
      ...capture.providerBundle.captures[0], requestSha256: 'f'.repeat(64),
    };
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(capture))
      .toThrow('BUNDLE_INVALID');
  });

  it('rejects forged file hashes and credential-scrub policy drift', () => {
    const hash = mutableBase();
    hash.providerReceiptFileSha256 = 'bad';
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(hash))
      .toThrow('ARTIFACT_FILE_HASH_INVALID');
    const credentials = mutableBase();
    credentials.testRun.credentialNamesScrubbed = ['OPENAI_API_KEY'];
    expect(() => finalizeStage25FinalGeneralisationProviderSourceGateV1(credentials))
      .toThrow('TEST_RUN_POLICY_INVALID');
  });
});

function base(): Stage25FinalProviderSourceGateInputV1 {
  return structuredClone({
    source: { commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40),
      relevantScopeSha256: 'c'.repeat(64), relevantTrackedFileCount: 1_950,
      relevantStatusEntries: [] },
    toolchain: { nodeVersion: 'v22.23.1', vitestVersion: '1.6.1' },
    testRun: { startedAt: '2026-08-26T12:00:00.000Z',
      completedAt: '2026-08-26T12:01:00.000Z', report: passingReport(),
      runnerExitCode: 0, automaticRetryCount: 0,
      credentialNamesScrubbed: [...STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1] },
    providerBundle,
    providerReceiptFileSha256: 'd'.repeat(64),
    requestCapturesFileSha256: 'e'.repeat(64),
  });
}
function mutableBase(): Mutable<Stage25FinalProviderSourceGateInputV1> {
  return structuredClone(base()) as Mutable<Stage25FinalProviderSourceGateInputV1>;
}
function passingReport() {
  const counts = [10, 6, 19, 7, 5, 5, 5, 5, 4, 4];
  return { success: true, numTotalTests: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    numPassedTests: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1.map((name, index) => ({
      name: `D:/repo/${name}`,
      assertionResults: Array.from({ length: counts[index] }, () => ({ status: 'passed' })),
    })) };
}
function report(input: Stage25FinalProviderSourceGateInputV1) {
  return input.testRun.report as ReturnType<typeof passingReport>;
}
async function mockFetch(url: URL | RequestInfo): Promise<Response> {
  const target = String(url);
  if (target.endsWith('/gpt-5.6-luna')) return json({ id: 'gpt-5.6-luna' });
  if (target.endsWith('/gpt-5.6-terra')) return json({ id: 'gpt-5.6-terra' });
  if (target.endsWith('/gemini-3.7-flash')) return json({ name: 'models/gemini-3.7-flash' });
  if (target.endsWith(':countTokens')) return json({ totalTokens: 20_000 });
  return json({ error: 'unexpected endpoint' }, 500);
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status,
    headers: { 'content-type': 'application/json' } });
}
