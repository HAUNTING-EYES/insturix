import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1';
import {
  assertStage25FinalGeneralisationPaidAuthorizationV1,
  issueStage25FinalGeneralisationPaidAuthorizationV1,
  STAGE25_FINAL_GENERALISATION_MAX_SPEND_NANO_USD_V1,
  STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1,
  STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1,
} from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-authorization-v1';
import { preflightStage25FinalGeneralisationProvidersV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-preflight-v1';
import { finalizeStage25FinalGeneralisationProviderSourceGateV1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-source-gate-v1';

type JsonRecord = Record<string, unknown>;
const now = '2026-08-26T12:00:00.000Z';

describe('Stage 2.5 final generalisation paid authorization V1', () => {
  it('binds the exact confirmation to 24 rows and the frozen spend ceiling', async () => {
    const setup = await gate();
    expect(setup.authorization).toMatchObject({
      limits: { rows: 24, maximumProviderInferenceCalls: 48,
        maximumAttemptsPerRow: 2, maximumSchemaOrProtocolCorrectionsPerRow: 1,
        absoluteMaxCohortSpendNanoUsd:
          STAGE25_FINAL_GENERALISATION_MAX_SPEND_NANO_USD_V1 },
      networkPolicy: 'MODEL_INFERENCE_ONLY_NO_INTERNAL_TRANSPORT_RETRY',
      projectReadsAuthorized: 0, projectMutationsAuthorized: 0,
    });
    expect(setup.authorization.authorizedRows).toHaveLength(24);
    expect(new Set(setup.authorization.authorizedRows
      .map(({ rowId }) => rowId))).toHaveLength(24);
  });

  it('rejects an altered confirmation, ceiling, identity or expiry', async () => {
    const setup = await evidence();
    for (const approval of [
      { ...setup.approval, executeConfirmation: 'CONFIRM SOMETHING ELSE' },
      { ...setup.approval, confirmedMaxSpendUsd: '5.81' },
      { ...setup.approval, confirmedCohortSha256: '0'.repeat(64) },
      { ...setup.approval, expiresAt: '2026-08-28T12:00:00.000Z' },
    ]) {
      expect(() => issueStage25FinalGeneralisationPaidAuthorizationV1({
        readinessReceipt: setup.readiness, providerBundle: setup.bundle,
        approval: approval as never,
      })).toThrow(/APPROVAL_INVALID|AUTHORIZATION_EXPIRED/);
    }
  });

  it('rejects forged readiness even after the outer receipt is rehashed', async () => {
    const setup = await evidence();
    const readiness = structuredClone(setup.readiness) as JsonRecord;
    (readiness.providerPreflight as JsonRecord).absoluteTwoAttemptMaxSpendUsd = 1;
    const { receiptSha256: _old, ...material } = readiness;
    readiness.receiptSha256 = hashCanonicalJsonV1(material);
    expect(() => issueStage25FinalGeneralisationPaidAuthorizationV1({
      readinessReceipt: readiness, providerBundle: setup.bundle,
      approval: { ...setup.approval,
        confirmedReadinessReceiptSha256: String(readiness.receiptSha256) },
    })).toThrow('READINESS_INVALID');
  });

  it('rejects rehashed row, limit and state-effect authorization forgeries', async () => {
    const setup = await gate();
    for (const mutate of [
      (value: JsonRecord) => {
        (value.authorizedRows as JsonRecord[])[0]!.maximumProviderAttempts = 3;
      },
      (value: JsonRecord) => { (value.limits as JsonRecord).rows = 23; },
      (value: JsonRecord) => { value.stateEffects = ['project-write']; },
    ]) {
      const authorization = structuredClone(setup.authorization) as unknown as JsonRecord;
      mutate(authorization);
      const { authorizationSha256: _old, ...material } = authorization;
      authorization.authorizationSha256 = hashCanonicalJsonV1(material);
      expect(() => assertStage25FinalGeneralisationPaidAuthorizationV1({
        readinessReceipt: setup.readiness, providerBundle: setup.bundle,
        authorization, now,
      })).toThrow('AUTHORIZATION_INVALID');
    }
  });
});

async function gate() {
  const setup = await evidence();
  const authorization = issueStage25FinalGeneralisationPaidAuthorizationV1({
    readinessReceipt: setup.readiness, providerBundle: setup.bundle,
    approval: setup.approval,
  });
  return { ...setup, authorization };
}

async function evidence() {
  const bundle = await preflightStage25FinalGeneralisationProvidersV1({
    confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    operatorId: 'admin',
    environment: { OPENAI_API_KEY: 'openai-secret',
      GOOGLE_GENERATIVE_AI_API_KEY: 'google-secret' },
    fetchImpl: mockFetch, now,
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
    providerBundle: bundle,
    providerReceiptFileSha256: 'd'.repeat(64),
    requestCapturesFileSha256: 'e'.repeat(64),
  });
  const approval = {
    operatorId: 'admin', approvedAt: now, expiresAt: '2026-08-27T12:00:00.000Z',
    confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    confirmedReadinessReceiptSha256: readiness.receiptSha256,
    confirmedProviderPreflightReceiptSha256: String(bundle.receipt.receiptSha256),
    confirmedRequestCaptureSetSha256: String(bundle.receipt.requestCaptureSetSha256),
    executeConfirmation: STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1,
    confirmedMaxSpendUsd: STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1,
  } as const;
  return { bundle, readiness, approval };
}

function passingReport() {
  const counts = [10, 6, 19, 7, 5, 5, 5, 5, 4, 4, 3];
  return { success: true,
    numTotalTests: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    numPassedTests: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1.map(
      (name, index) => ({ name: `D:/repo/${name}`,
        assertionResults: Array.from({ length: counts[index] }, () => ({ status: 'passed' })) }),
    ) };
}
async function mockFetch(url: URL | RequestInfo): Promise<Response> {
  const target = String(url);
  if (target.endsWith('/gpt-5.6-luna')) return json({ id: 'gpt-5.6-luna' });
  if (target.endsWith('/gpt-5.6-terra')) return json({ id: 'gpt-5.6-terra' });
  if (target.endsWith('/gemini-3.7-flash')) {
    return json({ name: 'models/gemini-3.7-flash' });
  }
  if (target.endsWith(':countTokens')) return json({ totalTokens: 20_000 });
  return json({ error: 'unexpected endpoint' }, 500);
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status,
    headers: { 'content-type': 'application/json' } });
}
