import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseEnv } from 'dotenv';

import { hashCanonicalJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1';
import { createStage25FinalGeneralisationPaidFilesystemPortV1,
  writeDurableExclusiveJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-filesystem-port-v1';
import { assertStage25FinalGeneralisationPaidAuthorizationV1,
  issueStage25FinalGeneralisationPaidAuthorizationV1,
  STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1,
  STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-authorization-v1';
import { assertStage25FinalGeneralisationProviderPreflightBundleV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-preflight-v1';
import { runStage25FinalGeneralisationPaidCohortV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-runner-v1';
import { stage25FinalProviderSourceIdentityV1 }
  from './stage25-final-generalisation-provider-preflight-operator-v1';

type JsonRecord = Record<string, unknown>;
const DAY_MS = 24 * 60 * 60 * 1_000;

export async function runStage25FinalGeneralisationPaidOperatorV1(input: {
  workspaceRoot: string;
  artifactParent: string;
  preflightExecutionRoot: string;
  operatorId: string;
  executeConfirmation: string;
  confirmedMaxSpendUsd: string;
  localEnvironmentFile?: string;
  productionEnvironmentFile?: string;
  executionSuffix?: string;
  fetchImpl?: typeof fetch;
  clock?: () => Date;
  nowMs?: () => number;
}) {
  if (input.executeConfirmation !== STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1
    || input.confirmedMaxSpendUsd !== STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1) {
    fail('EXPLICIT_AUTHORIZATION_INVALID');
  }
  const source = await stage25FinalProviderSourceIdentityV1(input.workspaceRoot);
  if (source.relevantStatusEntries.length) fail('SOURCE_SCOPE_DIRTY');
  const evidence = await loadPreflight(input.preflightExecutionRoot);
  assertSourceBinding(source, evidence.readiness);
  const environment = await loadCredentials(input);
  const clock = input.clock ?? (() => new Date());
  const suffix = input.executionSuffix ?? 'v1';
  if (!/^v[1-9]\d*$/.test(suffix)) fail('EXECUTION_SUFFIX_INVALID');
  const executionId = `stage25-final-paid-${source.commitSha.slice(0, 9)}-${suffix}`;
  const artifactParent = path.resolve(input.artifactParent);
  const executionRoot = path.join(artifactParent, executionId);
  await mkdir(artifactParent, { recursive: true });
  await mkdir(executionRoot, { recursive: true });
  const secrets = Object.values(environment);
  const authorizationPath = path.join(executionRoot, 'authorization.json');
  const authorization = await readOrIssueAuthorization({ input, evidence,
    authorizationPath, clock, secrets });
  const runContract = contract(source, evidence, authorization.authorizationSha256);
  await writeOrVerify(path.join(executionRoot, 'run-contract.json'), runContract, secrets);
  const durablePort = await createStage25FinalGeneralisationPaidFilesystemPortV1({
    root: path.join(executionRoot, 'durable'), forbiddenSecrets: secrets,
  });
  const output = await runStage25FinalGeneralisationPaidCohortV1({
    readinessReceipt: evidence.readiness, providerBundle: evidence.bundle,
    authorization, durablePort, environment,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    now: () => clock().toISOString(), ...(input.nowMs ? { nowMs: input.nowMs } : {}),
  });
  await writeOrVerify(path.join(executionRoot, 'cohort-result.json'), output, secrets);
  return {
    executionId, executionRoot,
    authorizationSha256: authorization.authorizationSha256,
    cohortReceiptSha256: output.receipt.receiptSha256,
    rows: output.rows.length, accounting: output.receipt.accounting,
    assessments: Object.fromEntries([...new Set(output.rows.map(
      ({ scorecardRow }) => scorecardRow.assessment,
    ))].map((assessment) => [assessment, output.rows.filter(
      ({ scorecardRow }) => scorecardRow.assessment === assessment,
    ).length])),
  };
}

async function loadPreflight(rootInput: string) {
  const root = path.resolve(rootInput);
  const providerBytes = await readFile(path.join(root, 'provider-preflight-receipt.json'));
  const captureBytes = await readFile(path.join(root, 'request-captures.json'));
  const readiness = JSON.parse(await readFile(
    path.join(root, 'readiness-receipt.json'), 'utf8',
  )) as JsonRecord;
  const bundle = assertStage25FinalGeneralisationProviderPreflightBundleV1({
    receipt: JSON.parse(providerBytes.toString('utf8')) as JsonRecord,
    captures: JSON.parse(captureBytes.toString('utf8')) as never,
  });
  const provider = record(readiness.providerPreflight);
  if (provider.receiptFileSha256 !== sha(providerBytes)
    || provider.requestCapturesFileSha256 !== sha(captureBytes)) {
    fail('PREFLIGHT_FILE_HASH_MISMATCH');
  }
  return { bundle, readiness };
}
async function readOrIssueAuthorization(input: {
  input: Parameters<typeof runStage25FinalGeneralisationPaidOperatorV1>[0];
  evidence: Awaited<ReturnType<typeof loadPreflight>>;
  authorizationPath: string;
  clock: () => Date;
  secrets: readonly string[];
}) {
  if (await exists(input.authorizationPath)) {
    return assertStage25FinalGeneralisationPaidAuthorizationV1({
      readinessReceipt: input.evidence.readiness, providerBundle: input.evidence.bundle,
      authorization: await readJson(input.authorizationPath),
      now: input.clock().toISOString(),
    });
  }
  const approvedAt = input.clock();
  const authorization = issueStage25FinalGeneralisationPaidAuthorizationV1({
    readinessReceipt: input.evidence.readiness, providerBundle: input.evidence.bundle,
    approval: { operatorId: input.input.operatorId,
      approvedAt: approvedAt.toISOString(),
      expiresAt: new Date(approvedAt.getTime() + DAY_MS).toISOString(),
      confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
      confirmedReadinessReceiptSha256: String(input.evidence.readiness.receiptSha256),
      confirmedProviderPreflightReceiptSha256:
        String(input.evidence.bundle.receipt.receiptSha256),
      confirmedRequestCaptureSetSha256:
        String(input.evidence.bundle.receipt.requestCaptureSetSha256),
      executeConfirmation: STAGE25_FINAL_GENERALISATION_PAID_CONFIRMATION_V1,
      confirmedMaxSpendUsd: STAGE25_FINAL_GENERALISATION_MAX_SPEND_USD_V1 },
  });
  await writeDurableExclusiveJsonV1({ filePath: input.authorizationPath,
    value: authorization, forbiddenSecrets: input.secrets });
  return authorization;
}
function contract(source: Awaited<ReturnType<typeof stage25FinalProviderSourceIdentityV1>>,
  evidence: Awaited<ReturnType<typeof loadPreflight>>, authorizationSha256: string) {
  const material = { version: 'EDITRON_STAGE25_FINAL_PAID_OPERATOR_V1_1',
    authority: 'RESEARCH_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY', source,
    readinessReceiptSha256: evidence.readiness.receiptSha256,
    providerPreflightReceiptSha256: evidence.bundle.receipt.receiptSha256,
    requestCaptureSetSha256: evidence.bundle.receipt.requestCaptureSetSha256,
    authorizationSha256, automaticTransportRetryCount: 0,
    projectReads: 0, projectMutations: 0, stateEffects: [] };
  return { ...material, receiptSha256: hashCanonicalJsonV1(material) };
}
function assertSourceBinding(source: Awaited<ReturnType<
  typeof stage25FinalProviderSourceIdentityV1>>, readiness: JsonRecord): void {
  const expected = record(readiness.source);
  if (expected.commitSha !== source.commitSha || expected.treeSha !== source.treeSha
    || expected.relevantScopeSha256 !== source.relevantScopeSha256
    || expected.relevantTrackedFileCount !== source.relevantTrackedFileCount
    || expected.relevantWorktreeClean !== true) fail('SOURCE_BINDING_MISMATCH');
}
async function loadCredentials(input: { workspaceRoot: string;
  localEnvironmentFile?: string; productionEnvironmentFile?: string }) {
  const [local, production] = await Promise.all([
    readFile(path.resolve(input.localEnvironmentFile
      ?? path.join(input.workspaceRoot, '.env.local'))).then(parseEnv),
    readFile(path.resolve(input.productionEnvironmentFile
      ?? path.join(input.workspaceRoot, '.env.local.prod'))).then(parseEnv),
  ]);
  return { OPENAI_API_KEY: secret(local.OPENAI_API_KEY, 'OPENAI_KEY'),
    GOOGLE_GENERATIVE_AI_API_KEY: secret(
      production.GOOGLE_GENERATIVE_AI_API_KEY, 'PRODUCTION_GOOGLE_KEY') };
}
async function writeOrVerify(filePath: string, value: unknown, secrets: readonly string[]) {
  if (!await exists(filePath)) return writeDurableExclusiveJsonV1({
    filePath, value, forbiddenSecrets: secrets,
  });
  if (hashCanonicalJsonV1(await readJson(filePath)) !== hashCanonicalJsonV1(value)) {
    fail('PERSISTED_ARTIFACT_DRIFT');
  }
}
async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}
async function exists(filePath: string): Promise<boolean> {
  try { await stat(filePath); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function record(value: unknown): JsonRecord { return value && typeof value === 'object'
  && !Array.isArray(value) ? value as JsonRecord : {}; }
function sha(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function secret(value: string | undefined, code: string): string {
  const result = value?.trim(); if (!result) fail(`SECRET_MISSING:${code}`); return result;
}
function fail(code: string): never { throw new Error(`STAGE25_FINAL_PAID_OPERATOR_${code}`); }
async function main(): Promise<void> {
  const [artifactParent, preflightExecutionRoot, operatorId, confirmation, max, suffix,
    productionEnvironmentFile] = process.argv.slice(2);
  if (!artifactParent || !preflightExecutionRoot || !operatorId || !confirmation || !max) {
    fail('USAGE_INVALID');
  }
  const result = await runStage25FinalGeneralisationPaidOperatorV1({
    workspaceRoot: process.cwd(), artifactParent, preflightExecutionRoot, operatorId,
    executeConfirmation: confirmation, confirmedMaxSpendUsd: max,
    ...(suffix ? { executionSuffix: suffix } : {}),
    ...(productionEnvironmentFile ? { productionEnvironmentFile } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked && invoked === path.resolve(fileURLToPath(import.meta.url))) await main();
