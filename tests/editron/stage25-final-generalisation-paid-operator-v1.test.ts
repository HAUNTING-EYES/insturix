import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1';
import { createStage25FinalGeneralisationPaidFilesystemPortV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-filesystem-port-v1';
import { STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1,
  STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-authorization-v1';
import { preflightStage25FinalGeneralisationProvidersV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-preflight-v1';
import { finalizeStage25FinalGeneralisationProviderSourceGateV1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-source-gate-v1';
import { createStage25FinalGeneralisationPaidDispatchV1,
  createStage25FinalGeneralisationPaidResponseV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-runner-contract-v1';
import { runStage25FinalGeneralisationPaidOperatorV1 }
  from './helpers/stage25-final-generalisation-paid-operator-v1';
import { stage25FinalProviderSourceIdentityV1 }
  from './helpers/stage25-final-generalisation-provider-preflight-operator-v1';

type JsonRecord = Record<string, unknown>;
const execFileAsync = promisify(execFile);
const roots: string[] = [];
const openAiSecret = 'openai-test-secret-value-123456';
const googleSecret = 'google-test-secret-value-123456';
const fixedNow = new Date('2026-08-26T12:00:00.000Z');

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Stage 2.5 final paid filesystem and operator V1', () => {
  it('persists dispatch and response receipts across port instances', async () => {
    const root = await temporaryRoot();
    const request = requestFixture();
    const dispatch = createStage25FinalGeneralisationPaidDispatchV1({
      rowId: 'row:1', attempt: 1, authorizationSha256: 'a'.repeat(64),
      rowAuthorizationSha256: 'b'.repeat(64), request,
      reservedWorstCaseNanoUsd: 1_000, createdAt: fixedNow.toISOString(),
    });
    const first = await createStage25FinalGeneralisationPaidFilesystemPortV1({ root });
    await first.commitDispatch({ rowId: dispatch.rowId, dispatch });
    const response = createStage25FinalGeneralisationPaidResponseV1({
      dispatch, status: 503, body: { error: 'unavailable' },
      receivedAt: fixedNow.toISOString(),
    });
    await first.commitResponse({ rowId: dispatch.rowId, response });
    const second = await createStage25FinalGeneralisationPaidFilesystemPortV1({ root });
    const state = await second.load(dispatch.rowId);
    expect(state.attempts[0]).toEqual({ dispatch, response });
    await expect(second.commitDispatch({ rowId: dispatch.rowId, dispatch }))
      .rejects.toThrow('DISPATCH_ORDER_INVALID');
  });

  it('fails closed on secret-bearing or response-without-dispatch state', async () => {
    const root = await temporaryRoot();
    const port = await createStage25FinalGeneralisationPaidFilesystemPortV1({
      root, forbiddenSecrets: [openAiSecret],
    });
    const request = requestFixture({ note: openAiSecret });
    const dispatch = createStage25FinalGeneralisationPaidDispatchV1({
      rowId: 'row:secret', attempt: 1, authorizationSha256: 'a'.repeat(64),
      rowAuthorizationSha256: 'b'.repeat(64), request,
      reservedWorstCaseNanoUsd: 1_000, createdAt: fixedNow.toISOString(),
    });
    await expect(port.commitDispatch({ rowId: dispatch.rowId, dispatch }))
      .rejects.toThrow('SECRET_LEAK');
    const cleanDispatch = createStage25FinalGeneralisationPaidDispatchV1({
      rowId: 'row:missing', attempt: 1, authorizationSha256: 'a'.repeat(64),
      rowAuthorizationSha256: 'b'.repeat(64), request: requestFixture(),
      reservedWorstCaseNanoUsd: 1_000, createdAt: fixedNow.toISOString(),
    });
    const response = createStage25FinalGeneralisationPaidResponseV1({
      dispatch: cleanDispatch, status: 503, body: {}, receivedAt: fixedNow.toISOString(),
    });
    await expect(port.commitResponse({ rowId: cleanDispatch.rowId, response }))
      .rejects.toThrow('RESPONSE_WITHOUT_DISPATCH');
  });

  it('runs 24 rows once, resumes without spending, and rejects stale source', async () => {
    const setup = await operatorFixture();
    const calls: string[] = [];
    const input = { workspaceRoot: setup.workspace, artifactParent: setup.artifacts,
      preflightExecutionRoot: setup.preflight, operatorId: 'admin',
      executeConfirmation: STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1,
      confirmedMaxSpendUsd: STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1,
      localEnvironmentFile: setup.localEnv, productionEnvironmentFile: setup.productionEnv,
      clock: () => fixedNow, nowMs: incrementingClock(),
      fetchImpl: failingInference(calls) } as const;
    const first = await runStage25FinalGeneralisationPaidOperatorV1(input);
    expect(calls).toHaveLength(24);
    expect(first).toMatchObject({ rows: 24,
      assessments: { NOT_EVALUATED_PROVIDER_INFRASTRUCTURE: 24 } });
    const serialized = await readFile(path.join(first.executionRoot, 'cohort-result.json'), 'utf8');
    expect(serialized).not.toContain(openAiSecret);
    expect(serialized).not.toContain(googleSecret);
    calls.length = 0;
    const resumed = await runStage25FinalGeneralisationPaidOperatorV1({
      ...input, fetchImpl: failingInference(calls), nowMs: incrementingClock(),
    });
    expect(calls).toHaveLength(0);
    expect(resumed.cohortReceiptSha256).toBe(first.cohortReceiptSha256);

    const stale = path.join(setup.root, 'stale-preflight');
    await cp(setup.preflight, stale, { recursive: true });
    const readinessPath = path.join(stale, 'readiness-receipt.json');
    const readiness = JSON.parse(await readFile(readinessPath, 'utf8')) as JsonRecord;
    (readiness.source as JsonRecord).commitSha = 'f'.repeat(40);
    const { receiptSha256: _old, ...material } = readiness;
    readiness.receiptSha256 = hashCanonicalJsonV1(material);
    await writeFile(readinessPath, `${JSON.stringify(readiness, null, 2)}\n`);
    await expect(runStage25FinalGeneralisationPaidOperatorV1({
      ...input, preflightExecutionRoot: stale, executionSuffix: 'v2',
    })).rejects.toThrow('SOURCE_BINDING_MISMATCH');
  }, 60_000);
});

async function operatorFixture() {
  const root = await temporaryRoot();
  const workspace = path.join(root, 'workspace');
  const preflight = path.join(root, 'preflight');
  const artifacts = path.join(root, 'artifacts');
  await mkdir(path.join(workspace, 'lib/editron'), { recursive: true });
  await writeFile(path.join(workspace, 'lib/editron/source.ts'), 'export const source = true;\n');
  await git(workspace, ['init']);
  await git(workspace, ['config', 'user.email', 'editron-test@example.com']);
  await git(workspace, ['config', 'user.name', 'Editron Test']);
  await git(workspace, ['add', '--', 'lib/editron/source.ts']);
  await git(workspace, ['commit', '-m', 'fixture']);
  const localEnv = path.join(workspace, '.env.local');
  const productionEnv = path.join(workspace, '.env.production-test');
  await writeFile(localEnv, `OPENAI_API_KEY=${openAiSecret}\n`);
  await writeFile(productionEnv, `GOOGLE_GENERATIVE_AI_API_KEY=${googleSecret}\n`);
  const source = await stage25FinalProviderSourceIdentityV1(workspace);
  const bundle = await preflightStage25FinalGeneralisationProvidersV1({
    confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    operatorId: 'admin', environment: { OPENAI_API_KEY: openAiSecret,
      GOOGLE_GENERATIVE_AI_API_KEY: googleSecret }, fetchImpl: preflightFetch,
    now: fixedNow.toISOString(),
  });
  const providerBytes = bytes(bundle.receipt); const captureBytes = bytes(bundle.captures);
  const readiness = finalizeStage25FinalGeneralisationProviderSourceGateV1({
    source, toolchain: { nodeVersion: process.version, vitestVersion: '1.6.1' },
    testRun: { startedAt: fixedNow.toISOString(), completedAt: fixedNow.toISOString(),
      report: passingReport(), runnerExitCode: 0, automaticRetryCount: 0,
      credentialNamesScrubbed:
        [...STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1] },
    providerBundle: bundle, providerReceiptFileSha256: sha(providerBytes),
    requestCapturesFileSha256: sha(captureBytes),
  });
  await mkdir(preflight, { recursive: true });
  await Promise.all([
    writeFile(path.join(preflight, 'provider-preflight-receipt.json'), providerBytes),
    writeFile(path.join(preflight, 'request-captures.json'), captureBytes),
    writeFile(path.join(preflight, 'readiness-receipt.json'), bytes(readiness)),
  ]);
  return { root, workspace, preflight, artifacts, localEnv, productionEnv };
}

function passingReport() {
  const counts = new Map<string, number>([
    ['tests/editron/stage25-final-generalisation-v1.test.ts', 10],
    ['tests/editron/stage25-generalisation-scorecard-v1.test.ts', 6],
    ['tests/editron/open-ended-planner-v2-stage25-dependency-diversity-holdout.test.ts', 19],
    ['tests/editron/stage25-heldout-route-owner-materialization-v1.test.ts', 7],
    ['tests/editron/stage25-project-service-conflict-trial-v1.test.ts', 5],
    ['tests/editron/stage25-final-generalisation-source-bound-gate-v1.test.ts', 5],
    ['tests/editron/stage25-final-generalisation-provider-preflight-v1.test.ts', 5],
    ['tests/editron/stage25-final-generalisation-provider-source-gate-v1.test.ts', 5],
    ['tests/editron/stage25-final-generalisation-paid-authorization-v1.test.ts', 4],
    ['tests/editron/stage25-final-generalisation-paid-runner-v1.test.ts', 4],
    ['tests/editron/stage25-final-generalisation-paid-operator-v1.test.ts', 3],
  ]);
  return { success: true, numTotalTests: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    numPassedTests: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_COUNT_V1,
    numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1.map((name) => ({
      name: `D:/repo/${name}`, assertionResults: Array.from(
        { length: counts.get(name) ?? 0 }, () => ({ status: 'passed' })),
    })) };
}
function requestFixture(body: JsonRecord = { objective: 'test' }) {
  const endpoint = 'https://api.openai.com/v1/responses';
  return { endpoint, body, requestHash: hashCanonicalJsonV1({ endpoint, body }) } as never;
}
function failingInference(calls: string[]): typeof fetch {
  return async (target, init) => { calls.push(hashCanonicalJsonV1({ target: String(target),
    body: String(init?.body) })); return json({ error: 'provider unavailable' }, 503); };
}
async function preflightFetch(target: URL | RequestInfo): Promise<Response> {
  const url = String(target);
  if (url.endsWith('/gpt-5.6-luna')) return json({ id: 'gpt-5.6-luna' });
  if (url.endsWith('/gpt-5.6-terra')) return json({ id: 'gpt-5.6-terra' });
  if (url.endsWith('/gemini-3.7-flash')) return json({ name: 'models/gemini-3.7-flash' });
  if (url.endsWith(':countTokens')) return json({ totalTokens: 20_000 });
  return json({ error: 'unexpected endpoint' }, 500);
}
async function temporaryRoot() { const root = await mkdtemp(path.join(tmpdir(), 'editron-s25-'));
  roots.push(root); return root; }
async function git(root: string, args: string[]) { await execFileAsync('git', args,
  { cwd: root, windowsHide: true }); }
function incrementingClock() { let value = 0; return () => ++value; }
function bytes(value: unknown) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
function sha(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value),
  { status, headers: { 'content-type': 'application/json' } }); }
