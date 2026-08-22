import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import type { ProviderNativeCohortManifestV2R } from './provider-native-cohort-manifest-v2r';
import {
  assertSealedH03PaidAuthorizationV3R3, type SealedH03PaidAuthorizationV3R3,
} from './sealed-holdout-h03-paid-authorization-v3r3';
import type { SealedH03ProviderCohortManifestV3R3 } from './sealed-holdout-h03-provider-cohort-v3r3';
import type { SealedH03ProviderSourceRequestV3R3 } from './sealed-holdout-h03-provider-preflight-v3r3';
import { runSealedH03ProviderRowV3R3 } from './sealed-holdout-h03-provider-row-runner-v3r3';
import type { SealedHoldoutCohortManifestV3R2 } from './sealed-holdout-cohort-v3r2';

type JsonRecord = Record<string, unknown>;
type CohortRow = SealedH03ProviderCohortManifestV3R3['rows'][number];
type RowResult = Awaited<ReturnType<typeof runSealedH03ProviderRowV3R3>>;
type RunRow = typeof runSealedH03ProviderRowV3R3;
export const SEALED_H03_PROVIDER_COHORT_RUNNER_VERSION_V3R3 =
  'EDITRON_OE_SEALED_H03_PROVIDER_COHORT_RUNNER_V3R3_2' as const;

export async function runSealedH03ProviderCohortV3R3(input: Readonly<{
  baseManifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  providerManifest: Readonly<ProviderNativeCohortManifestV2R>;
  cohortManifest: Readonly<SealedH03ProviderCohortManifestV3R3>;
  sourceRequest: Readonly<SealedH03ProviderSourceRequestV3R3>;
  authorization: Readonly<SealedH03PaidAuthorizationV3R3>;
  environment: Readonly<Record<string, string | undefined>>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputRoot: string;
  executionCommitSha: string;
  runnerSourceSha256: string;
  sandboxEnvironment: Readonly<{ snapshotId: string; snapshotCommit: string }>;
  repoRoot: string;
  now?: () => string;
  runRow?: RunRow;
  onProgress?: (event: Readonly<JsonRecord>) => void;
}>) {
  const now = input.now ?? (() => new Date().toISOString());
  const authorization = validateAuthorization(input, Date.parse(now()));
  const contract = buildContract(input, authorization);
  await initializeRun(input.outputRoot, contract);
  const runRow = input.runRow ?? runSealedH03ProviderRowV3R3;
  const outcomes: JsonRecord[] = [];
  for (const row of input.cohortManifest.rows) {
    validateAuthorization(input, Date.parse(now()));
    const routeEntry = input.providerManifest.routes.find(({ route }) => (
      route.routeId === row.routeId
    ));
    if (!routeEntry) fail(`SEALED_H03_PROVIDER_COHORT_ROUTE_MISSING:${row.routeId}`);
    const rowRoot = path.join(input.outputRoot, 'rows', safe(String(row.rowId)));
    await mkdir(rowRoot, { recursive: true });
    const receiptPath = path.join(rowRoot, 'row-receipt.json');
    const failurePath = path.join(rowRoot, 'row-unverifiable.json');
    const existing = await readExistingOutcome(receiptPath, failurePath, contract, row);
    if (existing) {
      outcomes.push(existing);
      progress(input, row, 'RESUMED_EXISTING_ROW');
      continue;
    }
    const attemptPath = path.join(rowRoot, 'attempt.json');
    if (await exists(attemptPath)) {
      fail(`SEALED_H03_PROVIDER_ROW_PRIOR_ATTEMPT_INDETERMINATE:${row.rowId}`);
    }
    await writeJsonOnce(attemptPath, signed({
      version: SEALED_H03_PROVIDER_COHORT_RUNNER_VERSION_V3R3,
      authority: 'ROW_ATTEMPT_MARKER_NO_PROJECT_MUTATION',
      contractSha256: contract.contractSha256,
      rowId: row.rowId,
      createdAt: now(),
    }));
    progress(input, row, 'STARTED');
    try {
      const result = await runRow({
        baseManifest: input.baseManifest,
        cohortManifest: input.cohortManifest,
        routeEntry,
        row,
        sourceRequest: input.sourceRequest,
        environment: input.environment,
        mediaManifest: input.mediaManifest,
        outputDirectory: path.join(rowRoot, 'proof'),
        executionId: `${authorization.authorizationId}-${row.rowId}`,
        createdAt: now(),
        sandboxEnvironment: input.sandboxEnvironment,
        repoRoot: input.repoRoot,
      });
      const outcome = successfulOutcome(contract, row, result);
      await Promise.all([
        writeJsonOnce(receiptPath, outcome),
        writeJsonOnce(path.join(rowRoot, 'source-row-receipt.json'), result.receipt),
        writeJsonOnce(path.join(rowRoot, 'provider-calls.json'), result.providerCalls),
        ...(result.proof
          ? [writeJsonOnce(path.join(rowRoot, 'proof-receipt.json'), result.proof)] : []),
      ]);
      outcomes.push(outcome);
      progress(input, row, String(result.receipt.disposition));
    } catch (error) {
      const outcome = unverifiableOutcome(input, contract, row, error, now());
      await writeJsonOnce(failurePath, outcome);
      outcomes.push(outcome);
      progress(input, row, 'ROW_UNVERIFIABLE');
    }
    assertTotals(outcomes, authorization);
  }
  const totals = assertTotals(outcomes, authorization);
  const material = {
    version: SEALED_H03_PROVIDER_COHORT_RUNNER_VERSION_V3R3,
    authority: 'RESEARCH_PROVIDER_SANDBOX_COHORT_NO_PROJECT_AUTHORITY' as const,
    contractSha256: contract.contractSha256,
    authorizationSha256: authorization.authorizationSha256,
    manifestSha256: input.cohortManifest.manifestSha256,
    rowCount: outcomes.length,
    dispositionCounts: countDispositions(outcomes),
    rowReceiptSha256s: outcomes.map(({ receiptSha256 }) => receiptSha256),
    accounting: totals,
    assessment: 'RAW_EXECUTED_PENDING_FROZEN_INTERPRETATION' as const,
    projectReads: 0 as const,
    projectMutations: 0 as const,
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({
    ...material,
    receiptSha256: hashCanonicalJsonV1(material),
  });
  await writeJsonOnce(path.join(input.outputRoot, 'cohort-receipt.json'), receipt);
  return receipt;
}
function validateAuthorization(
  input: Parameters<typeof runSealedH03ProviderCohortV3R3>[0],
  nowUnixMs: number,
) {
  return assertSealedH03PaidAuthorizationV3R3(input.authorization, {
    manifest: input.cohortManifest,
    executionCommitSha: input.executionCommitSha,
    runnerSourceSha256: input.runnerSourceSha256,
    nowUnixMs,
  });
}

function buildContract(
  input: Parameters<typeof runSealedH03ProviderCohortV3R3>[0],
  authorization: Readonly<SealedH03PaidAuthorizationV3R3>,
) {
  if (!/^[a-f0-9]{40}$/.test(input.executionCommitSha)
    || !/^[a-f0-9]{64}$/.test(input.runnerSourceSha256)) {
    fail('SEALED_H03_PROVIDER_COHORT_EXECUTION_IDENTITY_INVALID');
  }
  const material = {
    version: SEALED_H03_PROVIDER_COHORT_RUNNER_VERSION_V3R3,
    authority: 'RESEARCH_PROVIDER_SANDBOX_COHORT_NO_PROJECT_AUTHORITY',
    executionCommitSha: input.executionCommitSha,
    runnerSourceSha256: input.runnerSourceSha256,
    manifestSha256: input.cohortManifest.manifestSha256,
    authorizationSha256: authorization.authorizationSha256,
    mediaManifestSha256: input.mediaManifest.manifestSha256,
    rowSetSha256: hashCanonicalJsonV1(input.cohortManifest.rows),
    sandboxEnvironment: input.sandboxEnvironment,
    projectReadsAuthorized: 0,
    projectMutationsAuthorized: 0,
    stateEffects: [],
  };
  return deepFreezeV1({ ...material, contractSha256: hashCanonicalJsonV1(material) });
}
function successfulOutcome(
  contract: Readonly<JsonRecord>,
  row: Readonly<CohortRow>,
  result: Readonly<RowResult>,
) {
  const accounting = result.receipt.accounting;
  const committedSpendUsd = accounting.accountingDisposition === 'EXACT_FROM_PROVIDER_RECEIPTS'
    ? accounting.actualSpendUsd : Number(row.absoluteMaxRowSpendUsd);
  return signed({
    authority: 'RESEARCH_PROVIDER_ROW_OUTCOME_NO_PROJECT_MUTATION',
    contractSha256: contract.contractSha256,
    rowId: row.rowId,
    disposition: result.receipt.disposition,
    failureDiagnostic: result.receipt.failureDiagnostic,
    rowReceiptSha256: result.receipt.receiptSha256,
    providerGeneratedCandidates: accounting.providerGeneratedCandidates,
    providerHttpAttemptsCommitted: accounting.providerHttpAttempts,
    knownActualSpendUsd: accounting.actualSpendUsd,
    committedSpendUsd,
    projectReads: 0,
    projectMutations: 0,
    stateEffects: [],
  });
}

function unverifiableOutcome(
  input: Parameters<typeof runSealedH03ProviderCohortV3R3>[0],
  contract: Readonly<JsonRecord>,
  row: Readonly<CohortRow>,
  error: unknown,
  createdAt: string,
) {
  return signed({
    authority: 'RESEARCH_PROVIDER_ROW_OUTCOME_NO_PROJECT_MUTATION',
    contractSha256: contract.contractSha256,
    rowId: row.rowId,
    disposition: 'ROW_UNVERIFIABLE',
    diagnostic: redact(error instanceof Error ? error.message : String(error), input.environment),
    createdAt,
    providerGeneratedCandidates: row.armId === 'CAPABILITY_CEILING' ? 2 : 1,
    providerHttpAttemptsCommitted: Number(row.maximumProviderHttpRequests),
    knownActualSpendUsd: 0,
    committedSpendUsd: Number(row.absoluteMaxRowSpendUsd),
    projectReads: 0,
    projectMutations: 0,
    stateEffects: [],
  });
}

function assertTotals(
  outcomes: readonly Readonly<JsonRecord>[],
  authorization: Readonly<SealedH03PaidAuthorizationV3R3>,
) {
  const totals = deepFreezeV1({
    providerGeneratedCandidates: sum(outcomes, 'providerGeneratedCandidates'),
    providerHttpAttemptsCommitted: sum(outcomes, 'providerHttpAttemptsCommitted'),
    knownActualSpendUsd: roundUsd(sum(outcomes, 'knownActualSpendUsd')),
    committedSpendUsd: roundUsd(sum(outcomes, 'committedSpendUsd')),
  });
  if (totals.providerHttpAttemptsCommitted > authorization.limits.maximumProviderHttpRequests
    || totals.committedSpendUsd
      > authorization.limits.absoluteMaxSpendMicroUsd / 1_000_000 + 0.000001) {
    fail('SEALED_H03_PROVIDER_COHORT_ACCOUNTING_LIMIT_EXCEEDED');
  }
  return totals;
}

async function initializeRun(outputRoot: string, contract: Readonly<JsonRecord>): Promise<void> {
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: true });
  const contractPath = path.join(outputRoot, 'run-contract.json');
  if (await exists(contractPath)) {
    const existing = await readJson(contractPath);
    if (existing.contractSha256 !== contract.contractSha256) {
      fail('SEALED_H03_PROVIDER_COHORT_RESUME_CONTRACT_DRIFT');
    }
  } else {
    await writeJsonOnce(contractPath, contract);
  }
  await mkdir(path.join(outputRoot, 'rows'), { recursive: true });
}

async function readExistingOutcome(
  receiptPath: string,
  failurePath: string,
  contract: Readonly<JsonRecord>,
  row: Readonly<CohortRow>,
): Promise<JsonRecord | null> {
  const selected = await exists(receiptPath) ? receiptPath
    : await exists(failurePath) ? failurePath : null;
  if (!selected) return null;
  const value = await readJson(selected);
  const { receiptSha256, ...material } = value;
  if (value.contractSha256 !== contract.contractSha256 || value.rowId !== row.rowId
    || receiptSha256 !== hashCanonicalJsonV1(material)) {
    fail(`SEALED_H03_PROVIDER_COHORT_RESUME_ROW_DRIFT:${row.rowId}`);
  }
  return value;
}

function signed(material: JsonRecord): JsonRecord {
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}
function countDispositions(values: readonly JsonRecord[]): JsonRecord {
  return values.reduce<JsonRecord>((counts, row) => {
    const key = String(row.disposition);
    counts[key] = Number(counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
function sum(values: readonly JsonRecord[], key: string): number {
  return values.reduce((total, value) => total + Number(value[key] ?? 0), 0);
}
function progress(input: Parameters<typeof runSealedH03ProviderCohortV3R3>[0], row: Readonly<CohortRow>, status: string): void {
  input.onProgress?.({ rowId: row.rowId, routeId: row.routeId, armId: row.armId, status });
}
function redact(value: string, environment: Readonly<Record<string, string | undefined>>): string {
  let result = value.slice(0, 1_000);
  for (const secret of Object.values(environment)) {
    if (secret && secret.length >= 12) result = result.replaceAll(secret, '[REDACTED]');
  }
  return result;
}
function safe(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, '_'); }
function roundUsd(value: number): number { return Number(value.toFixed(9)); }
async function exists(filePath: string): Promise<boolean> {
  try { await readFile(filePath); return true; } catch { return false; }
}
async function readJson(filePath: string): Promise<JsonRecord> {
  const value = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEALED_H03_JSON_INVALID');
  return value as JsonRecord;
}
async function writeJsonOnce(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}
function fail(code: string): never { throw new Error(code); }
