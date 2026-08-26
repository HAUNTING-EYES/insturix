import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1';
import { issueStage25FinalGeneralisationPaidAuthorizationV1,
  STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1,
  STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-authorization-v1';
import { preflightStage25FinalGeneralisationProvidersV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-preflight-v1';
import { finalizeStage25FinalGeneralisationProviderSourceGateV1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-source-gate-v1';
import type { Stage25FinalGeneralisationPaidDurablePortV1,
  Stage25FinalGeneralisationPaidDurableStateV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-runner-contract-v1';
import { runStage25FinalGeneralisationPaidCohortV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-runner-v1';

type JsonRecord = Record<string, unknown>;
const now = '2026-08-26T12:00:00.000Z';
const environment = { OPENAI_API_KEY: 'openai-secret',
  GOOGLE_GENERATIVE_AI_API_KEY: 'google-secret' } as const;
type Setup = Awaited<ReturnType<typeof setup>>;
let frozen: Setup;

describe('Stage 2.5 final generalisation paid runner V1', () => {
  beforeAll(async () => { frozen = await setup(); }, 30_000);

  it('runs 24 exact first requests and at most one public correction per row', async () => {
    const calls: string[] = [];
    const result = await run(frozen, memoryPort(), invalidFinishFetch(calls));
    expect(calls).toHaveLength(48);
    expect(result.rows).toHaveLength(24);
    expect(result.rows.every(({ attempts }) => attempts.length === 2)).toBe(true);
    expect(result.rows.every(({ scorecardRow }) =>
      scorecardRow.assessment === 'FAIL_MODEL_OR_TASK')).toBe(true);
    const captureMap = new Map(frozen.bundle.captures.map((capture) =>
      [capture.rowId, capture.requestSha256]));
    for (const row of result.rows) {
      expect(row.attempts[0]!.requestSha256).toBe(captureMap.get(row.rowId));
      expect(row.attempts[1]!.requestSha256).not.toBe(row.attempts[0]!.requestSha256);
      expect(row.projectReads).toBe(0);
      expect(row.projectMutations).toBe(0);
    }
    expect(result.receipt.accounting).toMatchObject({
      providerDispatchesAccounted: 48, providerResponsesObserved: 48,
    });
    expect(result.receipt.accounting.spentNanoUsd)
      .toBeLessThanOrEqual(frozen.authorization.limits.absoluteMaxCohortSpendNanoUsd);
  }, 60_000);

  it('does not retry provider HTTP failures', async () => {
    const calls: string[] = [];
    const result = await run(frozen, memoryPort(), httpFailureFetch(calls));
    expect(calls).toHaveLength(24);
    expect(result.rows.every(({ attempts, scorecardRow }) => attempts.length === 1
      && scorecardRow.assessment === 'NOT_EVALUATED_PROVIDER_INFRASTRUCTURE')).toBe(true);
  }, 60_000);

  it('replays persisted responses locally after a row-commit crash', async () => {
    const calls: string[] = [];
    const port = memoryPort({ failCommitRowOnce: true });
    await expect(run(frozen, port, invalidFinishFetch(calls))).rejects.toThrow('TEST_ROW_COMMIT_CRASH');
    expect(calls).toHaveLength(2);
    const result = await run(frozen, port, invalidFinishFetch(calls));
    expect(result.rows).toHaveLength(24);
    expect(calls).toHaveLength(48);
    expect(result.rows[0]!.attempts.map(({ observation }) => observation))
      .toEqual(['PERSISTED_RESPONSE_REPLAY', 'PERSISTED_RESPONSE_REPLAY']);
  }, 60_000);

  it('never repeats a request whose transport result became unknown', async () => {
    const calls: string[] = [];
    const port = memoryPort({ failCommitRowOnce: true });
    await expect(run(frozen, port, unknownFirstFetch(calls))).rejects.toThrow('TEST_ROW_COMMIT_CRASH');
    expect(calls).toHaveLength(1);
    const result = await run(frozen, port, httpFailureFetch(calls));
    expect(calls).toHaveLength(24);
    expect(result.rows[0]!.attempts[0]!.observation)
      .toBe('TRANSPORT_RESULT_UNKNOWN_NO_RETRY');
  }, 60_000);
});

async function run(setupValue: Setup,
  durablePort: Stage25FinalGeneralisationPaidDurablePortV1, fetchImpl: typeof fetch) {
  let ms = 0;
  return runStage25FinalGeneralisationPaidCohortV1({
    readinessReceipt: setupValue.readiness, providerBundle: setupValue.bundle,
    authorization: setupValue.authorization, durablePort, environment, fetchImpl,
    now: () => now, nowMs: () => ++ms,
  });
}

function memoryPort(options: { failCommitRowOnce?: boolean } = {}) {
  const state = new Map<string, Stage25FinalGeneralisationPaidDurableStateV1>();
  let failed = false;
  const port: Stage25FinalGeneralisationPaidDurablePortV1 = {
    load: async (rowId) => structuredClone(state.get(rowId) ?? { attempts: [] }),
    commitDispatch: async ({ rowId, dispatch }) => {
      const current = structuredClone(state.get(rowId) ?? { attempts: [] });
      if (current.completedRow || current.attempts.some(({ dispatch: prior }) =>
        prior.attempt === dispatch.attempt)) throw new Error('TEST_DUPLICATE_DISPATCH');
      state.set(rowId, { attempts: [...current.attempts, { dispatch }] });
    },
    commitResponse: async ({ rowId, response }) => {
      const current = structuredClone(state.get(rowId) ?? { attempts: [] });
      const attempts = current.attempts.map((attempt) =>
        attempt.dispatch.attempt === response.attempt ? { ...attempt, response } : attempt);
      if (!attempts.some(({ response: value }) => value?.receiptSha256 === response.receiptSha256)) {
        throw new Error('TEST_RESPONSE_WITHOUT_DISPATCH');
      }
      state.set(rowId, { attempts });
    },
    commitRow: async ({ rowId, row }) => {
      if (options.failCommitRowOnce && !failed) {
        failed = true;
        throw new Error('TEST_ROW_COMMIT_CRASH');
      }
      state.set(rowId, { completedRow: row, attempts: [] });
    },
  };
  return port;
}

function invalidFinishFetch(calls: string[]): typeof fetch {
  return async (target, init) => {
    const url = String(target); const body = JSON.parse(String(init?.body)) as JsonRecord;
    calls.push(hashCanonicalJsonV1({ endpoint: url, body }));
    const args = { disposition: 'READY_FOR_PROOF' };
    const model = String(body.model); const id = `response-${calls.length}`;
    return json(url.endsWith('/responses') ? {
      id, model, status: 'completed', output: [{ type: 'function_call',
        call_id: `finish-${id}`, name: 'finish_editron_research_episode',
        arguments: JSON.stringify(args) }], usage: openAiUsage(),
    } : { id, model, status: 'completed', steps: [{ type: 'function_call',
      id: `finish-${id}`, name: 'finish_editron_research_episode', arguments: args }],
    usage: googleUsage() });
  };
}
function httpFailureFetch(calls: string[]): typeof fetch {
  return async (target, init) => {
    calls.push(hashCanonicalJsonV1({ endpoint: String(target), body: String(init?.body) }));
    return json({ error: 'provider unavailable' }, 503);
  };
}
function unknownFirstFetch(calls: string[]): typeof fetch {
  return async (target, init) => {
    calls.push(hashCanonicalJsonV1({ endpoint: String(target), body: String(init?.body) }));
    throw new TypeError('simulated unknown transport result');
  };
}

async function setup() {
  const bundle = await preflightStage25FinalGeneralisationProvidersV1({
    confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    operatorId: 'admin', environment, fetchImpl: preflightFetch, now,
  });
  const readiness = finalizeStage25FinalGeneralisationProviderSourceGateV1({
    source: { commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40),
      relevantScopeSha256: 'c'.repeat(64), relevantTrackedFileCount: 1_925,
      relevantStatusEntries: [] },
    toolchain: { nodeVersion: 'v22.23.1', vitestVersion: '1.6.1' },
    testRun: { startedAt: now, completedAt: now, report: passingReport(),
      runnerExitCode: 0, automaticRetryCount: 0,
      credentialNamesScrubbed:
        [...STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1] },
    providerBundle: bundle, providerReceiptFileSha256: 'd'.repeat(64),
    requestCapturesFileSha256: 'e'.repeat(64),
  });
  const authorization = issueStage25FinalGeneralisationPaidAuthorizationV1({
    readinessReceipt: readiness, providerBundle: bundle,
    approval: { operatorId: 'admin', approvedAt: now,
      expiresAt: '2026-08-27T12:00:00.000Z',
      confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
      confirmedReadinessReceiptSha256: readiness.receiptSha256,
      confirmedProviderPreflightReceiptSha256: String(bundle.receipt.receiptSha256),
      confirmedRequestCaptureSetSha256: String(bundle.receipt.requestCaptureSetSha256),
      executeConfirmation: STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1,
      confirmedMaxSpendUsd: STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1 },
  });
  return { bundle, readiness, authorization };
}

async function preflightFetch(target: URL | RequestInfo): Promise<Response> {
  const url = String(target);
  if (url.endsWith('/gpt-5.6-luna')) return json({ id: 'gpt-5.6-luna' });
  if (url.endsWith('/gpt-5.6-terra')) return json({ id: 'gpt-5.6-terra' });
  if (url.endsWith('/gemini-3.7-flash')) return json({ name: 'models/gemini-3.7-flash' });
  if (url.endsWith(':countTokens')) return json({ totalTokens: 20_000 });
  return json({ error: 'unexpected endpoint' }, 500);
}
function passingReport() {
  const counts = [10, 6, 19, 7, 5, 5, 5, 5, 4, 4];
  return { success: true, numTotalTests: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    numPassedTests: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1.map(
      (name, index) => ({ name: `D:/repo/${name}`,
        assertionResults: Array.from({ length: counts[index] }, () => ({ status: 'passed' })) })) };
}
function openAiUsage() { return { input_tokens: 1_000, output_tokens: 500,
  total_tokens: 1_500, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 0 } }; }
function googleUsage() { return { total_input_tokens: 1_000, total_cached_tokens: 0,
  total_output_tokens: 500, total_thought_tokens: 0, total_tokens: 1_500 }; }
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value),
  { status, headers: { 'content-type': 'application/json' } }); }
